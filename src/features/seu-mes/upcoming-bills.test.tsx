// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('@/features/contas/actions', () => ({ markBillPaid: vi.fn() }))
const { UpcomingBills } = await import('./upcoming-bills')

afterEach(() => cleanup())

test('bloco do protótipo: nome, prazo, valor, "Marcar como paga" e "Ver todas"', () => {
  render(<UpcomingBills items={[{ id: 'luz', name: 'Luz', amountCents: 18000, dueText: 'vence em 3 dias' }]} />)
  const region = screen.getByRole('region', { name: 'Próximas contas' })
  expect(region.textContent).toContain('Luz vence em 3 dias')
  expect(region.textContent).toContain('180,00')
  const pay = within(region).getByRole('button', { name: 'Marcar Luz como paga' })
  expect(pay.textContent).toBe('Marcar como paga')
  expect(within(region).getByRole('link', { name: 'Ver todas' }).getAttribute('href')).toBe('/contas')
})
