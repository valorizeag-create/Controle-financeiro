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

describe('createBill', () => {
  test('cria a conta; a primeira vence na próxima data a partir de hoje', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(
      actions.createBill({ status: 'idle' }, form({ name: 'Luz', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' })),
    )
    expect(url).toBe('/contas')
    expect(calls).toEqual([
      {
        op: 'insert:recurrences',
        filters: {},
        payload: {
          user_id: 'u1', kind: 'expense', name: 'Luz', amount_cents: 18000, category_id: CAT,
          frequency: 'monthly', due_day: 25, due_month: null, starts_on: '2026-10-25',
        },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Conta criada.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/contas')
  })

  test('anual em 29 de fevereiro começa no último dia de fevereiro (Review Focus 2)', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.createBill({ status: 'idle' }, form({ name: 'IPVA', amount: '500', categoryId: CAT, frequency: 'yearly', dueDay: '29', dueMonth: '2' })))
    expect(calls[0].payload).toMatchObject({ frequency: 'yearly', due_day: 29, due_month: 2, starts_on: '2027-02-28' })
  })

  test('erro de campo não grava nada e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.createBill({ status: 'idle' }, form({ name: '', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' }, values: { amount: '180' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { code: '23503' } })
    const state = await actions.createBill({ status: 'idle' }, form({ name: 'Luz', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Luz' } })
  })
})

describe('updateRecurrence', () => {
  test('o tipo vem do banco; altera pela função atômica', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    const url = await redirectOf(actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Energia', amount: '200', categoryId: CAT, source: 'Freela', dueDay: '10' })))
    expect(url).toBe('/contas')
    expect(calls).toEqual([
      { op: 'read:recurrences', filters: { id: ID, user_id: 'u1', ended_on: null } },
      {
        op: 'rpc:update_recurrence',
        filters: {},
        payload: { p_id: ID, p_name: 'Energia', p_amount_cents: 20000, p_category_id: CAT, p_source: null, p_due_day: 10 },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('entrada ignora categoria enviada pelo formulário', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    await redirectOf(actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Freela', amount: '800', categoryId: CAT, source: 'Freela', dueDay: '30' })))
    expect(calls[1].payload).toMatchObject({ p_category_id: null, p_source: 'Freela' })
  })

  test('recorrência encerrada, de outra pessoa ou id inválido não grava', async () => {
    h.supabase = fakeSupabase({ kind: null })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateRecurrence({ status: 'idle' }, form({ id, name: 'Luz', amount: '10', categoryId: CAT, dueDay: '5' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '10' } })
    }
    expect(calls.filter((c) => c.op.startsWith('rpc:'))).toEqual([])
  })

  test('falha na função avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', rpcError: { message: 'Recorrência não encontrada.' } })
    const state = await actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Luz', amount: '10', categoryId: CAT, dueDay: '5' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
  })
})

describe('endRecurrence', () => {
  test('encerra e avisa que o histórico continua', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.endRecurrence(form({ id: ID })))).toBe('/contas')
    expect(calls).toEqual([{ op: 'rpc:end_recurrence', filters: {}, payload: { p_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Encerrada. O histórico continua no Extrato.')
  })

  test('falha volta para a recorrência com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.endRecurrence(form({ id: ID })))).toBe(`/contas/recorrencia/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para Contas sem chamar o banco', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.endRecurrence(form({ id: 'x' })))).toBe('/contas')
    expect(calls).toEqual([])
  })
})
