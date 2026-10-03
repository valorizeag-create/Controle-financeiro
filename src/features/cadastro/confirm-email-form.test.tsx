// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as { status: string }, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ confirmEmailChange: async () => ({ status: 'idle' }) }))
const { ConfirmEmailForm } = await import('./confirm-email-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
  window.history.replaceState(null, '', '/')
})

const TOKEN = `pkce_${'a'.repeat(56)}`
const INVALID = 'Este link não vale mais. Peça a troca de novo em Configurações.'

test('abrir o link só mostra o botão; o código vai num campo escondido', () => {
  const { container } = render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(screen.getByRole('button', { name: 'Confirmar troca de e-mail' })).toBeTruthy()
  expect((container.querySelector('input[name="token_hash"]') as HTMLInputElement).value).toBe(TOKEN)
  expect(container.textContent).not.toContain(TOKEN)
})

test('sem código, ou com código fora do formato: link que não vale, sem botão', () => {
  for (const bad of [null, 'curto', '<script>']) {
    const { unmount } = render(<ConfirmEmailForm tokenHash={bad} />)
    expect(screen.getByText(INVALID)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
  }
})

test.each([
  ['half', 'Falta um passo. Confirme também pelo link enviado ao outro endereço.'],
  ['done', 'E-mail alterado. Use o novo endereço para entrar.'],
  ['invalid', INVALID],
])('estado %s', (status, text) => {
  h.state = { status }
  render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(screen.getByText(text)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Confirmar troca de e-mail' })).toBeNull()
})

test('depois do clique o código sai da barra de endereço; antes, nada muda', () => {
  window.history.replaceState(null, '', `/confirmar-email?token_hash=${TOKEN}`)
  const { unmount } = render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(window.location.search).toContain(TOKEN)
  unmount()
  h.state = { status: 'half' }
  render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(window.location.search).toBe('')
  expect(window.location.pathname).toBe('/confirmar-email')
})

test('falha passageira: aviso calmo, o botão continua e o código fica na barra de endereço', () => {
  window.history.replaceState(null, '', `/confirmar-email?token_hash=${TOKEN}`)
  h.state = { status: 'error' }
  const { container } = render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(screen.getByRole('alert').textContent).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  expect(screen.getByRole('button', { name: 'Confirmar troca de e-mail' })).toBeTruthy()
  expect((container.querySelector('input[name="token_hash"]') as HTMLInputElement).value).toBe(TOKEN)
  expect(screen.queryByText(INVALID)).toBeNull()
  expect(window.location.search).toContain(TOKEN)
})

test('link que não vale: o código sai da barra de endereço', () => {
  window.history.replaceState(null, '', `/confirmar-email?token_hash=${TOKEN}`)
  h.state = { status: 'invalid' }
  render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(window.location.search).toBe('')
})
