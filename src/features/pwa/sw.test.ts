import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, test, vi } from 'vitest'
import { isAllowedTarget } from '@/domain/notifications'

const source = readFileSync('public/sw.js', 'utf8')
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

type Handler = (event: Record<string, unknown>) => void

function load() {
  const handlers: Record<string, Handler> = {}
  const cache = { addAll: vi.fn(async (_urls: string[]) => {}), put: vi.fn(), add: vi.fn() }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['iris-estatico-v0', 'outro', 'iris-estatico-v1']),
    delete: vi.fn(async (_key: string) => true),
    match: vi.fn(async (u: string) => `em-cache:${u}`),
  }
  const self = {
    addEventListener: (type: string, h: Handler) => { handlers[type] = h },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), openWindow: vi.fn(async (_url: string) => null) },
    registration: { showNotification: vi.fn(async (_title: string, _options: Record<string, unknown>) => {}) },
    location: { origin: 'https://iris.app' },
  }
  const fetch = vi.fn<(request: unknown) => Promise<unknown>>()
  vm.runInNewContext(source, { self, caches, fetch, URL })
  const run = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: unknown[] = []
    let response: unknown
    handlers[type]({ ...event, waitUntil: (p: unknown) => waits.push(p), respondWith: (p: unknown) => { response = p } })
    await Promise.all(waits)
    return response
  }
  return { handlers, cache, caches, self, fetch, run }
}

const pushEvent = (data: unknown) => ({ data: { json: () => { if (data === 'quebrado') throw new Error('json'); return data } } })
const click = (url: unknown, action = '') => ({ action, notification: { close: vi.fn(), data: { url } } })

