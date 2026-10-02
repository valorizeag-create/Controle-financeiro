import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), revalidatePath: vi.fn() }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const KEYS = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
let upserts: { table: string; row: unknown; options: unknown }[] = []
let rpcCalls: { fn: string; args: unknown }[] = []
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
let upsertError: unknown = null

beforeEach(() => {
  upserts = []
  rpcCalls = []
  rpcResult = { data: null, error: null }
  upsertError = null
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
  h.supabase = {
    from: (table: string) => ({
      upsert: async (row: unknown, options: unknown) => {
        upserts.push({ table, row, options })
        return { error: upsertError }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
  }
})

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const redirected = async (p: Promise<unknown>): Promise<string | null> => {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  return null
}

describe('setNotificationPref', () => {
  test('grava a chave da própria pessoa (o id vem da sessão, nunca do formulário)', async () => {
    const f = form({ kind: 'daily', enabled: 'true', user_id: 'outra-pessoa' })
    expect(await redirected(actions.setNotificationPref(f))).toBe('/configuracoes')
    expect(upserts).toEqual([{ table: 'notification_prefs', row: { user_id: 'u1', kind: 'daily', enabled: true }, options: { onConflict: 'user_id,kind' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/configuracoes')
  })
  test('desligar', async () => {
    await redirected(actions.setNotificationPref(form({ kind: 'bills', enabled: 'false' })))
    expect(upserts[0].row).toEqual({ user_id: 'u1', kind: 'bills', enabled: false })
  })
  test.each([{ kind: 'tudo', enabled: 'true' }, { kind: 'bill_today', enabled: 'true' }, { kind: 'daily', enabled: 'sim' }, {}])('entrada que não serve (%j): nada é gravado', async (o) => {
    expect(await redirected(actions.setNotificationPref(form(o as Record<string, string>)))).toBe('/configuracoes')
    expect(upserts).toEqual([])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
  test('erro do banco: volta com o aviso de erro, sem "Alterações salvas."', async () => {
    upsertError = { message: 'x' }
    expect(await redirected(actions.setNotificationPref(form({ kind: 'daily', enabled: 'true' })))).toBe('/configuracoes?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('inscrição deste aparelho', () => {
  test('savePushSubscription grava pelo banco, com endereço e chaves conferidos', async () => {
    expect(await actions.savePushSubscription({ endpoint: ENDPOINT, keys: KEYS, expirationTime: null })).toEqual({ ok: true })
    expect(rpcCalls).toEqual([{ fn: 'save_push_subscription', args: { p_endpoint: ENDPOINT, p_p256dh: KEYS.p256dh, p_auth: KEYS.auth } }])
  })
  test.each([
    { endpoint: 'https://169.254.169.254/latest', keys: KEYS },
    { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys: KEYS },
    { endpoint: ENDPOINT, keys: { p256dh: 'curta', auth: KEYS.auth } },
    { endpoint: ENDPOINT },
    null,
    'texto',
  ])('savePushSubscription recusa endereço fora da lista e chaves malformadas (%j)', async (input) => {
    expect(await actions.savePushSubscription(input)).toEqual({ ok: false })
    expect(rpcCalls).toEqual([])
  })
  test('erro do banco ao salvar', async () => {
    rpcResult = { data: null, error: { message: 'x' } }
    expect(await actions.savePushSubscription({ endpoint: ENDPOINT, keys: KEYS })).toEqual({ ok: false })
  })
  test('syncPushSubscription: responde se a inscrição do navegador é de quem está usando', async () => {
    rpcResult = { data: true, error: null }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: true })
    expect(rpcCalls).toEqual([{ fn: 'sync_push_subscription', args: { p_endpoint: ENDPOINT } }])
    rpcResult = { data: false, error: null }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: false })
    rpcResult = { data: null, error: { message: 'x' } }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: false })
    rpcCalls = []
    expect(await actions.syncPushSubscription(12)).toEqual({ mine: false })
    expect(await actions.syncPushSubscription('x'.repeat(3000))).toEqual({ mine: false })
    expect(rpcCalls).toEqual([])
  })
  test('removePushSubscription apaga pelo banco (que só apaga a da própria pessoa)', async () => {
    await actions.removePushSubscription(ENDPOINT)
    expect(rpcCalls).toEqual([{ fn: 'delete_push_subscription', args: { p_endpoint: ENDPOINT } }])
    rpcCalls = []
    await actions.removePushSubscription(null)
    expect(rpcCalls).toEqual([])
  })
})

test('o módulo "use server" exporta só funções async', () => {
  for (const [name, value] of Object.entries(actions)) {
    expect(typeof value, name).toBe('function')
    expect((value as { constructor: { name: string } }).constructor.name, name).toBe('AsyncFunction')
  }
})
