import { beforeEach, expect, test, vi } from 'vitest'

// A rota de verdade, com as leituras e a montagem de verdade. Só a camada de
// baixo é falsa: cookies(), createClient e requireUser. Depois que GET() devolve
// a resposta, o pedido acabou: qualquer acesso à sessão ou ao cookie, a partir
// daí, lança (como no Next, "cookies was called outside a request scope").
const h = vi.hoisted(() => ({
  returned: false,
  calls: [] as string[],
  reads: [] as { table: string; filters: string[] }[],
  rows: {} as Record<string, unknown[]>,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('@/lib/supabase/server', () => {
  const cookies = async () => {
    h.calls.push(h.returned ? 'cookies-after' : 'cookies')
    if (h.returned) throw new Error('`cookies` was called outside a request scope')
    return {}
  }
  const supabase = {
    from(table: string) {
      const read = { table, filters: [] as string[] }
      h.reads.push(read)
      let range: [number, number] | null = null
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        eq: (c: string, v: unknown) => (read.filters.push(`eq:${c}=${String(v)}`), b),
        is: (c: string, v: unknown) => (read.filters.push(`is:${c}=${String(v)}`), b),
        range: (a: number, z: number) => ((range = [a, z]), b),
        single: async () => ({ data: (h.rows[table] ?? [])[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: (h.rows[table] ?? [])[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => {
          const all = h.rows[table] ?? []
          return Promise.resolve({ data: range ? all.slice(range[0], range[1] + 1) : all, error: null }).then(ok, no)
        },
      }
      return b
    },
  }
  return {
    createClient: async () => {
      await cookies()
      return supabase
    },
    requireUser: async () => {
      await cookies()
      return { id: 'u1', email: 'camila@teste.iris.dev' }
    },
  }
})

const route = await import('./route')

const tx = (i: number) => ({
  id: `t${i}`, kind: 'expense', amount_cents: 100 + i, category_id: null, source: null, note: null, payment_method: 'pix',
  occurred_on: '2026-10-01', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-10-01T12:00:00Z',
  card_id: null, card_deleted: false, installment_plan_id: null, installment_number: null, installment_count: null,
  goal_id: null, goal_funded_cents: 0, family_id: null,
})

beforeEach(() => {
  h.returned = false
  h.calls = []
  h.reads = []
  h.rows = {
    profiles: [{ display_name: 'Camila', initial_balance_cents: 100000, created_at: '2026-09-01T15:00:00Z' }],
    categories: [],
    family_members: [],
    transactions: Array.from({ length: 2300 }, (_, i) => tx(i)),
    goal_movements: [],
  }
})

test('a sessão e o cookie só são lidos antes de a resposta ser devolvida; o arquivo sai completo', async () => {
  const res = await route.GET(new Request('http://localhost:3000/configuracoes/dados/exportar'))
  h.returned = true
  expect(res.status).toBe(200)
  const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())
  expect(csv.startsWith('﻿"Cadastro"\r\n')).toBe(true)
  expect(csv.endsWith('"Lembrete para anotar";"Não"\r\n\r\n')).toBe(true)
  expect(csv.match(/^\d\d\/10\/2026;"Gasto"/gm)).toHaveLength(2300)
  expect(h.calls.filter((c) => c.endsWith('-after'))).toEqual([])
  expect(h.calls).toEqual(['cookies', 'cookies']) // requireUser e createClient, uma vez cada
  // continua valendo: toda leitura é da própria pessoa
  for (const r of h.reads) expect(r.filters, r.table).toContain(r.table === 'profiles' ? 'eq:id=u1' : 'eq:user_id=u1')
})

test('sem sessão a rota redireciona antes de qualquer leitura', async () => {
  // o requireUser de verdade chama redirect(); aqui basta provar que nada é lido antes dele
  h.returned = true // qualquer acesso lança
  await expect(route.GET(new Request('http://localhost:3000/configuracoes/dados/exportar'))).rejects.toBeTruthy()
  expect(h.reads).toEqual([])
})
