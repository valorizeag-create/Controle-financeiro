// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({ updateDisplayName: vi.fn() }))

const { InitialBalanceForm, NameForm } = await import('./forms')

afterEach(() => cleanup())

test('saldo inicial: rótulo, dica ligada ao campo e botão', () => {
  render(<InitialBalanceForm action={vi.fn()} submitLabel="Salvar e continuar" />)
  const input = screen.getByLabelText('Somando banco, carteira e dinheiro guardado')
  expect(input.getAttribute('inputmode')).toBe('decimal')
  expect(input.getAttribute('aria-describedby')).toBe('initialBalance-hint')
  expect(screen.getByText('Não precisa ser exato. Um valor aproximado já ajuda a enxergar.').id).toBe('initialBalance-hint')
  expect(screen.getByRole('button', { name: 'Salvar e continuar' })).toBeTruthy()
})

test('em Configurações, o saldo vem com o valor atual', () => {
  render(<InitialBalanceForm action={vi.fn()} submitLabel="Salvar alterações" defaultValue="6000,00" />)
  expect((screen.getByLabelText('Somando banco, carteira e dinheiro guardado') as HTMLInputElement).value).toBe('6000,00')
})

test('nome: campo com o nome atual e Salvar alterações', () => {
  render(<NameForm defaultValue="Camila" />)
  expect((screen.getByLabelText('Como podemos te chamar?') as HTMLInputElement).value).toBe('Camila')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})
