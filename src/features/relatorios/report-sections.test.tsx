// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MonthByMonth, WhatChanged } from './report-sections'

afterEach(() => cleanup())

test('O que mudou: frases com os valores em destaque', () => {
  render(
    <WhatChanged
      summary={['Em agosto, entrou ', { value: 'R$ 5.000' }, ' e saiu ', { value: 'R$ 3.720' }, '.']}
      changes={[['Você gastou ', { value: 'R$ 180' }, ' a menos com Comer fora do que no mês passado.']]}
    />,
  )
  const section = screen.getByRole('region', { name: 'O que mudou' })
  const ps = section.querySelectorAll('p')
  expect([...ps].map((p) => p.textContent)).toEqual([
    'Em agosto, entrou R$ 5.000 e saiu R$ 3.720.',
    'Você gastou R$ 180 a menos com Comer fora do que no mês passado.',
  ])
  expect([...section.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['R$ 5.000', 'R$ 3.720', 'R$ 180'])
})

test('Mês a mês: "até agora" no mês atual; entrou e guardado abaixo', () => {
  render(
    <MonthByMonth
      months={[
        { month: '2026-09', label: 'Setembro', current: true, entrouText: 'Entrou R$ 5.000', saiuText: 'Saiu R$ 3.460', goalText: 'Tirado das metas R$ 100' },
        { month: '2026-08', label: 'Agosto', current: false, entrouText: 'Entrou R$ 5.000', saiuText: 'Saiu R$ 3.720', goalText: null },
      ]}
    />,
  )
  const items = screen.getByRole('region', { name: 'Mês a mês' }).querySelectorAll('li')
  expect(items[0].textContent).toContain('Setembro')
  expect(items[0].textContent).toContain('até agora')
  expect(items[0].textContent).toContain('Saiu R$ 3.460')
  expect(items[0].textContent).toContain('Entrou R$ 5.000 · Tirado das metas R$ 100')
  expect(items[1].textContent).not.toContain('até agora')
  expect(items[1].textContent).not.toContain('·')
})
