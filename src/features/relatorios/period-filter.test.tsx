// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { PeriodFilter } from './period-filter'
import { resolvePeriod } from './period'

afterEach(() => cleanup())

test('quatro filtros da copy; o atual marcado (RF-40)', () => {
  render(<PeriodFilter period={resolvePeriod({}, '2026-09-28')} de="" ate="" />)
  const nav = screen.getByRole('navigation', { name: 'Período' })
  const links = within(nav).getAllByRole('link')
  expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Este mês', '/relatorios?periodo=este-mes'],
    ['Mês passado', '/relatorios?periodo=mes-passado'],
    ['Últimos 3 meses', '/relatorios?periodo=3-meses'],
    ['Personalizado', '/relatorios?periodo=personalizado'],
  ])
  expect(links[2].getAttribute('aria-current')).toBe('page')
  expect(links[0].getAttribute('aria-current')).toBeNull()
  expect(screen.queryByLabelText('De')).toBeNull()
})

test('personalizado: meses "De" e "Até" preenchidos e o aviso calmo quando o período não vale (Review Focus 5)', () => {
  const period = resolvePeriod({ periodo: 'personalizado', de: '2026-10', ate: '2026-09' }, '2026-09-28')
  render(<PeriodFilter period={period} de="2026-10" ate="2026-09" />)
  const de = screen.getByLabelText('De') as HTMLInputElement
  expect([de.type, de.name, de.value, de.min, de.max]).toEqual(['month', 'de', '2026-10', '2000-01', '2099-12'])
  expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Ver período' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('Escolha um período de até 12 meses.')
  expect((document.querySelector('input[type="hidden"][name="periodo"]') as HTMLInputElement).value).toBe('personalizado')
})
