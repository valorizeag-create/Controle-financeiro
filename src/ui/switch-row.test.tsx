// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SwitchRow } from './switch-row'

afterEach(() => cleanup())

test('SwitchRow: papel de chave, estado, alvo de toque e o próximo valor no formulário', () => {
  const { container } = render(<SwitchRow label="Resumo do mês" caption="Todo dia 1" checked action={async () => {}} fields={{ kind: 'summary' }} />)
  const sw = screen.getByRole('switch', { name: 'Resumo do mês' })
  expect(sw.getAttribute('aria-checked')).toBe('true')
  expect(sw.getAttribute('type')).toBe('submit')
  expect(sw.className).toContain('min-h-11')
  expect(container.querySelector('input[name="kind"]')?.getAttribute('value')).toBe('summary')
  expect(container.querySelector('input[name="enabled"]')?.getAttribute('value')).toBe('false') // tocar desliga
  expect(container.textContent).toContain('Todo dia 1')
  cleanup()
  const off = render(<SwitchRow label="Lembrete para anotar" checked={false} action={async () => {}} fields={{ kind: 'daily' }} />)
  expect(screen.getByRole('switch', { name: 'Lembrete para anotar' }).getAttribute('aria-checked')).toBe('false')
  expect(off.container.querySelector('input[name="enabled"]')?.getAttribute('value')).toBe('true')
})
