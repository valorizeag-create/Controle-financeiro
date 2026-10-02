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
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), revalidatePath: vi.fn(), after: [] as (() => unknown)[], budgetAlerts: vi.fn(async () => {}), goalAlert: vi.fn(async (_id: string) => {}) }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { h.after.push(fn) } }))
vi.mock('@/features/notificacoes/alerts', () => ({ queueBudgetAlerts: h.budgetAlerts, queueGoalAlert: h.goalAlert }))
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
    is(col: string, val: unknown) {
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
  installment?: boolean
  goalFunded?: boolean
  existingFamilyId?: string | null
  family?: string | null
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
          is(col: string, val: unknown) {
            filters[col] = val
            return builder
          },
          maybeSingle: async () => {
            if (table === 'family_members') {
              calls.push({ op: 'read:family_members', filters })
              return { data: s.family ? { family_id: s.family } : null, error: null }
            }
            return {
              data: s.kind ? { kind: s.kind, status: s.status ?? 'confirmed', paid_on: s.paidOn ?? null, family_id: s.existingFamilyId ?? null } : null,
              error: null,
            }
          },
        }
        return builder
      },
      update: (payload: unknown) =>
        makeBuilder('update', table, payload, (filters) => {
          // Simula o filtro `.is('installment_plan_id', null)` do banco: uma parcela nunca
          // atende a esse filtro, então nenhuma linha volta.
          if (s.installment && filters.installment_plan_id === null) return { data: [], error: null }
          // Simula o filtro `.is('goal_id', null)` do banco: um gasto pago com meta nunca
          // atende a esse filtro, então nenhuma linha volta.
          if (s.goalFunded && filters.goal_id === null) return { data: [], error: null }
          return {
            data: Array.from({ length: s.changedRows ?? 1 }, () => ({ id: filters.id })),
            error: null,
          }
        }),
      delete: () =>
        makeBuilder('delete', table, undefined, (filters) => {
          if (s.deleteFails) return { data: null, error: { message: 'falhou' } }
          if (s.installment && filters.installment_plan_id === null) return { data: [], error: null }
          if (s.goalFunded && filters.goal_id === null) return { data: [], error: null }
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
  h.after.length = 0
  h.budgetAlerts.mockClear()
  h.goalAlert.mockClear()
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.useRealTimers())

describe('avisos do planejado depois de salvar (fora do caminho da resposta)', () => {
  const expense = { kind: 'expense', amount: '50', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix' }

  test('depois de salvar um gasto, confere os avisos do planejado fora do caminho da resposta', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form(expense)))
    expect(h.after.length).toBe(1)
    expect(h.budgetAlerts).not.toHaveBeenCalled()
    await h.after[0]()
    expect(h.budgetAlerts).toHaveBeenCalledTimes(1)
  })

  test('entrada não confere avisos do planejado; erro de validação também não', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'income', amount: '10', source: 'Salário', when: 'today', date: '' })))
    await createTransaction({ status: 'idle' }, form({ ...expense, amount: '' }))
    expect(h.after).toEqual([])
  })

  test('editar um gasto confere os avisos; editar uma entrada ou falhar não', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix' })))
    expect(h.after.length).toBe(1)
    await h.after[0]()
    expect(h.budgetAlerts).toHaveBeenCalledTimes(1)
    h.after.length = 0
    h.supabase = fakeSupabase({ kind: 'income' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '10', source: 'Freela', when: 'today', date: '' })))
    h.supabase = fakeSupabase({ kind: 'expense', changedRows: 0 })
    await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix' }))
    expect(h.after).toEqual([])
  })
})

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
        filters: { id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null },
        payload: { amount_cents: 15000, category_id: CAT, note: 'feira', payment_method: 'pix', card_id: null, card_deleted: false, occurred_on: '2026-08-15' },
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
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
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
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
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
    expect(calls[0].payload).toEqual({ amount_cents: 18000, category_id: CAT, note: 'Luz', payment_method: null, card_id: null, paid_on: '2026-09-29' })
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
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
    expect(calls[0].payload).toEqual({ amount_cents: 18000, category_id: CAT, note: 'Luz', payment_method: null, card_id: null, paid_on: '2026-09-30' })
  })
})

