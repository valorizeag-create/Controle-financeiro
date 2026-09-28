// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BudgetLines } from './budget-lines'
import type { BudgetLineView } from './view-model'

afterEach(() => cleanup())

const ADJUST = 'Quer ajustar o valor deste mês?'
const lines: BudgetLineView[] = [
  { categoryId: 'c1', name: 'Mercado', amountsText: 'R$ 890 de R$ 1.000', percent: 89, state: 'within', statusText: 'Ainda tem R$ 110 disponível.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c1', adjustLabel: null },
  { categoryId: 'c2', name: 'Saúde', amountsText: 'R$ 810 de R$ 900', percent: 90, state: 'near', statusText: 'Falta pouco para chegar ao que você planejou.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c2', adjustLabel: null },
  { categoryId: 'c4', name: 'Comer fora', amountsText: 'R$ 420 de R$ 400', percent: 100, state: 'over', statusText: 'Passou R$ 20 do planejado.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4', adjustLabel: ADJUST },
]

test('cada linha: nome, "{gasto} de {planejado}", barra acessível e o estado em texto (RF-23)', () => {
  render(<BudgetLines lines={lines} showAdjust />)
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(items[0].textContent).toContain('Mercado')
  expect(items[0].textContent).toContain('R$ 890 de R$ 1.000')
  expect(items[0].textContent).toContain('Ainda tem R$ 110 disponível.')
  expect(items[1].textContent).toContain('Falta pouco para chegar ao que você planejou.')
  expect(items[2].textContent).toContain('Passou R$ 20 do planejado.')
  const over = screen.getByRole('progressbar', { name: 'Uso do planejado em Comer fora' })
  expect(over.getAttribute('aria-valuenow')).toBe('100')
  expect((over.firstElementChild as HTMLElement).className).toContain('bg-amber-bar')
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0].textContent).toBe(`${ADJUST} Comer fora`)
  expect(links[0].getAttribute('href')).toBe('/planejamento/editar?mes=2026-09&categoria=c4')
  expect(links[0].getAttribute('aria-label')).toBeNull()
  expect(screen.getByRole('link', { name: `${ADJUST} Comer fora` })).toBe(links[0])
  expect(document.body.innerHTML).not.toMatch(/text-red|bg-red/)
})

test('duas categorias que passaram: nomes acessíveis distintos, todos com o texto visível (WCAG 2.5.3)', () => {
  const two = [lines[2], { ...lines[2], categoryId: 'c5', name: 'Transporte' }]
  render(<BudgetLines lines={two} showAdjust />)
  const names = screen.getAllByRole('link').map((l) => l.textContent)
  expect(new Set(names).size).toBe(2)
  expect(names.every((n) => n!.startsWith(ADJUST))).toBe(true)
  expect(screen.getByRole('link', { name: `${ADJUST} Transporte` })).toBeTruthy()
})

test('sem o link de ajuste quando não pedido (Seu mês)', () => {
  render(<BudgetLines lines={lines} showAdjust={false} />)
  expect(screen.queryAllByRole('link')).toHaveLength(0)
})
