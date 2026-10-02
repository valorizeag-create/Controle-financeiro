import { beforeEach, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}
vi.mock('server-only', () => ({}))
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/features/cadastro/forget-device', () => ({ ForgetDevice: () => null }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url)
  },
}))

const { default: Page, metadata } = await import('./page')

beforeEach(() => getUser.mockReset())

function texts(n: unknown, out: string[] = []): string[] {
  if (typeof n === 'string') out.push(n)
  else if (Array.isArray(n)) n.forEach((c) => texts(c, out))
  else if (n && typeof n === 'object') texts((n as ReactElement<{ children?: unknown }>).props?.children, out)
  return out
}

test('sem sessão: mostra a mensagem e limpa o aparelho; a página não é indexada', async () => {
  getUser.mockResolvedValue({ data: { user: null } })
  const tree = (await Page()) as ReactElement
  expect(texts(tree)).toEqual(['Seu cadastro foi excluído.', 'Obrigado por ter usado a Íris.'])
  expect(JSON.stringify(tree, (_, v) => (typeof v === 'function' ? v.name : v))).toContain('ForgetDevice')
  expect(metadata).toEqual({ robots: { index: false } })
})

test('com sessão (cadastro existe): volta ao início, sem a mensagem nem a limpeza', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  await expect(Page()).rejects.toMatchObject({ url: '/inicio' })
})
