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

vi.mock('server-only', () => ({}))
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

function fakeSupabase(s: { rpcError?: unknown } = {}) {
  return {
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
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.restoreAllMocks())

describe('settlePurchase (RN-08)', () => {
  test('quita com o valor pago e volta para a compra', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '180' })))
    expect(url).toBe(`/extrato/parcelas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:settle_installments', filters: {}, payload: { p_plan_id: ID, p_amount_cents: 18000 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Parcelas quitadas. Seu mês já está atualizado.')
    for (const path of ['/inicio', '/extrato', '/contas', '/cartoes']) expect(h.revalidatePath).toHaveBeenCalledWith(path)
  })

  test('valor vazio pede o valor', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } })
    expect(calls).toEqual([])
  })

  test('toque duplo, compra de outra pessoa ou já quitada: avisa sem perder o valor (Review Focus 5)', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Compra não encontrada.' } })
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '180' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '180' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido não chama o banco', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: 'x', amount: '180' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
  })
})

describe('refundPurchase (RN-09)', () => {
  test('cancela as futuras e volta para a compra', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.refundPurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:refund_installments', filters: {}, payload: { p_plan_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Parcelas canceladas. Seu mês já está atualizado.')
  })

  test('falha volta para a compra com aviso de erro; id inválido vai para o Extrato', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.refundPurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}?erro=1`)
    expect(await redirectOf(actions.refundPurchase(form({ id: 'x' })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deletePurchase', () => {
  test('exclui a compra inteira e volta ao Extrato', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deletePurchase(form({ id: ID })))).toBe('/extrato')
    expect(calls).toEqual([{ op: 'rpc:delete_installment_purchase', filters: {}, payload: { p_plan_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('falha volta para a compra com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.deletePurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}?erro=1`)
  })
})
