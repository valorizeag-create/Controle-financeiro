// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const cards = [
  { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const, brand: null },
  { id: 'k2', nickname: 'Inter', kind: 'debit' as const, color: 'orange' as const, brand: null },
]

describe('Como pagou? (K6 A)', () => {
  test('sem cartões, não aparece e a forma de pagamento continua em Mais detalhes', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.queryByRole('group', { name: 'Como pagou?' })).toBeNull()
    expect(screen.getByLabelText('Forma de pagamento')).toBeTruthy()
  })

  test('um toque por cartão, o último usado já marcado, e "Outra forma" que desmarca', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" />)
    const group = screen.getByRole('group', { name: 'Como pagou?' })
    expect(within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['k1', 'k2', ''])
    expect(within(group).getByRole('radio', { name: 'Inter' })).toHaveProperty('checked', true)
    expect((within(group).getByRole('radio', { name: 'Inter' }) as HTMLInputElement).name).toBe('cardId')
    expect(screen.queryByLabelText('Forma de pagamento')).toBeNull()
    fireEvent.click(within(group).getByRole('radio', { name: 'Outra forma' }))
    expect(within(group).getByRole('radio', { name: 'Inter' })).toHaveProperty('checked', false)
    expect(screen.getByLabelText('Forma de pagamento')).toBeTruthy()
  })

  test('último usado que não existe mais: "Outra forma" marcada (Review Focus 4)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="excluido" />)
    expect(screen.getByRole('radio', { name: 'Outra forma' })).toHaveProperty('checked', true)
  })

  test('na edição vem o cartão do registro, não o último usado', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today, cardId: 'k1' }
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" record={gasto} />)
    expect(screen.getByRole('radio', { name: 'Nubank pessoal' })).toHaveProperty('checked', true)
  })

  test('depois de um erro, o cartão escolhido continua marcado', () => {
    mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, message: 'x', values: { amount: '10', cardId: 'k1' } }, vi.fn(), false])
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" />)
    expect(screen.getByRole('radio', { name: 'Nubank pessoal' })).toHaveProperty('checked', true)
  })

  test('entrada não mostra cartões', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} cards={cards} lastCardId="k1" />)
    expect(screen.queryByRole('group', { name: 'Como pagou?' })).toBeNull()
  })
})

describe('Foi parcelado (só gasto, só ao criar)', () => {
  test('dentro de Mais detalhes; marcado pede o nº de parcelas e explica o total', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const box = screen.getByLabelText('Foi parcelado') as HTMLInputElement
    expect(box.closest('details')).not.toBeNull()
    expect(box.name).toBe('parcelado')
    expect(screen.queryByLabelText('Em quantas parcelas?')).toBeNull()
    fireEvent.click(box)
    const count = screen.getByLabelText('Em quantas parcelas?') as HTMLInputElement
    expect(count.name).toBe('installments')
    expect(count.getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText('O valor em "Quanto foi?" é o total da compra.')).toBeTruthy()
  })

  test('parcelado e se repete nunca ficam marcados juntos (decisão 50)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    fireEvent.click(screen.getByLabelText('É uma conta que se repete'))
    expect(screen.getByRole('radio', { name: 'Todo mês' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Foi parcelado'))
    expect(screen.getByLabelText('É uma conta que se repete')).toHaveProperty('checked', false)
    expect(screen.queryByRole('radio', { name: 'Todo mês' })).toBeNull()
    fireEvent.click(screen.getByLabelText('É uma conta que se repete'))
    expect(screen.getByLabelText('Foi parcelado')).toHaveProperty('checked', false)
    expect(screen.queryByLabelText('Em quantas parcelas?')).toBeNull()
  })

  test('depois de um erro, continua marcado, com o número e a mensagem', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { installments: 'Escolha de 2 a 48 parcelas.' }, values: { amount: '300', parcelado: 'on', installments: '60' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    expect((screen.getByLabelText('Em quantas parcelas?') as HTMLInputElement).value).toBe('60')
    expect(screen.getByText('Escolha de 2 a 48 parcelas.')).toBeTruthy()
  })

  test('não existe na edição nem na entrada', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today }
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(screen.queryByLabelText('Foi parcelado')).toBeNull()
    cleanup()
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.queryByLabelText('Foi parcelado')).toBeNull()
  })
})

describe('AnotarForm — gasto da família', () => {
  const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today }

  test('sem inFamily não existe a caixa nem o marcador', () => {
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.queryByLabelText('Gasto da família')).toBeNull()
    expect(container.querySelector('input[name="familyChoice"]')).toBeNull()
  })

  test('com inFamily a caixa existe só em "Saiu dinheiro", dentro de Mais detalhes, com o marcador familyChoice', () => {
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} inFamily />)
    const box = screen.getByLabelText('Gasto da família') as HTMLInputElement
    expect(box.name).toBe('family')
    expect(box.checked).toBe(false)
    expect(box.closest('details')).toBeTruthy()
    const marker = container.querySelector('input[name="familyChoice"]') as HTMLInputElement
    expect(marker.type).toBe('hidden')
    expect(marker.value).toBe('1')
    cleanup()
    const income = render(<AnotarForm kind="income" categories={categories} today={today} inFamily />)
    expect(screen.queryByLabelText('Gasto da família')).toBeNull()
    expect(income.container.querySelector('input[name="familyChoice"]')).toBeNull()
  })

  test('na edição de gasto da família a caixa vem marcada; de gasto pessoal, desmarcada', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} inFamily record={{ ...gasto, familyId: 'f1' }} />)
    expect(screen.getByLabelText('Gasto da família')).toHaveProperty('checked', true)
    cleanup()
    render(<AnotarForm kind="expense" categories={categories} today={today} inFamily record={gasto} />)
    expect(screen.getByLabelText('Gasto da família')).toHaveProperty('checked', false)
  })

  test('depois de um erro, o valor devolvido family: on volta marcado e os detalhes abertos', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, message: 'Falhou.', values: { amount: '10', family: 'on' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} inFamily />)
    expect(screen.getByLabelText('Gasto da família')).toHaveProperty('checked', true)
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
  })

  test('parcelado e conta que se repete convivem com a caixa (o banco aceita p_family)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} inFamily />)
    fireEvent.click(screen.getByLabelText('Foi parcelado'))
    expect(screen.getByLabelText('Gasto da família')).toBeTruthy()
  })
})
