import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return {
    RedirectSignal,
    oauth: vi.fn(async (_a: unknown) => ({ data: { url: 'https://accounts.google.test/auth' }, error: null as unknown })),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: { siteUrl: 'https://iris.app' } }))
vi.mock('@/lib/flash', () => ({ setFlash: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
      signInWithOAuth: h.oauth,
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const CODE = 'a'.repeat(32)
const idle = { status: 'idle' } as const

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  throw new Error('esperava um redirecionamento')
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => h.oauth.mockClear())

describe('volta ao convite depois de entrar', () => {
  const creds = { email: 'ana@teste.iris.dev', password: 'senha-forte-123' }

  test('entrar: volta ao convite; qualquer outra coisa vai para o Início', async () => {
    expect(await redirectOf(actions.signIn(idle, form({ ...creds, next: `/convite/${CODE}` })))).toBe(`/convite/${CODE}`)
    expect(await redirectOf(actions.signIn(idle, form({ ...creds, next: '//evil.com' })))).toBe('/inicio')
    expect(await redirectOf(actions.signIn(idle, form({ ...creds, next: '/extrato' })))).toBe('/inicio')
    expect(await redirectOf(actions.signIn(idle, form({ ...creds, next: '/convite/abc' })))).toBe('/inicio')
    expect(await redirectOf(actions.signIn(idle, form(creds)))).toBe('/inicio')
  })

  test('criar cadastro: volta ao convite; senão Boas-vindas', async () => {
    const sign = { ...creds, displayName: 'Ana' }
    expect(await redirectOf(actions.signUp(idle, form({ ...sign, next: `/convite/${CODE}` })))).toBe(`/convite/${CODE}`)
    expect(await redirectOf(actions.signUp(idle, form({ ...sign, next: '/extrato' })))).toBe('/boas-vindas')
    expect(await redirectOf(actions.signUp(idle, form({ ...sign, next: 'https://evil.com' })))).toBe('/boas-vindas')
    expect(await redirectOf(actions.signUp(idle, form(sign)))).toBe('/boas-vindas')
  })

  test('Google: leva o convite para o retorno do login; formato estranho é ignorado', async () => {
    await redirectOf(actions.signInWithGoogle(form({ next: `/convite/${CODE}` })))
    expect(h.oauth.mock.calls[0][0]).toMatchObject({ options: { redirectTo: `https://iris.app/auth/callback?next=%2Fconvite%2F${CODE}` } })
    await redirectOf(actions.signInWithGoogle(form({ next: '//evil.com' })))
    expect(h.oauth.mock.calls[1][0]).toMatchObject({ options: { redirectTo: 'https://iris.app/auth/callback' } })
    await redirectOf(actions.signInWithGoogle())
    expect(h.oauth.mock.calls[2][0]).toMatchObject({ options: { redirectTo: 'https://iris.app/auth/callback' } })
  })
})
