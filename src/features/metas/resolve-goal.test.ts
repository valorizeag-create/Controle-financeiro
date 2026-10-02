import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({
  loadGoal: vi.fn(),
  loadMyGoalUses: vi.fn(),
  loadMyFamily: vi.fn(),
  loadFamilyGoal: vi.fn(),
}))
vi.mock('./queries', () => ({ loadGoal: h.loadGoal, loadMyGoalUses: h.loadMyGoalUses }))
vi.mock('@/features/familia/queries', () => ({ loadMyFamily: h.loadMyFamily, loadFamilyGoal: h.loadFamilyGoal }))

const { resolveGoal } = await import('./resolve-goal')

const goal = { id: 'g1', createdBy: 'u2' }

beforeEach(() => {
  vi.resetAllMocks()
  h.loadGoal.mockResolvedValue(null)
  h.loadMyGoalUses.mockResolvedValue([])
})

describe('resolveGoal', () => {
  test('a meta pessoal vem primeiro e não consulta a família', async () => {
    h.loadGoal.mockResolvedValue({ goal: { id: 'g1' }, movements: [] })
    expect(await resolveGoal('g1')).toMatchObject({ kind: 'personal' })
    expect(h.loadMyFamily).not.toHaveBeenCalled()
  })

  test('sem meta pessoal e sem família: nada', async () => {
    h.loadMyFamily.mockResolvedValue(null)
    expect(await resolveGoal('g1')).toBeNull()
  })

  test('meta que não é da família da pessoa: nada', async () => {
    h.loadMyFamily.mockResolvedValue({ id: 'f1', role: 'member', meId: 'u1' })
    h.loadFamilyGoal.mockResolvedValue(null)
    expect(await resolveGoal('g1')).toBeNull()
    expect(h.loadFamilyGoal).toHaveBeenCalledWith('g1', 'f1')
  })

  test('membro: não administra, só edita se criou; não carrega usos', async () => {
    h.loadMyFamily.mockResolvedValue({ id: 'f1', role: 'member', meId: 'u1' })
    h.loadFamilyGoal.mockResolvedValue({ goal, movements: [] })
    expect(await resolveGoal('g1')).toMatchObject({ kind: 'family', isAdmin: false, canEdit: false, uses: [] })
    expect(h.loadMyGoalUses).not.toHaveBeenCalled()
    h.loadMyFamily.mockResolvedValue({ id: 'f1', role: 'member', meId: 'u2' })
    expect(await resolveGoal('g1')).toMatchObject({ isAdmin: false, canEdit: true })
  })

  test('administrador: edita, e os usos dele vêm do gasto', async () => {
    h.loadMyFamily.mockResolvedValue({ id: 'f1', role: 'admin', meId: 'u1' })
    h.loadFamilyGoal.mockResolvedValue({ goal, movements: [] })
    h.loadMyGoalUses.mockResolvedValue([{ id: 'tx1', amountCents: 100, occurredOn: '2026-09-20' }])
    expect(await resolveGoal('g1')).toMatchObject({ isAdmin: true, canEdit: true, uses: [{ id: 'tx1' }] })
    expect(h.loadMyGoalUses).toHaveBeenCalledWith('g1')
  })
})
