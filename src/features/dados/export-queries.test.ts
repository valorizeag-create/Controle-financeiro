import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ supabase: null as unknown, user: { id: 'u1', email: 'camila@teste.iris.dev' } }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => h.user }))

const q = await import('./export-queries')

type Read = { table: string; filters: string[]; range: [number, number] | null }
let reads: Read[] = []
let rows: Record<string, unknown[]> = {}
let failOn: { table: string; from: number } | null = null

// Construtor encadeável: registra a tabela e os filtros e responde com as linhas da tabela.
function fake() {
  return {
    from(table: string) {
      const read: Read = { table, filters: [], range: null }
      reads.push(read)
      const result = () => {
        if (failOn && failOn.table === table && read.range && read.range[0] >= failOn.from) return { data: null, error: { message: 'caiu' } }
        const all = rows[table] ?? []
        return { data: read.range ? all.slice(read.range[0], read.range[1] + 1) : all, error: null }
      }
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        eq: (c: string, v: unknown) => (read.filters.push(`eq:${c}=${String(v)}`), b),
        is: (c: string, v: unknown) => (read.filters.push(`is:${c}=${String(v)}`), b),
        in: (c: string) => (read.filters.push(`in:${c}`), b),
        range: (a: number, z: number) => ((read.range = [a, z]), b),
        single: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, no),
      }
      return b
    },
  }
}

const tx = (i: number) => ({
  id: `t${i}`, kind: 'expense', amount_cents: 100 + i, category_id: 'c1', source: null, note: null, payment_method: 'pix',
  occurred_on: '2026-10-01', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-10-01T12:00:00Z',
  card_id: null, card_deleted: false, installment_plan_id: null, installment_number: null, installment_count: null,
  goal_id: null, goal_funded_cents: 0, family_id: null,
})

beforeEach(() => {
  reads = []
  failOn = null
  rows = {
    profiles: [{ display_name: 'Camila', initial_balance_cents: 100000, created_at: '2026-09-01T15:00:00Z' }],
    categories: [{ id: 'c1', name: 'Mercado', default_key: 'mercado', sort_order: 2 }],
    family_members: [],
  }
  h.supabase = fake()
})

async function drain<T>(pages: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = []
  for await (const p of pages) out.push(p)
  return out
}

test('toda leitura é da própria pessoa; nada de push, fila de avisos, convites ou avisos da família', async () => {
  const data = await q.loadExportData()
  await drain(q.exportTransactionPages())
  await drain(q.exportMovementPages())
  expect(data.profile).toEqual({ displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 100000, createdOn: '2026-09-01' })
  expect(data.family).toBeNull()
  const tables = [...new Set(reads.map((r) => r.table))].sort()
  expect(tables).toEqual([
    'budgets', 'cards', 'categories', 'family_members', 'goal_movements', 'goals', 'installment_plans',
    'notification_prefs', 'profiles', 'recurrences', 'transactions',
  ])
  for (const r of reads) {
    const own = r.table === 'profiles' ? 'eq:id=u1' : 'eq:user_id=u1'
    expect(r.filters, r.table).toContain(own)
  }
})

test('com família: lê só a própria participação, o nome da família dela e as metas dessa família em que a pessoa tem movimento', async () => {
  rows.family_members = [{ family_id: 'f1', role: 'member', joined_at: '2026-09-10T12:00:00Z' }]
  rows.families = [{ id: 'f1', name: 'Família Souza' }]
  const goal = (id: string, name: string) => ({
    id, name, target_cents: 1000, deadline: null, status: 'active', used_on: null, deleted_on: null, created_at: '2026-09-11T12:00:00Z',
  })
  rows.goals = [goal('g1', 'Viagem'), goal('g2', 'Meta de outro membro')]
  rows.goal_movements = [{ goal_id: 'g1' }]
  const data = await q.loadExportData()
  expect(data.family).toEqual({ name: 'Família Souza', role: 'member', joinedOn: '2026-09-10' })
  const members = reads.filter((r) => r.table === 'family_members')
  expect(members).toHaveLength(1)
  expect(members[0].filters).toEqual(expect.arrayContaining(['eq:user_id=u1', 'is:left_at=null']))
  expect(reads.find((r) => r.table === 'families')?.filters).toEqual(['eq:id=f1'])
  const familyGoals = reads.filter((r) => r.table === 'goals' && r.filters.includes('eq:family_id=f1'))
  expect(familyGoals).toHaveLength(1)
  // as partes dos outros membros não são lidas: só os movimentos da própria pessoa
  for (const m of reads.filter((r) => r.table === 'goal_movements')) expect(m.filters).toContain('eq:user_id=u1')
  // (o fake não aplica filtros: as pessoais voltam iguais; o que importa é a parte da família)
  expect(data.goals.filter((g) => g.family).map((g) => g.name)).toEqual(['Viagem'])
})

test('os registros vêm em páginas de 1000, até a última', async () => {
  rows.transactions = Array.from({ length: 2300 }, (_, i) => tx(i))
  const pages = await drain(q.exportTransactionPages())
  expect(pages.map((p) => p.length)).toEqual([1000, 1000, 300])
  expect(pages[2][299].amountCents).toBe(2399)
  expect(reads.filter((r) => r.table === 'transactions').map((r) => r.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
})

test('erro numa página interrompe a leitura (não devolve um arquivo pela metade)', async () => {
  rows.transactions = Array.from({ length: 2300 }, (_, i) => tx(i))
  failOn = { table: 'transactions', from: 1000 }
  const pages = q.exportTransactionPages()
  expect((await pages.next()).value).toHaveLength(1000)
  await expect(pages.next()).rejects.toBeTruthy()
})
