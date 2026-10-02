import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, expense, joinFamily, todaySP } from './family-helpers'

type FamilyExpenseRow = {
  id: string; effective_on: string; amount_cents: number; category_key: string | null; category_name: string
  note: string | null; author_id: string | null; author_name: string | null; created_at: string; can_adjust: boolean
}

let ana: TestUser // administra
let bia: TestUser // membro
let caio: TestUser // administra outra família
let eli: TestUser // sem família
let famAna: string
let famCaio: string
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

beforeAll(async () => {
  ;[ana, bia, caio, eli] = await Promise.all(['Ana', 'Bia', 'Caio', 'Eli'].map((n) => newUser(n)))
  famAna = await createFamily(ana, 'Família Souza')
  await joinFamily(bia, ana)
  famCaio = await createFamily(caio, 'Família Caio')
})

afterAll(async () => {
  await removeUsers(ana, bia, caio, eli)
})

async function familyRows(user: TestUser, from = monthStart, to = today): Promise<FamilyExpenseRow[]> {
  const { data, error } = await user.client.rpc('family_expenses', { p_from: from, p_to: to })
  if (error) throw error
  return data as FamilyExpenseRow[]
}

async function familyBill(owner: TestUser, family: string, key: string, cents: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await owner.client.from('recurrences').insert({
    user_id: owner.id, kind: 'expense', name: 'Aluguel', amount_cents: cents, category_id: await categoryId(owner, key),
    frequency: 'monthly', due_day: 28, starts_on: monthStart, family_id: family, ...extra,
  }).select('id').single()
  if (error) throw error
  const gen = await owner.client.rpc('generate_family_occurrences')
  if (gen.error) throw gen.error
  return data.id as string
}

async function billId(user: TestUser, recurrence: string): Promise<string> {
  const { data } = await user.client.rpc('family_bills')
  const owned = await user.client.from('transactions').select('id').eq('recurrence_id', recurrence).eq('status', 'pending')
  const fromOwner = owned.data?.[0]?.id as string | undefined
  return fromOwner ?? (data as { id: string }[])[0].id
}

const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0

describe('gasto da família (RN-18, RN-19)', () => {
  test('só quem participa marca um gasto como da família; entrada nunca', async () => {
    expect(await expense(bia, 'mercado', 31240, { family_id: famAna })).toBeTruthy()
    for (const u of [eli, caio]) {
      const { error } = await u.client.from('transactions').insert({
        user_id: u.id, kind: 'expense', amount_cents: 100, category_id: await categoryId(u, 'casa'), occurred_on: today, family_id: famAna,
      })
      expect(error?.message).toContain('Família não encontrada.')
    }
    const income = await bia.client.from('transactions').insert({ user_id: bia.id, kind: 'income', amount_cents: 100, source: 'Salário', occurred_on: today, family_id: famAna })
    expect(income.error?.code).toBe('23514')
  })

  test('um registro só entra na família de quem participa dela', async () => {
    const id = await expense(bia, 'lazer', 5000)
    const other = await bia.client.from('transactions').update({ family_id: famCaio }).eq('id', id).select('id')
    expect(other.error?.message).toContain('Família não encontrada.')
    expect((await bia.client.from('transactions').update({ family_id: famAna }).eq('id', id).select('id')).data).toHaveLength(1)
    expect((await bia.client.from('transactions').update({ family_id: null }).eq('id', id).select('id')).data).toHaveLength(1)
  })
})

