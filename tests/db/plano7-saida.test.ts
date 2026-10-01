import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, expense, inviteCode, joinFamily, todaySP } from './family-helpers'

let ana: TestUser // administra
let bia: TestUser // sai
let eva: TestUser // é removida
let fabio: TestUser // membro
let famAna: string
let reforma: string
const created: TestUser[] = []
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`
const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'

async function user(name: string): Promise<TestUser> {
  const u = await newUser(name)
  created.push(u)
  return u
}
async function familyGoal(u: TestUser, name: string): Promise<string> {
  const { data, error } = await u.client.rpc('create_family_goal', { p_name: name, p_target_cents: 1_000_000, p_deadline: null })
  if (error) throw error
  return data as string
}
async function deposit(u: TestUser, goal: string, cents: number) {
  const { error } = await u.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: cents })
  if (error) throw error
}
async function totals(u: TestUser): Promise<Record<string, number>> {
  const { data, error } = await u.client.rpc('family_goal_totals')
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { goal_id: string; saved_cents: number }[]).map((r) => [r.goal_id, Number(r.saved_cents)]))
}
async function events(u: TestUser) {
  const { data, error } = await u.client.from('family_events').select('kind, member_name, goal_name, amount_cents').order('created_at').order('goal_name')
  if (error) throw error
  return (data ?? []).map((e) => ({ ...e, amount_cents: e.amount_cents === null ? null : Number(e.amount_cents) }))
}
async function familyRows(u: TestUser, to = today) {
  const { data, error } = await u.client.rpc('family_expenses', { p_from: monthStart, p_to: to })
  if (error) throw error
  return data as { id: string; author_id: string | null; author_name: string | null; category_key: string | null; category_name: string; amount_cents: number; note: string | null }[]
}
async function familyBill(owner: TestUser, family: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await owner.client.from('recurrences').insert({
    user_id: owner.id, kind: 'expense', name, amount_cents: 10000, category_id: await categoryId(owner, 'casa'),
    frequency: 'monthly', due_day: 28, starts_on: monthStart, family_id: family, ...extra,
  }).select('id').single()
  if (error) throw error
  await owner.client.rpc('generate_family_occurrences')
  return data.id as string
}

beforeAll(async () => {
  ;[ana, bia, eva, fabio] = await Promise.all(['Ana', 'Bia', 'Eva', 'Fábio'].map((n) => user(n)))
  famAna = await createFamily(ana, 'Família Souza')
  for (const u of [bia, eva, fabio]) await joinFamily(u, ana)
  reforma = await familyGoal(ana, 'Reforma da cozinha')
})

afterAll(async () => {
  await removeUsers(...created)
})

describe('sair da família (RN-22d, RN-23, Review Focus 3)', () => {
  let biaExpense: string
  let biaBill: string

  test('a parte nas metas volta hoje para quem sai; a família recebe o aviso; o histórico fica com o nome', async () => {
    await deposit(bia, reforma, 2000)
    biaExpense = await expense(bia, 'mercado', 31240, { family_id: famAna })
    biaBill = await familyBill(bia, famAna, 'Faxina')
    expect((await bia.client.rpc('leave_family')).error).toBeNull()
    const moves = await bia.client.from('goal_movements').select('kind, amount_cents, occurred_on').eq('goal_id', reforma).eq('kind', 'return_on_exit')
    expect(moves.data).toEqual([{ kind: 'return_on_exit', amount_cents: 2000, occurred_on: today }])
    expect((await totals(ana))[reforma]).toBe(0)
    expect(await events(ana)).toEqual([{ kind: 'member_left', member_name: 'Bia', goal_name: 'Reforma da cozinha', amount_cents: 2000 }])
    expect((await familyRows(ana)).find((r) => r.id === biaExpense)).toMatchObject({ author_id: bia.id, author_name: 'Bia', amount_cents: 31240 })
  })

  test('ex-membro perde todo acesso ao espaço da família na hora, inclusive ao histórico dos outros', async () => {
    const anaExpense = await expense(ana, 'casa', 5000, { family_id: famAna })
    expect((await bia.client.rpc('my_family_id')).data).toBeNull()
    for (const table of ['families', 'family_members', 'family_events', 'family_invites']) {
      expect((await bia.client.from(table).select('id')).data ?? []).toEqual([])
    }
    expect((await bia.client.from('goals').select('id').eq('id', reforma)).data).toEqual([])
    expect(await familyRows(bia)).toEqual([])
    expect(await totals(bia)).toEqual({})
    expect((await bia.client.rpc('family_bills')).data).toEqual([])
    expect((await bia.client.rpc('family_recurrences')).data).toEqual([])
    expect((await bia.client.rpc('family_expense', { p_id: anaExpense })).data).toEqual([])
  })

  test('os próprios registros continuam dela; contas da família que ela criou são encerradas e as não pagas saem', async () => {
    expect((await bia.client.from('transactions').select('family_id').eq('id', biaExpense).single()).data?.family_id).toBe(famAna)
    expect((await bia.client.from('recurrences').select('ended_on').eq('id', biaBill).single()).data?.ended_on).toBe(today)
    expect((await bia.client.from('transactions').select('id').eq('recurrence_id', biaBill).eq('status', 'pending')).data).toEqual([])
    expect(((await ana.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === biaBill)).toBe(false)
  })

  test('ex-membro não guarda, não paga, não convida e não marca nada novo como da família', async () => {
    const anaBill = await familyBill(ana, famAna, 'Aluguel')
    const pending = (await ana.client.from('transactions').select('id').eq('recurrence_id', anaBill).eq('status', 'pending').single()).data!.id
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: reforma, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    expect((await bia.client.rpc('pay_family_bill', { p_id: pending })).error?.message).toContain('Conta não encontrada.')
    expect((await bia.client.rpc('create_family_invite')).error?.message).toContain(ADMIN_ONLY)
    const { error } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 100, category_id: await categoryId(bia, 'casa'), occurred_on: today, family_id: famAna,
    })
    expect(error?.message).toContain('Família não encontrada.')
  })

  test('ex-membro ainda edita o próprio registro antigo; a família vê a mudança com o nome dele (RN-23)', async () => {
    const upd = await bia.client.from('transactions').update({ amount_cents: 30000 }).eq('id', biaExpense).select('id')
    expect(upd.data).toHaveLength(1)
    expect((await familyRows(ana)).find((r) => r.id === biaExpense)).toMatchObject({ amount_cents: 30000, author_name: 'Bia' })
  })

  test('quem saiu pode voltar com um convite novo', async () => {
    expect((await bia.client.rpc('accept_family_invite', { p_code: await inviteCode(ana) })).error).toBeNull()
    expect((await bia.client.rpc('my_family_role')).data).toBe('member')
    const rows = (await ana.client.from('family_members').select('left_at').eq('user_id', bia.id)).data!
    expect(rows.map((r) => r.left_at === null).sort()).toEqual([false, true])
  })
})

describe('administração ao sair (RN-25, Review Focus 5)', () => {
  test('administrador com outras pessoas não sai sem passar a administração', async () => {
    expect((await ana.client.rpc('leave_family')).error?.message).toContain('Escolha quem vai administrar a família antes de sair.')
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('sozinho, sair encerra a família; depois dá para criar outra', async () => {
    const gil = await user('Gil')
    const fam = await createFamily(gil, 'Família Gil')
    expect((await gil.client.rpc('leave_family')).error).toBeNull()
    expect((await admin.from('families').select('ended_at').eq('id', fam).single()).data?.ended_at).not.toBeNull()
    expect((await gil.client.rpc('my_family_id')).data).toBeNull()
    expect((await gil.client.rpc('create_family', { p_name: 'Família Nova' })).error).toBeNull()
  })

  test('quem não participa de família nenhuma não sai', async () => {
    const hugo = await user('Hugo')
    expect((await hugo.client.rpc('leave_family')).error?.message).toContain('Família não encontrada.')
  })
})

describe('remover um membro (RF-44)', () => {
  test('só o administrador; nunca a si mesmo nem quem é de fora; a parte volta para quem foi removido', async () => {
    await deposit(eva, reforma, 1500)
    expect((await fabio.client.rpc('remove_family_member', { p_user: eva.id })).error?.message).toContain(ADMIN_ONLY)
    const outsider = await user('Iara')
    for (const p_user of [ana.id, outsider.id, null]) {
      expect((await ana.client.rpc('remove_family_member', { p_user })).error?.message).toContain('Pessoa não encontrada.')
    }
    expect((await ana.client.rpc('remove_family_member', { p_user: eva.id })).error).toBeNull()
    expect((await eva.client.rpc('my_family_id')).data).toBeNull()
    const back = await eva.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', reforma).eq('kind', 'return_on_exit')
    expect(back.data).toEqual([{ kind: 'return_on_exit', amount_cents: 1500 }])
    expect((await events(fabio)).at(-1)).toEqual({ kind: 'member_left', member_name: 'Eva', goal_name: 'Reforma da cozinha', amount_cents: 1500 })
  })
})

describe('excluir o cadastro (RN-22e, RN-24; tela no Plano 9)', () => {
  test('gastos da família ficam como Ex-membro, sem nome; a parte sai das metas; a parte já usada fica na compra', async () => {
    const ivo = await newUser('Ivo') // excluído no teste: fora de `created`
    await joinFamily(ivo, ana)
    const pet = (await ivo.client.from('categories').insert({ user_id: ivo.id, name: 'Pet' }).select('id').single()).data!.id
    const { data: petExpense } = await ivo.client.from('transactions').insert({
      user_id: ivo.id, kind: 'expense', amount_cents: 4000, category_id: pet, occurred_on: today, family_id: famAna,
    }).select('id').single()
    const personal = await expense(ivo, 'lazer', 999)
    const ivoBill = await familyBill(ivo, famAna, 'Internet')
    const g1 = await familyGoal(ana, 'Viagem')
    const g2 = await familyGoal(ana, 'Sofá')
    await deposit(ivo, g1, 3000)
    await deposit(ana, g2, 1000)
    await deposit(ivo, g2, 1000)
    const { data: used } = await ana.client.rpc('use_family_goal', { p_goal_id: g2, p_amount_cents: 1500, p_category_id: await categoryId(ana, 'casa') })
    const useTx = (used as { tx_id: string }[])[0].tx_id
    const before = await totals(ana)
    const eventsBefore = (await events(ana)).length

    const { error } = await admin.auth.admin.deleteUser(ivo.id)
    expect(error).toBeNull()

    expect((await familyRows(ana)).find((r) => r.id === petExpense!.id)).toMatchObject({
      author_id: null, author_name: null, category_key: null, category_name: 'Pet', amount_cents: 4000,
    })
    expect((await admin.from('transactions').select('id').eq('id', personal)).data).toEqual([])
    expect((await admin.from('transactions').select('id').eq('recurrence_id', ivoBill)).data).toEqual([])
    const after = await totals(ana)
    expect(after[g1]).toBe(before[g1] - 3000)
    expect(after[g2]).toBe(250)
    const useMoves = (await admin.from('goal_movements').select('user_id, amount_cents').eq('transaction_id', useTx)).data!
    expect(useMoves.map((m) => [m.user_id === null ? null : 'ana', Number(m.amount_cents)]).sort()).toEqual([['ana', 750], [null, 750]])
    expect((await ana.client.from('transactions').select('amount_cents, goal_funded_cents').eq('id', useTx).single()).data).toEqual({ amount_cents: 1500, goal_funded_cents: 1500 })
    expect((await events(ana)).slice(eventsBefore)).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: 'Sofá', amount_cents: null },
      { kind: 'member_deleted', member_name: null, goal_name: 'Viagem', amount_cents: null },
    ])
    const rows = (await ana.client.from('family_members').select('user_id, display_name, left_at')).data!
    expect(rows.some((m) => m.user_id === ivo.id)).toBe(false)
    expect(rows.filter((m) => m.user_id === null).every((m) => m.display_name === null && m.left_at !== null)).toBe(true)
  })

  test('administrador que exclui o cadastro passa o papel a quem participa há mais tempo; a compra com a meta fica e pode ser desfeita', async () => {
    const [jo, ka, lu] = [await newUser('Jô'), await user('Ká'), await user('Lu')]
    await createFamily(jo, 'Família Jô')
    await joinFamily(ka, jo)
    await joinFamily(lu, jo)
    const goal = await familyGoal(jo, 'Geladeira')
    await deposit(jo, goal, 1000)
    await deposit(ka, goal, 1000)
    const { data } = await jo.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2000, p_category_id: await categoryId(jo, 'casa') })
    const tx = (data as { tx_id: string }[])[0].tx_id

    expect((await admin.auth.admin.deleteUser(jo.id)).error).toBeNull()

    expect((await ka.client.rpc('my_family_role')).data).toBe('admin')
    expect((await lu.client.rpc('my_family_role')).data).toBe('member')
    const { data: rows } = await ka.client.rpc('family_expenses', { p_from: monthStart, p_to: today })
    expect((rows as { id: string; author_id: string | null }[]).find((r) => r.id === tx)?.author_id).toBeNull()
    expect((await ka.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error).toBeNull()
    expect(Number((await ka.client.rpc('goal_balance', { p_goal_id: goal })).data)).toBe(1000)
  })

  test('sozinho, excluir o cadastro encerra a família; conta paga por outro membro continua dele', async () => {
    const mo = await newUser('Mô')
    const famMo = await createFamily(mo, 'Família Mô')
    expect((await admin.auth.admin.deleteUser(mo.id)).error).toBeNull()
    expect((await admin.from('families').select('ended_at').eq('id', famMo).single()).data?.ended_at).not.toBeNull()

    const [ze, yan] = [await newUser('Zé'), await user('Yan')]
    const famZe = await createFamily(ze, 'Família Zé')
    await joinFamily(yan, ze)
    const rec = await familyBill(ze, famZe, 'Luz')
    const pending = (await ze.client.from('transactions').select('id').eq('recurrence_id', rec).eq('status', 'pending').single()).data!.id
    const paid = (await yan.client.rpc('pay_family_bill', { p_id: pending })).data as string
    expect((await admin.auth.admin.deleteUser(ze.id)).error).toBeNull()
    expect((await yan.client.from('transactions').select('amount_cents, status').eq('id', paid).single()).data).toEqual({ amount_cents: 10000, status: 'confirmed' })
    expect((await yan.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('excluir cadastro sem família continua como antes', async () => {
    const solo = await newUser('Solo')
    await expense(solo, 'lazer', 100)
    expect((await admin.auth.admin.deleteUser(solo.id)).error).toBeNull()
    expect((await admin.from('transactions').select('id').eq('user_id', solo.id)).data).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Emendas da revisão de segurança (sql-design-review.md: I1, I4, I5, M1–M3) e
// das revisões das Tasks 2–4: tudo conferido depois de uma saída de verdade
// (leave_family / remove_family_member), não de uma simulação.
// ---------------------------------------------------------------------------

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

async function part(u: TestUser, goal: string): Promise<number> {
  return Number((await u.client.rpc('goal_balance', { p_goal_id: goal })).data)
}
async function useAs(u: TestUser, goal: string, cents: number): Promise<string> {
  const { data, error } = await u.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: cents, p_category_id: await categoryId(u, 'casa') })
  if (error) throw error
  return (data as { tx_id: string }[])[0].tx_id
}
async function uses(goal: string) {
  const { data, error } = await admin.from('goal_movements').select('user_id, amount_cents').eq('goal_id', goal).eq('kind', 'use')
  if (error) throw error
  return data.map((m) => ({ user_id: m.user_id as string | null, amount_cents: Number(m.amount_cents) }))
}
async function familyEvents(family: string) {
  const { data, error } = await admin.from('family_events').select('kind, member_id, member_name, goal_name, amount_cents')
    .eq('family_id', family).order('created_at').order('goal_name')
  if (error) throw error
  return data.map((e) => ({ ...e, amount_cents: e.amount_cents === null ? null : Number(e.amount_cents) }))
}
async function activeAdmins(family: string): Promise<string[]> {
  const { data, error } = await admin.from('family_members').select('user_id').eq('family_id', family).eq('role', 'admin').is('left_at', null)
  if (error) throw error
  return data.map((m) => m.user_id as string)
}

describe('depois de uma saída de verdade: a família não mexe no que é de quem saiu, nem quem saiu na família (I2, I3, C1, M2)', () => {
  let rui: TestUser // administra; depois passa o papel e sai
  let sol: TestUser // sai
  let tom: TestUser // fica
  let famRui: string
  let solCard: string
  let solPet: string
  let solExpense: string
  let solBill: string
  let solPlan: string
  let geladeira: string
  let sofa: string
  let geladeiraTx: string

  beforeAll(async () => {
    ;[rui, sol, tom] = await Promise.all(['Rui', 'Sol', 'Tom'].map((n) => user(n)))
    famRui = await createFamily(rui, 'Família Rui')
    await joinFamily(sol, rui)
    await joinFamily(tom, rui)

    solCard = (await sol.client.from('cards').insert({ user_id: sol.id, nickname: 'Nubank', kind: 'credit', color: 'purple' }).select('id').single()).data!.id
    solPet = (await sol.client.from('categories').insert({ user_id: sol.id, name: 'Pet' }).select('id').single()).data!.id
    const spent = await sol.client.from('transactions').insert({
      user_id: sol.id, kind: 'expense', amount_cents: 4000, category_id: solPet, occurred_on: today, family_id: famRui, card_id: solCard,
    }).select('id').single()
    if (spent.error) throw spent.error
    solExpense = spent.data.id as string
    // Conta da família com o cartão e a categoria dela, com uma ocorrência a pagar.
    solBill = await familyBill(sol, famRui, 'Ração', { category_id: solPet, card_id: solCard })
    const plan = await sol.client.rpc('create_installment_purchase', {
      p_amount_cents: 30000, p_count: 3, p_category_id: await categoryId(sol, 'compras'), p_note: 'Fogão',
      p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
    })
    if (plan.error) throw plan.error
    solPlan = plan.data as string

    geladeira = await familyGoal(rui, 'Geladeira')
    await deposit(rui, geladeira, 1000)
    await deposit(sol, geladeira, 1000)
    geladeiraTx = await useAs(rui, geladeira, 2000)
    sofa = await familyGoal(rui, 'Sofá')
    await deposit(sol, sofa, 500)
    await deposit(rui, sofa, 800)

    const left = await sol.client.rpc('leave_family')
    if (left.error) throw left.error
  })

  test('toda parte maior que zero volta na saída (só onde havia parte); nada fica parado na meta', async () => {
    const back = await sol.client.from('goal_movements').select('goal_id, kind, amount_cents').eq('kind', 'return_on_exit')
    expect(back.data).toEqual([{ goal_id: sofa, kind: 'return_on_exit', amount_cents: 500 }])
    expect([await part(sol, sofa), await part(sol, geladeira)]).toEqual([0, 0])
    const seen = await totals(rui)
    expect([seen[sofa], seen[geladeira]]).toEqual([800, 0])
    const row = (await admin.from('family_members').select('id').eq('family_id', famRui).eq('user_id', sol.id).single()).data!.id
    expect(await familyEvents(famRui)).toEqual([{ kind: 'member_left', member_id: row, member_name: 'Sol', goal_name: 'Sofá', amount_cents: 500 }])
  })

  test('o administrador não edita nem exclui o gasto de quem saiu (I2)', async () => {
    expect((await rui.client.rpc('admin_update_family_expense', { p_id: solExpense, p_amount_cents: 1, p_on: today, p_note: 'x' })).error?.message)
      .toContain('Gasto não encontrado.')
    expect((await rui.client.rpc('admin_delete_family_expense', { p_id: solExpense })).error?.message).toContain('Gasto não encontrado.')
    expect((await sol.client.from('transactions').select('amount_cents, note, family_id').eq('id', solExpense).single()).data)
      .toEqual({ amount_cents: 4000, note: null, family_id: famRui })
    expect((await familyRows(rui)).find((r) => r.id === solExpense)).toMatchObject({ author_id: sol.id, author_name: 'Sol', amount_cents: 4000 })
  })

  test('quem saiu não cria conta para a família pagar, não reabre a conta encerrada e não derruba a geração (I3)', async () => {
    const toBill = await sol.client.from('transactions')
      .update({ status: 'pending', due_on: today, amount_cents: 9999999999 }).eq('id', solExpense).select('id')
    expect(toBill.error?.message).toContain('Família não encontrada.')
    const reopen = await sol.client.from('recurrences').update({ ended_on: null }).eq('id', solBill).select('id')
    expect(reopen.error?.message).toContain('Família não encontrada.')
    const fresh = await sol.client.from('recurrences').insert({
      user_id: sol.id, kind: 'expense', name: 'Nova', amount_cents: 100, category_id: await categoryId(sol, 'casa'),
      frequency: 'monthly', due_day: 10, starts_on: monthStart, family_id: famRui,
    })
    expect(fresh.error?.message).toContain('Família não encontrada.')
    expect((await sol.client.from('transactions').select('status, amount_cents').eq('id', solExpense).single()).data).toEqual({ status: 'confirmed', amount_cents: 4000 })
    expect((await sol.client.from('recurrences').select('ended_on').eq('id', solBill).single()).data?.ended_on).toBe(today)

    // Nada de quem saiu ficou a pagar, e a geração continua para os outros.
    expect((await admin.from('transactions').select('id').eq('recurrence_id', solBill).eq('status', 'pending')).data).toEqual([])
    expect((await sol.client.rpc('generate_family_occurrences')).data).toBe(0)
    expect((await rui.client.rpc('generate_family_occurrences')).error).toBeNull()
    await familyBill(rui, famRui, 'Gás')
    expect(((await rui.client.rpc('family_bills')).data as { name: string }[]).map((b) => b.name)).toEqual(['Gás'])
    expect(((await rui.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === solBill)).toBe(false)
    expect((await rui.client.rpc('update_family_recurrence', { p_id: solBill, p_name: 'X', p_amount_cents: 1, p_due_day: 1 })).error?.message)
      .toContain('Conta não encontrada.')
    expect((await rui.client.rpc('end_family_recurrence', { p_id: solBill })).error?.message).toContain('Conta não encontrada.')
  })

  test('parcelas da família que ainda vão vencer voltam a ser só de quem saiu; a de hoje fica no histórico (M2)', async () => {
    const rows = (await sol.client.from('transactions').select('installment_number, family_id, occurred_on').eq('installment_plan_id', solPlan).order('installment_number')).data!
    expect(rows.map((r) => [r.installment_number, r.family_id, r.occurred_on > today])).toEqual([[1, famRui, false], [2, null, true], [3, null, true]])
    const seen = (await familyRows(rui, plusDays(today, 300))).filter((r) => r.author_id === sol.id && r.note === 'Fogão')
    expect(seen).toHaveLength(1)
  })

  test('depois de sair, a pessoa exclui o cartão e a categoria que usava nos gastos e na conta da família', async () => {
    expect((await sol.client.rpc('delete_card', { p_card_id: solCard })).error).toBeNull()
    expect((await sol.client.rpc('delete_category', { p_category_id: solPet })).error).toBeNull()
    const outros = await categoryId(sol, 'outros')
    expect((await sol.client.from('transactions').select('amount_cents, card_id, card_deleted, category_id, family_id').eq('id', solExpense).single()).data)
      .toEqual({ amount_cents: 4000, card_id: null, card_deleted: true, category_id: outros, family_id: famRui })
    expect((await sol.client.from('recurrences').select('card_id, category_id, ended_on, family_id').eq('id', solBill).single()).data)
      .toEqual({ card_id: null, category_id: outros, ended_on: today, family_id: famRui })
    expect((await sol.client.from('cards').select('id').eq('id', solCard)).data).toEqual([])
    expect((await sol.client.from('categories').select('id').eq('id', solPet)).data).toEqual([])
    expect((await familyRows(rui)).find((r) => r.id === solExpense)).toMatchObject({ category_key: 'outros', amount_cents: 4000 })
  })

  test('com a parte de quem saiu no uso, o uso não é desfeito; a meta continua servindo aos outros (C1)', async () => {
    expect((await rui.client.rpc('delete_family_goal_use', { p_transaction_id: geladeiraTx })).error?.message).toContain('Gasto não encontrado.')
    expect(await part(sol, geladeira)).toBe(0)
    expect(await uses(geladeira)).toHaveLength(2)
    expect((await rui.client.from('transactions').select('id').eq('id', geladeiraTx)).data).toHaveLength(1)

    // A saída de verdade não deixa parte parada: usar e excluir seguem valendo.
    await useAs(rui, sofa, 800)
    expect(await uses(sofa)).toEqual([{ user_id: rui.id, amount_cents: 800 }])
    expect((await rui.client.rpc('delete_family_goal', { p_goal_id: geladeira })).error).toBeNull()
    expect((await rui.client.rpc('delete_family_goal', { p_goal_id: sofa })).error).toBeNull()
  })

  test('o gasto de quem usou a meta, passou a administração e saiu continua dele: o novo administrador não o apaga (C1)', async () => {
    const tv = await familyGoal(tom, 'TV')
    await deposit(rui, tv, 1000)
    await deposit(tom, tv, 1000)
    const tx = await useAs(rui, tv, 2000)
    expect((await rui.client.rpc('transfer_family_admin', { p_user: tom.id })).error).toBeNull()
    expect((await rui.client.rpc('leave_family')).error).toBeNull()
    expect((await rui.client.rpc('my_family_id')).data).toBeNull()
    expect(await activeAdmins(famRui)).toEqual([tom.id])

    expect((await tom.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error?.message).toContain('Gasto não encontrado.')
    expect((await rui.client.from('transactions').select('amount_cents, goal_funded_cents, family_id').eq('id', tx).single()).data)
      .toEqual({ amount_cents: 2000, goal_funded_cents: 2000, family_id: famRui })
    expect([await part(rui, tv), await part(tom, tv)]).toEqual([0, 0])
    expect(await uses(tv)).toHaveLength(2)
  })
})

describe('saída, remoção e administração ao mesmo tempo (I1, I4)', () => {
  let nina: TestUser // administra
  let otto: TestUser
  let pia: TestUser
  let famNina: string

  beforeAll(async () => {
    ;[nina, otto, pia] = await Promise.all(['Nina', 'Otto', 'Pia'].map((n) => user(n)))
    famNina = await createFamily(nina, 'Família Nina')
    await joinFamily(otto, nina)
    await joinFamily(pia, nina)
  })

  test('a família de uma conta que se repete não muda depois de criada', async () => {
    const bill = await familyBill(pia, famNina, 'Jardim')
    const out = await pia.client.from('recurrences').update({ family_id: null }).eq('id', bill).select('id')
    expect(out.error?.message).toContain('Família não encontrada.')
    const personal = (await pia.client.from('recurrences').insert({
      user_id: pia.id, kind: 'expense', name: 'Pessoal', amount_cents: 100, category_id: await categoryId(pia, 'casa'),
      frequency: 'monthly', due_day: 10, starts_on: monthStart,
    }).select('id').single()).data!.id
    const into = await pia.client.from('recurrences').update({ family_id: famNina }).eq('id', personal).select('id')
    expect(into.error?.message).toContain('Família não encontrada.')
    expect((await pia.client.from('recurrences').select('family_id').eq('id', bill).single()).data?.family_id).toBe(famNina)
    expect((await pia.client.from('recurrences').select('family_id').eq('id', personal).single()).data?.family_id).toBeNull()
    // Alterar o resto continua valendo para quem participa.
    expect((await pia.client.rpc('end_family_recurrence', { p_id: bill })).error).toBeNull()
  })

  test('guardar e ser removido ao mesmo tempo: nada fica parado com quem saiu (I1)', async () => {
    const goal = await familyGoal(nina, 'Viagem')
    await deposit(nina, goal, 700)
    await deposit(otto, goal, 1000)
    const [saved, removed] = await Promise.all([
      otto.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 500 }),
      nina.client.rpc('remove_family_member', { p_user: otto.id }),
    ])
    expect(removed.error).toBeNull()
    if (saved.error !== null) expect(saved.error.message).toContain('Meta não encontrada.')
    expect((await otto.client.rpc('my_family_id')).data).toBeNull()
    expect(await part(otto, goal)).toBe(0)
    const back = await otto.client.from('goal_movements').select('amount_cents').eq('goal_id', goal).eq('kind', 'return_on_exit')
    expect(back.data).toEqual([{ amount_cents: saved.error === null ? 1500 : 1000 }])
    expect((await totals(nina))[goal]).toBe(700)
    // A meta continua servindo: sem parte de quem saiu, usar não é recusado.
    await useAs(nina, goal, 700)
    expect(await uses(goal)).toEqual([{ user_id: nina.id, amount_cents: 700 }])
  })

  test('passar a administração e remover a mesma pessoa ao mesmo tempo: a família nunca fica sem administrador (I4)', async () => {
    const [transferred, removed] = await Promise.all([
      nina.client.rpc('transfer_family_admin', { p_user: pia.id }),
      nina.client.rpc('remove_family_member', { p_user: pia.id }),
    ])
    const results = [transferred, removed]
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    const refusal = results.find((r) => r.error !== null)!.error!.message
    expect([ADMIN_ONLY, 'Pessoa não encontrada.'].some((m) => refusal.includes(m))).toBe(true)
    const admins = await activeAdmins(famNina)
    expect(admins).toHaveLength(1)
    if (transferred.error === null) {
      expect(admins).toEqual([pia.id])
      expect((await pia.client.rpc('my_family_role')).data).toBe('admin')
      expect((await nina.client.rpc('my_family_role')).data).toBe('member')
    } else {
      expect(admins).toEqual([nina.id])
      expect((await pia.client.rpc('my_family_id')).data).toBeNull()
    }
  })

  test('sair e gerar as contas da família ao mesmo tempo: os dois pedidos terminam, sem impasse (ordem das travas)', async () => {
    const [raul, sara] = [await user('Raul'), await user('Sara')]
    const fam = await createFamily(raul, 'Família Raul')
    await joinFamily(sara, raul)
    // Contas da Sara ainda não geradas neste mês: é o que a geração trava e a saída encerra.
    const open: string[] = []
    for (const name of ['Luz', 'Água', 'Gás']) {
      const { data, error } = await sara.client.from('recurrences').insert({
        user_id: sara.id, kind: 'expense', name, amount_cents: 5000, category_id: await categoryId(sara, 'casa'),
        frequency: 'monthly', due_day: 28, starts_on: monthStart, family_id: fam,
      }).select('id').single()
      if (error) throw error
      open.push(data.id as string)
    }
    const [left, generated] = await Promise.all([
      sara.client.rpc('leave_family'),
      raul.client.rpc('generate_family_occurrences'),
    ])
    expect(left.error).toBeNull()
    expect(generated.error).toBeNull()
    expect((await sara.client.rpc('my_family_id')).data).toBeNull()
    // Quem quer que tenha chegado primeiro: nada da Sara fica aberto nem a pagar na família.
    const templates = (await admin.from('recurrences').select('ended_on').in('id', open)).data!
    expect(templates.map((t) => t.ended_on)).toEqual([today, today, today])
    expect((await admin.from('transactions').select('id').in('recurrence_id', open)).data).toEqual([])
    expect((await raul.client.rpc('family_bills')).data).toEqual([])
    expect((await raul.client.rpc('generate_family_occurrences')).error).toBeNull()
  })

  test('criar uma conta da família por gravação direta no instante da remoção: nada aberto fica com quem saiu', async () => {
    const [teo, uli] = [await user('Teo'), await user('Uli')]
    const fam = await createFamily(teo, 'Família Teo')
    await joinFamily(uli, teo)
    const card = (await uli.client.from('cards').insert({ user_id: uli.id, nickname: 'Inter', kind: 'debit', color: 'orange' }).select('id').single()).data!.id
    const [inserted, removed] = await Promise.all([
      uli.client.from('recurrences').insert({
        user_id: uli.id, kind: 'expense', name: 'Direta', amount_cents: 100, category_id: await categoryId(uli, 'casa'),
        frequency: 'monthly', due_day: 10, starts_on: monthStart, family_id: fam, card_id: card,
      }),
      teo.client.rpc('remove_family_member', { p_user: uli.id }),
    ])
    expect(removed.error).toBeNull()
    if (inserted.error !== null) expect(inserted.error.message).toContain('Família não encontrada.')
    const leftOpen = await admin.from('recurrences').select('id').eq('user_id', uli.id).eq('family_id', fam).is('ended_on', null)
    expect(leftOpen.data).toEqual([])
    expect((await uli.client.rpc('delete_card', { p_card_id: card })).error).toBeNull()
  })

  test('sozinho e com parte numa meta: a parte volta, a família é encerrada e nenhum aviso é gravado', async () => {
    const vito = await user('Vito')
    const fam = await createFamily(vito, 'Família Vito')
    const goal = await familyGoal(vito, 'Viagem')
    await deposit(vito, goal, 4200)
    expect((await vito.client.rpc('leave_family')).error).toBeNull()
    expect((await vito.client.from('goal_movements').select('kind, amount_cents, occurred_on').eq('goal_id', goal).order('created_at')).data)
      .toEqual([{ kind: 'deposit', amount_cents: 4200, occurred_on: today }, { kind: 'return_on_exit', amount_cents: 4200, occurred_on: today }])
    expect(await part(vito, goal)).toBe(0)
    expect((await admin.from('families').select('ended_at').eq('id', fam).single()).data?.ended_at).not.toBeNull()
    expect(await familyEvents(fam)).toEqual([])
  })

  test('família encerrada pela saída: o convite pendente deixa de valer', async () => {
    const quim = await user('Quim')
    const fam = await createFamily(quim, 'Família Quim')
    const code = await inviteCode(quim)
    expect((await quim.client.rpc('leave_family')).error).toBeNull()
    expect((await admin.from('family_invites').select('revoked_at').eq('family_id', fam).single()).data?.revoked_at).not.toBeNull()
    expect(await familyEvents(fam)).toEqual([])
    expect((await otto.client.rpc('invite_preview', { p_code: code })).data).toEqual([])
    expect((await otto.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await otto.client.rpc('my_family_id')).data).toBeNull()
  })
})

describe('saída e remoção só para quem participa, e da própria família (I5)', () => {
  test('sem sessão ninguém sai nem remove; as funções internas não são chamáveis por ninguém', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    expect((await anon.rpc('leave_family')).error?.message).toContain('permission denied')
    expect((await anon.rpc('remove_family_member', { p_user: fabio.id })).error?.message).toContain('permission denied')
    for (const client of [anon, bia.client, ana.client]) {
      expect((await client.rpc('family_detach', { p_family: famAna, p_user: fabio.id })).error?.message).toContain('permission denied')
      // Função de gatilho: a API nem a oferece (PGRST202) ou o banco recusa (42501).
      expect(['PGRST202', '42501']).toContain((await client.rpc('handle_user_deleted')).error?.code)
    }
    expect((await fabio.client.rpc('my_family_id')).data).toBe(famAna)
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('administrador de outra família não remove ninguém desta, e ninguém remove quem é de outra', async () => {
    const dani = await user('Dani')
    const famDani = await createFamily(dani, 'Família Dani')
    expect((await dani.client.rpc('remove_family_member', { p_user: fabio.id })).error?.message).toContain('Pessoa não encontrada.')
    expect((await ana.client.rpc('remove_family_member', { p_user: dani.id })).error?.message).toContain('Pessoa não encontrada.')
    expect((await fabio.client.rpc('my_family_id')).data).toBe(famAna)
    expect((await dani.client.rpc('my_family_id')).data).toBe(famDani)
    expect((await dani.client.rpc('my_family_role')).data).toBe('admin')
  })
})

describe('excluir o cadastro nunca é barrado pela família e não deixa nada da pessoa para trás (RN-24, M1, M3)', () => {
  let vera: TestUser // administra
  let famVera: string

  beforeAll(async () => {
    vera = await user('Vera')
    famVera = await createFamily(vera, 'Família Vera')
  })

  test('quem saiu e depois exclui o cadastro: o nome some dos avisos antigos e das participações', async () => {
    const wal = await newUser('Wal') // excluída no teste: fora de `created`
    await joinFamily(wal, vera)
    const goal = await familyGoal(vera, 'Bicicleta')
    await deposit(wal, goal, 900)
    const spent = await expense(wal, 'mercado', 2500, { family_id: famVera, note: 'feira' })
    expect((await wal.client.rpc('leave_family')).error).toBeNull()
    const row = (await admin.from('family_members').select('id').eq('family_id', famVera).eq('user_id', wal.id).single()).data!.id
    expect(await familyEvents(famVera)).toEqual([{ kind: 'member_left', member_id: row, member_name: 'Wal', goal_name: 'Bicicleta', amount_cents: 900 }])

    expect((await admin.auth.admin.deleteUser(wal.id)).error).toBeNull()

    const eventsAfter = await familyEvents(famVera)
    expect(eventsAfter).toEqual([{ kind: 'member_deleted', member_id: null, member_name: null, goal_name: 'Bicicleta', amount_cents: null }])
    const members = (await admin.from('family_members').select('user_id, role, display_name, left_at').eq('family_id', famVera)).data!
    expect(members.find((m) => m.user_id === null)).toMatchObject({ display_name: null, role: 'member' })
    expect(members.filter((m) => m.user_id !== null).map((m) => m.user_id)).toEqual([vera.id])
    expect(JSON.stringify([eventsAfter, members])).not.toContain('Wal')

    // O gasto fica como Ex-membro, sem apontar para nada do cadastro apagado (M1).
    expect((await familyRows(vera)).find((r) => r.id === spent)).toMatchObject({
      author_id: null, author_name: null, category_key: 'mercado', category_name: 'Mercado', amount_cents: 2500, note: 'feira',
    })
    expect((await admin.from('transactions').select('user_id, category_id, card_id, recurrence_id, installment_plan_id, ex_category_key, ex_category_name').eq('id', spent).single()).data)
      .toEqual({ user_id: null, category_id: null, card_id: null, recurrence_id: null, installment_plan_id: null, ex_category_key: 'mercado', ex_category_name: 'Mercado' })
    expect((await totals(vera))[goal]).toBe(0)
  })

  test('ninguém grava a categoria guardada do Ex-membro num registro que tem dono', async () => {
    const mine = await expense(vera, 'casa', 1000, { family_id: famVera })
    const forged = await vera.client.from('transactions').update({ ex_category_key: 'mercado', ex_category_name: 'Mercado' }).eq('id', mine).select('id')
    expect(forged.error?.code).toBe('23514')
    expect((await familyRows(vera)).find((r) => r.id === mine)).toMatchObject({ category_key: 'casa' })
  })

  test('parte parada de quem já não participa (banco antigo) não impede a exclusão; a parte usada fica na compra, sem dono', async () => {
    const xis = await newUser('Xis') // excluído no teste: fora de `created`
    await joinFamily(xis, vera)
    const goal = await familyGoal(vera, 'Fogão')
    await deposit(xis, goal, 300)
    await deposit(vera, goal, 300)
    const tx = await useAs(vera, goal, 400)
    // Saída só com left_at, sem devolver nada: sobra a parte de 100 e o "use" de quem saiu.
    const left = await admin.from('family_members').update({ left_at: new Date().toISOString() })
      .eq('family_id', famVera).eq('user_id', xis.id).is('left_at', null)
    expect(left.error).toBeNull()
    expect(await part(xis, goal)).toBe(100)

    expect((await admin.auth.admin.deleteUser(xis.id)).error).toBeNull()

    expect((await admin.from('goal_movements').select('id').eq('goal_id', goal).eq('user_id', xis.id)).data).toEqual([])
    const moves = (await admin.from('goal_movements').select('user_id, amount_cents').eq('transaction_id', tx)).data!
    expect(moves.map((m) => [m.user_id === null ? 'ex' : 'vera', Number(m.amount_cents)]).sort()).toEqual([['ex', 200], ['vera', 200]])
    expect((await vera.client.from('transactions').select('amount_cents, goal_funded_cents').eq('id', tx).single()).data).toEqual({ amount_cents: 400, goal_funded_cents: 400 })
    expect((await totals(vera))[goal]).toBe(100)
    // Sem parte de quem saiu, a meta volta a aceitar a exclusão.
    expect((await vera.client.rpc('delete_family_goal', { p_goal_id: goal })).error).toBeNull()
  })

  test('administradora que exclui o cadastro: o convite pendente dela cai, e quem fica administra', async () => {
    const [zara, bento] = [await newUser('Zara'), await user('Bento')] // Zara é excluída no teste
    const fam = await createFamily(zara, 'Família Zara')
    await joinFamily(bento, zara)
    const code = await inviteCode(zara)
    expect((await admin.auth.admin.deleteUser(zara.id)).error).toBeNull()
    expect(await activeAdmins(fam)).toEqual([bento.id])
    expect(await familyEvents(fam)).toEqual([{ kind: 'member_deleted', member_id: null, member_name: null, goal_name: null, amount_cents: null }])
    expect((await vera.client.rpc('invite_preview', { p_code: code })).data).toEqual([])
    const outsider = await user('Caio')
    expect((await outsider.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await bento.client.rpc('create_family_invite')).error).toBeNull()
  })

  test('família encerrada pela exclusão: nenhum gasto, uso de meta, aviso ou nome de quem saiu por último fica guardado', async () => {
    const yuri = await newUser('Yuri') // excluído no teste: fora de `created`
    const fam = await createFamily(yuri, 'Família Yuri')
    const code = await inviteCode(yuri)
    await expense(yuri, 'mercado', 1234, { family_id: fam, note: 'só meu' })
    const goal = await familyGoal(yuri, 'Notebook')
    await deposit(yuri, goal, 500)
    await useAs(yuri, goal, 500)

    expect((await admin.auth.admin.deleteUser(yuri.id)).error).toBeNull()

    expect((await admin.from('families').select('ended_at').eq('id', fam).single()).data?.ended_at).not.toBeNull()
    expect((await admin.from('transactions').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goal_movements').select('id').eq('goal_id', goal)).data).toEqual([])
    expect(await familyEvents(fam)).toEqual([])
    expect((await admin.from('family_members').select('user_id, display_name').eq('family_id', fam)).data).toEqual([{ user_id: null, display_name: null }])
    expect((await vera.client.rpc('invite_preview', { p_code: code })).data).toEqual([])
  })

  test('família encerrada pela exclusão: o uso em que quem já saiu tem parte fica, para não mexer no guardado dessa pessoa', async () => {
    const [noa, lia] = [await newUser('Noa'), await user('Lia')] // Noa é excluída no teste
    const fam = await createFamily(noa, 'Família Noa')
    await joinFamily(lia, noa)
    const goal = await familyGoal(noa, 'Mesa')
    await deposit(noa, goal, 1000)
    await deposit(lia, goal, 1000)
    const tx = await useAs(noa, goal, 2000)
    expect((await lia.client.rpc('leave_family')).error).toBeNull()

    expect((await admin.auth.admin.deleteUser(noa.id)).error).toBeNull()

    expect((await admin.from('families').select('ended_at').eq('id', fam).single()).data?.ended_at).not.toBeNull()
    expect(await part(lia, goal)).toBe(0)
    expect((await lia.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', goal).order('created_at')).data)
      .toEqual([{ kind: 'deposit', amount_cents: 1000 }, { kind: 'use', amount_cents: 1000 }])
    expect((await admin.from('transactions').select('user_id, amount_cents, goal_funded_cents').eq('id', tx).single()).data)
      .toEqual({ user_id: null, amount_cents: 2000, goal_funded_cents: 2000 })
  })
})
