// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as Record<string, unknown>, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ requestEmailChange: async () => ({ status: 'idle' }) }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sair da Íris</button> }))
const { EmailForm } = await import('./email-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
})

const SENT = 'Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois.'

test('mostra o e-mail atual, o campo do novo e o botão', () => {
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByText('E-mail atual')).toBeTruthy()
  expect(screen.getByText('ana@teste.iris.dev')).toBeTruthy()
  const field = screen.getByLabelText('Novo e-mail') as HTMLInputElement
  expect(field.type).toBe('email')
  expect(field.name).toBe('email')
  expect(screen.getByRole('button', { name: 'Enviar link' })).toBeTruthy()
  expect(screen.queryByText(/Troca pendente/)).toBeNull()
})

test('depois de enviar: a mesma frase, sem dizer se o endereço já tem cadastro, e sem repetir o endereço', () => {
  h.state = { status: 'sent' }
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByRole('status').textContent).toBe(SENT)
  expect(screen.queryByRole('button', { name: 'Enviar link' })).toBeNull()
})

test('troca pendente aparece com o endereço novo', () => {
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail="nova@teste.iris.dev" />)
  expect(screen.getByText('Troca pendente para nova@teste.iris.dev. Ela só vale depois de confirmar pelos dois links.')).toBeTruthy()
})

test('entrada antiga: o aviso, "Sair da Íris" e o que foi digitado continua no campo', () => {
  h.state = { status: 'error', submission: 3, message: 'Por segurança, saia e entre de novo antes de trocar o e-mail.', code: 'reauth', values: { email: 'nova@teste.iris.dev' } }
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByRole('alert').textContent).toBe('Por segurança, saia e entre de novo antes de trocar o e-mail.')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
  expect((screen.getByLabelText('Novo e-mail') as HTMLInputElement).defaultValue).toBe('nova@teste.iris.dev')
})
