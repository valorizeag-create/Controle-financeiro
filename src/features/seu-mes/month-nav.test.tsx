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
