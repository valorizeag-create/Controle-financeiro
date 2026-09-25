// @vitest-environment jsdom
import { expect, test, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MonthNav } from './month-nav'

afterEach(() => cleanup())

test('capitaliza apenas a primeira letra do rótulo do mês', () => {
  render(<MonthNav month="2026-09" label="setembro de 2026" />)
  expect(screen.getByText('Setembro de 2026')).not.toBeNull()
  expect(screen.queryByText('setembro de 2026')).toBeNull()
})

test('no Seu mês, as setas levam aos meses vizinhos', () => {
  render(<MonthNav month="2026-01" label="janeiro de 2026" />)
  expect(screen.getByRole('link', { name: 'Mês anterior' }).getAttribute('href')).toBe('/inicio?mes=2025-12')
  expect(screen.getByRole('link', { name: 'Próximo mês' }).getAttribute('href')).toBe('/inicio?mes=2026-02')
})

test('no Extrato, as setas mantêm os filtros', () => {
  render(<MonthNav month="2026-09" label="setembro de 2026" basePath="/extrato" query={{ tipo: 'entradas', q: 'café' }} />)
  expect(screen.getByRole('link', { name: 'Mês anterior' }).getAttribute('href')).toBe('/extrato?mes=2026-08&tipo=entradas&q=caf%C3%A9')
})