describe('privacidade entre membros (Review Focus 1)', () => {
  let biaFamily: string
  let biaPersonal: string
  let biaCard: string
  let biaGoal: string
  let biaPet: string

  beforeAll(async () => {
    biaCard = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Nubank', kind: 'credit', color: 'purple' }).select('id').single()).data!.id
    biaFamily = await expense(bia, 'casa', 8990, { family_id: famAna, card_id: biaCard, note: 'lâmpadas' })
    biaPersonal = await expense(bia, 'lazer', 12000, { note: 'cinema' })
    biaGoal = (await bia.client.from('goals').insert({ user_id: bia.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    biaPet = (await bia.client.from('categories').insert({ user_id: bia.id, name: 'Pet' }).select('id').single()).data!.id
    await bia.client.rpc('deposit_to_goal', { p_goal_id: biaGoal, p_amount_cents: 1000 })
    await bia.client.from('budgets').insert({ user_id: bia.id, month: monthStart, category_id: biaPet, amount_cents: 5000 })
  })

  test('a família nunca lê as tabelas pessoais dos outros — nem os gastos da família direto', async () => {
    expect((await ana.client.from('transactions').select('id').eq('id', biaFamily)).data).toEqual([])
    const all = await ana.client.from('transactions').select('user_id')
    expect((all.data ?? []).every((r) => r.user_id === ana.id)).toBe(true)
    for (const table of ['categories', 'cards', 'goals', 'goal_movements', 'budgets', 'recurrences', 'installment_plans']) {
      const { data } = await ana.client.from(table).select('id').eq('user_id', bia.id)
      expect(data ?? []).toEqual([])
    }
  })

  test('ninguém altera ou apaga registro, categoria, cartão ou meta de outra pessoa', async () => {
    expect(refused(await ana.client.from('transactions').update({ amount_cents: 1 }).eq('id', biaFamily).select())).toBe(true)
    expect(refused(await ana.client.from('transactions').delete().eq('id', biaPersonal).select())).toBe(true)
    expect(refused(await ana.client.from('categories').update({ name: 'Invadida' }).eq('id', biaPet).select())).toBe(true)
    expect(refused(await ana.client.from('cards').delete().eq('id', biaCard).select())).toBe(true)
    expect(refused(await ana.client.from('goals').update({ name: 'Invadida' }).eq('id', biaGoal).select())).toBe(true)
    expect((await ana.client.rpc('delete_category', { p_category_id: biaPet })).error?.message).toContain('Categoria não encontrada.')
    expect((await ana.client.rpc('delete_card', { p_card_id: biaCard })).error?.message).toContain('Cartão não encontrado.')
    expect((await ana.client.rpc('deposit_to_goal', { p_goal_id: biaGoal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    const own = await bia.client.from('transactions').select('amount_cents, card_id').eq('id', biaFamily).single()
    expect(own.data).toEqual({ amount_cents: 8990, card_id: biaCard })
    expect((await bia.client.from('categories').select('name').eq('id', biaPet).single()).data?.name).toBe('Pet')
  })

  test('a família vê só as colunas seguras dos gastos da família (RN-31: nada de cartão)', async () => {
    const rows = await familyRows(ana)
    const row = rows.find((r) => r.id === biaFamily)!
    expect(Object.keys(row).sort()).toEqual(['amount_cents', 'author_id', 'author_name', 'can_adjust', 'category_key', 'category_name', 'created_at', 'effective_on', 'id', 'note'])
    expect(row).toMatchObject({ amount_cents: 8990, category_key: 'casa', note: 'lâmpadas', author_id: bia.id, author_name: 'Bia', effective_on: today })
    expect(rows.some((r) => r.id === biaPersonal)).toBe(false)
    expect(await familyRows(eli)).toEqual([])
    expect((await familyRows(caio)).some((r) => r.id === biaFamily)).toBe(false)
    expect((await ana.client.rpc('family_expense', { p_id: biaFamily })).data).toHaveLength(1)
    expect((await caio.client.rpc('family_expense', { p_id: biaFamily })).data).toEqual([])
    expect((await ana.client.rpc('family_expense', { p_id: biaPersonal })).data).toEqual([])
  })

  test('can_adjust: sim só para quem administra; para o membro é sempre não, até no próprio gasto', async () => {
    const anaOwn = await expense(ana, 'casa', 1200, { family_id: famAna })
    const asAdmin = await familyRows(ana)
    expect(asAdmin.find((r) => r.id === biaFamily)?.can_adjust).toBe(true)
    expect(asAdmin.find((r) => r.id === anaOwn)?.can_adjust).toBe(true)
    const asMember = await familyRows(bia)
    expect(asMember.length).toBeGreaterThan(0)
    expect(asMember.every((r) => r.can_adjust === false)).toBe(true)
    const one = async (u: TestUser, id: string) => ((await u.client.rpc('family_expense', { p_id: id })).data as FamilyExpenseRow[])[0]?.can_adjust
    expect(await one(ana, biaFamily)).toBe(true)
    expect(await one(bia, biaFamily)).toBe(false)
    expect(await one(bia, anaOwn)).toBe(false)
    // De fora da família não vem linha nenhuma, então não vem resposta nenhuma.
    expect(await one(caio, biaFamily)).toBeUndefined()
    expect(await one(eli, biaFamily)).toBeUndefined()
  })

  test('categorias na família (A3): a padrão vem pela chave mesmo renomeada; a própria pelo nome', async () => {
    await bia.client.from('categories').update({ name: 'Supermercado' }).eq('id', await categoryId(bia, 'mercado'))
    const renamed = await expense(bia, 'mercado', 1000, { family_id: famAna })
    const { data: pet } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 2000, category_id: biaPet, occurred_on: today, family_id: famAna,
    }).select('id').single()
    const rows = await familyRows(ana)
    expect(rows.find((r) => r.id === renamed)).toMatchObject({ category_key: 'mercado', category_name: 'Supermercado' })
    expect(rows.find((r) => r.id === pet!.id)).toMatchObject({ category_key: null, category_name: 'Pet' })
  })

  test('período inválido é recusado', async () => {
    for (const [from, to] of [[today, monthStart === today ? plusDays(today, -1) : monthStart], ['2024-01-01', '2026-01-01'], ['1999-12-31', '2000-01-31'], [null, today]]) {
      const { error } = await ana.client.rpc('family_expenses', { p_from: from, p_to: to })
      expect(error?.message).toContain('Período inválido.')
    }
  })
})

describe('administrador e gastos da família (RN-21, RF-44)', () => {
  test('membro não edita gasto de outra pessoa; administrador edita valor, data e nota', async () => {
    const mine = await expense(ana, 'casa', 5000, { family_id: famAna })
    const theirs = await expense(bia, 'casa', 8990, { family_id: famAna })
    const byMember = await bia.client.rpc('admin_update_family_expense', { p_id: mine, p_amount_cents: 1, p_on: today, p_note: null })
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    const { data, error } = await ana.client.rpc('admin_update_family_expense', { p_id: theirs, p_amount_cents: 9990, p_on: today, p_note: '  lâmpadas  ' })
    expect(error).toBeNull()
    expect(data).toBe(today)
    expect((await bia.client.from('transactions').select('amount_cents, note').eq('id', theirs).single()).data).toEqual({ amount_cents: 9990, note: 'lâmpadas' })
  })

  test('limites da edição do administrador', async () => {
    const theirs = await expense(bia, 'casa', 1000, { family_id: famAna })
    const personal = await expense(bia, 'casa', 1000)
    const other = await expense(caio, 'casa', 1000, { family_id: famCaio })
    const plan = (await bia.client.rpc('create_installment_purchase', {
      p_amount_cents: 3000, p_count: 3, p_category_id: await categoryId(bia, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
    })).data as string
    const installment = (await bia.client.from('transactions').select('id').eq('installment_plan_id', plan).limit(1).single()).data!.id
    const cases: [string, number | null, string | null, string | null, string][] = [
      [theirs, 0, today, null, 'Valor inválido.'],
      [theirs, -1, today, null, 'Valor inválido.'],
      [theirs, 10_000_000_000, today, null, 'Valor inválido.'],
      [theirs, null, today, null, 'Valor inválido.'],
      [theirs, 100, '1999-12-31', null, 'Data inválida.'],
      [theirs, 100, plusDays(today, 366), null, 'Data inválida.'],
      [theirs, 100, null, null, 'Data inválida.'],
      [theirs, 100, today, 'x'.repeat(141), 'Nota inválida.'],
      [personal, 100, today, null, 'Gasto não encontrado.'],
      [other, 100, today, null, 'Gasto não encontrado.'],
      [installment, 100, today, null, 'Gasto não encontrado.'],
    ]
    for (const [p_id, p_amount_cents, p_on, p_note, message] of cases) {
      const { error } = await ana.client.rpc('admin_update_family_expense', { p_id, p_amount_cents, p_on, p_note })
      expect(error?.message).toContain(message)
    }
    expect((await bia.client.from('transactions').select('amount_cents').eq('id', theirs).single()).data?.amount_cents).toBe(1000)
    // can_adjust diz o mesmo que a função responde: parcela não, gasto comum sim.
    const one = async (id: string) => ((await ana.client.rpc('family_expense', { p_id: id })).data as FamilyExpenseRow[])[0]?.can_adjust
    expect(await one(installment)).toBe(false)
    expect(await one(theirs)).toBe(true)
    const listed = (await familyRows(ana, monthStart, plusDays(today, 120))).filter((r) => r.can_adjust === false).map((r) => r.id)
    expect(listed).toContain(installment)
    expect(listed).not.toContain(theirs)
  })

  test('administrador exclui gasto da família de outra pessoa; membro não', async () => {
    const theirs = await expense(bia, 'casa', 700, { family_id: famAna })
    const mine = await expense(ana, 'casa', 700, { family_id: famAna })
    expect((await bia.client.rpc('admin_delete_family_expense', { p_id: mine })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    const { data, error } = await ana.client.rpc('admin_delete_family_expense', { p_id: theirs })
    expect(error).toBeNull()
    expect(data).toBe(today)
    expect((await bia.client.from('transactions').select('id').eq('id', theirs)).data).toEqual([])
  })
})

describe('contas da família (RN-20)', () => {
  test('qualquer membro gera e vê as contas da família; quem é de fora, não', async () => {
    const rec = await familyBill(ana, famAna, 'casa', 180000)
    await bia.client.rpc('generate_family_occurrences')
    await ana.client.rpc('generate_occurrences')
    const bills = (await bia.client.rpc('family_bills')).data as { id: string; name: string; amount_cents: number; author_id: string }[]
    const mine = bills.filter((b) => b.name === 'Aluguel' && b.amount_cents === 180000)
    expect(mine).toHaveLength(1)
    expect(mine[0].author_id).toBe(ana.id)
    expect((await ana.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toHaveLength(1)
    expect((await bia.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toEqual([])
    expect((await eli.client.rpc('family_bills')).data).toEqual([])
    expect(((await caio.client.rpc('family_bills')).data as unknown[]).length).toBe(0)
    const recs = (await bia.client.rpc('family_recurrences')).data as { id: string; author_id: string }[]
    expect(recs.find((r) => r.id === rec)?.author_id).toBe(ana.id)
    expect((await eli.client.rpc('family_recurrences')).data).toEqual([])
  })

  test('quem paga fica com o gasto: sai do Disponível dele, na categoria dele, sem cartão (Review Focus 4)', async () => {
    const card = (await ana.client.from('cards').insert({ user_id: ana.id, nickname: 'Inter', kind: 'debit', color: 'orange' }).select('id').single()).data!.id
    const rec = await familyBill(ana, famAna, 'casa', 50000, { card_id: card, name: 'Luz' })
    const id = await billId(ana, rec)
    const { data: paidId, error } = await bia.client.rpc('pay_family_bill', { p_id: id })
    expect(error).toBeNull()
    expect(paidId).not.toBe(id)
    const paid = await bia.client.from('transactions')
      .select('status, paid_on, category_id, card_id, payment_method, family_id, amount_cents, note, recurrence_id')
      .eq('id', paidId).single()
    expect(paid.data).toEqual({
      status: 'confirmed', paid_on: today, category_id: await categoryId(bia, 'casa'), card_id: null, payment_method: null,
      family_id: famAna, amount_cents: 50000, note: 'Luz', recurrence_id: null,
    })
    expect((await ana.client.from('transactions').select('id').eq('id', id)).data).toEqual([])
    expect(((await ana.client.rpc('family_bills')).data as { id: string }[]).some((b) => b.id === id)).toBe(false)
    expect((await familyRows(ana)).find((r) => r.id === paidId)).toMatchObject({ author_id: bia.id, amount_cents: 50000 })
    // A conta paga não volta a ser gerada (decisão 30).
    await ana.client.rpc('generate_family_occurrences')
    expect((await ana.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toEqual([])
  })

  test('quem criou e paga continua dono, com o cartão', async () => {
    const card = (await ana.client.from('cards').insert({ user_id: ana.id, nickname: 'C6', kind: 'credit', color: 'graphite' }).select('id').single()).data!.id
    const rec = await familyBill(ana, famAna, 'assinaturas', 3990, { card_id: card, name: 'Streaming' })
    const id = await billId(ana, rec)
    const { data } = await ana.client.rpc('pay_family_bill', { p_id: id })
    expect(data).toBe(id)
    expect((await ana.client.from('transactions').select('status, card_id, paid_on').eq('id', id).single()).data).toEqual({ status: 'confirmed', card_id: card, paid_on: today })
  })

  test('pagar duas vezes, conta de outra família ou por quem é de fora não vale', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Água' })
    const recCaio = await familyBill(caio, famCaio, 'casa', 1000, { name: 'Gás' })
    const idAna = await billId(ana, recAna)
    const idCaio = await billId(caio, recCaio)
    expect((await bia.client.rpc('pay_family_bill', { p_id: idCaio })).error?.message).toContain('Conta não encontrada.')
    expect((await eli.client.rpc('pay_family_bill', { p_id: idAna })).error?.message).toContain('Conta não encontrada.')
    const both = await Promise.all([bia.client.rpc('pay_family_bill', { p_id: idAna }), ana.client.rpc('pay_family_bill', { p_id: idAna })])
    expect(both.filter((r) => r.error === null)).toHaveLength(1)
    expect(both.find((r) => r.error !== null)?.error?.message).toContain('Conta não encontrada.')
  })

  test('categoria própria vai para a de mesmo nome de quem paga; sem ela, para Outros', async () => {
    const condo = (await ana.client.from('categories').insert({ user_id: ana.id, name: 'Condomínio' }).select('id').single()).data!.id
    const rec1 = await familyBill(ana, famAna, 'casa', 1000, { category_id: condo, name: 'Condomínio' })
    const id1 = await billId(ana, rec1)
    const paid1 = (await bia.client.rpc('pay_family_bill', { p_id: id1 })).data as string
    expect((await bia.client.from('transactions').select('category_id').eq('id', paid1).single()).data?.category_id).toBe(await categoryId(bia, 'outros'))
    const anaPet = (await ana.client.from('categories').insert({ user_id: ana.id, name: 'PET' }).select('id').single()).data!.id
    const biaPet = (await bia.client.from('categories').select('id').eq('name', 'Pet').single()).data!.id
    const rec2 = await familyBill(ana, famAna, 'casa', 1000, { category_id: anaPet, name: 'Ração' })
    const id2 = await billId(ana, rec2)
    const paid2 = (await bia.client.rpc('pay_family_bill', { p_id: id2 })).data as string
    expect((await bia.client.from('transactions').select('category_id').eq('id', paid2).single()).data?.category_id).toBe(biaPet)
  })

  test('alterar e encerrar: quem criou e o administrador; membro que não criou, não', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Internet' })
    const byMember = await bia.client.rpc('update_family_recurrence', { p_id: recAna, p_name: 'X', p_amount_cents: 1, p_due_day: 1 })
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    expect((await ana.client.rpc('update_family_recurrence', { p_id: recAna, p_name: 'Internet nova', p_amount_cents: 12000, p_due_day: 28 })).error).toBeNull()
    const listed = ((await bia.client.rpc('family_recurrences')).data as { id: string; name: string; amount_cents: number }[]).find((r) => r.id === recAna)
    expect(listed).toMatchObject({ name: 'Internet nova', amount_cents: 12000 })
    for (const [p_name, p_amount_cents, p_due_day, message] of [['', 1, 1, 'Nome inválido.'], ['x'.repeat(41), 1, 1, 'Nome inválido.'], ['Ok', 0, 1, 'Valor inválido.'], ['Ok', 1, 0, 'Dia inválido.'], ['Ok', 1, 32, 'Dia inválido.']] as const) {
      expect((await ana.client.rpc('update_family_recurrence', { p_id: recAna, p_name, p_amount_cents, p_due_day })).error?.message).toContain(message)
    }
    const recBia = await familyBill(bia, famAna, 'casa', 1000, { name: 'Faxina' })
    expect((await caio.client.rpc('end_family_recurrence', { p_id: recBia })).error?.message).toContain('Conta não encontrada.')
    expect((await ana.client.rpc('end_family_recurrence', { p_id: recBia })).error).toBeNull()
    expect(((await bia.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === recBia)).toBe(false)
    expect((await bia.client.rpc('update_family_recurrence', { p_id: recBia, p_name: 'Faxina', p_amount_cents: 1, p_due_day: 1 })).error?.message).toContain('Conta não encontrada.')
  })

  test('ocorrência só de molde próprio, também na família; o dono não troca direto', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Seguro' })
    const next = `${plusDays(`${today.slice(0, 7)}-15`, 31).slice(0, 7)}-01`
    const squat = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 1, category_id: await categoryId(bia, 'casa'), occurred_on: next,
      status: 'pending', due_on: next, recurrence_id: recAna, recurrence_period: next, family_id: famAna,
    })
    expect(squat.error?.code).toBe('23503')
    const id = await billId(ana, recAna)
    expect(refused(await ana.client.from('transactions').update({ user_id: bia.id }).eq('id', id).select())).toBe(true)
    expect(refused(await bia.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', id).select())).toBe(true)
  })
})

describe('parcelado, conta pelo Anotar e cartão na família (RN-31, decisão 50)', () => {
  test('parcelado da família: todas as parcelas; o cartão continua só de quem pagou; quitar leva a família', async () => {
    const card = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Visa', kind: 'credit', color: 'blue' }).select('id').single()).data!.id
    const { data: plan, error } = await bia.client.rpc('create_installment_purchase', {
      p_amount_cents: 30000, p_count: 3, p_category_id: await categoryId(bia, 'compras'), p_note: 'Geladeira',
      p_card_id: card, p_payment_method: null, p_purchased_on: today, p_family: true,
    })
    expect(error).toBeNull()
    const rows = (await bia.client.from('transactions').select('family_id, card_id').eq('installment_plan_id', plan)).data!
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.family_id === famAna && r.card_id === card)).toBe(true)
    const settled = await bia.client.rpc('settle_installments', { p_plan_id: plan, p_amount_cents: 18000 })
    expect(settled.error).toBeNull()
    expect((await bia.client.from('transactions').select('family_id').eq('id', settled.data).single()).data?.family_id).toBe(famAna)
    const noFamily = await eli.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(eli, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
    })
    expect(noFamily.error?.message).toContain('Família não encontrada.')
  })

  test('conta que se repete da família pelo Anotar; entrada da família não existe', async () => {
    const { data: tx, error } = await bia.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9900, p_category_id: await categoryId(bia, 'assinaturas'), p_source: null, p_note: 'Streaming',
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly', p_card_id: null, p_family: true,
    })
    expect(error).toBeNull()
    const row = (await bia.client.from('transactions').select('family_id, recurrence_id').eq('id', tx).single()).data!
    expect(row.family_id).toBe(famAna)
    expect((await bia.client.from('recurrences').select('family_id').eq('id', row.recurrence_id).single()).data?.family_id).toBe(famAna)
    const income = await bia.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 100, p_category_id: null, p_source: 'Salário', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly', p_card_id: null, p_family: true,
    })
    expect(income.error?.message).toContain('Família não encontrada.')
  })
})

describe('guardas antigas continuam valendo com a família', () => {
  test('excluir a categoria leva o gasto da família para Outros; a família vê Outros', async () => {
    const gifts = (await bia.client.from('categories').insert({ user_id: bia.id, name: 'Presentes' }).select('id').single()).data!.id
    const { data } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 4500, category_id: gifts, occurred_on: today, family_id: famAna,
    }).select('id').single()
    expect((await bia.client.rpc('delete_category', { p_category_id: gifts })).error).toBeNull()
    expect((await familyRows(ana)).find((r) => r.id === data!.id)).toMatchObject({ category_key: 'outros' })
  })

  test('excluir o cartão mantém o gasto da família com o mesmo valor', async () => {
    const card = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Débito', kind: 'debit', color: 'green' }).select('id').single()).data!.id
    const id = await expense(bia, 'mercado', 6000, { family_id: famAna, card_id: card })
    expect((await bia.client.rpc('delete_card', { p_card_id: card })).error).toBeNull()
    expect((await bia.client.from('transactions').select('amount_cents, card_id, card_deleted, family_id').eq('id', id).single()).data)
      .toEqual({ amount_cents: 6000, card_id: null, card_deleted: true, family_id: famAna })
  })
})

describe('funções da família só para quem participa, e da própria família (I5)', () => {
  test('sem sessão ninguém chama as funções da família; as guardas não são chamáveis', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const calls: [string, Record<string, unknown>][] = [
      ['family_expenses', { p_from: monthStart, p_to: today }],
      ['family_expense', { p_id: famAna }],
      ['family_bills', {}],
      ['family_recurrences', {}],
      ['generate_family_occurrences', {}],
      ['pay_family_bill', { p_id: famAna }],
      ['admin_update_family_expense', { p_id: famAna, p_amount_cents: 1, p_on: today, p_note: null }],
      ['admin_delete_family_expense', { p_id: famAna }],
      ['update_family_recurrence', { p_id: famAna, p_name: 'X', p_amount_cents: 1, p_due_day: 1 }],
      ['end_family_recurrence', { p_id: famAna }],
      ['create_recurring_transaction', {
        p_kind: 'expense', p_amount_cents: 100, p_category_id: famAna, p_source: null, p_note: null,
        p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly', p_card_id: null, p_family: true,
      }],
      ['create_installment_purchase', {
        p_amount_cents: 300, p_count: 3, p_category_id: famAna, p_note: null,
        p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
      }],
    ]
    for (const [fn, args] of calls) {
      expect((await anon.rpc(fn, args)).error, fn).not.toBeNull()
    }
    for (const fn of ['transactions_family_guard', 'recurrences_family_guard']) {
      expect((await bia.client.rpc(fn)).error, fn).not.toBeNull()
    }
  })

  test('administrador de outra família não edita, não exclui e não altera nada desta', async () => {
    const theirs = await expense(bia, 'casa', 2500, { family_id: famAna })
    const rec = await familyBill(ana, famAna, 'casa', 1000, { name: 'Jardim' })
    expect((await caio.client.rpc('admin_update_family_expense', { p_id: theirs, p_amount_cents: 1, p_on: today, p_note: null })).error?.message)
      .toContain('Gasto não encontrado.')
    expect((await caio.client.rpc('admin_delete_family_expense', { p_id: theirs })).error?.message).toContain('Gasto não encontrado.')
    expect((await caio.client.rpc('update_family_recurrence', { p_id: rec, p_name: 'X', p_amount_cents: 1, p_due_day: 1 })).error?.message)
      .toContain('Conta não encontrada.')
    expect((await bia.client.from('transactions').select('amount_cents').eq('id', theirs).single()).data?.amount_cents).toBe(2500)
    const listed = ((await ana.client.rpc('family_recurrences')).data as { id: string; name: string; amount_cents: number }[]).find((r) => r.id === rec)
    expect(listed).toMatchObject({ name: 'Jardim', amount_cents: 1000 })
  })

  test('molde da família por gravação direta: só de quem participa, só na própria família', async () => {
    const base = { kind: 'expense', name: 'Direto', amount_cents: 100, frequency: 'monthly', due_day: 10, starts_on: monthStart }
    const byOutsider = await eli.client.from('recurrences').insert({ ...base, user_id: eli.id, category_id: await categoryId(eli, 'casa'), family_id: famAna })
    expect(byOutsider.error?.message).toContain('Família não encontrada.')
    const otherFamily = await bia.client.from('recurrences').insert({ ...base, user_id: bia.id, category_id: await categoryId(bia, 'casa'), family_id: famCaio })
    expect(otherFamily.error?.message).toContain('Família não encontrada.')
    const personal = (await bia.client.from('recurrences').insert({ ...base, user_id: bia.id, category_id: await categoryId(bia, 'casa') }).select('id').single()).data!.id
    const moved = await bia.client.from('recurrences').update({ family_id: famCaio }).eq('id', personal).select('id')
    expect(moved.error?.message).toContain('Família não encontrada.')
    expect((await bia.client.from('recurrences').select('family_id').eq('id', personal).single()).data?.family_id).toBeNull()
  })
})

describe('conta a pagar da família só nasce de um molde da família (I6)', () => {
  test('ninguém cria conta da família com valor qualquer por gravação direta', async () => {
    const loose = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 9999999999, category_id: await categoryId(bia, 'casa'),
      occurred_on: today, status: 'pending', due_on: today, family_id: famAna,
    })
    expect(loose.error?.message).toContain('Família não encontrada.')

    const confirmed = await expense(bia, 'casa', 3000, { family_id: famAna })
    const toPending = await bia.client.from('transactions').update({ status: 'pending', due_on: today, paid_on: null }).eq('id', confirmed).select('id')
    expect(toPending.error?.message).toContain('Família não encontrada.')

    const personal = (await bia.client.from('recurrences').insert({
      user_id: bia.id, kind: 'expense', name: 'Pessoal', amount_cents: 4000, category_id: await categoryId(bia, 'casa'),
      frequency: 'monthly', due_day: 28, starts_on: monthStart,
    }).select('id').single()).data!.id
    expect((await bia.client.rpc('generate_occurrences')).error).toBeNull()
    const occurrence = (await bia.client.from('transactions').select('id').eq('recurrence_id', personal).eq('status', 'pending').single()).data!.id
    const marked = await bia.client.from('transactions').update({ family_id: famAna }).eq('id', occurrence).select('id')
    expect(marked.error?.message).toContain('Família não encontrada.')

    const bills = (await ana.client.rpc('family_bills')).data as { id: string; amount_cents: number }[]
    expect(bills.some((b) => b.id === confirmed || b.id === occurrence || b.amount_cents === 9999999999)).toBe(false)
    expect((await bia.client.from('transactions').select('status, family_id').eq('id', confirmed).single()).data).toEqual({ status: 'confirmed', family_id: famAna })
  })
})

