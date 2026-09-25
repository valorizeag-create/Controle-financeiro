// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ createTransaction: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), true]) }
})

import { AnotarForm } from './anotar-form'

const mockUseActionState = vi.mocked(useActionState)
const today = '2026-09-30'

const categories = [
  { id: '1', name: 'Casa', defaultKey: 'casa' },
  { id: '2', name: 'Mercado', defaultKey: 'mercado' },
]

afterEach(() => cleanup())

describe('AnotarForm', () => {
  test('gasto tem valor, categorias, quando e "Salvar gasto"', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto foi?').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
  })
  test('botão fica desativado enquanto salva (evita registro duplicado)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toHaveProperty('disabled', true)
  })
  test('entrada usa "Quanto entrou?" e "Salvar entrada"', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto entrou?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar entrada' })).toBeTruthy()
  })
  test('erro de data mostra input com aria-describedby e mensagem', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { date: 'Escolha o dia.' }, values: { when: 'other', date: '' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('aria-describedby')).toBe('date-error')
    expect(dateInput.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Escolha o dia.')).toBeTruthy()
  })
  test('entrada: o campo de outro dia não passa de hoje', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('max')).toBe('2026-09-30')
    expect(dateInput.getAttribute('min')).toBe('2000-01-01')
  })
  test('gasto: o campo de outro dia vai até um ano à frente', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    expect(screen.getByLabelText('Dia').getAttribute('max')).toBe('2027-09-30')
  })
})
