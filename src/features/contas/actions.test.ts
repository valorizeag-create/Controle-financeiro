import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), revalidatePath: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []

// Fake encadeável: cada `.eq`/`.is` registra o filtro; `.select()` ou `.maybeSingle()` resolvem.
function fakeSupabase(s: { rows?: number; error?: unknown; kind?: 'income' | 'expense' | null; rpcError?: unknown; insertError?: unknown } = {}) {
  function builder(op: string, table: string, payload?: unknown) {
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
        calls.push({ op: `${op}:${table}`, filters, payload })
        if (s.error) return { data: null, error: s.error }
        return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
      },
      maybeSingle: async () => {
        calls.push({ op: `read:${table}`, filters })
        return { data: s.kind ? { kind: s.kind } : null, error: null }
      },
    }
    return b
  }
  return {
    from: (table: string) => ({
      select: () => builder('read', table),
      update: (payload: unknown) => builder('update', table, payload),
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, filters: {}, payload })
        return { error: s.insertError ?? null }
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

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const CAT = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const NBSP = String.fromCharCode(0xa0)
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.useRealTimers())

describe('markBillPaid', () => {
  test('marca como paga hoje, só se for conta pendente da própria pessoa, e volta de onde veio', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/inicio' })))
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'update:transactions',
        filters: { id: ID, user_id: 'u1', kind: 'expense', status: 'pending' },
        payload: { status: 'confirmed', paid_on: '2026-09-30' },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Conta marcada como paga.')
    for (const path of ['/inicio', '/extrato', '/contas']) expect(h.revalidatePath).toHaveBeenCalledWith(path)
  })

  test('toque duplo ou conta já paga: nada muda e não aparece erro (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    const url = await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/contas?mes=2026-09&aba=vencidas' })))
    expect(url).toBe('/contas?mes=2026-09&aba=vencidas')
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('endereço de volta adulterado vai para Contas', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.markBillPaid(form({ id: ID, volta: '//evil.com' })))).toBe('/contas')
  })

  test('id inválido não grava nada', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.markBillPaid(form({ id: 'nao-e-id', volta: '/inicio' })))).toBe('/inicio')
    expect(calls).toEqual([])
  })

  test('falha no banco mostra o aviso de erro em Contas', async () => {
    h.supabase = fakeSupabase({ error: { message: 'falhou' } })
    expect(await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/inicio' })))).toBe('/contas?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('confirmIncome (RF-17)', () => {
  test('confirma com o valor ajustado e conta hoje', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '750' })))
    expect(url).toBe('/contas?mes=2026-09')
    expect(calls).toEqual([
      {
        op: 'update:transactions',
        filters: { id: ID, user_id: 'u1', kind: 'income', status: 'pending' },
        payload: { status: 'confirmed', paid_on: '2026-09-30', amount_cents: 75000 },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith(`Anotado. Mais R$${NBSP}750,00 no seu mês.`)
  })

  test('valor vazio pede o valor e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } })
    expect(calls).toEqual([])
  })

  test('entrada que já não está a receber: avisa sem perder o valor', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    const state = await actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '750' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '750' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
