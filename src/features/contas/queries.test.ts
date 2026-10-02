import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))

const { loadRecurrences, loadRecurrence } = await import('./queries')

type Call = { table: string; filters: Record<string, unknown> }
let calls: Call[] = []
let rows: unknown[] = []

h.supabase = {
  from: (table: string) => ({
    select: () => {
      const call: Call = { table, filters: {} }
      calls.push(call)
      const b = {
        eq: (c: string, v: unknown) => ((call.filters[`eq:${c}`] = v), b),
        is: (c: string, v: unknown) => ((call.filters[`is:${c}`] = v), b),
        order: () => b,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, no),
      }
      return b
    },
  }),
}

const raw = {
  id: 'r1', kind: 'expense', name: 'Internet', amount_cents: '9990', category_id: 'c1', source: null, card_id: null,
  frequency: 'monthly', due_day: 10, due_month: null, starts_on: '2026-09-01', ended_on: null,
}

beforeEach(() => {
  calls = []
  rows = [raw]
})

// Decisão 103: a conta da família tem tela própria; em Contas (pessoal) ela não aparece nem pode ser aberta.
test('contas que se repetem: só as da própria pessoa, ativas e que não são da família', async () => {
  const list = await loadRecurrences()
  expect(list.map((r) => r.id)).toEqual(['r1'])
  expect(calls).toEqual([{ table: 'recurrences', filters: { 'eq:user_id': 'u1', 'is:family_id': null, 'is:ended_on': null } }])
})

test('uma conta que se repete: id, dono, ativa e nunca a da família', async () => {
  expect((await loadRecurrence('r1'))?.id).toBe('r1')
  expect(calls).toEqual([
    { table: 'recurrences', filters: { 'eq:id': 'r1', 'eq:user_id': 'u1', 'is:family_id': null, 'is:ended_on': null } },
  ])
  rows = []
  expect(await loadRecurrence('r-da-familia')).toBeNull()
})
