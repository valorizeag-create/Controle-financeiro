// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/features/metas/resolve-goal', () => ({ resolveGoal: async () => h.data }))
vi.mock('@/features/metas/view-model', () => ({
  buildGoalDetail: () => ({ history: [] }),
  buildFamilyGoalDetail: () => ({ history: [] }),
}))
vi.mock('@/features/metas/goal-detail', () => ({
  GoalHero: () => <h2>Resumo</h2>,
  GoalActions: () => <h2>Ações</h2>,
  GoalHistory: () => <h2>Histórico</h2>,
}))
vi.mock('@/features/metas/family-goal-detail', () => ({ FamilyGoalDetail: () => <h2>Detalhe da família</h2> }))

const { default: MetaPage } = await import('./page')
const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const show = async (id: string) => render(await MetaPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))
const column = (name: string) => screen.getByRole('heading', { name }).closest('[data-column]')?.getAttribute('data-column')
afterEach(() => cleanup())

test('meta pessoal: resumo e ações à esquerda, histórico à direita, nessa ordem no DOM', async () => {
  h.data = { kind: 'personal', goal: { id: UUID, name: 'Viagem' }, movements: [] }
  const { container } = await show(UUID)
  expect(['Resumo', 'Ações', 'Histórico'].map(column)).toEqual(['main', 'main', 'aside'])
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})

test('meta da família: uma coluna, largura de leitura', async () => {
  h.data = { kind: 'family', goal: { id: UUID, name: 'Casa' }, movements: [], uses: [], isAdmin: false, canEdit: false }
  const { container } = await show(UUID)
  expect(container.querySelector('[data-columns]')).toBeNull()
  expect(container.querySelector('main')?.className).not.toContain('lg:max-w-[1180px]')
})
