// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./movement-actions', () => ({ spendFromGoal: vi.fn() }))
const { UseGoalForm } = await import('./use-form')

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const categories = [
  { id: 'c1', name: 'Lazer', defaultKey: 'lazer' },
  { id: 'c2', name: 'Transporte', defaultKey: 'transporte' },
  { id: 'c3', name: 'Outros', defaultKey: 'outros' },
]

test('protótipo: valor, "Com o quê?", aviso e botão', () => {
  render(<UseGoalForm goalId="g1" balanceCents={248000} categories={categories} />)
  expect(screen.getByLabelText('Quanto foi o gasto?')).toBeTruthy()
  const group = screen.getByRole('group', { name: 'Com o quê?' })
  expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['c1', 'c2', 'c3'])
  expect(screen.getByText('Esse gasto não sai do seu Disponível de novo: o dinheiro já tinha saído quando foi guardado.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Usar o dinheiro da meta' })).toBeTruthy()
})

test('gasto maior que o guardado avisa quanto sai do mês (RN-15a); menor não avisa', () => {
  render(<UseGoalForm goalId="g1" balanceCents={248000} categories={categories} />)
  const amount = screen.getByLabelText('Quanto foi o gasto?')
  fireEvent.change(amount, { target: { value: '3.000' } })
  // getByText normaliza espaços (inclusive NBSP) só do lado do DOM; comparamos o texto bruto
  // do aria-live para não perder o NBSP que formatBRL usa entre "R$" e o valor.
  const warning = document.querySelector('[aria-live="polite"]')
  expect(warning?.textContent).toBe(`A diferença de R$${NBSP}520,00 sai do seu Disponível deste mês.`)
  fireEvent.change(amount, { target: { value: '2.300' } })
  expect(document.querySelector('[aria-live="polite"]')).toBeNull()
})
