// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './hero'

const summary = {
  entrouCents: 0, saiuCents: 14230, goalLine: null, disponivelCents: -14230, contasAPagarCents: 0,
  disponivelDepoisContasCents: -14230, saldoTotalCents: -14230, guardadoTotalCents: 0,
}

test('Disponível negativo aparece com sinal e sem cor de alarme', () => {
  render(<Hero summary={summary} />)
  const value = screen.getByTestId('disponivel')
  expect(value.textContent).toBe('−R$ 142,30')
  expect(value.className).toContain('text-brand-ink')
  expect(value.className).not.toMatch(/red|error/)
})

test('linha de metas só aparece com valor', () => {
  render(<Hero summary={summary} />)
  expect(screen.queryByText('Guardado este mês')).toBeNull()
})

test('linha de metas aparece quando goalLine está definido', () => {
  render(<Hero summary={{ ...summary, goalLine: { label: 'Guardado este mês', amountCents: 5000 } }} />)
  expect(screen.getByText('Guardado este mês')).not.toBeNull()
})
