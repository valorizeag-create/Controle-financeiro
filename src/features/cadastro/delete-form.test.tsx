// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as Record<string, unknown>, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ deleteAccount: async () => ({ status: 'idle' }) }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sair da Íris</button> }))

const { DeleteForm } = await import('./delete-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
})

const ALL = 'Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito.'
const FAMILY = 'Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome.'

test('sem histórico de família: o texto da copy, o link para baixar antes, o campo e os dois botões', () => {
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByText(ALL)).toBeTruthy()
  expect(screen.queryByText(FAMILY)).toBeNull()
  expect(screen.queryByText(/também sairá delas/)).toBeNull()
  expect(screen.queryByText(/A administração da família/)).toBeNull()
  expect(screen.getByRole('link', { name: 'Baixar meus dados antes' }).getAttribute('href')).toBe('/configuracoes/dados')
  const field = screen.getByLabelText('Digite EXCLUIR para confirmar.') as HTMLInputElement
  expect(field.name).toBe('confirm')
  expect(field.getAttribute('autocomplete')).toBe('off')
  expect(screen.getByRole('button', { name: 'Excluir meu cadastro' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Manter meu cadastro' }).getAttribute('href')).toBe('/configuracoes')
})

test('com gastos na família: o texto aprovado do RF-53, a parte nas metas com o valor e o aviso da administração', () => {
  render(<DeleteForm notice="family-history" shareCents={3000} passesAdmin />)
  expect(screen.getByText(FAMILY)).toBeTruthy()
  expect(screen.getByText('Isso não pode ser desfeito.')).toBeTruthy()
  expect(screen.queryByText(ALL)).toBeNull()
  const share = screen.getByText(/também sairá delas/)
  expect(share.textContent!.replace(/ /g, ' ')).toBe('Sua parte nas metas da família (R$ 30,00) também sairá delas.')
  expect(screen.getByText('A administração da família passa para quem participa há mais tempo.')).toBeTruthy()
})

test('palavra errada: o campo mostra o erro; enquanto envia, o botão fica desativado (dois toques não enviam duas vezes)', () => {
  h.state = { status: 'error', submission: 1, fieldErrors: { confirm: 'Digite EXCLUIR para confirmar.' } }
  h.pending = true
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  expect((screen.getByRole('button', { name: 'Excluir meu cadastro' }) as HTMLButtonElement).disabled).toBe(true)
})

test('entrada antiga na hora de enviar: o aviso e "Sair da Íris"', () => {
  h.state = { status: 'error', submission: 2, message: 'Por segurança, saia e entre de novo antes de excluir o cadastro.', code: 'reauth' }
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByRole('alert').textContent).toBe('Por segurança, saia e entre de novo antes de excluir o cadastro.')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})
