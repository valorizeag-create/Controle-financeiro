import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: '' }),
}))
vi.mock('@/features/registro/queries', () => ({ loadCategories: async () => [{ id: 'c1', name: 'Mercado', defaultKey: null }] }))
vi.mock('@/features/cartoes/queries', () => ({ loadCards: async () => [] }))

const { loadImportContext } = await import('./queries')

type Call = { table: string; or?: string; eq: Record<string, unknown>; range?: [number, number] }
const calls: Call[] = []

function raw(over: Record<string, unknown>) {
  return {
    id: 't1', kind: 'expense', amount_cents: '1000', category_id: null, source: null, note: null, payment_method: null,
    occurred_on: '2026-09-10', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-09-10T00:00:00Z',
    card_id: null, card_deleted: false, installment_plan_id: null, installment_number: null, installment_count: null,
    goal_id: null, goal_funded_cents: 0, family_id: null, import_key: null, ...over,
  }
}

function fakeSupabase(txs: unknown[], rules: unknown[]) {
  return {
    from(table: string) {
      const call: Call = { table, eq: {} }
      calls.push(call)
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          call.eq[c] = v
          return b
        },
        or: (s: string) => {
          call.or = s
          return b
        },
        order: () => b,
        range: async (a: number, z: number) => {
          call.range = [a, z]
          return { data: table === 'transactions' ? txs : rules.slice(a, z + 1), error: null }
        },
      }
      return b
    },
  }
}

beforeEach(() => {
  calls.length = 0
})

describe('loadImportContext', () => {
  test('lê a janela de ±5 dias por data ou vencimento, e mapeia chaves e regras', async () => {
    h.supabase = fakeSupabase(
      [raw({ id: 'a', import_key: 'k1' }), raw({ id: 'b' }), raw({ id: 'c', status: 'pending', due_on: '2026-09-12' })],
      [{ merchant_key: 'padaria', kind: 'expense', category_id: 'c1', source: null }],
    )
    const ctx = await loadImportContext('2026-09-10', '2026-09-20')
    const tx = calls.find((c) => c.table === 'transactions')!
    expect(tx.eq).toEqual({ user_id: 'u1' })
    expect(tx.or).toBe('and(occurred_on.gte.2026-09-05,occurred_on.lte.2026-09-25),and(due_on.gte.2026-09-05,due_on.lte.2026-09-25)')
    expect(ctx.existing.map((e) => [e.id, e.importKey])).toEqual([['a', 'k1'], ['b', null], ['c', null]])
    expect(ctx.usedKeys).toEqual(['k1'])
    expect(ctx.rules).toEqual([{ merchantKey: 'padaria', kind: 'expense', categoryId: 'c1', source: null }])
    expect(ctx.categories).toHaveLength(1)
    expect(ctx.cards).toEqual([])
  })

  test('lê a memória de categorias em páginas', async () => {
    const rules = Array.from({ length: 1001 }, (_, i) => ({ merchant_key: `loja ${i}`, kind: 'expense', category_id: 'c1', source: null }))
    h.supabase = fakeSupabase([], rules)
    const ctx = await loadImportContext('2026-09-10', '2026-09-20')
    expect(calls.filter((c) => c.table === 'import_rules').map((c) => c.range)).toEqual([[0, 999], [1000, 1999]])
    expect(ctx.rules).toHaveLength(1001)
  })

  test('recusa datas inválidas, intervalo invertido e mais de 400 dias', async () => {
    h.supabase = fakeSupabase([], [])
    await expect(loadImportContext('x', '2026-09-10')).rejects.toThrow()
    await expect(loadImportContext('2026-02-31', '2026-03-10')).rejects.toThrow()
    await expect(loadImportContext('2026-09-10', '2026-09-09')).rejects.toThrow()
    await expect(loadImportContext('2025-01-01', '2026-09-09')).rejects.toThrow()
    expect(calls).toEqual([])
    await expect(loadImportContext('2026-01-01', '2026-02-05')).resolves.toBeDefined()
  })
})
