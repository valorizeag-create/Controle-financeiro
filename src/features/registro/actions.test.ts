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

const { updateTransaction, deleteTransaction } = await import('./actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []

// Builder encadeável: cada `.eq(col, val)` registra o filtro e devolve o próprio builder, para que
// `updateTransaction`/`deleteTransaction` possam encadear tantos `.eq(...)` quanto precisarem
// (ex.: filtrar por `id` E por `user_id`) antes do `.select(...)` final, que resolve o resultado.
function makeBuilder(op: 'update' | 'delete', table: string, payload: unknown, resolve: (filters: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const filters: Record<string, unknown> = {}
  const builder = {
    eq(col: string, val: unknown) {
      filters[col] = val
      return builder
    },
    select: async () => {
      calls.push({ op: `${op}:${table}`, filters, payload })
      return resolve(filters)
    },
  }
  return builder
}

function fakeSupabase(s: { kind: 'income' | 'expense' | null; changedRows?: number; deleted?: { occurred_on: string }[]; deleteFails?: boolean }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: s.kind ? { kind: s.kind } : null, error: null }) }),
      }),
      update: (payload: unknown) =>
        makeBuilder('update', table, payload, (filters) => ({
          data: Array.from({ length: s.changedRows ?? 1 }, () => ({ id: filters.id })),
          error: null,
        })),
      delete: () =>
        makeBuilder('delete', table, undefined, () =>
          s.deleteFails ? { data: null, error: { message: 'falhou' } } : { data: s.deleted ?? [], error: null },
        ),
    }),
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
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.useRealTimers())

describe('updateTransaction', () => {
  test('gasto movido para o mês anterior: salva e volta ao Extrato do novo mês (Review Focus 2)', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    const url = await redirectOf(
      updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'other', date: '2026-08-15', note: 'feira', paymentMethod: 'pix' })),
    )
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([
      {
        op: 'update:transactions',
        filters: { id: ID, user_id: 'u1' },
        payload: { amount_cents: 15000, category_id: CAT, note: 'feira', payment_method: 'pix', occurred_on: '2026-08-15' },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/inicio')
    expect(h.revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  test('entrada segue as regras de entrada: data de amanhã é recusada', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '10', source: 'Salário', when: 'other', date: '2026-10-01' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { date: 'Escolha o dia.' }, values: { amount: '10' } })
    expect(calls).toEqual([])
  })

  test('o tipo vem do banco, não do formulário', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, kind: 'expense', amount: '10', source: 'Freela', when: 'today', date: '' })))
    expect(calls[0].payload).toEqual({ amount_cents: 1000, source: 'Freela', occurred_on: '2026-09-30' })
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1' })
  })

  test('id inválido ou de registro que a pessoa não vê não grava nada', async () => {
    h.supabase = fakeSupabase({ kind: null })
    for (const id of ['nao-e-id', ID]) {
      const state = await updateTransaction({ status: 'idle' }, form({ id, amount: '10', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '10' } })
    }
    expect(calls).toEqual([])
  })

  test('se nenhuma linha mudou, avisa e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', changedRows: 0 })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '150' } })
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1' })
  })
})

describe('deleteTransaction', () => {
  test('exclui e volta ao mês do registro com o aviso', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleted: [{ occurred_on: '2026-08-12' }] })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([{ op: 'delete:transactions', filters: { id: ID, user_id: 'u1' }, payload: undefined }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('falha no banco volta para a edição com aviso de erro', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleteFails: true })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe(`/extrato/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1' })
  })

  test('id inválido ou registro que já não existe volta ao Extrato sem aviso', async () => {
    h.supabase = fakeSupabase({ kind: null, deleted: [] })
    expect(await redirectOf(deleteTransaction(form({ id: 'x' })))).toBe('/extrato')
    expect(calls).toEqual([])
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1' })
  })
})
