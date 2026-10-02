import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'

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
    requireUser: vi.fn(async () => ({ id: 'u1', email: 'camila@teste.iris.dev' })),
    loadExportData: vi.fn(async () => ({ marker: 'data' })),
    parts: ['﻿"Cadastro"\r\n', '"Registros"\r\n'] as (string | Error)[],
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ requireUser: h.requireUser, createClient: async () => ({}) }))
vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => { if (e instanceof h.RedirectSignal) throw e } }))
vi.mock('@/features/dados/export-queries', () => ({
  loadExportData: h.loadExportData,
  exportTransactionPages: () => 'tx-pages',
  exportMovementPages: () => 'move-pages',
}))
vi.mock('@/features/dados/export-csv', () => ({
  exportFileName: (d: string) => `iris-meus-dados-${d}.csv`,
  exportCsv: async function* (data: unknown, tx: unknown, moves: unknown) {
    expect([data, tx, moves]).toEqual([{ marker: 'data' }, 'tx-pages', 'move-pages'])
    for (const p of h.parts) {
      if (p instanceof Error) throw p
      yield p
    }
  },
}))

const route = await import('./route')
const get = (headers: Record<string, string> = {}) => route.GET(new Request('http://localhost:3000/configuracoes/dados/exportar', { headers }))

beforeEach(() => {
  h.requireUser.mockClear()
  h.loadExportData.mockClear()
  h.loadExportData.mockImplementation(async () => ({ marker: 'data' }))
  h.requireUser.mockImplementation(async () => ({ id: 'u1', email: 'camila@teste.iris.dev' }))
  h.parts = ['﻿"Cadastro"\r\n', '"Registros"\r\n']
})

test('só GET; nunca guardado; arquivo com nome sem dado pessoal', async () => {
  expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic', 'runtime'])
  expect(route.dynamic).toBe('force-dynamic')
  expect(route.runtime).toBe('nodejs')
  const res = await get({ 'sec-fetch-site': 'same-origin' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('no-store, max-age=0')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('x-robots-tag')).toBe('noindex')
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="iris-meus-dados-\d{4}-\d{2}-\d{2}\.csv"$/)
  expect(res.headers.get('content-disposition')).not.toMatch(/camila|u1/i)
  const bytes = new Uint8Array(await res.arrayBuffer())
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  expect(new TextDecoder().decode(bytes)).toBe('"Cadastro"\r\n"Registros"\r\n')
})

test('sem sessão nada é lido: requireUser decide antes de qualquer leitura', async () => {
  h.requireUser.mockImplementation(async () => {
    throw new h.RedirectSignal('/entrar')
  })
  await expect(get()).rejects.toMatchObject({ url: '/entrar' })
  expect(h.loadExportData).not.toHaveBeenCalled()
})

test('pedido de outro site volta para a tela, sem ler nada; digitar o endereço e seguir um link da própria Íris baixam', async () => {
  for (const site of ['cross-site', 'same-site']) {
    const res = await get({ 'sec-fetch-site': site })
    expect(res.status, site).toBe(303)
    expect(res.headers.get('location')).toBe('/configuracoes/dados')
    expect(res.headers.get('cache-control')).toBe('no-store, max-age=0')
  }
  expect(h.loadExportData).not.toHaveBeenCalled()
  expect((await get({ 'sec-fetch-site': 'none' })).status).toBe(200)
  expect((await get()).status).toBe(200)
})

test('falha antes de começar volta para a tela com o aviso; falha no meio interrompe o envio sem dizer o motivo', async () => {
  h.loadExportData.mockImplementation(async () => {
    throw new Error('caiu')
  })
  const before = await get()
  expect(before.status).toBe(303)
  expect(before.headers.get('location')).toBe('/configuracoes/dados?erro=1')

  h.loadExportData.mockImplementation(async () => ({ marker: 'data' }))
  h.parts = ['﻿"Cadastro"\r\n', new Error('caiu no meio')]
  const res = await get()
  expect(res.status).toBe(200)
  const failure = await res.text().then(() => null, (e: unknown) => e)
  expect(failure).toBeTruthy()
  expect(String((failure as Error).message)).not.toMatch(/meio/)
})

test('o service worker não guarda nada do app, e a tela usa um link simples (sem pré-carregamento)', () => {
  const sw = readFileSync('public/sw.js', 'utf8')
  expect(sw).not.toMatch(/cache\.put\(|configuracoes/)
  expect(sw).toMatch(/const PRECACHE = \[OFFLINE_URL, '\/icons\/icon-192\.png'\]/)
  const page = readFileSync('src/app/(app)/configuracoes/dados/page.tsx', 'utf8')
  expect(page).toMatch(/<a\s[^>]*href="\/configuracoes\/dados\/exportar"/)
  expect(page).not.toMatch(/from 'next\/link'|<Button[^>]*href/)
})
