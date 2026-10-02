import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))

const {
  myFamilyId,
  loadMyFamily,
  loadFamilyExpenses,
  loadFamilyExpense,
  loadFamilySummary,
  loadFamilySummaryOrNull,
  loadFamilyBills,
  loadFamilyRecurrences,
  loadFamilyGoals,
  loadFamilyGoal,
} = await import('./queries')

// O redirecionamento do Next é um erro com `digest` próprio; o de verdade é reconhecido pelo unstable_rethrow.
const { redirect } = await import('next/navigation')

type Call = {
  table?: string
  op?: string
  select?: string
  filters?: Record<string, unknown>
  rpc?: string
  args?: unknown
  range?: [number, number]
}
let calls: Call[] = []
// Cada leitura de uma tabela (ou RPC) tira a próxima resposta da fila; a última se repete.
let responses: Record<string, unknown[][]> = {}

// Leituras que respondem com erro (por tabela).
const failing = new Map<string, unknown>()

function queue(r: Record<string, unknown[][]>) {
  responses = r
}
function next(key: string): unknown[] {
  const list = responses[key] ?? []
  return (list.length > 1 ? list.shift() : list[0]) ?? []
}

function builder(call: Call, key: string) {
  const rows = next(key)
  const filters = (call.filters ??= {})
  const b = {
    eq: (c: string, v: unknown) => ((filters[`eq:${c}`] = v), b),
    is: (c: string, v: unknown) => ((filters[`is:${c}`] = v), b),
    gt: (c: string, v: unknown) => ((filters[`gt:${c}`] = v), b),
    order: () => b,
    limit: () => b,
    range: (from: number, to: number) => ((call.range = [from, to]), b),
    maybeSingle: async () => (failing.has(key) ? { data: null, error: failing.get(key) } : { data: rows[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  }
  return b
}

h.supabase = {
  from: (table: string) => ({
    select: (select: string) => {
      const call: Call = { table, op: 'select', select }
      calls.push(call)
      return builder(call, table)
    },
  }),
  rpc: (name: string, args?: unknown) => {
    const call: Call = { rpc: name, args }
    calls.push(call)
    return builder(call, name)
  },
}

beforeEach(() => {
  calls = []
  responses = {}
  failing.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const tables = () => calls.filter((c) => c.table).map((c) => c.table)
const member = (role: 'admin' | 'member') => ({ user_id: 'u1', role, display_name: 'Ana', joined_at: '2026-08-01T12:00:00Z', left_at: null })
const goalRaw = {
  id: 'g1', name: 'Viagem', target_cents: 900000, deadline: null, status: 'active', used_on: null, deleted_on: null,
  created_at: 'c', family_id: 'f1', created_by: 'u2',
}

test('myFamilyId filtra a pessoa e só a participação ativa (Review Focus 3)', async () => {
  queue({ family_members: [[{ family_id: 'f1' }]] })
  expect(await myFamilyId(h.supabase as never, 'u1')).toBe('f1')
  expect(calls).toContainEqual({ table: 'family_members', op: 'select', select: 'family_id', filters: { 'eq:user_id': 'u1', 'is:left_at': null } })
})

test('myFamilyId sem família devolve null', async () => {
  queue({ family_members: [[]] })
  expect(await myFamilyId(h.supabase as never, 'u1')).toBeNull()
})

test('loadMyFamily sem família devolve null sem ler mais nada', async () => {
  queue({ family_members: [[]] })
  expect(await loadMyFamily()).toBeNull()
  expect(tables()).toEqual(['family_members'])
})

test('membro não lê convites; administrador lê só os pendentes, válidos e da própria família', async () => {
  queue({ family_members: [[{ family_id: 'f1' }], [member('member')]], families: [[{ id: 'f1', name: 'Família Souza' }]], family_events: [[]] })
  const asMember = (await loadMyFamily())!
  expect(asMember.invites).toEqual([])
  expect(asMember).toMatchObject({ id: 'f1', name: 'Família Souza', meId: 'u1', role: 'member' })
  expect(calls.some((c) => c.table === 'family_invites')).toBe(false)

  calls = []
  queue({
    family_members: [[{ family_id: 'f1' }], [member('admin')]],
    families: [[{ id: 'f1', name: 'Família Souza' }]],
    family_events: [[]],
    family_invites: [[{ id: 'i1', expires_at: '2026-10-05T12:00:00Z' }]],
  })
  const fam = (await loadMyFamily())!
  expect(fam.role).toBe('admin')
  expect(fam.invites).toEqual([{ id: 'i1', expiresAt: '2026-10-05T12:00:00Z' }])
  expect(calls.find((c) => c.table === 'family_invites')?.filters).toEqual({
    'eq:family_id': 'f1', 'is:accepted_at': null, 'is:revoked_at': null, 'gt:expires_at': '2026-09-28T15:00:00.000Z',
  })
})

test('família: filtros de cada leitura e nunca member_id nos avisos', async () => {
  queue({
    family_members: [[{ family_id: 'f1' }], [member('member')]],
    families: [[{ id: 'f1', name: 'X' }]],
    family_events: [[{ id: 'v1', kind: 'member_left', member_name: 'Bia', goal_name: null, amount_cents: '100', created_at: 'c' }]],
  })
  const fam = (await loadMyFamily())!
  expect(calls.find((c) => c.table === 'families')?.filters).toEqual({ 'eq:id': 'f1' })
  expect(calls.filter((c) => c.table === 'family_members')[1].filters).toEqual({ 'eq:family_id': 'f1' })
  const events = calls.find((c) => c.table === 'family_events')!
  expect(events.filters).toEqual({ 'eq:family_id': 'f1' })
  expect(events.select).not.toContain('member_id')
  expect(fam.events[0]).toMatchObject({ kind: 'member_left', memberName: 'Bia', amountCents: 100 })
})

test('loadFamilySummary: só a própria participação ativa e o nome', async () => {
  queue({ family_members: [[{ family_id: 'f1', role: 'admin' }]], families: [[{ id: 'f1', name: 'Família Souza' }]] })
  expect(await loadFamilySummary()).toEqual({ id: 'f1', name: 'Família Souza', role: 'admin' })
  expect(calls[0].filters).toEqual({ 'eq:user_id': 'u1', 'is:left_at': null })
  queue({ family_members: [[]] })
  expect(await loadFamilySummary()).toBeNull()
})

test('Seu mês: falha ao ler a família vira null e fica no registro, sem dados da pessoa', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  failing.set('family_members', { code: '57014', message: 'canceling statement due to statement timeout', details: 'u1 ana@teste.iris.dev', hint: null })
  expect(await loadFamilySummaryOrNull()).toBeNull()
  expect(log).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith('loadFamilySummary', { code: '57014', message: 'canceling statement due to statement timeout' })
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/u1|ana@teste/)

  // Sem falha: o mesmo resultado de loadFamilySummary, e nada no registro.
  log.mockClear()
  failing.clear()
  queue({ family_members: [[{ family_id: 'f1', role: 'member' }]], families: [[{ id: 'f1', name: 'Família Souza' }]] })
  expect(await loadFamilySummaryOrNull()).toEqual({ id: 'f1', name: 'Família Souza', role: 'member' })
  queue({ family_members: [[]] })
  expect(await loadFamilySummaryOrNull()).toBeNull()
  expect(log).not.toHaveBeenCalled()
  log.mockRestore()
})

test('Seu mês: o redirecionamento do Next não é engolido nem registrado como erro', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  let thrown: unknown
  try {
    redirect('/entrar')
  } catch (e) {
    thrown = e
  }
  failing.set('family_members', thrown)
  await expect(loadFamilySummaryOrNull()).rejects.toBe(thrown)
  expect(log).not.toHaveBeenCalled()
  log.mockRestore()
})

test('gastos da família: só o mês pedido, do dia 1 ao último dia, por RPC e em páginas', async () => {
  queue({
    family_expenses: [[{ id: 'e1', effective_on: '2026-02-03', amount_cents: '31240', category_key: null, category_name: 'Outros', note: null, author_id: 'u2', author_name: 'Bia', created_at: 'c', can_adjust: true }]],
  })
  const rows = await loadFamilyExpenses('2026-02')
  expect(calls[0]).toMatchObject({ rpc: 'family_expenses', args: { p_from: '2026-02-01', p_to: '2026-02-28' }, range: [0, 999] })
  expect(rows[0].amountCents).toBe(31240)
  expect(rows[0].canAdjust).toBe(true)
})

test('um gasto da família pelo RPC, só o que tem o id pedido', async () => {
  const row = { id: 'e1', effective_on: '2026-02-03', amount_cents: 100, category_key: null, category_name: 'Outros', note: null, author_id: 'u2', author_name: 'Bia', created_at: 'c', can_adjust: true }
  queue({ family_expense: [[{ ...row, can_adjust: false }]] })
  expect((await loadFamilyExpense('e1'))?.canAdjust).toBe(false)
  calls = []
  queue({ family_expense: [[row]] })
  expect(await loadFamilyExpense('e1')).toMatchObject({ id: 'e1', canAdjust: true })
  expect(calls[0]).toMatchObject({ rpc: 'family_expense', args: { p_id: 'e1' } })
  queue({ family_expense: [[row]] })
  expect(await loadFamilyExpense('e2')).toBeNull()
  queue({ family_expense: [[]] })
  expect(await loadFamilyExpense('e1')).toBeNull()
})

test('contas da família: gera as ocorrências antes de ler pelo RPC', async () => {
  queue({ family_bills: [[{ id: 'b1', name: 'Luz', amount_cents: '9000', due_on: '2026-10-10', author_id: 'u2' }]] })
  const bills = await loadFamilyBills()
  expect(calls.map((c) => c.rpc)).toEqual(['generate_occurrences', 'generate_family_occurrences', 'family_bills'])
  expect(bills).toEqual([{ id: 'b1', name: 'Luz', amountCents: 9000, dueOn: '2026-10-10', authorId: 'u2' }])
})

test('moldes da família pelo RPC', async () => {
  queue({ family_recurrences: [[{ id: 'r1', name: 'Aluguel', amount_cents: '150000', frequency: 'monthly', due_day: 5, due_month: null, author_id: 'u2' }]] })
  expect((await loadFamilyRecurrences())[0]).toMatchObject({ id: 'r1', dueDay: 5, amountCents: 150000 })
  expect(calls[0].rpc).toBe('family_recurrences')
})

test('metas da família: filtra a família, sem as excluídas, e junta o total', async () => {
  queue({ goals: [[goalRaw]], family_goal_totals: [[{ goal_id: 'g1', saved_cents: '300000' }]] })
  const [g] = await loadFamilyGoals('f1')
  expect(g.savedCents).toBe(300000)
  expect(calls.find((c) => c.table === 'goals')?.filters).toEqual({ 'eq:family_id': 'f1', 'is:deleted_on': null })
})

test('metas da família sem total ainda: zero', async () => {
  queue({ goals: [[goalRaw]], family_goal_totals: [[]] })
  expect((await loadFamilyGoals('f1'))[0].savedCents).toBe(0)
})

test('meta da família: filtra id e família; só os movimentos de quem pede (A4 B)', async () => {
  queue({ goals: [[goalRaw]], goal_movements: [[]], family_goal_totals: [[{ goal_id: 'g1', saved_cents: 5 }]] })
  const r = await loadFamilyGoal('g1', 'f1')
  expect(r?.goal.savedCents).toBe(5)
  expect(calls.find((c) => c.table === 'goals')?.filters).toEqual({ 'eq:id': 'g1', 'eq:family_id': 'f1', 'is:deleted_on': null })
  expect(calls.find((c) => c.table === 'goal_movements')?.filters).toEqual({ 'eq:goal_id': 'g1', 'eq:user_id': 'u1' })
  queue({ goals: [[]], goal_movements: [[]], family_goal_totals: [[]] })
  expect(await loadFamilyGoal('g2', 'f1')).toBeNull()
})
