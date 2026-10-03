import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

test('o endereço do site perde a barra do fim (evita "//convite" e "//sitemap.xml")', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'x'.repeat(30))
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://iris.exemplo//')
  const { env } = await import('./env')
  expect(env.siteUrl).toBe('https://iris.exemplo')
})