describe('service worker: nada do app fica guardado', () => {
  test('instalar guarda só a página "Sem conexão" e um ícone', async () => {
    const sw = load()
    await sw.run('install')
    expect(sw.caches.open).toHaveBeenCalledWith('iris-estatico-v1')
    expect(sw.cache.addAll).toHaveBeenCalledWith(['/sem-conexao.html', '/icons/icon-192.png'])
    expect(sw.self.skipWaiting).toHaveBeenCalled()
  })
  test('ativar apaga caches antigos e assume as abas abertas', async () => {
    const sw = load()
    await sw.run('activate')
    expect(sw.caches.delete.mock.calls.map((c) => c[0])).toEqual(['iris-estatico-v0', 'outro'])
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })
  test('o que não é navegação não é tocado (dados, ações, arquivos do Next)', async () => {
    const sw = load()
    for (const mode of ['cors', 'same-origin', 'no-cors']) {
      expect(await sw.run('fetch', { request: { mode, url: 'https://iris.app/inicio' } })).toBeUndefined()
    }
    expect(sw.fetch).not.toHaveBeenCalled()
  })
  test('navegação com rede: a resposta vem da rede e não é guardada', async () => {
    const sw = load()
    sw.fetch.mockResolvedValueOnce('da-rede')
    expect(await sw.run('fetch', { request: { mode: 'navigate', url: 'https://iris.app/extrato' } })).toBe('da-rede')
    expect(sw.cache.put).not.toHaveBeenCalled()
    expect(sw.cache.add).not.toHaveBeenCalled()
    expect(sw.caches.match).not.toHaveBeenCalled()
  })
  test('navegação sem rede: a página "Sem conexão"', async () => {
    const sw = load()
    sw.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await sw.run('fetch', { request: { mode: 'navigate', url: 'https://iris.app/extrato' } })).toBe('em-cache:/sem-conexao.html')
  })
  test('depois de sair da conta nada pessoal fica guardado: só a instalação escreve no cache e, com rede, nada é lido', async () => {
    const sw = load()
    await sw.run('install')
    sw.fetch.mockResolvedValue('da-rede')
    for (const url of ['/inicio', '/extrato', '/contas?mes=2026-10', '/sair', '/_next/data/x.json', '/api/qualquer']) {
      await sw.run('fetch', { request: { mode: 'navigate', url: `https://iris.app${url}` } })
      await sw.run('fetch', { request: { mode: 'cors', url: `https://iris.app${url}` } })
    }
    await sw.run('fetch', { request: { mode: 'cors', url: 'https://projeto.supabase.co/rest/v1/transactions' } })
    expect(sw.cache.put).not.toHaveBeenCalled()
    expect(sw.cache.add).not.toHaveBeenCalled()
    expect(sw.cache.addAll).toHaveBeenCalledTimes(1)
    expect(sw.caches.match).not.toHaveBeenCalled()
  })
  test('o arquivo não guarda respostas nem cita rotas do app', () => {
    expect(source).not.toMatch(/cache\.put|\.add\(|_next|\/api\//)
  })
})

describe('service worker: aviso', () => {
  test('mostra o aviso com o título "Íris", o texto recebido e o destino', async () => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true }))
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Íris', {
      body: 'Hoje é o dia de Luz.', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'pt-BR', tag: `bill-${ID}`,
      data: { url: `/contas?mes=2026-10&pagar=${ID}` },
      actions: [{ action: 'pay', title: 'Marcar como paga' }, { action: 'later', title: 'Agora não' }],
    })
  })
  test('aviso sem pagamento não tem botões', async () => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Seu mês continua aqui. Quer atualizar?', url: '/inicio', tag: 'comeback', pay: false }))
    expect(sw.self.registration.showNotification.mock.calls[0][1].actions).toEqual([])
  })
  test.each(['quebrado', null, {}, { body: '' }, { body: 12 }, { body: 'x'.repeat(301) }])('conteúdo que não serve (%j): não mostra nada e não lança', async (data) => {
    const sw = load()
    await sw.run('push', pushEvent(data))
    expect(sw.self.registration.showNotification).not.toHaveBeenCalled()
  })
  test.each([
    '//evil.dev', 'https://evil.dev/inicio', '/\\evil.dev', 'javascript:alert(1)', '/configuracoes', '/entrar', '/inicio\n/x', 12, undefined,
  ])('destino que não é do app (%j) vira /inicio já ao receber', async (url) => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Oi', url, tag: 't', pay: false }))
    expect(sw.self.registration.showNotification.mock.calls[0][1].data).toEqual({ url: '/inicio' })
  })
  test('tocar no aviso (ou em "Marcar como paga") abre o destino; "Agora não" só fecha', async () => {
    const sw = load()
    const body = click(`/contas?mes=2026-10&pagar=${ID}`)
    await sw.run('notificationclick', body)
    expect(body.notification.close).toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith(`/contas?mes=2026-10&pagar=${ID}`)
    await sw.run('notificationclick', click(`/familia/contas?pagar=${ID}`, 'pay'))
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith(`/familia/contas?pagar=${ID}`)
    const later = click('/inicio', 'later')
    await sw.run('notificationclick', later)
    expect(later.notification.close).toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenCalledTimes(2)
  })
  test('destino adulterado no aviso guardado também vira /inicio ao tocar', async () => {
    const sw = load()
    await sw.run('notificationclick', click('https://evil.dev'))
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith('/inicio')
  })
  test('a lista de destinos do service worker decide igual a isAllowedTarget (src/domain)', async () => {
    const sw = load()
    const amostras = [
      '/inicio', '/anotar', '/planejamento', '/familia', '/relatorios?periodo=mes-passado',
      '/contas?mes=2026-10', `/contas?mes=2026-10&pagar=${ID}`, `/familia/contas?pagar=${ID}`, `/metas/${ID}`,
      '', '/', '//evil.com', 'https://evil.com', '/\\evil.com', '/inicio?next=//evil.com', '/contas?pagar=abc',
      `/contas?mes=2026-13&pagar=${ID}`, '/metas/abc', `/metas/${ID}/usar`, '/configuracoes', '/entrar', '/inicio\n', ' /inicio',
      '/%2F/evil.com', '/%2e%2e/entrar', '/inicio%0a', '/inicio\u0000', '/inicio\t', '/INICIO', '/inicio/', '/inicio#x', '/inicio?',
      `/metas/${ID.toUpperCase()}`, 'javascript:alert(1)', `/contas?mes=2026-10&pagar=${ID}&x=1`, `/contas?pagar=${ID}&mes=2026-10`,
      '/inicio' + 'a'.repeat(300),
    ]
    for (const url of amostras) {
      sw.self.clients.openWindow.mockClear()
      await sw.run('notificationclick', click(url))
      expect(sw.self.clients.openWindow, JSON.stringify(url)).toHaveBeenLastCalledWith(isAllowedTarget(url) ? url : '/inicio')
    }
  })
})
