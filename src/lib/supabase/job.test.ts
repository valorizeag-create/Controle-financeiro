import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  env: { supabaseUrl: 'https://projeto.supabase.co', supabaseKey: 'sb_publishable_teste' },
  create: vi.fn((_url: string, _key: string, _options: unknown) => ({ rpc: vi.fn() })),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: h.env }))
vi.mock('@supabase/supabase-js', () => ({ createClient: h.create }))

const { createJobClient, isSafeJobUrl } = await import('./job')

beforeEach(() => { h.create.mockClear(); h.env.supabaseUrl = 'https://projeto.supabase.co' })

// O segredo da tarefa vai como parâmetro de cada chamada ao banco: nunca em texto aberto pela rede.
describe('para onde o segredo da tarefa pode ir', () => {
  test.each([
    'https://projeto.supabase.co', 'https://projeto.supabase.co/', 'https://db.iris.app:8443',
    'http://localhost:54321', 'http://127.0.0.1:54321', 'http://localhost', 'http://127.0.0.1/',
  ])('aceita https e a própria máquina (%s)', (url) => {
    expect(isSafeJobUrl(url)).toBe(true)
  })

  test.each([
    'http://projeto.supabase.co', 'http://db.iris.app:54321', 'http://192.168.0.10:54321', 'http://10.0.0.1',
    'http://host.docker.internal:54321', 'http://localhost.evil.dev', 'http://127.0.0.1.evil.dev', 'http://evil.dev/localhost',
    'http://localhost@evil.dev', 'http://evil.dev#@localhost', 'http://0.0.0.0:54321', 'http://[::1]:54321',
    'https://usuario:senha@projeto.supabase.co', 'ws://localhost:54321', 'ftp://localhost', '//localhost:54321',
    'localhost:54321', 'HTTP://PROJETO.SUPABASE.CO', '', ' ', 'nada',
  ])('recusa http fora da própria máquina e o que não é endereço (%s)', (url) => {
    expect(isSafeJobUrl(url)).toBe(false)
  })

  test('só aceita texto', () => {
    for (const bad of [null, undefined, 42, {}, ['https://projeto.supabase.co']]) {
      expect(isSafeJobUrl(bad as unknown as string)).toBe(false)
    }
  })
})

describe('createJobClient', () => {
  test('endereço seguro: cliente com a chave publicável, sem sessão guardada', () => {
    expect(createJobClient()).not.toBeNull()
    expect(h.create).toHaveBeenCalledWith('https://projeto.supabase.co', 'sb_publishable_teste', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  })

  test('banco local: também', () => {
    h.env.supabaseUrl = 'http://127.0.0.1:54321'
    expect(createJobClient()).not.toBeNull()
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  test('endereço em http fora da própria máquina: não cria cliente nenhum (o segredo não sai)', () => {
    h.env.supabaseUrl = 'http://projeto.supabase.co'
    expect(createJobClient()).toBeNull()
    expect(h.create).not.toHaveBeenCalled()
  })
})
