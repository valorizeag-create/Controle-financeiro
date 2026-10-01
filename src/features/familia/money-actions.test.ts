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

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const { payFamilyBill, updateFamilyExpense, deleteFamilyExpense, updateFamilyBill, endFamilyBill } = await import('./money-actions')

const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const idle = { status: 'idle' } as const

let rpcCalls: { fn: string; args: unknown }[] = []
let rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}
const rpcData = (fn: string, data: unknown) => (rpcResults[fn] = { data })
const rpcError = (fn: string, message: string, code?: string) => (rpcResults[fn] = { error: { message, code } })

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
  rpcCalls = []
  rpcResults = {}
  h.supabase = {
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      const r = rpcResults[fn] ?? {}
      return { data: r.data ?? null, error: r.error ?? null }
    },
  }
  h.setFlash.mockClear()
  h.refresh.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
})

afterEach(() => vi.useRealTimers())

describe('pagar conta da família', () => {
  test('só o id; volta para onde estava; aviso da copy', async () => {
    expect(await redirectOf(payFamilyBill(form({ id: UUID, volta: '/inicio/familia' })))).toBe('/inicio/familia')
    expect(rpcCalls).toEqual([{ fn: 'pay_family_bill', args: { p_id: UUID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Conta marcada como paga.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('endereço de volta adulterado ou id inválido', async () => {
    expect(await redirectOf(payFamilyBill(form({ id: UUID, volta: 'https://evil.com' })))).toBe('/familia/contas')
    rpcCalls = []
    expect(await redirectOf(payFamilyBill(form({ id: 'x', volta: '/inicio/familia' })))).toBe('/inicio/familia')
    expect(await redirectOf(payFamilyBill(form({ id: 'x' })))).toBe('/familia/contas')
    expect(rpcCalls).toEqual([])
  })

  test('conta já paga ou de fora: volta sem aviso; outro erro: aviso de erro', async () => {
    rpcError('pay_family_bill', 'Conta não encontrada.')
    expect(await redirectOf(payFamilyBill(form({ id: UUID, volta: '/inicio/familia?mes=2026-09' })))).toBe('/inicio/familia?mes=2026-09')
    expect(h.setFlash).not.toHaveBeenCalled()
    rpcError('pay_family_bill', 'deadlock detected', '40P01')
    expect(await redirectOf(payFamilyBill(form({ id: UUID })))).toBe('/familia/contas?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('administrador: gasto da família', () => {
  test('edita valor, data e nota; erro de valor fica no campo', async () => {
    expect(await updateFamilyExpense(idle, form({ id: UUID, amount: 'abc', when: 'today', date: '', note: '' }))).toMatchObject({
      fieldErrors: { amount: 'Esse valor não parece certo. Use apenas números.' },
    })
    expect(rpcCalls).toEqual([])
    expect(await redirectOf(updateFamilyExpense(idle, form({ id: UUID, amount: '99,90', when: 'other', date: '2026-08-10', note: ' lâmpadas ' })))).toBe(
      '/inicio/familia?mes=2026-08',
    )
    expect(rpcCalls.at(-1)).toEqual({ fn: 'admin_update_family_expense', args: { p_id: UUID, p_amount_cents: 9990, p_on: '2026-08-10', p_note: 'lâmpadas' } })
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('recusa do banco mantém o que foi digitado; impasse pede para tentar de novo', async () => {
    const fields = { id: UUID, amount: '10', when: 'today', date: '', note: '' }
    rpcError('admin_update_family_expense', 'Só quem administra a família pode fazer isso.', '42501')
    expect(await updateFamilyExpense(idle, form(fields))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '10' } })
    rpcError('admin_update_family_expense', 'deadlock detected', '40P01')
    expect(await updateFamilyExpense(idle, form(fields))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('exclui e volta ao mês do gasto excluído', async () => {
    rpcData('admin_delete_family_expense', '2026-09-03')
    expect(await redirectOf(deleteFamilyExpense(form({ id: UUID })))).toBe('/inicio/familia?mes=2026-09')
    expect(rpcCalls).toEqual([{ fn: 'admin_delete_family_expense', args: { p_id: UUID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Gasto excluído.')
  })

  test('exclusão recusada: sem aviso de sucesso', async () => {
    rpcError('admin_delete_family_expense', 'Gasto não encontrado.')
    expect(await redirectOf(deleteFamilyExpense(form({ id: UUID })))).toBe('/inicio/familia')
    rpcError('admin_delete_family_expense', 'x', '42501')
    expect(await redirectOf(deleteFamilyExpense(form({ id: UUID })))).toBe('/inicio/familia?erro=1')
    expect(await redirectOf(deleteFamilyExpense(form({ id: 'x' })))).toBe('/inicio/familia')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('conta da família: alterar e encerrar', () => {
  test('alterar e encerrar', async () => {
    expect(await redirectOf(updateFamilyBill(idle, form({ id: UUID, name: 'Aluguel', amount: '1.800,00', dueDay: '5' })))).toBe('/familia/contas')
    expect(rpcCalls.at(-1)).toEqual({ fn: 'update_family_recurrence', args: { p_id: UUID, p_name: 'Aluguel', p_amount_cents: 180000, p_due_day: 5 } })
    expect(await redirectOf(endFamilyBill(form({ id: UUID })))).toBe('/familia/contas')
    expect(rpcCalls.at(-1)).toEqual({ fn: 'end_family_recurrence', args: { p_id: UUID } })
    expect(h.setFlash).toHaveBeenLastCalledWith('Encerrada. O histórico continua no Extrato.')
  })

  test('erros: campo, recusa do banco e impasse', async () => {
    expect(await updateFamilyBill(idle, form({ id: UUID, name: '', amount: '1', dueDay: '5' }))).toMatchObject({ fieldErrors: { name: 'Falta o nome.' } })
    const fields = { id: UUID, name: 'Luz', amount: '10', dueDay: '5' }
    rpcError('update_family_recurrence', 'Só quem administra a família pode fazer isso.', '42501')
    expect(await updateFamilyBill(idle, form(fields))).toMatchObject({ message: SAVE_FAILED, values: { name: 'Luz' } })
    rpcError('update_family_recurrence', 'deadlock', '40P01')
    expect(await updateFamilyBill(idle, form(fields))).toMatchObject({ message: UNEXPECTED })
    rpcError('end_family_recurrence', 'x', '42501')
    expect(await redirectOf(endFamilyBill(form({ id: UUID })))).toBe('/familia/contas?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
