// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  order: [] as string[],
  disable: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/features/auth/actions', () => ({ signOut: h.signOut }))
vi.mock('@/features/notificacoes/push-client', () => ({ disablePush: h.disable }))

const { SignOutButton } = await import('./sign-out-button')

beforeEach(() => {
  h.order = []
  h.disable.mockReset().mockImplementation(async () => { h.order.push('disablePush') })
  h.signOut.mockReset().mockImplementation(async () => { h.order.push('signOut') })
})
afterEach(() => cleanup())

test('Sair apaga a inscrição de push deste aparelho antes de encerrar a sessão', async () => {
  render(<SignOutButton variant="row" />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da Íris' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sair' }))
  await waitFor(() => expect(h.order).toEqual(['disablePush', 'signOut']))
})

test('se apagar a inscrição falhar, a pessoa sai do mesmo jeito', async () => {
  h.disable.mockRejectedValue(new Error('x'))
  render(<SignOutButton variant="row" />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da Íris' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sair' }))
  await waitFor(() => expect(h.signOut).toHaveBeenCalled())
})
