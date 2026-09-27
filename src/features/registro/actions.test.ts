import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

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

const { createTransaction, updateTransaction, deleteTransaction } = await import('./actions')

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

function fakeSupabase(s: {
  kind: 'income' | 'expense' | null
  status?: 'confirmed' | 'pending'
  paidOn?: string | null
  changedRows?: number
  deleted?: { occurred_on: string; paid_on?: string | null }[]
  deleteFails?: boolean
}) {
  return {
    from: (table: string) => ({
      // Pré-leitura encadeável (id + user_id) igual à de update/delete, mas termina em
      // `maybeSingle()` em vez de `select()`.
      select: () => {
        const filters: Record<string, unknown> = {}
        const builder = {
          eq(col: string, val: unknown) {
            filters[col] = val
            return builder
          },
          maybeSingle: async () => ({
            data: s.kind ? { kind: s.kind, status: s.status ?? 'confirmed', paid_on: s.paidOn ?? null } : null,
            error: null,
          }),
        }
        return builder
      },
      update: (payload: unknown) =>
        makeBuilder('update', table, payload, (filters) => ({
          data: Array.from({ length: s.changedRows ?? 1 }, () => ({ id: filters.id })),
          error: null,
        })),
      delete: () =>
        makeBuilder('delete', table, undefined, (filters) => {
          if (s.deleteFails) return { data: null, error: { message: 'falhou' } }
          // Simula o filtro `.eq('status', 'confirmed')` do banco: um registro pendente não é
          // afetado pelo delete, então nenhuma linha volta.
          if (filters.status && filters.status !== (s.status ?? 'confirmed')) return { data: [], error: null }
          return { data: s.deleted ?? [], error: null }
        }),
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
        filters: { id: ID, user_id: 'u1', status: 'confirmed' },
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
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
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
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
  })

  test('registro pendente não pode ser editado por aqui', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', status: 'pending' })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '150' } })
    expect(calls).toEqual([])
  })

  test('conta paga: a data editada é o dia do pagamento, não o vencimento (Review Focus 5)', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', paidOn: '2026-10-02' })
    const url = await redirectOf(
      updateTransaction({ status: 'idle' }, form({ id: ID, amount: '180', categoryId: CAT, when: 'other', date: '2026-09-29', note: 'Luz', paymentMethod: '' })),
    )
    expect(url).toBe('/extrato?mes=2026-09')
    expect(calls[0].payload).toEqual({ amount_cents: 18000, category_id: CAT, note: 'Luz', payment_method: null, paid_on: '2026-09-29' })
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
  })

  test('entrada recebida de uma recorrência: também muda o dia em que entrou', async () => {
    h.supabase = fakeSupabase({ kind: 'income', paidOn: '2026-09-28' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '750', source: 'Freela', when: 'yesterday', date: '' })))
    expect(calls[0].payload).toEqual({ amount_cents: 75000, source: 'Freela', paid_on: '2026-09-29' })
  })

  test('conta paga não pode ser movida para uma data futura: um pagamento não pode ter acontecido no futuro', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', paidOn: '2026-09-25' })
    const state = await updateTransaction(
      { status: 'idle' },
      form({ id: ID, amount: '180', categoryId: CAT, when: 'other', date: '2026-10-01', note: 'Luz', paymentMethod: '' }),
    )
    expect(state).toMatchObject({ status: 'error', fieldErrors: { date: 'Escolha o dia.' }, values: { amount: '180', note: 'Luz' } })
    expect(calls).toEqual([])
  })

  test('conta paga pode ser movida para hoje', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', paidOn: '2026-09-25' })
    const url = await redirectOf(
      updateTransaction(
        { status: 'idle' },
        form({ id: ID, amount: '180', categoryId: CAT, when: 'other', date: '2026-09-30', note: 'Luz', paymentMethod: '' }),
      ),
    )
    expect(url).toBe('/extrato?mes=2026-09')
    expect(calls[0].payload).toEqual({ amount_cents: 18000, category_id: CAT, note: 'Luz', payment_method: null, paid_on: '2026-09-30' })
  })
})

describe('deleteTransaction', () => {
  test('exclui e volta ao mês do registro com o aviso', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleted: [{ occurred_on: '2026-08-12' }] })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([{ op: 'delete:transactions', filters: { id: ID, user_id: 'u1', status: 'confirmed' }, payload: undefined }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('exclui conta paga e volta ao mês do pagamento, não ao mês do lançamento', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleted: [{ occurred_on: '2026-09-01', paid_on: '2026-08-30' }] })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato?mes=2026-08')
  })

  test('falha no banco volta para a edição com aviso de erro', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleteFails: true })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe(`/extrato/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
  })

  test('id inválido ou registro que já não existe volta ao Extrato sem aviso', async () => {
    h.supabase = fakeSupabase({ kind: null, deleted: [] })
    expect(await redirectOf(deleteTransaction(form({ id: 'x' })))).toBe('/extrato')
    expect(calls).toEqual([])
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
  })

  test('registro pendente não pode ser excluído por aqui', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', status: 'pending' })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

function fakeCreate(s: { rpcError?: unknown } = {}) {
  return {
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, filters: {}, payload })
        return { error: null }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: 'novo-id', error: s.rpcError ?? null }
    },
  }
}

describe('createTransaction com repetição', () => {
  test('gasto que se repete cria recorrência e primeira ocorrência de uma vez', async () => {
    h.supabase = fakeCreate()
    const url = await redirectOf(
      createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: 'Internet', paymentMethod: 'boleto', repeats: 'on', frequency: 'monthly' })),
    )
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'rpc:create_recurring_transaction',
        filters: {},
        payload: {
          p_kind: 'expense', p_amount_cents: 12000, p_category_id: CAT, p_source: null, p_note: 'Internet',
          p_payment_method: 'boleto', p_occurred_on: '2026-09-30', p_frequency: 'monthly',
        },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/contas')
  })

  test('entrada que se repete todo ano', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'income', amount: '800', source: 'Freela', when: 'today', date: '', repeats: 'on', frequency: 'yearly' })))
    expect(calls[0].payload).toEqual({
      p_kind: 'income', p_amount_cents: 80000, p_category_id: null, p_source: 'Freela', p_note: null,
      p_payment_method: null, p_occurred_on: '2026-09-30', p_frequency: 'yearly',
    })
  })

  test('sem repetição continua um registro simples', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '10', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' })))
    expect(calls.map((c) => c.op)).toEqual(['insert:transactions'])
  })

  test('falha na função mantém o que foi digitado, inclusive a repetição', async () => {
    h.supabase = fakeCreate({ rpcError: { message: 'x' } })
    const state = await createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', repeats: 'on', frequency: 'yearly' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { repeats: 'on', frequency: 'yearly' } })
  })
})
