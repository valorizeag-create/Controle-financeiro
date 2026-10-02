// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(async (_i: unknown) => ({ ok: true })),
  sync: vi.fn(async (_e: unknown) => ({ mine: true })),
  remove: vi.fn(async (_e: unknown) => {}),
}))
vi.mock('./actions', () => ({ savePushSubscription: h.save, syncPushSubscription: h.sync, removePushSubscription: h.remove }))

const { deviceState, disablePush, enablePush } = await import('./push-client')

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const subscription = () => ({
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
})
type Sub = ReturnType<typeof subscription>

function browser(opts: { permission?: string; current?: Sub | null; created?: Sub; subscribeFails?: boolean; ua?: string; standalone?: boolean; push?: boolean }) {
  const manager = {
    getSubscription: vi.fn(async () => opts.current ?? null),
    subscribe: vi.fn(async (_o: unknown) => {
      if (opts.subscribeFails) throw new Error('x')
      return opts.created ?? subscription()
    }),
  }
  const define = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { configurable: true, value })
  define(window.navigator, 'userAgent', opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130')
  define(window, 'matchMedia', (q: string) => ({ matches: q.includes('standalone') && opts.standalone === true }))
  if (opts.push === false) {
    Reflect.deleteProperty(window, 'PushManager')
    Reflect.deleteProperty(window, 'Notification')
    Reflect.deleteProperty(window.navigator, 'serviceWorker')
  } else {
    define(window, 'PushManager', function PushManager() {})
    define(window, 'Notification', { permission: opts.permission ?? 'default', requestPermission: vi.fn(async () => opts.permission ?? 'granted') })
    define(window.navigator, 'serviceWorker', { ready: Promise.resolve({ pushManager: manager }) })
  }
  return manager
}

beforeEach(() => { h.save.mockClear(); h.sync.mockClear(); h.remove.mockClear(); h.save.mockResolvedValue({ ok: true }); h.sync.mockResolvedValue({ mine: true }) })
afterEach(() => { vi.restoreAllMocks() })

describe('deviceState', () => {
  test('navegador sem push', async () => {
    browser({ push: false })
    expect(await deviceState()).toBe('unsupported')
  })
  test('iPhone fora da tela de início: primeiro adicionar', async () => {
    browser({ push: false, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' })
    expect(await deviceState()).toBe('needs-install')
  })
  test('permissão negada', async () => {
    browser({ permission: 'denied' })
    expect(await deviceState()).toBe('blocked')
  })
  test('sem inscrição: desligado', async () => {
    browser({ permission: 'granted', current: null })
    expect(await deviceState()).toBe('off')
    expect(h.sync).not.toHaveBeenCalled()
  })
  test('com inscrição que é desta pessoa: ligado', async () => {
    browser({ permission: 'granted', current: subscription() })
    expect(await deviceState()).toBe('on')
    expect(h.sync).toHaveBeenCalledWith(ENDPOINT)
  })
  test('com inscrição de outra pessoa: cancela no navegador e fica desligado', async () => {
    const current = subscription()
    browser({ permission: 'granted', current })
    h.sync.mockResolvedValue({ mine: false })
    expect(await deviceState()).toBe('off')
    expect(current.unsubscribe).toHaveBeenCalled()
  })
})

describe('enablePush / disablePush', () => {
  const KEY = `B${'A'.repeat(86)}`
  test('pede a permissão, inscreve com a chave pública e grava no servidor', async () => {
    const manager = browser({ permission: 'granted' })
    expect(await enablePush(KEY)).toBe('on')
    expect(manager.subscribe.mock.calls[0][0]).toMatchObject({ userVisibleOnly: true })
    expect(h.save).toHaveBeenCalledWith({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } })
  })
  test('permissão recusada: não inscreve', async () => {
    const manager = browser({ permission: 'denied' })
    expect(await enablePush(KEY)).toBe('blocked')
    expect(manager.subscribe).not.toHaveBeenCalled()
  })
  test('servidor recusou: desfaz a inscrição no navegador', async () => {
    const created = subscription()
    browser({ permission: 'granted', created })
    h.save.mockResolvedValue({ ok: false })
    expect(await enablePush(KEY)).toBe('failed')
    expect(created.unsubscribe).toHaveBeenCalled()
  })
  test('navegador não conseguiu inscrever', async () => {
    browser({ permission: 'granted', subscribeFails: true })
    expect(await enablePush(KEY)).toBe('failed')
    expect(h.save).not.toHaveBeenCalled()
  })
  test('desativar: apaga no servidor e cancela no navegador; sem inscrição não faz nada', async () => {
    const current = subscription()
    browser({ permission: 'granted', current })
    await disablePush()
    expect(h.remove).toHaveBeenCalledWith(ENDPOINT)
    expect(current.unsubscribe).toHaveBeenCalled()
    h.remove.mockClear()
    browser({ permission: 'granted', current: null })
    await disablePush()
    expect(h.remove).not.toHaveBeenCalled()
  })
})

describe('service worker ausente ou ainda ativando', () => {
  const sw = (value: unknown) => {
    browser({ permission: 'granted' })
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value })
  }
  afterEach(() => { vi.useRealTimers() })

  test('sem registro: "unsupported" na hora, sem esperar', async () => {
    sw({ ready: new Promise(() => {}), getRegistration: async () => undefined })
    expect(await deviceState()).toBe('unsupported')
  })
  test('registrado mas ainda ativando: depois de 3 s fica "checking" (nunca "unsupported")', async () => {
    vi.useFakeTimers()
    sw({ ready: new Promise(() => {}), getRegistration: async () => ({}) })
    const result = deviceState()
    await vi.advanceTimersByTimeAsync(3100)
    expect(await result).toBe('checking')
  })
  test('desativar com service worker que nunca fica pronto termina em ~3 s sem apagar nada', async () => {
    vi.useFakeTimers()
    sw({ ready: new Promise(() => {}), getRegistration: async () => ({}) })
    const done = disablePush()
    await vi.advanceTimersByTimeAsync(3100)
    await done
    expect(h.remove).not.toHaveBeenCalled()
  })
  test('permissão fechada sem decidir: "dismissed", não "failed"', async () => {
    browser({ permission: 'default' })
    expect(await enablePush(`B${'A'.repeat(86)}`)).toBe('dismissed')
  })
})
