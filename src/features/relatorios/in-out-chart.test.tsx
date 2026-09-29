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
  const bars = within(section).getByTestId('chart-bars')
  expect(bars.getAttribute('aria-hidden')).toBe('true')
  expect(bars.querySelectorAll('[style*="height: 74%"]')).toHaveLength(1)
  // legenda: os quadrados de cor são só visuais
  const legend = within(section).getByText('Entrou', { selector: 'span' })
  expect(legend.querySelector('[aria-hidden="true"]')).not.toBeNull()
})

test('mês sem entrada: a barra de Entrou com altura 0 não desenha borda', () => {
  render(
    <InOutChart
      bars={[
        { month: '2026-08', label: 'Agosto', fullLabel: 'Agosto', entrouText: 'R$ 0', saiuText: 'R$ 100', entrouHeight: 0, saiuHeight: 50 },
        { month: '2026-09', label: 'Setembro', fullLabel: 'Setembro', entrouText: 'R$ 200', saiuText: 'R$ 100', entrouHeight: 100, saiuHeight: 50 },
      ]}
    />,
  )
  const bars = screen.getByTestId('chart-bars')
  const zero = bars.querySelector('[style*="height: 0%"]') as HTMLElement
  const full = bars.querySelector('[style*="height: 100%"]') as HTMLElement
  expect(zero.className).not.toContain('border')
  expect(full.className).toContain('border')
})
