// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./movement-actions', () => ({ deleteGoalUse: vi.fn() }))
const { GoalActions, GoalHero, GoalHistory } = await import('./goal-detail')
import type { GoalDetailView } from './view-model'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const base: GoalDetailView = {
  summary: {
    goal: { id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
    balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false,
    remainingText: `Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`, shortRemaining: '', deadlineShort: 'até mar. 2027',
    suggestion: { untilLabel: 'março de 2027', perMonth: `R$${NBSP}254 por mês` },
  },
  state: 'active', celebration: null, usedText: null, balanceText: '', canDeposit: true, canWithdraw: true, canUse: true, history: [],
}

test('meta ativa: guardado, quanto falta e quanto guardar por mês (protótipo)', () => {
  render(<GoalHero view={base} />)
  const hero = screen.getByTestId('meta-resumo')
  expect(hero.textContent).toContain(`R$${NBSP}2.480,00`)
  expect(hero.textContent).toContain(`de R$${NBSP}4.000,00`)
  expect(hero.textContent).toContain(`Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`)
  expect(hero.textContent).toContain(`Para chegar até março de 2027, guarde cerca de R$${NBSP}254 por mês.`)
  expect(within(hero).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' }).getAttribute('aria-valuenow')).toBe('62')
})

test('meta completa: comemoração e "Usar o dinheiro da meta" (RF-30)', () => {
  render(<GoalHero view={{ ...base, state: 'complete', celebration: 'Você chegou lá. Viagem para Salvador está completa.' }} />)
  expect(screen.getByText('Você chegou lá. Viagem para Salvador está completa.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Usar o dinheiro da meta' }).getAttribute('href')).toBe('/metas/g1/usar')
  expect(screen.queryByText(/Para chegar até/)).toBeNull()
})

test('ações: guardar, tirar e usar só quando valem', () => {
  render(<GoalActions view={base} />)
  expect(screen.getByRole('link', { name: 'Guardar dinheiro' }).getAttribute('href')).toBe('/metas/g1/guardar')
  expect(screen.getByRole('link', { name: 'Tirar dinheiro' }).getAttribute('href')).toBe('/metas/g1/tirar')
  expect(screen.getByRole('link', { name: 'Usar o dinheiro' }).getAttribute('href')).toBe('/metas/g1/usar')
  cleanup()
  render(<GoalActions view={{ ...base, state: 'used', canDeposit: false, canUse: false }} />)
  expect(screen.queryByRole('link', { name: 'Guardar dinheiro' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Usar o dinheiro' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Tirar dinheiro' })).toBeTruthy()
})

test('histórico: guardou, tirou e usou; o uso pode ser excluído com confirmação', () => {
  render(
    <GoalHistory
      goalId="g1"
      items={[
        { id: 'm3', label: 'Usou', dateLabel: '28 de setembro', amountText: `− R$${NBSP}2.300,00`, positive: false, transactionId: 't1' },
        { id: 'm1', label: 'Guardou', dateLabel: '19 de setembro', amountText: `+ R$${NBSP}300,00`, positive: true, transactionId: null },
      ]}
    />,
  )
  const history = screen.getByRole('region', { name: 'Histórico' })
  expect(within(history).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    expect.stringContaining('Usou'), expect.stringContaining('Guardou'),
  ])
  expect(within(history).getAllByRole('button')).toHaveLength(1)
  fireEvent.click(within(history).getByRole('button', { name: 'Excluir o gasto de 28 de setembro' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  expect(dialog.textContent).toContain('Seu mês será recalculado. O valor volta para a meta.')
  expect((dialog.querySelector('input[name="transactionId"]') as HTMLInputElement).value).toBe('t1')
  expect((dialog.querySelector('input[name="goalId"]') as HTMLInputElement).value).toBe('g1')
})
