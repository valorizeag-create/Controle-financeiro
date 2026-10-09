import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return {
    RedirectSignal,
    supabase: null as unknown,
    setFlash: vi.fn(async (_m: string) => {}),
    revalidatePath: vi.fn(),
    loadImportContext: vi.fn(),
  }
})

const CAT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const OTHER_CAT = '9a8b7c6d-1111-4222-8333-444455556666'
const CARD = '11111111-2222-4333-8444-555566667777'
const BILL = '22222222-3333-4444-8555-666677778888'
const KEY = 'a'.repeat(64)

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
vi.mock('@/features/registro/queries', () => ({ loadCategories: async () => [{ id: CAT, name: 'Mercado', defaultKey: null }] }))
vi.mock('@/features/cartoes/queries', () => ({ loadCards: async () => [{ id: CARD, nickname: 'Nubank', kind: 'credit', color: 'purple', brand: null }] }))
vi.mock('./queries', () => ({ loadImportContext: h.loadImportContext }))

const actions = await import('./actions')

const calls: { fn: string; args: unknown }[] = []
function fakeSupabase(s: { data?: unknown; error?: unknown } = {}) {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args })
      return { data: s.data ?? 1, error: s.error ?? null }
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

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

const line = (over: Record<string, unknown> = {}) => ({
  importKey: KEY,
  kind: 'expense',
  amountCents: 1250,
  occurredOn: '2026-09-10',
  categoryId: CAT,
  source: null,
  note: 'Padaria',
  billId: null,
  merchantKey: 'padaria',
  ...over,
})

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
  h.loadImportContext.mockReset()
})

describe('saveImport', () => {
  test('monta p_lines em snake_case, chama a RPC e redireciona com aviso', async () => {
    h.supabase = fakeSupabase({ data: 2 })
    const payload = {
      cardId: CARD,
      lines: [
        line(),
        line({ importKey: 'b'.repeat(64), kind: 'income', categoryId: null, source: 'Salário', note: 'Salário', merchantKey: 'empresa' }),
      ],
    }
    expect(await redirectOf(actions.saveImport(payload))).toBe('/inicio')
    expect(calls).toEqual([
      {
        fn: 'import_statement',
        args: {
          p_card_id: CARD,
          p_lines: [
            { import_key: KEY, kind: 'expense', amount_cents: 1250, occurred_on: '2026-09-10', category_id: CAT, source: null, note: 'Padaria', bill_id: null, merchant_key: 'padaria' },
            { import_key: 'b'.repeat(64), kind: 'income', amount_cents: 1250, occurred_on: '2026-09-10', category_id: null, source: 'Salário', note: 'Salário', bill_id: null, merchant_key: 'empresa' },
          ],
        },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('2 registros anotados.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('um registro usa o singular', async () => {
    h.supabase = fakeSupabase({ data: 1 })
    await redirectOf(actions.saveImport({ cardId: null, lines: [line()] }))
    expect(h.setFlash).toHaveBeenCalledWith('1 registro anotado.')
  })

  test('merchant_key só vai para gasto com categoria sem conta a pagar, ou entrada com origem', async () => {
    h.supabase = fakeSupabase()
    const lines = [
      line({ importKey: '1'.repeat(64), billId: BILL, categoryId: CAT }),
      line({ importKey: '2'.repeat(64), merchantKey: '' }),
      line({ importKey: '3'.repeat(64), merchantKey: null }),
      line({ importKey: '4'.repeat(64), kind: 'income', categoryId: null, source: null }),
      line({ importKey: '5'.repeat(64), kind: 'income', categoryId: null, source: 'Pix' }),
      line({ importKey: '6'.repeat(64) }),
    ]
    await redirectOf(actions.saveImport({ cardId: null, lines }))
    const sent = (calls[0].args as { p_lines: { merchant_key: string | null }[] }).p_lines
    expect(sent.map((l) => l.merchant_key)).toEqual([null, null, null, null, 'padaria', 'padaria'])
  })

  test('categoria de outra pessoa: erro sem chamar a RPC', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.saveImport({ cardId: null, lines: [line({ categoryId: OTHER_CAT })] })
    expect(state).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('conta (cartão) de outra pessoa: erro sem chamar a RPC', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.saveImport({ cardId: OTHER_CAT, lines: [line()] })
    expect(state).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
  })

  test('payload inválido: erro sem chamar a RPC', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.saveImport({ cardId: null, lines: [] })).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(await actions.saveImport('lixo')).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
  })

  test('erro da RPC devolve a mensagem de falha', async () => {
    h.supabase = fakeSupabase({ error: { message: 'x' } })
    const state = await actions.saveImport({ cardId: null, lines: [line()] })
    expect(state).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('RPC devolve 0: tudo já estava anotado', async () => {
    h.supabase = fakeSupabase({ data: 0 })
    const state = await actions.saveImport({ cardId: null, lines: [line()] })
    expect(state).toEqual({ status: 'error', message: 'Esses registros já tinham sido anotados.' })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('loadContextAction', () => {
  test('devolve o contexto do período', async () => {
    const ctx = { categories: [], cards: [], existing: [], usedKeys: [], rules: [] }
    h.loadImportContext.mockResolvedValue(ctx)
    expect(await actions.loadContextAction('2026-09-01', '2026-09-30')).toEqual(ctx)
    expect(h.loadImportContext).toHaveBeenCalledWith('2026-09-01', '2026-09-30')
  })

  test('período inválido vira erro', async () => {
    h.loadImportContext.mockRejectedValue(new Error('Período inválido.'))
    await expect(actions.loadContextAction('x', 'y')).rejects.toThrow()
  })
})
