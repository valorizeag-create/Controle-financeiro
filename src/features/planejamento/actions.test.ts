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
const A = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const B = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

function fakeSupabase(s: { categoryIds?: string[]; rpc?: { data?: unknown; error?: unknown } } = {}) {
  return {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: async (col: string, val: unknown) => {
          calls.push({ op: `select:${table}:${cols}`, filters: { [col]: val } })
          return { data: (s.categoryIds ?? [A, B]).map((id) => ({ id })), error: null }
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: s.rpc?.data ?? null, error: s.rpc?.error ?? null }
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

describe('saveBudgets (RF-22)', () => {
  test('salva o mês pela função atômica, só com categorias da própria pessoa, e avisa com a copy', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 1 } })
    const url = await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '1.000', [`plan.${B}`]: '', user_id: 'outra' })))
    expect(url).toBe('/planejamento?mes=2026-09')
    expect(calls).toEqual([
      { op: 'select:categories:id', filters: { user_id: 'u1' } },
      { op: 'rpc:set_month_budgets', filters: {}, payload: { p_month: '2026-09-01', p_category_ids: [A, B], p_amounts: [100000, null] } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Planejamento salvo. Agora é só acompanhar.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('categoria excluída em outra aba é ignorada; o resto é salvo (Review Focus 3)', async () => {
    h.supabase = fakeSupabase({ categoryIds: [A], rpc: { data: 1 } })
    await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100', [`plan.${B}`]: '50' })))
    expect(calls[1].payload).toEqual({ p_month: '2026-09-01', p_category_ids: [A], p_amounts: [10000] })
  })

  test('nenhuma categoria sobrou: não chama a função e volta ao planejamento', async () => {
    h.supabase = fakeSupabase({ categoryIds: [] })
    expect(await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100' })))).toBe('/planejamento?mes=2026-09')
    expect(calls.map((c) => c.op)).toEqual(['select:categories:id'])
  })

  test('valor inválido fica no campo com a mensagem da copy, sem chamar o banco (Review Focus 4)', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: 'abc', [`plan.${B}`]: '300' }))
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { [`plan.${A}`]: 'Esse valor não parece certo. Use apenas números.' },
      values: { [`plan.${A}`]: 'abc', [`plan.${B}`]: '300' },
    })
    expect(calls).toEqual([])
  })

  test('mês inválido ou falha no banco: aviso da copy, sem perder o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.saveBudgets({ status: 'idle' }, form({ month: 'abc', [`plan.${A}`]: '100' }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
    h.supabase = fakeSupabase({ rpc: { error: { message: 'Categoria não encontrada.' } } })
    expect(await actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100' }))).toMatchObject({
      status: 'error', message: SAVE_FAILED, values: { [`plan.${A}`]: '100' },
    })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('repeatPreviousBudgets (RF-24)', () => {
  test('repete o mês anterior e avisa', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 6 } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10')
    expect(calls).toEqual([{ op: 'rpc:repeat_previous_budgets', filters: {}, payload: { p_month: '2026-10-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Planejamento salvo. Agora é só acompanhar.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('repetir sem nada novo não avisa; falha volta com aviso; mês inválido não chama o banco (Review Focus 3)', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 0 } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10')
    expect(h.setFlash).not.toHaveBeenCalled()
    h.supabase = fakeSupabase({ rpc: { error: { message: 'x' } } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10&erro=1')
    calls.length = 0
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-13' })))).toBe('/planejamento')
    expect(calls).toEqual([])
  })
})
