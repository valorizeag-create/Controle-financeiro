// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace }) }))
const { PayFromNotification } = await import('./pay-from-notification')

afterEach(() => cleanup())

test('abre a confirmação da copy; nada é pago sem confirmar; "Agora não" volta para a lista', () => {
  render(<PayFromNotification id="b1" name="Luz" back="/contas?mes=2026-10" action={async () => {}} />)
  const dialog = screen.getByRole('alertdialog')
  expect(dialog.textContent).toContain('Marcar Luz como paga?')
  expect(screen.getByRole('button', { name: 'Marcar como paga' }).getAttribute('type')).toBe('submit')
  expect(document.querySelector('input[name="id"]')?.getAttribute('value')).toBe('b1')
  expect(document.querySelector('input[name="volta"]')?.getAttribute('value')).toBe('/contas?mes=2026-10')
  fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
  expect(h.replace).toHaveBeenCalledWith('/contas?mes=2026-10')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
