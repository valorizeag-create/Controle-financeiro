// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { GoalForm } = await import('./goal-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Criar meta: campos da copy, prazo opcional por mês a partir de agora', () => {
  render(<GoalForm action={action} minMonth="2026-09" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).maxLength).toBe(40)
  expect((screen.getByLabelText('Quanto você precisa?') as HTMLInputElement).inputMode).toBe('decimal')
  const deadline = screen.getByLabelText('Até quando? (opcional)') as HTMLInputElement
  expect(deadline.type).toBe('month')
  expect(deadline.min).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Criar meta' })).toBeTruthy()
})

test('editar: vem preenchido, com o id escondido e "Salvar alterações"', () => {
  render(
    <GoalForm
      action={action}
      minMonth="2000-01"
      goal={{ id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' }}
    />,
  )
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).value).toBe('Viagem para Salvador')
  expect((screen.getByLabelText('Quanto você precisa?') as HTMLInputElement).value).toBe('4.000,00')
  expect((screen.getByLabelText('Até quando? (opcional)') as HTMLInputElement).value).toBe('2027-03')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('g1')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erro no campo aparece e o que foi digitado fica', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { deadline: 'Escolha um mês a partir de agora.' }, values: { name: 'Viagem', target: '4000', deadline: '2026-01' } },
    vi.fn(),
    false,
  ])
  render(<GoalForm action={action} minMonth="2026-09" />)
  expect(screen.getByText('Escolha um mês a partir de agora.')).toBeTruthy()
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).value).toBe('Viagem')
  expect(screen.getByLabelText('Até quando? (opcional)').getAttribute('aria-invalid')).toBe('true')
})

test('"Meta da família" só ao criar e só com inFamily, com a ajuda ligada à caixa', () => {
  render(<GoalForm action={action} minMonth="2026-09" />)
  expect(screen.queryByLabelText('Meta da família')).toBeNull()
  cleanup()
  render(<GoalForm action={action} minMonth="2026-09" inFamily />)
  const box = screen.getByLabelText('Meta da família') as HTMLInputElement
  expect(box.name).toBe('family')
  expect(screen.getByText('Todos da família veem o total; cada pessoa vê só a própria parte.')).toBeTruthy()
  expect(box.getAttribute('aria-describedby')).toBe('family-help')
  cleanup()
  const goal = { id: 'g1', name: 'Viagem', targetCents: 100000, deadline: null, status: 'active' as const, usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' }
  render(<GoalForm action={action} minMonth="2026-09" inFamily goal={goal} />)
  expect(screen.queryByLabelText('Meta da família')).toBeNull()
})
