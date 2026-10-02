import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))

const { loadGoalLabel, loadMyGoalUses } = await import('./queries')

type Call = { table: string; select: string; filters: Record<string, unknown> }
let calls: Call[] = []
// Cada leitura de uma tabela tira a próxima resposta da fila; a última se repete.
let responses: Record<string, { data: unknown[]; error?: unknown }[]> = {}

function next(table: string) {
  const list = responses[table] ?? []
  return (list.length > 1 ? list.shift() : list[0]) ?? { data: [] }
}

h.supabase = {
  from: (table: string) => ({
    select: (select: string) => {
      const call: Call = { table, select, filters: {} }
      calls.push(call)
      const res = next(table)
      const b = {
        eq: (c: string, v: unknown) => ((call.filters[`eq:${c}`] = v), b),
        is: (c: string, v: unknown) => ((call.filters[`is:${c}`] = v), b),
        order: () => b,
        maybeSingle: async () => ({ data: res.error ? null : (res.data[0] ?? null), error: res.error ?? null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
          Promise.resolve({ data: res.error ? null : res.data, error: res.error ?? null }).then(ok, no),
      }
      return b
    },
  }),
}

beforeEach(() => {
  calls = []
  responses = {}
})

const goalCalls = () => calls.filter((c) => c.table === 'goals')

test('nome da meta pessoal: filtra o id e o dono, e não olha a família', async () => {
  responses = { goals: [{ data: [{ name: 'Viagem', deleted_on: null }] }] }
  expect(await loadGoalLabel('g1')).toEqual({ name: 'Viagem', deletedOn: null })
  expect(calls).toEqual([{ table: 'goals', select: 'name, deleted_on', filters: { 'eq:id': 'g1', 'eq:user_id': 'u1' } }])
})

test('nome da meta da família: só a da família em que a pessoa participa agora, mesmo excluída', async () => {
  responses = {
    goals: [{ data: [] }, { data: [{ name: 'Reforma da cozinha', deleted_on: '2026-09-20' }] }],
    family_members: [{ data: [{ family_id: 'f1' }] }],
  }
  expect(await loadGoalLabel('g9')).toEqual({ name: 'Reforma da cozinha', deletedOn: '2026-09-20' })
  expect(calls.map((c) => c.table)).toEqual(['goals', 'family_members', 'goals'])
  // Primeiro como meta pessoal (id + dono); depois a participação ativa de quem pede; por fim id + essa família.
  expect(goalCalls()[0].filters).toEqual({ 'eq:id': 'g9', 'eq:user_id': 'u1' })
  expect(calls[1]).toEqual({ table: 'family_members', select: 'family_id', filters: { 'eq:user_id': 'u1', 'is:left_at': null } })
  expect(goalCalls()[1]).toEqual({ table: 'goals', select: 'name, deleted_on', filters: { 'eq:id': 'g9', 'eq:family_id': 'f1' } })
})

test('nome da meta: sem família (ou depois de sair) não há segunda leitura de metas', async () => {
  responses = { goals: [{ data: [] }], family_members: [{ data: [] }] }
  expect(await loadGoalLabel('g9')).toBeNull()
  expect(calls.map((c) => c.table)).toEqual(['goals', 'family_members'])
})

test('nome da meta: meta de outra família não é encontrada', async () => {
  responses = { goals: [{ data: [] }, { data: [] }], family_members: [{ data: [{ family_id: 'f1' }] }] }
  expect(await loadGoalLabel('g-outra')).toBeNull()
  expect(goalCalls()[1].filters).toEqual({ 'eq:id': 'g-outra', 'eq:family_id': 'f1' })
})

test('nome da meta: erro na leitura da família sobe, não vira "sem meta"', async () => {
  const boom = { code: 'XX000', message: 'falhou' }
  responses = { goals: [{ data: [] }, { data: [], error: boom }], family_members: [{ data: [{ family_id: 'f1' }] }] }
  await expect(loadGoalLabel('g9')).rejects.toBe(boom)
})

test('usos da meta da família: só gastos da própria pessoa, com o valor que saiu da meta', async () => {
  // Compra de R$ 3.500 com R$ 3.000 guardados: a linha "Usou" é de R$ 3.000 (a diferença saiu do Disponível).
  responses = { transactions: [{ data: [{ id: 'tx1', goal_funded_cents: '300000', occurred_on: '2026-09-20' }] }] }
  expect(await loadMyGoalUses('g1')).toEqual([{ id: 'tx1', amountCents: 300000, occurredOn: '2026-09-20' }])
  expect(calls).toEqual([
    {
      table: 'transactions',
      select: 'id, goal_funded_cents, occurred_on',
      filters: { 'eq:user_id': 'u1', 'eq:goal_id': 'g1', 'eq:kind': 'expense', 'eq:status': 'confirmed' },
    },
  ])
})
