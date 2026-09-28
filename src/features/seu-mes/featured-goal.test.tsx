// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FeaturedGoal } from './featured-goal'

afterEach(() => cleanup())

test('Meta em destaque: progresso, quanto falta, Ver metas e Guardar dinheiro', () => {
  render(
    <FeaturedGoal goal={{ id: 'g1', name: 'Viagem para Salvador', percent: 62, remainingText: 'Faltam R$ 1.520,00 para Viagem para Salvador.', caption: 'R$ 2.480,00 de R$ 4.000,00 · até março de 2027', guardarHref: '/metas/g1/guardar' }} />,
  )
  const card = screen.getByRole('region', { name: 'Meta em destaque' })
  expect(within(card).getByRole('link', { name: 'Ver metas' }).getAttribute('href')).toBe('/metas')
  expect(within(card).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' }).getAttribute('aria-valuenow')).toBe('62')
  expect(card.textContent).toContain('62%')
  expect(card.textContent).toContain('Faltam R$ 1.520,00 para Viagem para Salvador.')
  expect(within(card).getByRole('link', { name: 'Guardar dinheiro' }).getAttribute('href')).toBe('/metas/g1/guardar')
})
