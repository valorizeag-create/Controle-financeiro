import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { splitFamilyUse } from '../../src/domain/family'

let ana: TestUser // administra
let bia: TestUser // membro
let eva: TestUser // membro
let caio: TestUser // sem família
let dani: TestUser // administra outra família
let famAna: string
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`

beforeAll(async () => {
  ;[ana, bia, eva, caio, dani] = await Promise.all(['Ana', 'Bia', 'Eva', 'Caio', 'Dani'].map((n) => newUser(n)))
  famAna = await createFamily(ana, 'Família Souza')
  await joinFamily(bia, ana)
  await joinFamily(eva, ana)
  await createFamily(dani, 'Família Dani')
})

afterAll(async () => {
  await removeUsers(ana, bia, eva, caio, dani)
})

async function familyGoal(user: TestUser = bia, target = 1_000_000, name = 'Reforma da cozinha'): Promise<string> {
  const { data, error } = await user.client.rpc('create_family_goal', { p_name: name, p_target_cents: target, p_deadline: null })
  if (error) throw error
  return data as string
}
async function deposit(user: TestUser, goal: string, cents: number) {
  const { error } = await user.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: cents })
  if (error) throw error
}
async function part(user: TestUser, goal: string): Promise<number> {
  return Number((await user.client.rpc('goal_balance', { p_goal_id: goal })).data)
}
async function total(user: TestUser, goal: string): Promise<number | undefined> {
  const { data } = await user.client.rpc('family_goal_totals')
  const row = (data as { goal_id: string; saved_cents: number }[] | null)?.find((r) => r.goal_id === goal)
  return row === undefined ? undefined : Number(row.saved_cents)
}
async function uses(goal: string) {
  const { data } = await admin.from('goal_movements').select('user_id, amount_cents, transaction_id').eq('goal_id', goal).eq('kind', 'use').order('user_id')
  return (data ?? []).map((m) => ({ ...m, amount_cents: Number(m.amount_cents) }))
}
const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0
const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'

describe('criar e editar a meta da família (RF-25)', () => {
  test('qualquer membro cria; todos veem; quem é de fora, não', async () => {
    const id = await familyGoal(bia)
    for (const u of [ana, bia, eva]) {
      const { data } = await u.client.from('goals').select('user_id, family_id, created_by, name, status').eq('id', id)
      expect(data).toEqual([{ user_id: null, family_id: famAna, created_by: bia.id, name: 'Reforma da cozinha', status: 'active' }])
    }
    expect((await caio.client.from('goals').select('id').eq('id', id)).data).toEqual([])
    expect((await dani.client.from('goals').select('id').eq('id', id)).data).toEqual([])
    expect((await caio.client.rpc('create_family_goal', { p_name: 'X', p_target_cents: 100, p_deadline: null })).error?.message).toContain('Família não encontrada.')
  })

  test('limites: nome, valor e prazo', async () => {
    const cases: [string | null, number | null, string | null, string][] = [
      ['', 100, null, 'Nome inválido.'],
      ['x'.repeat(41), 100, null, 'Nome inválido.'],
      ['Ok', 0, null, 'Valor inválido.'],
      ['Ok', 10_000_000_000, null, 'Valor inválido.'],
      ['Ok', 100, `${today.slice(0, 7)}-15`, 'Prazo inválido.'],
      ['Ok', 100, '2020-01-01', 'Prazo inválido.'],
      ['Ok', 100, '2100-01-01', 'Prazo inválido.'],
    ]
    for (const [p_name, p_target_cents, p_deadline, message] of cases) {
      expect((await bia.client.rpc('create_family_goal', { p_name, p_target_cents, p_deadline })).error?.message).toContain(message)
    }
    expect((await bia.client.rpc('create_family_goal', { p_name: 'Ok', p_target_cents: 100, p_deadline: monthStart })).error).toBeNull()
  })

  test('editar: quem criou e o administrador; outro membro, não', async () => {
    const id = await familyGoal(bia, 500000, 'Viagem')
    const args = { p_id: id, p_name: 'Viagem de férias', p_target_cents: 600000, p_deadline: null }
    expect((await eva.client.rpc('update_family_goal', args)).error?.message).toContain(ADMIN_ONLY)
    expect((await caio.client.rpc('update_family_goal', args)).error?.message).toContain('Meta não encontrada.')
    expect((await bia.client.rpc('update_family_goal', args)).error).toBeNull()
    expect((await ana.client.rpc('update_family_goal', { ...args, p_target_cents: 700000 })).error).toBeNull()
    expect((await eva.client.from('goals').select('name, target_cents').eq('id', id).single()).data).toEqual({ name: 'Viagem de férias', target_cents: 700000 })
  })

  test('meta da família não é criada, editada nem excluída direto — nem pelo administrador', async () => {
    const id = await familyGoal(bia)
    expect((await bia.client.from('goals').insert({ family_id: famAna, name: 'Direto', target_cents: 100 })).error).not.toBeNull()
    expect(refused(await bia.client.from('goals').update({ name: 'Invadida' }).eq('id', id).select())).toBe(true)
    expect(refused(await ana.client.from('goals').update({ deleted_on: today }).eq('id', id).select())).toBe(true)
    expect((await ana.client.from('goals').select('name, deleted_on').eq('id', id).single()).data).toEqual({ name: 'Reforma da cozinha', deleted_on: null })
  })
})

describe('guardar e tirar a própria parte (RN-22, RN-22a, A4 B)', () => {
  let goal: string
  beforeAll(async () => {
    goal = await familyGoal(bia)
    await deposit(ana, goal, 100000)
    await deposit(bia, goal, 300000)
  })

  test('todos veem o total; cada um vê só a própria parte (Review Focus 1)', async () => {
    expect(await total(ana, goal)).toBe(400000)
    expect(await total(eva, goal)).toBe(400000)
    expect(await part(ana, goal)).toBe(100000)
    expect(await part(bia, goal)).toBe(300000)
    expect(await part(eva, goal)).toBe(0)
    const seen = await ana.client.from('goal_movements').select('user_id').eq('goal_id', goal)
    expect((seen.data ?? []).every((m) => m.user_id === ana.id)).toBe(true)
    expect(await total(caio, goal)).toBeUndefined()
    expect(await total(dani, goal)).toBeUndefined()
  })

  test('tirar só até a própria parte', async () => {
    const tooMuch = await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 300001 })
    expect(tooMuch.error?.message).toContain('Valor maior que o guardado.')
    const { data, error } = await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 100000 })
    expect(error).toBeNull()
    expect(Number(data)).toBe(200000)
    expect(await part(ana, goal)).toBe(100000)
    expect(await total(ana, goal)).toBe(300000)
  })

  test('quem é de fora não guarda nem tira; as funções pessoais não servem para meta da família', async () => {
    for (const u of [caio, dani]) {
      expect((await u.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 100 })).error?.message).toContain('Meta não encontrada.')
      expect((await u.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 100 })).error?.message).toContain('Meta não encontrada.')
    }
    const personal: [string, Record<string, unknown>][] = [
      ['deposit_to_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['use_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: await categoryId(bia, 'casa') }],
      ['delete_goal', { p_goal_id: goal }],
    ]
    for (const [fn, args] of personal) expect((await bia.client.rpc(fn, args)).error?.message).toContain('Meta não encontrada.')
    expect(await total(ana, goal)).toBe(300000)
  })

  test('movimento gravado direto na meta da família é recusado', async () => {
    const direct = await bia.client.from('goal_movements').insert({ user_id: bia.id, goal_id: goal, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(direct.error).not.toBeNull()
    const asOther = await bia.client.from('goal_movements').insert({ user_id: ana.id, goal_id: goal, kind: 'withdraw', amount_cents: 100, occurred_on: today })
    expect(asOther.error?.message).toContain('Meta não encontrada.')
    expect(await total(ana, goal)).toBe(300000)
  })

  test('gravar direto em nome de outro membro dá sempre a mesma recusa, seja qual for o valor: a parte dele não vaza (A4 B)', async () => {
    const before = [await part(ana, goal), await total(ana, goal)]
    expect(before[0]).toBe(100000)
    const answers: string[] = []
    for (const kind of ['withdraw', 'deposit']) {
      for (const cents of [1, 100000, 100001, 9_999_999_999]) {
        const r = await bia.client.from('goal_movements').insert({ user_id: ana.id, goal_id: goal, kind, amount_cents: cents, occurred_on: today })
        expect(r.error, `${kind} ${cents}`).not.toBeNull()
        answers.push(`${r.error?.code} ${r.error?.message}`)
      }
    }
    expect(new Set(answers).size).toBe(1)
    expect(answers[0]).toContain('Meta não encontrada.')
    expect([await part(ana, goal), await total(ana, goal)]).toEqual(before)
  })

  test('o Guardado de cada pessoa inclui a parte dela na meta da família', async () => {
    const { data } = await bia.client.from('goal_movements').select('kind, amount_cents').eq('user_id', bia.id).eq('goal_id', goal)
    const saved = (data ?? []).reduce((s, m) => s + (m.kind === 'deposit' ? 1 : -1) * Number(m.amount_cents), 0)
    expect(saved).toBe(200000)
  })
})

describe('usar o dinheiro da meta da família (RN-22b, RN-22c, Review Focus 4)', () => {
  test('só o administrador usa', async () => {
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 1000)
    const r = await bia.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 1000, p_category_id: await categoryId(bia, 'casa') })
    expect(r.error?.message).toContain(ADMIN_ONLY)
  })

  test('divide na proporção do guardado; a diferença sai de quem usou; uma compra só na família', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 100000)
    await deposit(bia, goal, 200000)
    const { data, error } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 350000, p_category_id: await categoryId(ana, 'casa') })
    expect(error).toBeNull()
    const r = (data as { tx_id: string; funded_cents: number; leftover_cents: number }[])[0]
    expect([Number(r.funded_cents), Number(r.leftover_cents)]).toEqual([300000, 0])
    const tx = await ana.client.from('transactions').select('user_id, amount_cents, goal_funded_cents, family_id, goal_id, occurred_on').eq('id', r.tx_id).single()
    expect(tx.data).toEqual({ user_id: ana.id, amount_cents: 350000, goal_funded_cents: 300000, family_id: famAna, goal_id: goal, occurred_on: today })
    expect(await uses(goal)).toEqual(
      [{ user_id: ana.id, amount_cents: 100000, transaction_id: r.tx_id }, { user_id: bia.id, amount_cents: 200000, transaction_id: r.tx_id }]
        .sort((x, y) => x.user_id.localeCompare(y.user_id)),
    )
    const own = await bia.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', goal).eq('kind', 'use')
    expect(own.data?.map((m) => Number(m.amount_cents))).toEqual([200000])
    expect((await bia.client.from('goals').select('status, used_on').eq('id', goal).single()).data).toEqual({ status: 'used', used_on: today })
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    const { data: rows } = await eva.client.rpc('family_expenses', { p_from: monthStart, p_to: today })
    expect((rows as { id: string; amount_cents: number; author_id: string }[]).find((x) => x.id === r.tx_id)).toMatchObject({ amount_cents: 350000, author_id: ana.id })
    // Gasto pago com meta: nem a administradora ajusta (as funções recusam), e can_adjust diz isso antes.
    const asAdmin = await ana.client.rpc('family_expense', { p_id: r.tx_id })
    expect((asAdmin.data as { can_adjust: boolean }[])[0].can_adjust).toBe(false)
    expect((await ana.client.rpc('admin_update_family_expense', { p_id: r.tx_id, p_amount_cents: 1, p_on: today, p_note: null })).error?.message)
      .toContain('Gasto não encontrado.')
  })

  test('centavos que sobram vão para os maiores restos (mesma regra de splitFamilyUse)', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1)
    await deposit(bia, goal, 2)
    const { data } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2, p_category_id: await categoryId(ana, 'casa') })
    const r = (data as { tx_id: string; leftover_cents: number }[])[0]
    expect(Number(r.leftover_cents)).toBe(1)
    const byUser = Object.fromEntries((await uses(goal)).map((m) => [m.user_id, m.amount_cents]))
    expect(byUser).toEqual({ [ana.id]: 1, [bia.id]: 1 })
    expect(await part(bia, goal)).toBe(1)
  })

  test('a sobra fica com cada um, na mesma proporção, e cada um tira a sua', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 1000)
    await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 1000, p_category_id: await categoryId(ana, 'casa') })
    expect([await part(ana, goal), await part(bia, goal), await total(eva, goal)]).toEqual([500, 500, 1000])
    expect((await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 500 })).error).toBeNull()
    expect(await total(ana, goal)).toBe(500)
  })

  test('meta sem dinheiro, categoria de outra pessoa ou valor fora do limite', async () => {
    const empty = await familyGoal(bia)
    const casa = await categoryId(ana, 'casa')
    expect((await ana.client.rpc('use_family_goal', { p_goal_id: empty, p_amount_cents: 100, p_category_id: casa })).error?.message).toContain('Meta sem dinheiro guardado.')
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 100)
    expect((await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: await categoryId(bia, 'casa') })).error?.message).toContain('Categoria não encontrada.')
    for (const cents of [0, -1, 10_000_000_000, null]) {
      expect((await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: cents, p_category_id: casa })).error?.message).toContain('Valor inválido.')
    }
  })

  test('um membro não apaga a própria parte do uso direto; o administrador desfaz o uso e o dinheiro volta', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 3000)
    const { data } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2000, p_category_id: await categoryId(ana, 'casa') })
    const txId = (data as { tx_id: string }[])[0].tx_id
    const del = await bia.client.from('goal_movements').delete().eq('goal_id', goal).eq('kind', 'use').select()
    expect(refused(del)).toBe(true)
    expect(await uses(goal)).toHaveLength(2)
    expect((await bia.client.rpc('delete_family_goal_use', { p_transaction_id: txId })).error?.message).toContain(ADMIN_ONLY)
    const { data: back, error } = await ana.client.rpc('delete_family_goal_use', { p_transaction_id: txId })
    expect(error).toBeNull()
    expect(back).toBe(goal)
    expect([await part(ana, goal), await part(bia, goal)]).toEqual([1000, 3000])
    expect((await ana.client.from('transactions').select('id').eq('id', txId)).data).toEqual([])
    expect((await bia.client.from('goals').select('status').eq('id', goal).single()).data?.status).toBe('active')
  })
})

describe('excluir a meta da família (A6 A)', () => {
  test('só o administrador exclui; cada parte volta hoje para quem guardou', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 2500)
    expect((await bia.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain(ADMIN_ONLY)
    expect((await caio.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain(ADMIN_ONLY)
    expect((await ana.client.rpc('delete_family_goal', { p_goal_id: goal })).error).toBeNull()
    const back = await bia.client.from('goal_movements').select('kind, amount_cents, occurred_on').eq('goal_id', goal).eq('kind', 'withdraw')
    expect(back.data).toEqual([{ kind: 'withdraw', amount_cents: 2500, occurred_on: today }])
    expect([await part(ana, goal), await part(bia, goal), await total(eva, goal)]).toEqual([0, 0, 0])
    expect((await eva.client.from('goals').select('deleted_on').eq('id', goal).single()).data?.deleted_on).toBe(today)
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    expect((await ana.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain('Meta não encontrada.')
  })
})

describe('metas individuais continuam privadas e com as mesmas regras', () => {
  test('a família não vê a meta individual; guardar, usar e desfazer seguem como no Plano 5', async () => {
    const { data: goal } = await bia.client.from('goals').insert({ user_id: bia.id, name: 'Só minha', target_cents: 10000 }).select('id').single()
    expect((await ana.client.from('goals').select('id').eq('id', goal!.id)).data).toEqual([])
    expect(await total(ana, goal!.id)).toBeUndefined()
    expect((await bia.client.rpc('deposit_to_goal', { p_goal_id: goal!.id, p_amount_cents: 1000 })).error).toBeNull()
    const used = await bia.client.rpc('use_goal', { p_goal_id: goal!.id, p_amount_cents: 500, p_category_id: await categoryId(bia, 'lazer') })
    expect(used.error).toBeNull()
    const txId = (used.data as { tx_id: string }[])[0].tx_id
    expect((await bia.client.from('transactions').select('family_id').eq('id', txId).single()).data?.family_id).toBeNull()
    expect((await bia.client.rpc('delete_goal_use', { p_transaction_id: txId })).error).toBeNull()
    expect(await part(bia, goal!.id)).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Emendas da revisão de segurança (sql-design-review.md: C1, I5) e da nota da
// Task 1 (a divisão no banco é a mesma de splitFamilyUse).
// ---------------------------------------------------------------------------

async function useAs(user: TestUser, goal: string, cents: number) {
  const { data, error } = await user.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: cents, p_category_id: await categoryId(user, 'casa') })
  if (error) throw error
  const r = (data as { tx_id: string; funded_cents: number; leftover_cents: number }[])[0]
  return { tx: r.tx_id, funded: Number(r.funded_cents), leftover: Number(r.leftover_cents) }
}
const byUser = (rows: { user_id: string; amount_cents: number }[]) => Object.fromEntries(rows.map((r) => [r.user_id, r.amount_cents]))
const bySplit = (rows: { userId: string; cents: number }[]) => Object.fromEntries(rows.map((r) => [r.userId, r.cents]))

describe('a divisão no banco é a mesma de splitFamilyUse (nota da Task 1)', () => {
  test('empate de resto e de parte: o centavo vai pelo id; parte zerada fica de fora', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1)
    await deposit(bia, goal, 1)
    await deposit(eva, goal, 300)
    expect((await eva.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 300 })).error).toBeNull()
    const r = await useAs(ana, goal, 1)
    expect([r.funded, r.leftover]).toEqual([1, 1])
    const expected = splitFamilyUse(1, [{ userId: ana.id, cents: 1 }, { userId: bia.id, cents: 1 }, { userId: eva.id, cents: 0 }])
    expect(expected).toHaveLength(1)
    expect(byUser(await uses(goal))).toEqual(bySplit(expected))
  })

  test('três partes iguais: os dois centavos vão para os dois menores ids', async () => {
    const goal = await familyGoal(bia)
    for (const u of [ana, bia, eva]) await deposit(u, goal, 1)
    await useAs(ana, goal, 2)
    const expected = splitFamilyUse(2, [ana, bia, eva].map((u) => ({ userId: u.id, cents: 1 })))
    expect(byUser(await uses(goal))).toEqual(bySplit(expected))
  })

  test('valores no limite (valor × parte perto de 10^20) sem erro de arredondamento', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 9_999_999_999)
    await deposit(bia, goal, 9_999_999_998)
    await deposit(eva, goal, 7)
    const r = await useAs(ana, goal, 9_999_999_999)
    expect([r.funded, r.leftover]).toEqual([9_999_999_999, 10_000_000_005])
    const expected = splitFamilyUse(9_999_999_999, [
      { userId: ana.id, cents: 9_999_999_999 }, { userId: bia.id, cents: 9_999_999_998 }, { userId: eva.id, cents: 7 },
    ])
    const got = await uses(goal)
    expect(byUser(got)).toEqual(bySplit(expected))
    expect(got.reduce((s, m) => s + m.amount_cents, 0)).toBe(9_999_999_999)
  })
})

describe('metas da família: só para quem participa, e da própria família (I5)', () => {
  test('sem sessão ninguém chama as funções de meta da família; as guardas não são chamáveis', async () => {
    const goal = await familyGoal(bia)
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const calls: [string, Record<string, unknown>][] = [
      ['family_goal_totals', {}],
      ['create_family_goal', { p_name: 'X', p_target_cents: 100, p_deadline: null }],
      ['update_family_goal', { p_id: goal, p_name: 'X', p_target_cents: 100, p_deadline: null }],
      ['deposit_family_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['use_family_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: goal }],
      ['delete_family_goal_use', { p_transaction_id: goal }],
      ['delete_family_goal', { p_goal_id: goal }],
    ]
    for (const [fn, args] of calls) {
      expect((await anon.rpc(fn, args)).error?.message, fn).toContain('permission denied')
    }
    for (const fn of ['goals_guard', 'goal_movements_guard', 'transactions_goal_link_guard', 'goal_movements_use_delete_guard']) {
      expect((await bia.client.rpc(fn)).error, fn).not.toBeNull()
    }
    expect((await ana.client.from('goals').select('name').eq('id', goal).single()).data?.name).toBe('Reforma da cozinha')
  })

  test('administrador de outra família não edita, não usa, não desfaz e não exclui nada desta', async () => {
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 5000)
    const used = await familyGoal(bia)
    await deposit(bia, used, 1000)
    const { tx } = await useAs(ana, used, 1000)
    const casa = await categoryId(dani, 'casa')
    expect((await dani.client.rpc('update_family_goal', { p_id: goal, p_name: 'Invadida', p_target_cents: 1, p_deadline: null })).error?.message)
      .toContain('Meta não encontrada.')
    expect((await dani.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: casa })).error?.message)
      .toContain('Meta não encontrada.')
    expect((await dani.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain('Meta não encontrada.')
    expect((await dani.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error?.message).toContain('Gasto não encontrado.')
    expect((await ana.client.from('goals').select('name, target_cents, deleted_on').eq('id', goal).single()).data)
      .toEqual({ name: 'Reforma da cozinha', target_cents: 1_000_000, deleted_on: null })
    expect(await total(ana, goal)).toBe(5000)
    expect((await ana.client.from('transactions').select('id').eq('id', tx)).data).toHaveLength(1)
    expect(await uses(used)).toHaveLength(1)
  })

  test('meta pessoal não vira meta da família por gravação direta', async () => {
    const { data: mine } = await bia.client.from('goals').insert({ user_id: bia.id, name: 'Minha', target_cents: 100 }).select('id').single()
    expect((await bia.client.from('goals').update({ family_id: famAna }).eq('id', mine!.id).select()).error?.message).toContain('Meta inválida.')
    expect((await bia.client.from('goals').update({ user_id: null, family_id: famAna }).eq('id', mine!.id).select()).error).not.toBeNull()
    expect((await bia.client.from('goals').insert({ user_id: bia.id, family_id: famAna, name: 'Dupla', target_cents: 100 })).error).not.toBeNull()
    expect((await bia.client.from('goals').select('user_id, family_id').eq('id', mine!.id).single()).data).toEqual({ user_id: bia.id, family_id: null })
    expect((await ana.client.from('goals').select('id').eq('id', mine!.id)).data).toEqual([])
  })

  test('gasto não aponta direto para a meta da família, e o gasto do uso não perde a meta nem a família', async () => {
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 1000)
    const casa = await categoryId(bia, 'casa')
    const inserted = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 500, category_id: casa, occurred_on: today,
      family_id: famAna, goal_id: goal, goal_funded_cents: 500,
    })
    expect(inserted.error).not.toBeNull()
    const plain = (await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 500, category_id: casa, occurred_on: today, family_id: famAna,
    }).select('id').single()).data!.id
    expect((await bia.client.from('transactions').update({ goal_id: goal, goal_funded_cents: 500 }).eq('id', plain)).error).not.toBeNull()
    expect((await bia.client.from('transactions').select('goal_id').eq('id', plain).single()).data?.goal_id).toBeNull()

    const { tx } = await useAs(ana, goal, 1000)
    expect((await ana.client.from('transactions').update({ family_id: null }).eq('id', tx)).error?.message).toContain('Movimento inválido.')
    expect((await ana.client.from('transactions').update({ goal_id: null, goal_funded_cents: 0 }).eq('id', tx)).error?.message).toContain('Movimento inválido.')
    expect((await ana.client.from('transactions').update({ goal_funded_cents: 999 }).eq('id', tx)).error?.message).toContain('Movimento inválido.')
    expect((await ana.client.from('transactions').delete().eq('id', tx)).error?.code).toBe('23503')
    expect((await ana.client.from('transactions').select('family_id, goal_id, goal_funded_cents').eq('id', tx).single()).data)
      .toEqual({ family_id: famAna, goal_id: goal, goal_funded_cents: 1000 })
    expect(await part(bia, goal)).toBe(0)
    expect(await total(eva, goal)).toBe(0)
  })
})

describe('dois pedidos ao mesmo tempo na meta da família', () => {
  test('dois usos ao mesmo tempo: só um acontece, e a parte de cada um sai uma vez', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 3000)
    const casa = await categoryId(ana, 'casa')
    const results = await Promise.all([
      ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 4000, p_category_id: casa }),
      ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 4000, p_category_id: casa }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(byUser(await uses(goal))).toEqual({ [ana.id]: 1000, [bia.id]: 3000 })
    expect(await total(eva, goal)).toBe(0)
  })

  test('tirar e usar ao mesmo tempo: quem chega primeiro decide, e nenhum centavo some nem sai duas vezes', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 3000)
    const casa = await categoryId(ana, 'casa')
    const [taken, used] = await Promise.all([
      bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 3000 }),
      ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 4000, p_category_id: casa }),
    ])
    expect(used.error).toBeNull()
    const funded = Number((used.data as { funded_cents: number }[])[0].funded_cents)
    if (taken.error === null) {
      expect(funded).toBe(1000)
    } else {
      expect(taken.error.message).toContain('Valor maior que o guardado.')
      expect(funded).toBe(4000)
    }
    expect([await part(ana, goal), await part(bia, goal), await total(eva, goal)]).toEqual([0, 0, 0])
  })
})

describe('desfazer o uso depois que alguém saiu (C1)', () => {
  let rui: TestUser // administra; depois passa o papel e sai
  let sol: TestUser // sai
  let tom: TestUser // fica
  let famRui: string

  beforeAll(async () => {
    ;[rui, sol, tom] = await Promise.all(['Rui', 'Sol', 'Tom'].map((n) => newUser(n)))
    famRui = await createFamily(rui, 'Família Rui')
    await joinFamily(sol, rui)
    await joinFamily(tom, rui)
  })

  afterAll(async () => {
    await removeUsers(rui, sol, tom)
  })

  // Saída só com left_at (leave_family é da Task 5): nenhuma parte é devolvida.
  async function leave(user: TestUser) {
    const { error } = await admin.from('family_members').update({ left_at: new Date().toISOString() })
      .eq('family_id', famRui).eq('user_id', user.id).is('left_at', null)
    if (error) throw error
  }

  test('com a parte de quem saiu no uso, o uso não é desfeito; a meta continua servindo aos outros', async () => {
    const geladeira = await familyGoal(rui, 200000, 'Geladeira')
    await deposit(rui, geladeira, 1000)
    await deposit(sol, geladeira, 1000)
    const { tx } = await useAs(rui, geladeira, 2000)

    const sofa = await familyGoal(rui, 200000, 'Sofá')
    await deposit(sol, sofa, 500)
    expect((await sol.client.rpc('withdraw_family_goal', { p_goal_id: sofa, p_amount_cents: 500 })).error).toBeNull()
    await deposit(rui, sofa, 800)

    const presa = await familyGoal(rui, 200000, 'Presa')
    await deposit(sol, presa, 300)
    await deposit(rui, presa, 300)

    await leave(sol)

    expect((await rui.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error?.message).toContain('Gasto não encontrado.')
    expect(await part(sol, geladeira)).toBe(0)
    expect(await total(rui, geladeira)).toBe(0)
    expect(await uses(geladeira)).toHaveLength(2)
    expect((await rui.client.from('transactions').select('id').eq('id', tx)).data).toHaveLength(1)
    expect((await rui.client.rpc('delete_family_goal', { p_goal_id: geladeira })).error).toBeNull()

    const other = await useAs(rui, sofa, 800)
    expect(byUser(await uses(sofa))).toEqual({ [rui.id]: 800 })
    expect([other.funded, other.leftover]).toEqual([800, 0])

    // Defesa em profundidade: se sobrasse parte de quem saiu, o erro é claro e nada é gravado pela metade.
    expect((await rui.client.rpc('use_family_goal', { p_goal_id: presa, p_amount_cents: 100, p_category_id: await categoryId(rui, 'casa') })).error?.message)
      .toContain('Meta inválida.')
    expect((await rui.client.rpc('delete_family_goal', { p_goal_id: presa })).error?.message).toContain('Meta inválida.')
    expect(await uses(presa)).toEqual([])
    expect([await part(sol, presa), await part(rui, presa)]).toEqual([300, 300])
    expect((await rui.client.from('goals').select('status, deleted_on').eq('id', presa).single()).data).toEqual({ status: 'active', deleted_on: null })
  })

  test('o gasto de quem usou a meta e saiu continua dele: o novo administrador não o apaga', async () => {
    const tv = await familyGoal(tom, 200000, 'TV')
    await deposit(rui, tv, 1000)
    await deposit(tom, tv, 1000)
    const { tx } = await useAs(rui, tv, 2000)
    expect((await rui.client.rpc('transfer_family_admin', { p_user: tom.id })).error).toBeNull()
    await leave(rui)

    expect((await tom.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error?.message).toContain('Gasto não encontrado.')
    expect((await rui.client.from('transactions').select('amount_cents, goal_funded_cents').eq('id', tx).single()).data)
      .toEqual({ amount_cents: 2000, goal_funded_cents: 2000 })
    expect([await part(rui, tv), await part(tom, tv)]).toEqual([0, 0])
    expect(await uses(tv)).toHaveLength(2)
  })
})
