// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({
  signUp: vi.fn(), signIn: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(),
}))
vi.mock('@/features/notificacoes/push-client', () => ({ disablePush: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})

const { NewPasswordForm, SignInForm, SignUpForm } = await import('./forms')

const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('vindo de Configurações, o formulário avisa de onde veio', () => {
  render(<NewPasswordForm from="configuracoes" />)
  expect((document.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement).value).toBe('configuracoes')
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeTruthy()
})

test('pelo link do e-mail, não há campo de origem', () => {
  render(<NewPasswordForm />)
  expect(document.querySelector('input[name="from"]')).toBeNull()
})

test('sessão antiga: oferece "Sair da Íris" ali mesmo, sem precisar ir buscar o botão em outro lugar', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, message: 'Por segurança, saia e entre de novo antes de mudar a senha.', code: 'reauth' },
    vi.fn(),
    false,
  ])
  render(<NewPasswordForm />)
  expect(screen.getByText('Sair da Íris')).toBeTruthy()
})

test('outros erros não oferecem "Sair da Íris"', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, message: 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.' },
    vi.fn(),
    false,
  ])
  render(<NewPasswordForm />)
  expect(screen.queryByText('Sair da Íris')).toBeNull()
})

test('entrar e criar cadastro levam o convite escondido; sem convite, nenhum campo de volta', () => {
  const next = `/convite/${'a'.repeat(32)}`
  const { unmount } = render(<SignInForm next={next} />)
  expect((document.querySelector('input[type="hidden"][name="next"]') as HTMLInputElement).value).toBe(next)
  unmount()
  render(<SignUpForm next={next} />)
  expect((document.querySelector('input[type="hidden"][name="next"]') as HTMLInputElement).value).toBe(next)
  cleanup()
  render(<SignInForm />)
  expect(document.querySelector('input[name="next"]')).toBeNull()
  cleanup()
  render(<SignUpForm />)
  expect(document.querySelector('input[name="next"]')).toBeNull()
})
