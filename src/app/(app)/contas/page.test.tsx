// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: { vapidPublicKey: 'k' } }))
vi.mock('@/features/registro/queries', () => ({
  loadLedger: async () => ({ profile: {}, categories: [], transactions: [], goalMovements: [] }),
}))
vi.mock('@/features/contas/queries', () => ({ loadRecurrences: async () => [] }))
vi.mock('@/features/contas/actions', () => ({ markBillPaid: async () => {} }))
vi.mock('@/features/contas/pay-target', () => ({ payTarget: () => null }))
vi.mock('@/features/contas/view-model', () => ({
  parseContasTab: () => 'a-pagar',
  buildContas: () => ({
    label: 'outubro', counts: { 'a-pagar': 1, pagas: 0, vencidas: 0 }, aPagarLabel: 'A pagar em outubro', aPagarCents: 100,
    disponivelDepoisCents: 50, bills: [{}], incomes: [{}], recurringBills: [], recurringIncomes: [{}], payable: [],
  }),
}))
vi.mock('@/features/notificacoes/bills-reminder-card', () => ({ BillsReminderCard: () => <p>lembrete</p> }))
vi.mock('@/features/notificacoes/pay-from-notification', () => ({ PayFromNotification: () => null }))
vi.mock('@/features/seu-mes/month-nav', () => ({ MonthNav: () => <nav aria-label="Mês" /> }))
vi.mock('@/features/contas/contas-sections', () => ({
  ContasTabs: () => <nav aria-label="Situação das contas" />,
  BillsList: () => <h2>Contas da aba</h2>,
  IncomeList: () => <h2>Entradas a receber</h2>,
  RecurringList: ({ title }: { title: string }) => <h2>{title}</h2>,
  contasHref: () => '/contas',
}))

const { default: ContasPage } = await import('./page')
const show = async () => render(await ContasPage({ searchParams: Promise.resolve({}) }))
afterEach(() => cleanup())

test('desktop: resumo e lembrete à direita em cima, lista à esquerda, recorrências à direita embaixo; DOM do celular', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect([...root.children].map((c) => [c.getAttribute('data-column'), c.getAttribute('data-row')])).toEqual([['aside', '1'], ['main', null], ['aside', '2']])
  expect(within(root.children[0] as HTMLElement).getByRole('region', { name: 'Resumo do mês' })).toBeTruthy()
  expect((root.children[0] as HTMLElement).textContent).toContain('lembrete')
  expect(within(root.children[1] as HTMLElement).getAllByRole('heading').map((x) => x.textContent)).toEqual(['Contas da aba', 'Entradas a receber'])
  expect(within(root.children[2] as HTMLElement).getAllByRole('heading').map((x) => x.textContent)).toEqual(['Contas que se repetem', 'Entradas que se repetem'])
  expect(screen.getByRole('navigation', { name: 'Situação das contas' }).closest('[data-columns]')).toBeNull()
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})
