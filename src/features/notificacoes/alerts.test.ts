import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  lines: [] as { categoryId: string; state: 'within' | 'near' | 'over' }[],
  rpc: vi.fn(async (_fn: string, _args: unknown) => ({ data: 1 as number | null, error: null as unknown })),
  ledgerFails: false,
  noBudgets: false,
  ledger: vi.fn(),
  build: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: h.rpc }), requireUser: async () => ({ id: 'u1', email: '' }) }))
vi.mock('@/features/registro/queries', () => ({
  loadLedger: async () => {
    h.ledger()
    if (h.ledgerFails) throw new Error('x')
    return { categories: ['c'], transactions: ['t'] }
  },
}))
vi.mock('@/features/planejamento/queries', () => ({ loadBudgets: async (months: string[]) => (h.noBudgets ? [] : months.map((m) => ({ month: m }))) }))
vi.mock('@/features/planejamento/view-model', () => ({
  buildPlanejamento: (input: unknown) => {
    h.build(input)
    return { lines: h.lines }
  },
}))

const { queueBudgetAlerts, queueGoalAlert } = await import('./alerts')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
  h.lines = []
  h.ledgerFails = false
  h.noBudgets = false
  h.ledger.mockClear()
  h.rpc.mockClear()
  h.build.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('queueBudgetAlerts', () => {
  test('usa a mesma regra do Planejamento, no mês atual, e avisa só as categorias "perto do limite"', async () => {
    h.lines = [{ categoryId: 'c1', state: 'near' }, { categoryId: 'c2', state: 'within' }, { categoryId: 'c3', state: 'over' }, { categoryId: 'c4', state: 'near' }]
    await queueBudgetAlerts()
    expect(h.build.mock.calls[0][0]).toMatchObject({ month: '2026-09', today: '2026-09-28', categories: ['c'], transactions: ['t'], budgets: [{ month: '2026-09' }] })
    expect(h.rpc.mock.calls).toEqual([
      ['queue_own_notification', { p_kind: 'budget_near', p_id: 'c1' }],
      ['queue_own_notification', { p_kind: 'budget_near', p_id: 'c4' }],
    ])
  })
  test('nada perto do limite: nenhuma chamada', async () => {
    h.lines = [{ categoryId: 'c2', state: 'within' }]
    await queueBudgetAlerts()
    expect(h.rpc).not.toHaveBeenCalled()
  })
  test('sem planejado no mês: não lê o extrato nem chama o banco', async () => {
    h.noBudgets = true
    h.lines = [{ categoryId: 'c1', state: 'near' }]
    await queueBudgetAlerts()
    expect(h.ledger).not.toHaveBeenCalled()
    expect(h.rpc).not.toHaveBeenCalled()
  })
  test('qualquer erro é engolido: o aviso nunca atrapalha o registro', async () => {
    h.ledgerFails = true
    await expect(queueBudgetAlerts()).resolves.toBeUndefined()
    h.ledgerFails = false
    h.lines = [{ categoryId: 'c1', state: 'near' }]
    h.rpc.mockRejectedValueOnce(new Error('rede'))
    await expect(queueBudgetAlerts()).resolves.toBeUndefined()
    expect(console.error).toHaveBeenLastCalledWith('queueBudgetAlerts', 'erro')
  })
})

describe('queueGoalAlert', () => {
  test('pede ao banco para conferir a meta (é ele que decide se falta pouco)', async () => {
    await queueGoalAlert('g1')
    expect(h.rpc.mock.calls).toEqual([['queue_own_notification', { p_kind: 'goal_near', p_id: 'g1' }]])
  })
  test('erro engolido', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(queueGoalAlert('g1')).resolves.toBeUndefined()
  })
})
