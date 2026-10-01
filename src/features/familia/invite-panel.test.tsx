// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./actions', () => ({ createInvite: vi.fn() }))
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useActionState: () => [{ status: 'ready', link: 'https://iris.app/convite/abc', expiresOn: '2026-10-05' }, vi.fn(), false],
}))

const { InvitePanel } = await import('./invite-panel')

afterEach(() => cleanup())

test('mostra o link, copia e avisa; sem "Compartilhar" quando o navegador não tem', async () => {
  const writeText = vi.fn(async () => {})
  Object.assign(navigator, { clipboard: { writeText }, share: undefined })
  render(<InvitePanel />)
  expect(screen.getByLabelText('Link do convite')).toHaveProperty('value', 'https://iris.app/convite/abc')
  expect(screen.getByText('Envie este link para quem vai participar. Ele vale até 5 de outubro e serve para uma pessoa.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copiado.'))
  expect(writeText).toHaveBeenCalledWith('https://iris.app/convite/abc')
  expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull()
})

test('com navegador que compartilha, mostra "Compartilhar"', () => {
  Object.assign(navigator, { share: vi.fn(async () => {}) })
  render(<InvitePanel />)
  expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeTruthy()
  Object.assign(navigator, { share: undefined })
})
