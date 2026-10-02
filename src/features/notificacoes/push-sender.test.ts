import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { webPushSender, getPushSender } = await import('./push-sender')

const config = { publicKey: `B${'A'.repeat(86)}`, privateKey: 'A'.repeat(43), subject: 'mailto:oi@iris.dev' }
const target = { id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
const message = { body: 'Luz vence amanhã. Quer marcar como paga?', url: '/contas?mes=2026-10', tag: 'bill-1', pay: true }
const OPTIONS = {
  vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
  TTL: 43200, urgency: 'normal', timeout: 4000,
}

let logs: { mock: { calls: unknown[][] } }[] = []
beforeEach(() => { logs = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('webPushSender', () => {
  test('envia o aviso cifrado com as chaves VAPID, validade de 12 horas e tempo máximo de espera', async () => {
    const lib = { sendNotification: vi.fn(async () => ({ statusCode: 201 })) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('sent')
    expect(lib.sendNotification).toHaveBeenCalledTimes(1)
    expect(lib.sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      OPTIONS,
    )
  })

  test.each([404, 410])('resposta %i: a inscrição não vale mais', async (statusCode) => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode }) }) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('gone')
  })

  test('outra falha: tentar de novo depois, sem insistir agora', async () => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode: 500 }) }) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('failed')
    expect(lib.sendNotification).toHaveBeenCalledTimes(1)
    const busy = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode: 429 }) }) }
    expect(await webPushSender(config, busy).send(target, message)).toBe('failed')
    expect(busy.sendNotification).toHaveBeenCalledTimes(1)
    const net = { sendNotification: vi.fn(async () => { throw new Error('ECONNRESET') }) }
    expect(await webPushSender(config, net).send(target, message)).toBe('failed')
    const sync = { sendNotification: vi.fn(() => { throw new Error('chave inválida') }) }
    expect(await webPushSender(config, sync).send(target, message)).toBe('failed')
  })

  test.each([
    'https://169.254.169.254/x', 'http://fcm.googleapis.com/fcm/send/abc', 'https://localhost:54321/rest/v1/',
    'https://fcm.googleapis.com.evil.dev/x', 'https://user:pass@fcm.googleapis.com/x',
  ])('endereço fora da lista (%s) nunca é chamado e é tratado como inscrição que não vale mais', async (endpoint) => {
    const lib = { sendNotification: vi.fn() }
    expect(await webPushSender(config, lib).send({ ...target, endpoint }, message)).toBe('gone')
    expect(lib.sendNotification).not.toHaveBeenCalled()
  })

  test('o conteúdo leva só os quatro campos do aviso', async () => {
    const lib = { sendNotification: vi.fn(async (_sub: unknown, _payload: string, _options: unknown) => ({})) }
    const extra = { ...message, email: 'ana@teste.iris.dev', user: 'u1' }
    await webPushSender(config, lib).send(target, extra)
    expect(JSON.parse(lib.sendNotification.mock.calls[0][1])).toEqual(message)
  })

  test('destino fora da lista fixa: nada é enviado', async () => {
    const lib = { sendNotification: vi.fn() }
    for (const url of ['https://evil.dev/', '//evil.dev', '/entrar', '/contas?mes=2026-10&x=1', 'javascript:alert(1)']) {
      expect(await webPushSender(config, lib).send(target, { ...message, url })).toBe('failed')
    }
    expect(lib.sendNotification).not.toHaveBeenCalled()
  })

  test('texto longo é cortado antes de sair', async () => {
    const lib = { sendNotification: vi.fn(async (_sub: unknown, _payload: string, _options: unknown) => ({})) }
    await webPushSender(config, lib).send(target, { ...message, body: 'a'.repeat(5000), tag: 't'.repeat(500) })
    const sent = JSON.parse(lib.sendNotification.mock.calls[0][1])
    expect(sent.body).toBe(`${'a'.repeat(239)}…`)
    expect(sent.tag).toBe('t'.repeat(100))
  })

  test('nada vai para o log: nem endereço, nem chaves, nem texto', async () => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error(target.endpoint), { statusCode: 500, endpoint: target.endpoint }) }) }
    await webPushSender(config, lib).send(target, message)
    expect(logs.flatMap((l) => l.mock.calls)).toEqual([])
  })
})

describe('getPushSender', () => {
  test('sem as chaves no ambiente: desligado, sem erro', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    expect(getPushSender()).toBeNull()
  })
  test('com as chaves: devolve quem envia', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', config.publicKey)
    vi.stubEnv('VAPID_PRIVATE_KEY', config.privateKey)
    vi.stubEnv('VAPID_SUBJECT', config.subject)
    expect(typeof getPushSender()?.send).toBe('function')
  })
})
