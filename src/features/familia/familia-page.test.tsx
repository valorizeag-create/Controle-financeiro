// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FamiliaPageView } from './view-model'

vi.mock('./actions', () => ({
  createFamily: vi.fn(), createInvite: vi.fn(), inviteByEmail: vi.fn(), resendInvite: vi.fn(), revokeInvite: vi.fn(), leaveFamily: vi.fn(), removeMember: vi.fn(), transferAdmin: vi.fn(),
}))

const { FamiliaPage } = await import('./familia-page')

afterEach(() => cleanup())

type Member = Extract<FamiliaPageView, { kind: 'member' }>
const view = (p: Partial<Member> = {}): FamiliaPageView => ({
  kind: 'member', name: 'Família Souza', isAdmin: true,
  members: [
    { userId: 'u1', label: 'Você', initial: 'C', caption: 'Administra a família', isMe: true, isAdmin: true },
    { userId: 'u2', label: 'Alex', initial: 'A', caption: 'Membro desde agosto', isMe: false, isAdmin: false },
  ],
  invite: { id: 'i1', caption: 'Convite pendente · vale até 4 de outubro', email: null },
  canInvite: true, events: ['Jordan saiu da família.'], leave: 'admin-with-others', ...p,
})
const asMember = () => view({ isAdmin: false, invite: null, canInvite: false, leave: 'member' })

test('sem família: criar com o campo e o botão', () => {
  render(<FamiliaPage view={{ kind: 'none' }} />)
  expect(screen.getByLabelText('Nome da família')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Criar família' })).toBeTruthy()
  expect(screen.getByText('Recebeu um convite? Abra o link que chegou para você.')).toBeTruthy()
})

test('membro: sem convidar nem remover, sem convite', () => {
  render(<FamiliaPage view={asMember()} />)
  expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remover Alex da família' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Tornar Alex administrador' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Cancelar convite' })).toBeNull()
})

test('administrador: ações, convite pendente, nenhuma ação sobre si mesmo; alvos de 44px', () => {
  const { container } = render(<FamiliaPage view={view()} />)
  for (const name of ['Convidar pessoa', 'Tornar Alex administrador', 'Remover Alex da família', 'Cancelar convite']) {
    expect(screen.getByRole('button', { name })).toBeTruthy()
  }
  expect(screen.queryByRole('button', { name: /Você/ })).toBeNull()
  expect(screen.getByText('Convite pendente · vale até 4 de outubro')).toBeTruthy()
  expect(screen.getByText('Jordan saiu da família.')).toBeTruthy()
  for (const el of container.querySelectorAll('button')) {
    expect(/min-h-(11|12|14)|size-11/.test(el.className), el.textContent ?? '').toBe(true)
  }
})

test('administrador vê o e-mail convidado, "Reenviar" e "Cancelar convite"; membro não vê nada disso', () => {
  const { container } = render(<FamiliaPage view={view({ invite: { id: 'i1', caption: 'Convite enviado · aguardando', email: 'jordan@email.com' } })} />)
  expect(screen.getByText('jordan@email.com')).toBeTruthy()
  expect(screen.getByText('Convite enviado · aguardando')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reenviar' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeTruthy()
  expect(screen.getByLabelText('E-mail de quem vai participar')).toBeTruthy()
  for (const el of container.querySelectorAll('button')) {
    expect(/min-h-(11|12|14)|size-11/.test(el.className), el.textContent ?? '').toBe(true)
  }
  cleanup()
  render(<FamiliaPage view={asMember()} />)
  expect(screen.queryByText('jordan@email.com')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull()
  expect(screen.queryByLabelText('E-mail de quem vai participar')).toBeNull()
})

test('convite por link: sem e-mail e sem "Reenviar"', () => {
  render(<FamiliaPage view={view()} />)
  expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeTruthy()
})

test('administrador com outros: sem botão de sair, com o texto de antes de sair', () => {
  render(<FamiliaPage view={view()} />)
  expect(screen.queryByRole('button', { name: 'Sair da família' })).toBeNull()
  expect(screen.getByText('Antes de sair, escolha quem vai administrar a família: toque em Tornar administrador ao lado da pessoa.')).toBeTruthy()
})

test('membro: Sair da família abre a confirmação com Ficar', () => {
  render(<FamiliaPage view={asMember()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da família' }))
  expect(screen.getByRole('alertdialog', { name: 'Sair da família?' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Ficar' })).toBeTruthy()
})

test('remover manda só o identificador, nunca o nome', () => {
  render(<FamiliaPage view={view()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remover Alex da família' }))
  const form = screen.getByRole('alertdialog').querySelector('form') as HTMLFormElement
  expect([...new FormData(form).keys()]).toEqual(['userId'])
  expect(new FormData(form).get('userId')).toBe('u2')
})

test('erros da URL: admin e 1 aparecem; valor desconhecido é ignorado', () => {
  const { rerender } = render(<FamiliaPage view={view()} erro="admin" />)
  expect(screen.getByRole('alert').textContent).toBe('Antes de sair, escolha quem vai administrar a família.')
  rerender(<FamiliaPage view={view()} erro="1" />)
  expect(screen.getByRole('alert').textContent).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  rerender(<FamiliaPage view={view()} erro="xyz" />)
  expect(screen.queryByRole('alert')).toBeNull()
})

test('desktop: participantes e convite à esquerda; avisos, "O que a família vê" e sair à direita, depois no DOM', () => {
  render(<FamiliaPage view={view()} />)
  const col = (name: string) => screen.getByRole('heading', { name }).closest('[data-column]')?.getAttribute('data-column')
  expect(['Quem participa', 'Convidar pessoa'].map(col)).toEqual(['main', 'main'])
  expect(['Avisos da família', 'O que a família vê'].map(col)).toEqual(['aside', 'aside'])
  const [main, aside] = [...document.querySelectorAll('[data-column]')]
  expect(main.getAttribute('data-column')).toBe('main')
  expect(aside.getAttribute('data-column')).toBe('aside')
  expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.querySelectorAll('main')).toHaveLength(1)
})

test('sem família: uma coluna', () => {
  const { container } = render(<FamiliaPage view={{ kind: 'none' }} />)
  expect(container.querySelector('[data-columns]')).toBeNull()
})