describe('deleteTransaction', () => {
  test('exclui e volta ao mês do registro com o aviso', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleted: [{ occurred_on: '2026-08-12' }] })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([{ op: 'delete:transactions', filters: { id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null }, payload: undefined }])
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
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
  })

  test('id inválido ou registro que já não existe volta ao Extrato sem aviso', async () => {
    h.supabase = fakeSupabase({ kind: null, deleted: [] })
    expect(await redirectOf(deleteTransaction(form({ id: 'x' })))).toBe('/extrato')
    expect(calls).toEqual([])
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
  })

  test('registro pendente não pode ser excluído por aqui', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', status: 'pending' })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

function fakeCreate(s: { rpcError?: unknown; family?: string | null } = {}) {
  return {
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {}
        const b = {
          eq(col: string, val: unknown) {
            filters[`eq:${col}`] = val
            return b
          },
          is(col: string, val: unknown) {
            filters[`is:${col}`] = val
            return b
          },
          maybeSingle: async () => {
            calls.push({ op: `read:${table}`, filters })
            return { data: s.family ? { family_id: s.family } : null, error: null }
          },
        }
        return b
      },
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
          p_payment_method: 'boleto', p_occurred_on: '2026-09-30', p_frequency: 'monthly', p_card_id: null,
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
      p_payment_method: null, p_occurred_on: '2026-09-30', p_frequency: 'yearly', p_card_id: null,
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

const CARD = '9c1e3f2a-5b7d-4e8a-9c21-7d4e5f6a8b91'

describe('gasto com cartão (K6 A)', () => {
  test('grava o cartão e deixa a forma de pagamento vazia', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix', cardId: CARD })))
    expect(calls).toEqual([
      {
        op: 'insert:transactions',
        filters: {},
        payload: { user_id: 'u1', kind: 'expense', amount_cents: 12000, category_id: CAT, note: null, payment_method: null, card_id: CARD, occurred_on: '2026-09-30' },
      },
    ])
    expect(h.revalidatePath).toHaveBeenCalledWith('/cartoes')
  })

  test('"Outra forma": sem cartão, vale a forma escolhida', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix', cardId: '' })))
    expect(calls[0].payload).toMatchObject({ card_id: null, payment_method: 'pix' })
  })

  test('conta que se repete com cartão leva o cartão para a função', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '39,90', categoryId: CAT, when: 'today', date: '', note: 'Streaming', paymentMethod: '', cardId: CARD, repeats: 'on', frequency: 'monthly' })))
    expect(calls[0]).toMatchObject({ op: 'rpc:create_recurring_transaction', payload: { p_card_id: CARD, p_payment_method: null } })
  })

  test('editar: trocar para um cartão tira a marca "Cartão excluído"; não escolher nada a mantém', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', cardId: CARD })))
    expect(calls[0].payload).toMatchObject({ card_id: CARD, payment_method: null, card_deleted: false })
    calls.length = 0
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', cardId: '' })))
    expect(calls[0].payload).not.toHaveProperty('card_deleted')
    expect(calls[0].payload).toMatchObject({ card_id: null, payment_method: null })
  })
})

