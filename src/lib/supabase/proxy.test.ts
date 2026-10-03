import { NextRequest } from 'next/server'
import { beforeEach, expect, test, vi } from 'vitest'

const getUser = vi.fn()
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'http://127.0.0.1:54321', supabaseKey: 'k'.repeat(30) } }))
const { updateSession } = await import('./proxy')

const CODE = 'a'.repeat(32)
const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const signIn = (on: boolean) => getUser.mockResolvedValue({ data: { user: on ? { id: 'u' } : null } })
// Devolve para onde o proxy mandou (caminho + busca) ou null quando a requisição segue.
async function run(path: string): Promise<string | null> {
  const res = await updateSession(new NextRequest(`http://localhost:3000${path}`))
  const to = res.headers.get('location')
  return to ? new URL(to).pathname + new URL(to).search : null
}

beforeEach(() => getUser.mockReset())

test('quem entrou e abre "/" vai para o Seu mês; a landing não lê nada além disso', async () => {
  signIn(true)
  expect(await run('/')).toBe('/inicio')
  expect(await run('/entrar')).toBe('/inicio')
})

test('quem não entrou vê a landing, robots e sitemap sem redirecionamento', async () => {
  signIn(false)
  for (const path of ['/', '/robots.txt', '/sitemap.xml']) expect(await run(path), path).toBeNull()
})

test('quem entrou segue para as telas do app, do onboarding, do convite e das notificações sem desvio', async () => {
  signIn(true)
  const returns = [`/convite/${CODE}`, `/contas?mes=2026-05&pagar=${UUID}`, `/familia/contas?pagar=${UUID}`, '/boas-vindas', '/boas-vindas/instalar', '/inicio', '/termos', '/privacidade', '/confirmar-email', '/cadastro-excluido', '/auth/callback']
  for (const path of returns) expect(await run(path), path).toBeNull()
})

test('quem não entrou: páginas públicas passam; o resto leva a /entrar guardando só os retornos permitidos', async () => {
  signIn(false)
  for (const path of ['/termos', '/privacidade', '/confirmar-email', '/cadastro-excluido', '/auth/callback', `/convite/${CODE}`, '/entrar', '/criar-cadastro']) {
    expect(await run(path), path).toBeNull()
  }
  expect(await run('/inicio')).toBe('/entrar')
  expect(await run('/boas-vindas')).toBe('/entrar')
  expect(await run(`/contas?mes=2026-05&pagar=${UUID}`)).toBe(`/entrar?next=${encodeURIComponent(`/contas?mes=2026-05&pagar=${UUID}`)}`)
})
