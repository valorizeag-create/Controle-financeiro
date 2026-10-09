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

function fakeSupabase(s: { rows?: number; error?: unknown; insertError?: unknown; rpcError?: unknown } = {}) {
  function builder(op: string, table: string, payload?: unknown) {
    const filters: Record<string, unknown> = {}
    const b = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return b
      },
      select: async () => {
        calls.push({ op: `${op}:${table}`, filters, payload })
        if (s.error) return { data: null, error: s.error }
        return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
      },
    }
    return b
  }
  return {
    from: (table: string) => ({
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
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.restoreAllMocks())

describe('createCard', () => {
  test('guarda só apelido, tipo e cor, da própria pessoa (RN-29)', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.createCard({ status: 'idle' }, form({ nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', brand: 'visa', user_id: 'outra' })))
    expect(url).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'insert:cards', filters: {}, payload: { user_id: 'u1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', brand: 'visa' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Cartão criado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('sem apelido: não grava e mantém o que foi escolhido', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.createCard({ status: 'idle' }, form({ nickname: '', kind: 'debit', color: 'pink' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { nickname: 'Falta o nome.' }, values: { kind: 'debit', color: 'pink' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { message: 'x' } })
    const state = await actions.createCard({ status: 'idle' }, form({ nickname: 'Inter', kind: 'debit', color: 'orange' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { nickname: 'Inter' } })
  })
})

describe('updateCard', () => {
  test('altera só o cartão da própria pessoa', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.updateCard({ status: 'idle' }, form({ id: ID, nickname: 'Inter', kind: 'debit', color: 'orange', brand: '' })))
    expect(url).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'update:cards', filters: { id: ID, user_id: 'u1' }, payload: { nickname: 'Inter', kind: 'debit', color: 'orange', brand: null } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('cartão de outra pessoa, excluído ou id inválido não grava', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateCard({ status: 'idle' }, form({ id, nickname: 'Inter', kind: 'debit', color: 'orange' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { nickname: 'Inter' } })
    }
    expect(calls.map((c) => c.filters)).toEqual([{ id: ID, user_id: 'u1' }])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteCard', () => {
  test('exclui pela função atômica e avisa', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteCard(form({ id: ID })))).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'rpc:delete_card', filters: {}, payload: { p_card_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Cartão excluído.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('falha volta para o cartão com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Cartão não encontrado.' } })
    expect(await redirectOf(actions.deleteCard(form({ id: ID })))).toBe(`/cartoes/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para Cartões sem chamar o banco', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteCard(form({ id: 'x' })))).toBe('/cartoes')
    expect(calls).toEqual([])
  })
})
