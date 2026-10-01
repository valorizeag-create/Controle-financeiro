import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))

const { loadLedger, loadCategories } = await import('./queries')

type Call = { table?: string; filters?: Record<string, unknown>; rpc?: string; range?: [number, number] }
let calls: Call[] = []
let data: Record<string, unknown[]> = {}

function builder(call: Call, rows: unknown[]) {
  const filters = (call.filters ??= {})
  const b = {
    eq: (c: string, v: unknown) => ((filters[`eq:${c}`] = v), b),
    is: (c: string, v: unknown) => ((filters[`is:${c}`] = v), b),
    order: () => b,
    range: (from: number, to: number) => ((call.range = [from, to]), b),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  }
  return b
}

h.supabase = {
  from: (table: string) => ({
    select: () => {
      const call: Call = { table }
      calls.push(call)
      return builder(call, data[table] ?? [])
    },
  }),
  rpc: (name: string) => {
    const call: Call = { rpc: name }
    calls.push(call)
    return builder(call, [])
  },
}

beforeEach(() => {
  calls = []
  data = { profiles: [{ display_name: 'Ana', initial_balance_cents: '500000' }], categories: [], goal_movements: [] }
})
afterEach(() => vi.restoreAllMocks())

const row = (p: Record<string, unknown>) => ({
  id: 'x', kind: 'expense', amount_cents: '1000', category_id: null, source: null, note: null, payment_method: null,
  occurred_on: '2026-09-10', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-09-10T12:00:00Z',
  card_id: null, card_deleted: false, installment_plan_id: null, installment_number: null, installment_count: null,
  goal_id: null, goal_funded_cents: 0, family_id: null, ...p,
})

test('loadLedger lê só os registros da própria pessoa e tira a conta da família a pagar (RNF-11)', async () => {
  data.transactions = [
    row({ id: 'a' }),
    row({ id: 'b', status: 'pending', due_on: '2026-09-28', family_id: 'f1' }),
    row({ id: 'c', family_id: 'f1' }),
  ]
  const ledger = await loadLedger()
  expect(ledger.transactions.map((t) => t.id)).toEqual(['a', 'c'])
  expect(ledger.transactions[1].familyId).toBe('f1')
  const tx = calls.find((c) => c.table === 'transactions')!
  expect(tx.filters).toMatchObject({ 'eq:user_id': 'u1' })
  expect(tx.range).toEqual([0, 999])
  expect(calls.find((c) => c.table === 'categories')?.filters).toMatchObject({ 'eq:user_id': 'u1' })
  expect(calls.find((c) => c.table === 'goal_movements')?.filters).toMatchObject({ 'eq:user_id': 'u1' })
  expect(calls.filter((c) => c.rpc).map((c) => c.rpc)).toEqual(['generate_occurrences', 'generate_family_occurrences'])
})

test('a conta pessoal a pagar continua no livro', async () => {
  data.transactions = [row({ id: 'p', status: 'pending', due_on: '2026-09-28' })]
  expect((await loadLedger()).transactions.map((t) => t.id)).toEqual(['p'])
})

test('loadCategories filtra a pessoa', async () => {
  await loadCategories()
  expect(calls.find((c) => c.table === 'categories')?.filters).toEqual({ 'eq:user_id': 'u1' })
})
