// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  signUp: vi.fn(), signIn: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(),
}))

const { NewPasswordForm } = await import('./forms')

afterEach(() => cleanup())

test('vindo de Configurações, o formulário avisa de onde veio', () => {
  render(<NewPasswordForm from="configuracoes" />)
  expect((document.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement).value).toBe('configuracoes')
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeTruthy()
})

test('pelo link do e-mail, não há campo de origem', () => {
  render(<NewPasswordForm />)
  expect(document.querySelector('input[name="from"]')).toBeNull()
})
