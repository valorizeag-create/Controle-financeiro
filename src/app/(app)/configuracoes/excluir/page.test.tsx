import { beforeEach, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'

const h = vi.hoisted(() => ({ ctx: { notice: 'everything', shareCents: 0, passesAdmin: false, sessionRecent: true } }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/cadastro/queries', () => ({ loadDeletionContext: async () => h.ctx }))
vi.mock('@/features/cadastro/delete-form', () => ({ DeleteForm: () => null }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => null }))

const { default: Page } = await import('./page')

beforeEach(() => {
  h.ctx = { notice: 'everything', shareCents: 0, passesAdmin: false, sessionRecent: true }
})

const names = (tree: unknown) => JSON.stringify(tree, (_, v) => (typeof v === 'function' ? v.name : v))

test('entrada recente: mostra o formulário de exclusão', async () => {
  const out = names(await Page())
  expect(out).toContain('DeleteForm')
  expect(out).not.toContain('SignOutButton')
})

test('entrada antiga: só o aviso e "Sair da Íris", sem formulário', async () => {
  h.ctx.sessionRecent = false
  const tree = (await Page()) as ReactElement
  const out = names(tree)
  expect(out).not.toContain('DeleteForm')
  expect(out).toContain('SignOutButton')
  expect(out).toContain('Por segurança, saia e entre de novo antes de excluir o cadastro.')
})
