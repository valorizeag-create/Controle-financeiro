// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ViewSwitch } from './view-switch'

afterEach(() => cleanup())

test('dois links, Eu e Família, e só o atual leva aria-current', () => {
  render(<ViewSwitch month="2026-09" current="familia" />)
  const nav = screen.getByRole('navigation', { name: 'Ver o mês de' })
  expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href'), l.getAttribute('aria-current')])).toEqual([
    ['Eu', '/inicio?mes=2026-09', null],
    ['Família', '/inicio/familia?mes=2026-09', 'page'],
  ])
})

test('no Seu mês pessoal o atual é Eu', () => {
  render(<ViewSwitch month="2026-09" current="eu" />)
  expect(screen.getByRole('link', { name: 'Eu' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Família' }).getAttribute('aria-current')).toBeNull()
})
