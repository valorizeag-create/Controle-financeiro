import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), refresh: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

function fakeSupabase(s: { rows?: number; insertError?: unknown; rpcError?: unknown } = {}) {
  return {
    from: (table: string) => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: async () => {
            calls.push({ op: `insert:${table}`, filters: {}, payload })
            return s.insertError ? { data: null, error: s.insertError } : { data: { id: ID }, error: null }
          },
        }),
      }),
      update: (payload: unknown) => {
        const filters: Record<string, unknown> = {}
        const b = {
          eq(col: string, val: unknown) {
            filters[col] = val
            return b
          },
          is(col: string, val: unknown) {
            filters[col] = val
            return b
          },
          select: async () => {
            calls.push({ op: `update:${table}`, filters, payload })
            return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
          },
        }
        return b
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: null, error: s.rpcError ?? null }
    },
  }
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  throw new Error('esperava um redirecionamento')
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.refresh.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createGoal', () => {
  test('cria a meta da própria pessoa, com prazo no 1º dia do mês, e abre a meta', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Viagem para Salvador', target: '4.000', deadline: '2027-03', user_id: 'outra' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'insert:goals', filters: {}, payload: { user_id: 'u1', name: 'Viagem para Salvador', target_cents: 400000, deadline: '2027-03-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta criada. O primeiro passo já foi dado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('sem prazo grava prazo vazio; erro no campo mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Reserva', target: '10.000', deadline: '' })))
    expect((calls[0].payload as { deadline: unknown }).deadline).toBeNull()
    calls.length = 0
    const state = await actions.createGoal({ status: 'idle' }, form({ name: '', target: '10', deadline: '2027-03' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' }, values: { target: '10', deadline: '2027-03' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { message: 'x' } })
    const state = await actions.createGoal({ status: 'idle' }, form({ name: 'Reserva', target: '10', deadline: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Reserva' } })
  })

  test('"Meta da família": cria pela função do banco, sem inserir em goals nem mandar família', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Reforma', target: '10.000', deadline: '', family: 'on', family_id: 'f9' })))
    expect(url).toBe('/metas')
    expect(calls).toEqual([{ op: 'rpc:create_family_goal', filters: {}, payload: { p_name: 'Reforma', p_target_cents: 1000000, p_deadline: null } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta criada. O primeiro passo já foi dado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('"Meta da família" com prazo manda o 1º dia do mês; falha avisa sem perder nada; impasse pede para tentar de novo', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Reforma', target: '10.000', deadline: '2027-03', family: 'on' })))
    expect((calls[0].payload as { p_deadline: unknown }).p_deadline).toBe('2027-03-01')
    h.supabase = fakeSupabase({ rpcError: { message: 'Família não encontrada.' } })
    expect(await actions.createGoal({ status: 'idle' }, form({ name: 'Reforma', target: '10', deadline: '', family: 'on' }))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Reforma' } })
    h.supabase = fakeSupabase({ rpcError: { code: '40P01', message: 'deadlock' } })
    expect(await actions.createGoal({ status: 'idle' }, form({ name: 'Reforma', target: '10', deadline: '', family: 'on' }))).toMatchObject({ message: 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.' })
  })
})

describe('updateGoal', () => {
  test('altera só a meta da própria pessoa, não excluída', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.updateGoal({ status: 'idle' }, form({ id: ID, name: 'Viagem', target: '5.000', deadline: '2026-05' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'update:goals', filters: { id: ID, user_id: 'u1', deleted_on: null }, payload: { name: 'Viagem', target_cents: 500000, deadline: '2026-05-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('meta de outra pessoa, excluída ou id inválido não grava (Review Focus 5)', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateGoal({ status: 'idle' }, form({ id, name: 'Viagem', target: '10', deadline: '' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Viagem' } })
    }
    expect(calls.map((c) => c.filters)).toEqual([{ id: ID, user_id: 'u1', deleted_on: null }])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteGoal', () => {
  test('exclui pela função atômica e avisa', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteGoal(form({ id: ID })))).toBe('/metas')
    expect(calls).toEqual([{ op: 'rpc:delete_goal', filters: {}, payload: { p_goal_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta excluída.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('falha volta para editar com aviso; id inválido volta para Metas sem chamar o banco', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Meta não encontrada.' } })
    expect(await redirectOf(actions.deleteGoal(form({ id: ID })))).toBe(`/metas/${ID}/editar?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
    calls.length = 0
    expect(await redirectOf(actions.deleteGoal(form({ id: 'x' })))).toBe('/metas')
    expect(calls).toEqual([])
  })
})
