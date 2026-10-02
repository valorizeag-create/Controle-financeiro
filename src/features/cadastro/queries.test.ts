import { beforeEach, expect, test, vi } from 'vitest'

type Member = { userId: string | null; role: 'admin' | 'member'; leftAt: string | null }
type Result = { data?: unknown; error?: { message: string } | null }

const h = vi.hoisted(() => ({
  supabase: null as unknown,
  user: { id: 'u1', email: 'ana@teste.iris.dev' },
  myFamily: null as unknown,
  goals: [] as { id: string }[],
  moves: [] as unknown[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => h.user }))
vi.mock('@/features/familia/queries', () => ({
  loadMyFamily: async () => h.myFamily,
  loadFamilyGoals: async () => h.goals,
}))
vi.mock('@/features/metas/queries', () => ({ fetchGoalMovements: async () => h.moves }))

const q = await import('./queries')

type Read = { table: string; filters: string[] }
let reads: Read[] = []
let rows: Record<string, unknown[]> = {}
let rpcResults: Record<string, Result> = {}
let authUser: Record<string, unknown> = {}

function fake() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', ...authUser } }, error: null }) },
    rpc: async (fn: string) => rpcResults[fn] ?? { data: null, error: { message: `sem resposta para ${fn}` } },
    from(table: string) {
      const read: Read = { table, filters: [] }
      reads.push(read)
      const b: Record<string, unknown> = {
        select: () => b,
        limit: () => b,
        eq: (c: string, v: unknown) => (read.filters.push(`eq:${c}=${String(v)}`), b),
        neq: (c: string, v: unknown) => (read.filters.push(`neq:${c}=${String(v)}`), b),
        not: (c: string, op: string, v: unknown) => (read.filters.push(`not:${c}.${op}.${String(v)}`), b),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok, no),
      }
      return b
    },
  }
}

const setUser = (u: Record<string, unknown>) => { authUser = u }
const rpcData = (fn: string, data: unknown) => { rpcResults[fn] = { data, error: null } }
const rpcError = (fn: string, message: string) => { rpcResults[fn] = { data: null, error: { message } } }
const active = (userId: string, role: Member['role'] = 'member'): Member => ({ userId, role, leftAt: null })
const left = (userId: string): Member => ({ userId, role: 'member', leftAt: '2026-09-01T00:00:00Z' })
const family = (f: { id: string; role: 'admin' | 'member'; members: Member[] } | null) => { h.myFamily = f }
const familyGoals = (ids: string[]) => { h.goals = ids.map((id) => ({ id })) }
const movements = (list: { goal_id: string; kind: string; amount_cents: number }[]) => {
  h.moves = list.map((m) => ({ goalId: m.goal_id, kind: m.kind, amountCents: m.amount_cents }))
}

beforeEach(() => {
  reads = []
  rows = {}
  rpcResults = {}
  authUser = {}
  h.myFamily = null
  h.goals = []
  h.moves = []
  h.supabase = fake()
})

test('loadSignIn: senha, troca pendente e entrada recente vêm do próprio cadastro', async () => {
  setUser({ app_metadata: { providers: ['email', 'google'] }, new_email: 'nova@teste.iris.dev' })
  rpcData('session_is_recent', true)
  expect(await q.loadSignIn()).toEqual({ hasPassword: true, pendingEmail: 'nova@teste.iris.dev', sessionRecent: true })
  setUser({ app_metadata: { providers: ['google'] } })
  rpcError('session_is_recent', 'caiu')
  expect(await q.loadSignIn()).toEqual({ hasPassword: false, pendingEmail: null, sessionRecent: false })
})

test('loadDeletionContext sem família: tudo é apagado, sem parte e sem troca de administração', async () => {
  family(null)
  rows.transactions = []
  rpcData('session_is_recent', true)
  expect(await q.loadDeletionContext()).toEqual({ notice: 'everything', shareCents: 0, passesAdmin: false, sessionRecent: true })
  // os registros da família são procurados só entre os da própria pessoa
  const txReads = reads.filter((x) => x.table === 'transactions')
  expect(txReads.length).toBeGreaterThan(0)
  for (const r of txReads) expect(r.filters).toContain('eq:user_id=u1')
})

test('loadDeletionContext: membro com gastos na família e parte nas metas', async () => {
  family({ id: 'f1', role: 'member', members: [active('u1'), active('u2')] })
  rows.transactions = [{ family_id: 'f1' }]
  familyGoals(['g1', 'g2'])
  movements([{ goal_id: 'g1', kind: 'deposit', amount_cents: 3000 }, { goal_id: 'pessoal', kind: 'deposit', amount_cents: 999 }])
  rpcData('session_is_recent', false)
  expect(await q.loadDeletionContext()).toEqual({ notice: 'family-history', shareCents: 3000, passesAdmin: false, sessionRecent: false })
})

test('loadDeletionContext: administradora com outras pessoas passa a administração; sozinha, não', async () => {
  rpcData('session_is_recent', true)
  family({ id: 'f1', role: 'admin', members: [active('u1', 'admin'), active('u2'), left('u3')] })
  expect((await q.loadDeletionContext()).passesAdmin).toBe(true)
  family({ id: 'f1', role: 'admin', members: [active('u1', 'admin'), left('u3')] })
  expect((await q.loadDeletionContext()).passesAdmin).toBe(false)
})

test('loadDeletionContext: família atual e outra família são procuradas só entre os registros confirmados da pessoa', async () => {
  family({ id: 'f1', role: 'member', members: [active('u1'), active('u2')] })
  rpcData('session_is_recent', true)
  await q.loadDeletionContext()
  const filters = reads.filter((x) => x.table === 'transactions').map((r) => r.filters)
  expect(filters).toContainEqual(['eq:user_id=u1', 'eq:status=confirmed', 'eq:family_id=f1'])
  expect(filters).toContainEqual(['eq:user_id=u1', 'eq:status=confirmed', 'not:family_id.is.null', 'neq:family_id=f1'])
})
