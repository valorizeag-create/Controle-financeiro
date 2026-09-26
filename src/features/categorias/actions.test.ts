import { beforeEach, describe, expect, test, vi } from 'vitest'

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

const { createCategory, deleteCategory, renameCategory } = await import('./actions')

type Call = { op: string; id?: unknown; payload?: unknown }
const calls: Call[] = []

function fakeSupabase(s: {
  lastOrder?: number | null
  insertError?: { code: string } | null
  updateRows?: number
  updateError?: { code: string } | null
  rpcError?: { message: string } | null
}) {
  return {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: s.lastOrder == null ? [] : [{ sort_order: s.lastOrder }], error: null }),
        }),
      }),
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, payload })
        return { error: s.insertError ?? null }
      },
      update: (payload: unknown) => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            calls.push({ op: `update:${table}`, id, payload })
            if (s.updateError) return { data: null, error: s.updateError }
            return { data: Array.from({ length: s.updateRows ?? 1 }, () => ({ id })), error: null }
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, payload: args })
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
const DUPLICATE = 'Você já tem uma categoria com esse nome.'

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

describe('createCategory', () => {
  test('cria com o nome limpo, depois das outras, e avisa', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10 })
    const url = await redirectOf(createCategory({ status: 'idle' }, form({ name: '  Pet   Shop ' })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'insert:categories', payload: { user_id: 'u1', name: 'Pet Shop', sort_order: 11 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Categoria criada.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('nome repetido com outra grafia vira mensagem no campo (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10, insertError: { code: '23505' } })
    const state = await createCategory({ status: 'idle' }, form({ name: '  pet ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: DUPLICATE }, values: { name: '  pet ' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('nome vazio não chega ao banco', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10 })
    const state = await createCategory({ status: 'idle' }, form({ name: '   ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' } })
    expect(calls).toEqual([])
  })

  test('primeira categoria própria de quem apagou todas as outras', async () => {
    h.supabase = fakeSupabase({ lastOrder: null })
    await redirectOf(createCategory({ status: 'idle' }, form({ name: 'Pet' })))
    expect(calls[0].payload).toMatchObject({ sort_order: 1 })
  })
})

describe('renameCategory', () => {
  test('renomeia e avisa', async () => {
    h.supabase = fakeSupabase({})
    const url = await redirectOf(renameCategory({ status: 'idle' }, form({ id: ID, name: 'Bichos' })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'update:categories', id: ID, payload: { name: 'Bichos' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('nome já usado vira mensagem no campo', async () => {
    h.supabase = fakeSupabase({ updateError: { code: '23505' } })
    const state = await renameCategory({ status: 'idle' }, form({ id: ID, name: 'MERCADO' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: DUPLICATE } })
  })

  test('categoria que a pessoa não vê (ou Outros) não muda', async () => {
    h.supabase = fakeSupabase({ updateRows: 0 })
    const state = await renameCategory({ status: 'idle' }, form({ id: ID, name: 'Bichos' }))
    expect(state).toMatchObject({ status: 'error', message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.' })
    const invalid = await renameCategory({ status: 'idle' }, form({ id: 'x', name: 'Bichos' }))
    expect(invalid).toMatchObject({ status: 'error' })
  })
})

describe('deleteCategory', () => {
  test('chama a função do banco que move os gastos para Outros', async () => {
    h.supabase = fakeSupabase({})
    const url = await redirectOf(deleteCategory(form({ id: ID })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'rpc:delete_category', payload: { p_category_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Categoria excluída.')
  })

  test('falha volta para a categoria com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'A categoria Outros não pode ser excluída.' } })
    expect(await redirectOf(deleteCategory(form({ id: ID })))).toBe(`/categorias/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para a lista sem chamar o banco', async () => {
    h.supabase = fakeSupabase({})
    expect(await redirectOf(deleteCategory(form({ id: 'x' })))).toBe('/categorias')
    expect(calls).toEqual([])
  })
})
