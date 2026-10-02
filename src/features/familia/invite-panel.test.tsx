// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InviteState } from './invite-state'

const h = vi.hoisted(() => ({ states: new Map<unknown, unknown>(), pending: new Set<unknown>() }))

vi.mock('./actions', () => ({ createInvite: vi.fn(), inviteByEmail: vi.fn(), resendInvite: vi.fn() }))
// Cada ação devolve o estado fixado para ela; as outras ficam em repouso.
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useActionState: (fn: unknown) => [h.states.get(fn) ?? { status: 'idle' }, vi.fn(), h.pending.has(fn)],
}))

const actions = await import('./actions')
const { InvitePanel } = await import('./invite-panel')

const setLink = (s: InviteState) => h.states.set(actions.createInvite, s)
const setMail = (s: InviteState) => h.states.set(actions.inviteByEmail, s)

afterEach(() => {
  cleanup()
  h.states.clear()
  h.pending.clear()
})

test('mostra o link, copia e avisa; sem "Compartilhar" quando o navegador não tem', async () => {
  setLink({ status: 'ready', link: 'https://iris.app/convite/abc', expiresOn: '2026-10-05' })
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
  setLink({ status: 'ready', link: 'https://iris.app/convite/abc', expiresOn: '2026-10-05' })
  Object.assign(navigator, { share: vi.fn(async () => {}) })
  render(<InvitePanel />)
  expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeTruthy()
  Object.assign(navigator, { share: undefined })
})

test('convite por e-mail: campo com rótulo, botão com verbo e objeto; o link continua existindo', () => {
  render(<InvitePanel />)
  const field = screen.getByLabelText('E-mail de quem vai participar')
  expect(field.getAttribute('type')).toBe('email')
  expect(field.getAttribute('name')).toBe('email')
  expect(field.getAttribute('autocomplete')).toBe('off')
  expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Convidar pessoa' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('enviado: confirma para quem e até quando', () => {
  setMail({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
  render(<InvitePanel />)
  expect(screen.getByRole('status').textContent).toBe('Convite enviado para jordan@email.com. Vale até 5 de outubro.')
  expect(screen.queryByLabelText('Link do convite')).toBeNull()
})

test('e-mail não saiu: o aviso e o link para copiar', () => {
  const notice = 'Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.'
  setMail({ status: 'ready', link: 'https://iris.app/convite/x', expiresOn: '2026-10-05', notice })
  render(<InvitePanel />)
  expect(screen.getByRole('alert').textContent).toBe(notice)
  expect(screen.getByLabelText('Link do convite')).toHaveProperty('value', 'https://iris.app/convite/x')
})

test('e-mail que não serve: o erro fica ligado ao campo', () => {
  setMail({ status: 'error', message: 'Confira o e-mail. Parece que falta alguma coisa.' })
  render(<InvitePanel />)
  const field = screen.getByLabelText('E-mail de quem vai participar')
  expect(field.getAttribute('aria-invalid')).toBe('true')
  const described = document.getElementById(field.getAttribute('aria-describedby')!)
  expect(described?.textContent).toBe('Confira o e-mail. Parece que falta alguma coisa.')
})

test('limite de convites: aviso calmo fora do campo', () => {
  const message = 'Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link.'
  setMail({ status: 'error', message })
  render(<InvitePanel />)
  expect(screen.getByRole('alert').textContent).toBe(message)
  expect(screen.getByLabelText('E-mail de quem vai participar').getAttribute('aria-invalid')).toBeNull()
})

test('enquanto envia, o botão fica desligado (sem envio duplo)', () => {
  h.pending.add(actions.inviteByEmail)
  render(<InvitePanel />)
  expect(screen.getByRole('button', { name: 'Enviar convite' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'Convidar pessoa' })).toHaveProperty('disabled', false)
})