describe('quem saiu não mexe mais na família, nem a família no que é dele (I2, I3)', () => {
  let dan: TestUser // administra
  let fia: TestUser // sai
  let famDan: string
  let fiaExpense: string
  let fiaOpen: string
  let fiaEnded: string
  let fiaPending: string
  const prevStart = `${plusDays(monthStart, -1).slice(0, 7)}-01`
  const prevDue = `${prevStart.slice(0, 7)}-28`

  beforeAll(async () => {
    ;[dan, fia] = await Promise.all(['Dan', 'Fia'].map((n) => newUser(n)))
    famDan = await createFamily(dan, 'Família Dan')
    await joinFamily(fia, dan)
    fiaExpense = await expense(fia, 'casa', 4000, { family_id: famDan })

    // Conta ativa de Fia, ainda não gerada no mês atual, com uma ocorrência a
    // pagar do mês anterior: o pior caso de sobra depois da saída.
    fiaOpen = (await fia.client.from('recurrences').insert({
      user_id: fia.id, kind: 'expense', name: 'Luz', amount_cents: 7000, category_id: await categoryId(fia, 'casa'),
      frequency: 'monthly', due_day: 28, starts_on: prevStart, generated_through: prevStart, family_id: famDan,
    }).select('id').single()).data!.id
    const pending = await admin.from('transactions').insert({
      user_id: fia.id, kind: 'expense', amount_cents: 7000, category_id: await categoryId(fia, 'casa'),
      occurred_on: prevDue, status: 'pending', due_on: prevDue, recurrence_id: fiaOpen, recurrence_period: prevStart, family_id: famDan,
    }).select('id').single()
    if (pending.error) throw pending.error
    fiaPending = pending.data.id as string

    fiaEnded = (await fia.client.from('recurrences').insert({
      user_id: fia.id, kind: 'expense', name: 'Água', amount_cents: 5000, category_id: await categoryId(fia, 'casa'),
      frequency: 'monthly', due_day: 10, starts_on: monthStart, generated_through: monthStart, family_id: famDan,
    }).select('id').single()).data!.id
    const ended = await fia.client.rpc('end_family_recurrence', { p_id: fiaEnded })
    if (ended.error) throw ended.error

    // Saída só com left_at (leave_family é da Task 5): nada mais é arrumado.
    const left = await admin.from('family_members').update({ left_at: new Date().toISOString() })
      .eq('family_id', famDan).eq('user_id', fia.id).is('left_at', null)
    if (left.error) throw left.error
  })

  afterAll(async () => {
    await removeUsers(dan, fia)
  })

  test('o administrador não edita nem exclui o gasto de quem saiu (I2)', async () => {
    expect((await dan.client.rpc('admin_update_family_expense', { p_id: fiaExpense, p_amount_cents: 1, p_on: today, p_note: 'x' })).error?.message)
      .toContain('Gasto não encontrado.')
    expect((await dan.client.rpc('admin_delete_family_expense', { p_id: fiaExpense })).error?.message).toContain('Gasto não encontrado.')
    expect((await fia.client.from('transactions').select('amount_cents, note, family_id').eq('id', fiaExpense).single()).data)
      .toEqual({ amount_cents: 4000, note: null, family_id: famDan })
    // O histórico continua com o nome (RN-23).
    expect((await familyRows(dan)).find((r) => r.id === fiaExpense)).toMatchObject({ author_id: fia.id, author_name: 'Fia', amount_cents: 4000 })
    // E a tela nem oferece o ajuste: can_adjust é falso para o gasto de quem saiu, e sim para o do próprio administrador.
    expect((await familyRows(dan)).find((r) => r.id === fiaExpense)?.can_adjust).toBe(false)
    expect(((await dan.client.rpc('family_expense', { p_id: fiaExpense })).data as FamilyExpenseRow[])[0].can_adjust).toBe(false)
    const danOwn = await expense(dan, 'casa', 100, { family_id: famDan })
    expect((await familyRows(dan)).find((r) => r.id === danOwn)?.can_adjust).toBe(true)
  })

  test('quem saiu não transforma gasto antigo em conta nem reabre conta encerrada (I3)', async () => {
    const toBill = await fia.client.from('transactions')
      .update({ status: 'pending', due_on: today, amount_cents: 9999999999 }).eq('id', fiaExpense).select('id')
    expect(toBill.error?.message).toContain('Família não encontrada.')
    const reopen = await fia.client.from('recurrences').update({ ended_on: null }).eq('id', fiaEnded).select('id')
    expect(reopen.error?.message).toContain('Família não encontrada.')
    const bump = await fia.client.from('transactions').update({ amount_cents: 9999999999 }).eq('id', fiaPending).select('id')
    expect(bump.error?.message).toContain('Família não encontrada.')
    expect((await fia.client.from('recurrences').select('ended_on').eq('id', fiaEnded).single()).data?.ended_on).toBe(today)
    expect((await fia.client.from('transactions').select('amount_cents').eq('id', fiaPending).single()).data?.amount_cents).toBe(7000)
  })

  test('a sobra de quem saiu não aparece, não se paga, não se altera e não derruba a geração (I3)', async () => {
    expect(((await dan.client.rpc('family_bills')).data as { id: string }[]).some((b) => b.id === fiaPending)).toBe(false)
    expect(((await dan.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === fiaOpen)).toBe(false)
    expect((await dan.client.rpc('pay_family_bill', { p_id: fiaPending })).error?.message).toContain('Conta não encontrada.')
    expect((await dan.client.rpc('update_family_recurrence', { p_id: fiaOpen, p_name: 'X', p_amount_cents: 1, p_due_day: 1 })).error?.message)
      .toContain('Conta não encontrada.')
    expect((await dan.client.rpc('end_family_recurrence', { p_id: fiaOpen })).error?.message).toContain('Conta não encontrada.')

    expect((await dan.client.rpc('generate_family_occurrences')).error).toBeNull()
    const gas = await familyBill(dan, famDan, 'casa', 1000, { name: 'Gás' })
    expect(((await dan.client.rpc('family_bills')).data as { name: string }[]).map((b) => b.name)).toEqual(['Gás'])
    expect((await dan.client.from('transactions').select('id').eq('recurrence_id', gas)).data).toHaveLength(1)
    const fiaRows = await admin.from('transactions').select('id').eq('recurrence_id', fiaOpen)
    expect(fiaRows.data).toEqual([{ id: fiaPending }])
  })

  test('quem saiu ainda edita o próprio gasto antigo e pode tirá-lo da família (decisão 97)', async () => {
    expect((await fia.client.from('transactions').update({ amount_cents: 4500 }).eq('id', fiaExpense).select('id')).data).toHaveLength(1)
    expect((await familyRows(dan)).find((r) => r.id === fiaExpense)).toMatchObject({ amount_cents: 4500 })
    expect((await fia.client.from('transactions').update({ family_id: null }).eq('id', fiaExpense).select('id')).data).toHaveLength(1)
    expect((await familyRows(dan)).some((r) => r.id === fiaExpense)).toBe(false)
    // Marcar de novo como da família, não.
    const back = await fia.client.from('transactions').update({ family_id: famDan }).eq('id', fiaExpense).select('id')
    expect(back.error?.message).toContain('Família não encontrada.')
  })
})