describe('createTransaction parcelado (RN-07)', () => {
  const base = { kind: 'expense', amount: '300', categoryId: CAT, when: 'today', date: '', note: 'Tênis', paymentMethod: '', cardId: CARD, parcelado: 'on', installments: '3' }

  test('cria a compra e todas as parcelas de uma vez, com o total e o nº de parcelas', async () => {
    h.supabase = fakeCreate()
    const url = await redirectOf(createTransaction({ status: 'idle' }, form(base)))
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'rpc:create_installment_purchase',
        filters: {},
        payload: { p_amount_cents: 30000, p_count: 3, p_category_id: CAT, p_note: 'Tênis', p_card_id: CARD, p_payment_method: null, p_purchased_on: '2026-09-30' },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/cartoes')
  })

  test('nº de parcelas fora de 2 a 48 pede de novo e mantém o que foi digitado', async () => {
    h.supabase = fakeCreate()
    for (const bad of ['', '1', '49', 'dez']) {
      const state = await createTransaction({ status: 'idle' }, form({ ...base, installments: bad }))
      expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Escolha de 2 a 48 parcelas.' }, values: { parcelado: 'on', installments: bad, amount: '300' } })
    }
    expect(calls).toEqual([])
  })

  test('valor menor que o nº de parcelas', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, amount: '0,05', installments: '10' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Valor pequeno demais para tantas parcelas.' } })
    expect(calls).toEqual([])
  })

  test('parcelado e se repete juntos (formulário adulterado) não gravam nada (decisão 50)', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, repeats: 'on', frequency: 'monthly' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Escolha só uma opção: se repete ou parcelado.' } })
    expect(calls).toEqual([])
  })

  test('compra parcelada não tem data futura', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, when: 'other', date: '2026-10-05' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { date: 'Escolha o dia.' } })
    expect(calls).toEqual([])
  })

  test('falha na função mantém tudo o que foi digitado', async () => {
    h.supabase = fakeCreate({ rpcError: { message: 'x' } })
    const state = await createTransaction({ status: 'idle' }, form(base))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { parcelado: 'on', installments: '3', cardId: CARD } })
  })

  test('"Foi parcelado" desmarcado ignora o número', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ ...base, parcelado: '', installments: '3' })))
    expect(calls.map((c) => c.op)).toEqual(['insert:transactions'])
  })
})

