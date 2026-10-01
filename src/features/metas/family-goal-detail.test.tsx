// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const acts = vi.hoisted(() => ({ deleteFamilyGoal: vi.fn(), deleteFamilyGoalUse: vi.fn() }))
vi.mock('./family-goal-actions', () => acts)
vi.mock('./movement-actions', () => ({ deleteGoalUse: vi.fn() }))
const { FamilyGoalDetail } = await import('./family-goal-detail')
import type { FamilyGoalRow } from '@/features/familia/types'
import type { FamilyGoalDetailView } from './view-model'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const goal: FamilyGoalRow = {
  id: 'g1', name: 'Reforma da cozinha', targetCents: 1000000, deadline: null, status: 'active', usedOn: null, deletedOn: null,
  createdAt: '2026-07-01T12:00:00Z', familyId: 'f1', createdBy: 'u2', savedCents: 300000,
}
const view = (p: Partial<FamilyGoalDetailView> = {}): FamilyGoalDetailView => ({
  summary: {
    goal, balanceCents: 300000, percent: 30, remainingCents: 700000, complete: false,
    remainingText: `Faltam R$${NBSP}7.000,00 para Reforma da cozinha.`, shortRemaining: '', deadlineShort: 'sem prazo', suggestion: null,
  },
  state: 'active', celebration: null, usedText: null, balanceText: '', canDeposit: true, canWithdraw: true, canUse: true,
  myPartCents: 180000,
  history: [
    { id: 'h1', label: 'Guardou', dateLabel: '1 de setembro', amountText: '+ R$ 1.800,00', positive: true, transactionId: null },
    { id: 'h2', label: 'Usou', dateLabel: '5 de setembro', amountText: '− R$ 100,00', positive: false, transactionId: 't1' },
  ],
  ...p,
})

test('cabeçalho: total da família e só a parte da própria pessoa', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin={false} canEdit={false} />)
  const hero = screen.getByTestId('meta-resumo')
  expect(hero.textContent).toContain(`R$${NBSP}3.000,00`)
  expect(hero.textContent).toContain(`Sua parte: R$${NBSP}1.800,00`)
})

test('membro: guarda e tira, mas não usa a meta nem exclui; sem editar, sem "Mais opções"; sem desfazer o uso', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin={false} canEdit={false} />)
  expect(screen.getByRole('link', { name: 'Guardar dinheiro' }).getAttribute('href')).toBe('/metas/g1/guardar')
  expect(screen.getByRole('link', { name: 'Tirar dinheiro' }).getAttribute('href')).toBe('/metas/g1/tirar')
  expect(screen.queryByRole('link', { name: 'Usar o dinheiro da meta' })).toBeNull()
  expect(screen.queryByText('Mais opções')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Excluir o gasto/ })).toBeNull()
})

test('quem criou a meta e não administra edita, mas não exclui', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin={false} canEdit />)
  expect(screen.getByText('Mais opções')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Editar' }).getAttribute('href')).toBe('/metas/g1/editar')
  expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
})

test('administrador: usa a meta, edita, exclui e desfaz o uso', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin canEdit />)
  expect(screen.getByRole('link', { name: 'Usar o dinheiro da meta' }).getAttribute('href')).toBe('/metas/g1/usar')
  expect(screen.getByRole('link', { name: 'Editar' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Excluir' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Excluir o gasto de 5 de setembro' })).toBeTruthy()
})

test('"Tirar dinheiro" some com parte 0; "Usar" some sem dinheiro guardado', () => {
  render(<FamilyGoalDetail goal={goal} view={view({ canWithdraw: false, canUse: false, myPartCents: 0 })} isAdmin canEdit />)
  expect(screen.queryByRole('link', { name: 'Tirar dinheiro' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Usar o dinheiro da meta' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Guardar dinheiro' })).toBeTruthy()
})

test('meta completa não repete "Usar o dinheiro da meta" no cabeçalho (nomes únicos)', () => {
  render(
    <FamilyGoalDetail goal={goal} view={view({ state: 'complete', celebration: 'Você chegou lá. Reforma da cozinha está completa.' })} isAdmin canEdit />,
  )
  expect(screen.getAllByRole('link', { name: 'Usar o dinheiro da meta' })).toHaveLength(1)
})

test('excluir a meta: confirmação com a frase da copy e a da família', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin canEdit />)
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByText('Excluir Reforma da cozinha?')).toBeTruthy()
  expect(dialog.textContent).toContain('O valor guardado continua registrado no seu histórico.')
  expect(dialog.textContent).toContain('A parte de cada pessoa volta para quem guardou.')
})

test('desfazer o uso envia transactionId e goalId', () => {
  render(<FamilyGoalDetail goal={goal} view={view()} isAdmin canEdit />)
  fireEvent.click(screen.getByRole('button', { name: 'Excluir o gasto de 5 de setembro' }))
  const dialog = screen.getByRole('alertdialog')
  const fields = Array.from(dialog.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value])
  expect(fields).toEqual([['transactionId', 't1'], ['goalId', 'g1']])
})
