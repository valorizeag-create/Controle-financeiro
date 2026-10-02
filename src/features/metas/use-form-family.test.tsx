// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const acts = vi.hoisted(() => ({ spendFromGoal: vi.fn(), spendFromFamilyGoal: vi.fn() }))
vi.mock('./movement-actions', () => ({ spendFromGoal: acts.spendFromGoal }))
vi.mock('./family-goal-actions', () => ({ spendFromFamilyGoal: acts.spendFromFamilyGoal }))
const { UseGoalForm } = await import('./use-form')

const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('family escolhe a ação da família; sem family, a pessoal', () => {
  render(<UseGoalForm goalId="g1" balanceCents={100} categories={[]} family />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.spendFromFamilyGoal)
  cleanup()
  mockUseActionState.mockClear()
  render(<UseGoalForm goalId="g1" balanceCents={100} categories={[]} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.spendFromGoal)
})