describe('parcela não é editada nem excluída sozinha (Review Focus 5, decisão 54)', () => {
  test('editar uma parcela pelo endereço não grava', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', installment: true })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '1', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls[0].filters).toMatchObject({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
  })

  test('excluir uma parcela pelo endereço não apaga nada', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', installment: true, deleted: [{ occurred_on: '2026-09-30' }] })
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('gasto pago com meta não é editado nem excluído pelo Extrato (Review Focus 5, decisão 66)', () => {
  test('editar não grava', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', goalFunded: true })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '1', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls[0].filters).toMatchObject({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('excluir não apaga', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', goalFunded: true, deleted: [{ occurred_on: '2026-09-28' }] })
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(calls[0].filters).toMatchObject({ goal_id: null })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('"Gasto da família" (RN-18)', () => {
  const base = { kind: 'expense', amount: '12,50', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }
  const idle = { status: 'idle' } as const
  const edit = { id: ID, amount: '10', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }

  test('avulso grava a família de quem anota, lida do banco pela pessoa', async () => {
    h.supabase = fakeCreate({ family: 'f1' })
    await redirectOf(createTransaction(idle, form({ ...base, family: 'on' })))
    expect(calls.find((c) => c.op === 'read:family_members')?.filters).toEqual({ 'eq:user_id': 'u1', 'is:left_at': null })
    expect(calls.find((c) => c.op === 'insert:transactions')?.payload).toMatchObject({ user_id: 'u1', family_id: 'f1' })
  })

  test('a família nunca vem do formulário: um family_id forjado é ignorado', async () => {
    h.supabase = fakeCreate({ family: 'f1' })
    await redirectOf(createTransaction(idle, form({ ...base, family: 'on', familyId: 'forjada', family_id: 'forjada' })))
    expect(calls.find((c) => c.op === 'insert:transactions')?.payload).toMatchObject({ family_id: 'f1' })
  })

  test('sem família: não salva e mantém o que foi digitado', async () => {
    h.supabase = fakeCreate({ family: null })
    const state = await createTransaction(idle, form({ ...base, family: 'on' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { family: 'on', amount: '12,50' } })
    expect(calls.some((c) => c.op.startsWith('insert') || c.op.startsWith('rpc'))).toBe(false)
  })

  test('sem o campo: nenhuma leitura a mais e nenhum family_id', async () => {
    h.supabase = fakeCreate({ family: 'f1' })
    await redirectOf(createTransaction(idle, form(base)))
    expect(calls.map((c) => c.op)).toEqual(['insert:transactions'])
    expect(calls[0].payload).not.toHaveProperty('family_id')
  })

  test('parcelado e conta que se repete levam p_family; entrada nunca', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction(idle, form({ ...base, family: 'on', parcelado: 'on', installments: '3' })))
    expect(calls.at(-1)).toMatchObject({ op: 'rpc:create_installment_purchase', payload: { p_family: true } })
    await redirectOf(createTransaction(idle, form({ ...base, family: 'on', repeats: 'on', frequency: 'monthly' })))
    expect(calls.at(-1)).toMatchObject({ op: 'rpc:create_recurring_transaction', payload: { p_family: true } })
    calls.length = 0
    await redirectOf(createTransaction(idle, form({ kind: 'income', amount: '10', source: 'x', when: 'today', date: '', family: 'on' })))
    expect(calls).toHaveLength(1)
    expect(calls[0].payload).not.toHaveProperty('family_id')
  })

  test('impasse (40P01) vira o aviso calmo de tentar de novo', async () => {
    h.supabase = fakeCreate({ rpcError: { message: 'deadlock detected', code: '40P01' } })
    const state = await createTransaction(idle, form({ ...base, family: 'on', repeats: 'on', frequency: 'monthly' }))
    expect(state).toMatchObject({ status: 'error', message: 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.' })
  })

  test('editar: aplica a família e mantém todos os filtros de dono (nunca remover)', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', existingFamilyId: null, family: 'f1' })
    await redirectOf(updateTransaction(idle, form({ ...edit, family: 'on', familyChoice: '1' })))
    const upd = calls.find((c) => c.op === 'update:transactions')!
    expect(upd.payload).toMatchObject({ family_id: 'f1' })
    expect(upd.filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
  })

  test('editar: gasto que já é da família não troca de família; desmarcar tira', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', existingFamilyId: 'f0', family: 'f1' })
    await redirectOf(updateTransaction(idle, form({ ...edit, family: 'on', familyChoice: '1' })))
    expect(calls.find((c) => c.op === 'update:transactions')!.payload).not.toHaveProperty('family_id')
    expect(calls.some((c) => c.op === 'read:family_members')).toBe(false)
    calls.length = 0
    await redirectOf(updateTransaction(idle, form({ ...edit, familyChoice: '1' })))
    expect(calls.find((c) => c.op === 'update:transactions')!.payload).toMatchObject({ family_id: null })
  })

  test('sem o marcador familyChoice, family_id não entra no update (nem lê a família)', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', existingFamilyId: 'f0', family: 'f1' })
    await redirectOf(updateTransaction(idle, form(edit)))
    expect(calls.find((c) => c.op === 'update:transactions')!.payload).not.toHaveProperty('family_id')
    calls.length = 0
    await redirectOf(updateTransaction(idle, form({ ...edit, family: 'on' })))
    expect(calls.find((c) => c.op === 'update:transactions')!.payload).not.toHaveProperty('family_id')
    expect(calls.some((c) => c.op === 'read:family_members')).toBe(false)
  })

  test('editar sem família: recusa e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', existingFamilyId: null, family: null })
    const state = await updateTransaction(idle, form({ ...edit, family: 'on', familyChoice: '1' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { family: 'on' } })
    expect(calls.some((c) => c.op === 'update:transactions')).toBe(false)
  })

  test('editar gasto pago com meta: o filtro de meta continua e nada muda', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', goalFunded: true, existingFamilyId: null, family: 'f1' })
    const state = await updateTransaction(idle, form({ ...edit, family: 'on', familyChoice: '1' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls.find((c) => c.op === 'update:transactions')!.filters).toMatchObject({ goal_id: null, installment_plan_id: null })
  })
})
