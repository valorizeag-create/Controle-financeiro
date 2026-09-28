// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { InOutChart } from './in-out-chart'

afterEach(() => cleanup())

test('barras só visuais; os números ficam numa tabela para leitor de tela (RNF-05)', () => {
  render(
    <InOutChart
      bars={[
        { month: '2026-08', label: 'Agosto', fullLabel: 'Agosto', entrouText: 'R$ 5.000', saiuText: 'R$ 3.720', entrouHeight: 100, saiuHeight: 74 },
        { month: '2026-09', label: 'Setembro', fullLabel: 'Setembro', entrouText: 'R$ 5.000', saiuText: 'R$ 3.460', entrouHeight: 100, saiuHeight: 69 },
      ]}
    />,
  )
  const section = screen.getByRole('region', { name: 'Entrou e saiu' })
  const table = within(section).getByRole('table', { name: 'Entrou e saiu por mês' })
  expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mês', 'Entrou', 'Saiu'])
  expect(within(table).getAllByRole('row')[2].textContent).toBe('SetembroR$ 5.000R$ 3.460')
  const bars = section.querySelector('[aria-hidden="true"]') as HTMLElement
  expect(bars.querySelectorAll('[style*="height: 74%"]')).toHaveLength(1)
})
