// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { PlannedCard } from './planned-card'

afterEach(() => cleanup())

test('Planejado: frase de abertura, quantas estão dentro, linhas sem link de ajuste e "Ver planejamento"', () => {
  render(
    <PlannedCard
      card={{
        leadText: 'Você ainda tem R$ 150 para Lazer este mês.',
        withinText: 'Você está dentro do planejado em 4 de 6 categorias.',
        lines: [{ categoryId: 'c4', name: 'Comer fora', amountsText: 'R$ 420 de R$ 400', percent: 100, state: 'over', statusText: 'Passou R$ 20 do planejado.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4', adjustLabel: 'Quer ajustar o valor deste mês?' }],
      }}
    />,
  )
  const card = screen.getByRole('region', { name: 'Planejado' })
  expect(within(card).getByRole('link', { name: 'Ver planejamento' }).getAttribute('href')).toBe('/planejamento')
  expect(card.textContent).toContain('Você ainda tem R$ 150 para Lazer este mês.')
  expect(card.textContent).toContain('Você está dentro do planejado em 4 de 6 categorias.')
  expect(card.textContent!.indexOf('Você ainda tem')).toBeLessThan(card.textContent!.indexOf('Você está dentro'))
  expect(card.textContent).toContain('Passou R$ 20 do planejado.')
  expect(within(card).getAllByRole('link')).toHaveLength(1)
})

test('Planejado: sem frase de abertura, só a de quantas estão dentro', () => {
  render(
    <PlannedCard
      card={{
        leadText: null,
        withinText: 'Você está dentro do planejado em 1 de 1 categorias.',
        lines: [],
      }}
    />,
  )
  const card = screen.getByRole('region', { name: 'Planejado' })
  expect(card.textContent).toContain('Você está dentro do planejado em 1 de 1 categorias.')
  expect(card.textContent).not.toContain('Você ainda tem')
  expect(card.querySelectorAll('p')).toHaveLength(1)
})
