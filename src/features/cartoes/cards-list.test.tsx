// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CardsList } from './cards-list'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)

test('cada cartão: editar, "Gasto neste cartão em {mês}" e "Ver gastos"', () => {
  render(
    <CardsList
      items={[{
        card: { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple' },
        spentCents: 128450, spentLabel: 'Gasto neste cartão em setembro', gastosHref: '/extrato?mes=2026-09&cartao=k1',
      }]}
    />,
  )
  const card = screen.getByRole('article', { name: 'Nubank pessoal' })
  expect(within(card).getByRole('link', { name: 'Editar cartão Nubank pessoal' }).getAttribute('href')).toBe('/cartoes/k1')
  expect(card.textContent).toContain('Gasto neste cartão em setembro')
  expect(card.textContent).toContain(`R$${NBSP}1.284,50`)
  expect(within(card).getByRole('link', { name: 'Ver gastos' }).getAttribute('href')).toBe('/extrato?mes=2026-09&cartao=k1')
})

test('sem cartões: convite calmo para adicionar', () => {
  render(<CardsList items={[]} />)
  expect(screen.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Adicionar' }).getAttribute('href')).toBe('/cartoes/novo')
})
