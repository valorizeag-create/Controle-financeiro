// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({ acceptInvite: vi.fn() }))

const { InviteScreen } = await import('./invite-screen')

afterEach(() => cleanup())

const code = 'a'.repeat(32)

test('sem sessão: os links carregam só o caminho de volta', () => {
  render(<InviteScreen view={{ kind: 'signed-out', signUpHref: `/criar-cadastro?next=%2Fconvite%2F${code}`, signInHref: `/entrar?next=%2Fconvite%2F${code}` }} />)
  expect(screen.getByRole('link', { name: 'Criar meu cadastro' }).getAttribute('href')).toBe(`/criar-cadastro?next=%2Fconvite%2F${code}`)
  expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe(`/entrar?next=%2Fconvite%2F${code}`)
})

test('pronto: formulário com o código escondido; erro passageiro mantém o botão', () => {
  const { container } = render(<InviteScreen transientError view={{ kind: 'ready', code, familyName: 'Família Souza', invitedBy: 'Camila' }} />)
  expect(screen.getByRole('heading', { name: 'Entrar na família Família Souza?' })).toBeTruthy()
  expect(screen.getByText('Camila convidou você.')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  expect(screen.getByRole('button', { name: 'Entrar na família' })).toBeTruthy()
  expect((container.querySelector('input[name="code"]') as HTMLInputElement).value).toBe(code)
  expect(screen.getByRole('link', { name: 'Agora não' }).getAttribute('href')).toBe('/inicio')
})

test('inválido e já em família', () => {
  const { rerender } = render(<InviteScreen view={{ kind: 'invalid' }} />)
  expect(screen.getByText('Este convite não vale mais. Peça um novo link a quem convidou você.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Ver meu mês' }).getAttribute('href')).toBe('/inicio')
  rerender(<InviteScreen view={{ kind: 'has-family' }} />)
  expect(screen.getByRole('link', { name: 'Ver a família' }).getAttribute('href')).toBe('/familia')
})

test('pronto: enquanto envia, o botão fica desativado e um segundo toque não envia de novo', async () => {
  const { acceptInvite } = await import('./actions')
  const accept = vi.mocked(acceptInvite)
  accept.mockClear()
  let finish: () => void = () => {}
  accept.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }) as never)
  render(<InviteScreen view={{ kind: 'ready', code, familyName: 'Família Souza', invitedBy: null }} />)
  const button = screen.getByRole('button', { name: 'Entrar na família' }) as HTMLButtonElement
  expect(button.disabled).toBe(false)

  await act(async () => {
    fireEvent.click(button)
  })
  expect(accept).toHaveBeenCalledTimes(1)
  expect((accept.mock.calls[0][0] as FormData).get('code')).toBe(code)
  expect(button.disabled).toBe(true)

  await act(async () => {
    fireEvent.click(button)
  })
  expect(accept).toHaveBeenCalledTimes(1)

  await act(async () => {
    finish()
  })
  expect(button.disabled).toBe(false)
})
