// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InviteState } from './invite-state'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as unknown, pending: false }))

vi.mock('./actions', () => ({ createInvite: vi.fn(), inviteByEmail: vi.fn(), resendInvite: vi.fn() }))
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useActionState: () => [h.state, vi.fn(), h.pending],
}))

const { ResendInvite } = await import('./resend-invite')
const set = (s: InviteState, pending = false) => {
  h.state = s
  h.pending = pending
}

afterEach(() => {
  cleanup()
  set({ status: 'idle' })
})

test('só o id vai no formulário; o botão tem 44px', () => {
  const { container } = render(<ResendInvite id="i1" />)
  expect([...new FormData(container.querySelector('form')!).entries()]).toEqual([['id', 'i1']])
  expect(screen.getByRole('button', { name: 'Reenviar' }).className).toContain('min-h-11')
})

test('reenviado, erro, e-mail desligado e enviando', () => {
  set({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
  const { rerender } = render(<ResendInvite id="i1" />)
  expect(screen.getByRole('status').textContent).toBe('Convite reenviado.')
  expect(document.body.textContent).not.toContain('jordan@email.com')
  set({ status: 'error', message: 'Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link.' })
  rerender(<ResendInvite id="i1" />)
  expect(screen.getByRole('alert').textContent).toContain('Você já enviou alguns convites hoje.')
  set({ status: 'ready', link: 'https://iris.app/convite/x', expiresOn: '2026-10-05', notice: 'Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.' })
  rerender(<ResendInvite id="i1" />)
  expect(screen.getByRole('alert').textContent).toBe('Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.')
  expect(screen.getByLabelText('Link do convite')).toBeTruthy()
  set({ status: 'idle' }, true)
  rerender(<ResendInvite id="i1" />)
  expect(screen.getByRole('button', { name: 'Reenviar' })).toHaveProperty('disabled', true)
})
