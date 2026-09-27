// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), true]) }
})

import { AnotarForm } from './anotar-form'
import { createTransaction, updateTransaction } from './actions'

const mockUseActionState = vi.mocked(useActionState)
const today = '2026-09-30'

const categories = [
  { id: '1', name: 'Casa', defaultKey: 'casa' },
  { id: '2', name: 'Mercado', defaultKey: 'mercado' },
]

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

describe('AnotarForm', () => {
  test('gasto tem valor, categorias, quando e "Salvar gasto"', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto foi?').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
    expect(mockUseActionState.mock.calls[0][0]).toBe(createTransaction)
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

describe('AnotarForm editando', () => {
  const gasto = {
    id: 'r1', kind: 'expense' as const, amountCents: 14230, categoryId: '2', source: null, note: 'feira', paymentMethod: 'pix', occurredOn: '2026-08-15',
  }
  test('vem preenchido com o registro e salva alterações', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(mockUseActionState.mock.calls[0][0]).toBe(updateTransaction)
    expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('142,30')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Outro dia' })).toHaveProperty('checked', true)
    expect((screen.getByLabelText('Dia') as HTMLInputElement).value).toBe('2026-08-15')
    expect((screen.getByLabelText('Uma nota, se quiser') as HTMLInputElement).value).toBe('feira')
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('pix')
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    const hidden = document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement
    expect(hidden.value).toBe('r1')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
  })
  test('entrada de ontem vem com a origem e "Ontem" marcados', () => {
    render(
      <AnotarForm
        kind="income"
        categories={categories}
        today={today}
        record={{ ...gasto, kind: 'income', categoryId: null, source: 'Salário', note: null, paymentMethod: null, occurredOn: '2026-09-29' }}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Salário' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Ontem' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
  })
})

describe('formulário "sujo" (para pedir confirmação ao fechar)', () => {
  test('fica marcado depois que a pessoa digita', () => {
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const form = container.querySelector('form')!
    expect(form.getAttribute('data-dirty')).toBeNull()
    fireEvent.input(screen.getByLabelText('Quanto foi?'), { target: { value: '10' } })
    expect(form.getAttribute('data-dirty')).toBe('true')
  })
  test('depois de um erro, o que foi digitado ainda não foi salvo', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } },
      vi.fn(),
      false,
    ])
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(container.querySelector('form')!.getAttribute('data-dirty')).toBe('true')
  })
})

describe('se repete (só ao criar)', () => {
  test('gasto: opção dentro de Mais detalhes; marcada mostra Todo mês / Todo ano', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const box = screen.getByLabelText('É uma conta que se repete') as HTMLInputElement
    expect(box.closest('details')).not.toBeNull()
    expect(box.name).toBe('repeats')
    expect(screen.queryByRole('radio', { name: 'Todo mês' })).toBeNull()
    fireEvent.click(box)
    expect(screen.getByRole('radio', { name: 'Todo mês' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', false)
    expect(screen.getByRole('group', { name: 'Com que frequência?' })).toBeTruthy()
  })

  test('entrada: "Isso se repete" fora de detalhes', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.getByLabelText('Isso se repete').closest('details')).toBeNull()
  })

  test('depois de um erro, a repetição escolhida continua marcada e visível', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, message: 'x', values: { amount: '120', repeats: 'on', frequency: 'yearly' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    expect(screen.getByLabelText('É uma conta que se repete')).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', true)
  })

  test('na edição não existe a opção', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today }
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(screen.queryByLabelText('É uma conta que se repete')).toBeNull()
  })
})
