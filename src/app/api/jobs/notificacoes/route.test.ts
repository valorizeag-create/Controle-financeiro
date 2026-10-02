import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  config: null as { secret: string } | null,
  deliver: vi.fn(async (_deps: Record<string, unknown>) => ({ claimed: 2, sent: 2, failed: 0, removed: 0, unconfirmed: 0 })),
  db: { rpc: vi.fn() },
  jobClient: vi.fn(),
  sessionClient: vi.fn(),
  cookies: vi.fn(),
  headers: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-env', () => ({ readJobConfig: () => h.config }))
vi.mock('@/lib/supabase/job', () => ({ createJobClient: h.jobClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: h.sessionClient, requireUser: h.sessionClient }))
vi.mock('next/headers', () => ({ cookies: h.cookies, headers: h.headers }))
vi.mock('@/lib/env', () => ({ env: { siteUrl: 'https://iris.app' } }))
vi.mock('@/features/notificacoes/deliver', () => ({ deliverBatch: h.deliver }))
vi.mock('@/features/notificacoes/push-sender', () => ({ getPushSender: () => null }))
vi.mock('@/features/notificacoes/mailer', () => ({ getMailer: () => null }))

const route = await import('./route')
const SECRET = 'S3gredo-da-tarefa_'.repeat(3)
const TOKEN = createHmac('sha256', SECRET).update('iris-job-trigger-v1').digest('base64url')
const call = (headers: Record<string, string> = {}) =>
  route.POST(new Request('https://iris.app/api/jobs/notificacoes', { method: 'POST', headers, body: '{}' }))

beforeEach(() => {
  h.config = { secret: SECRET }
  h.deliver.mockClear()
  h.jobClient.mockReset().mockReturnValue(h.db)
  h.sessionClient.mockClear()
  h.cookies.mockClear()
  h.headers.mockClear()
})

const nothingRan = () => {
  expect(h.deliver).not.toHaveBeenCalled()
  expect(h.jobClient).not.toHaveBeenCalled()
}

describe('POST /api/jobs/notificacoes', () => {
  test('sem o código de disparo: 401, e nada roda', async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    nothingRan()
  })

  test('código errado: a mesma resposta de quem não mandou nada', async () => {
    const missing = await call()
    const missingBody = await missing.text()
    expect(TOKEN.toLowerCase()).not.toBe(TOKEN)
    for (const value of ['x'.repeat(43), TOKEN.slice(0, 42), `${TOKEN}x`, TOKEN.toLowerCase(), '', `${TOKEN}, ${TOKEN}`]) {
      const res = await call({ 'x-iris-job-trigger': value })
      expect(res.status).toBe(401)
      expect(await res.text()).toBe(missingBody)
      expect([...res.headers.entries()].sort()).toEqual([...missing.headers.entries()].sort())
    }
    nothingRan()
  })

  test('o segredo em si não é o código de disparo: mandá-lo no cabeçalho não autoriza', async () => {
    expect((await call({ 'x-iris-job-trigger': SECRET })).status).toBe(401)
    expect((await call({ 'x-iris-job-secret': SECRET })).status).toBe(401)
    expect((await call({ authorization: `Bearer ${TOKEN}` })).status).toBe(401)
    nothingRan()
  })

  test('sessão não autoriza: cookie de quem entrou, sem o código, dá 401 — e a rota nem olha cookie ou sessão', async () => {
    const res = await call({ cookie: 'sb-access-token=qualquer; sb-refresh-token=qualquer', authorization: 'Bearer qualquer' })
    expect(res.status).toBe(401)
    nothingRan()
    await call({ 'x-iris-job-trigger': TOKEN, cookie: 'sb-access-token=qualquer' })
    expect(h.sessionClient).not.toHaveBeenCalled()
    expect(h.cookies).not.toHaveBeenCalled()
    expect(h.headers).not.toHaveBeenCalled()
  })

  test('tarefa desligada (sem JOB_SECRET no ambiente): 503 "não configurada", mesmo com cabeçalho, e nada roda', async () => {
    h.config = null
    for (const headers of [{}, { 'x-iris-job-trigger': TOKEN }] as Record<string, string>[]) {
      const res = await call(headers)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'not_configured' })
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    nothingRan()
  })

  test('código certo: entrega o lote com o segredo do ambiente e responde só números', async () => {
    const res = await call({ 'x-iris-job-trigger': TOKEN })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ claimed: 2, sent: 2, failed: 0, removed: 0, unconfirmed: 0 })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(h.jobClient).toHaveBeenCalledTimes(1)
    expect(h.deliver).toHaveBeenCalledTimes(1)
    expect(h.deliver).toHaveBeenCalledWith({ db: h.db, secret: SECRET, push: null, mailer: null, siteUrl: 'https://iris.app' })
  })

  test('o endereço dos links vem da configuração, nunca dos cabeçalhos da requisição', async () => {
    await call({ 'x-iris-job-trigger': TOKEN, host: 'evil.dev', 'x-forwarded-host': 'evil.dev', origin: 'https://evil.dev' })
    expect(h.deliver.mock.calls[0][0].siteUrl).toBe('https://iris.app')
  })

  test('falha na entrega: 500 sem corpo e sem detalhes', async () => {
    h.deliver.mockRejectedValueOnce(new Error(`segredo interno ${SECRET}`))
    const res = await call({ 'x-iris-job-trigger': TOKEN })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  test('falha ao montar o cliente do banco: também 500 sem corpo', async () => {
    h.jobClient.mockImplementationOnce(() => { throw new Error('config') })
    const res = await call({ 'x-iris-job-trigger': TOKEN })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
  })

  test('nenhuma resposta devolve o código de disparo nem o segredo', async () => {
    h.deliver.mockRejectedValueOnce(new Error(SECRET))
    const responses = [
      await call(), await call({ 'x-iris-job-trigger': 'errado' }), await call({ 'x-iris-job-trigger': TOKEN }), await call({ 'x-iris-job-trigger': TOKEN }),
    ]
    for (const res of responses) {
      const all = `${await res.text()}\n${JSON.stringify([...res.headers.entries()])}`
      expect(all).not.toContain(TOKEN)
      expect(all).not.toContain(SECRET)
      expect(all).not.toContain('errado')
    }
  })

  test('só POST existe (para os outros métodos o Next responde 405 sem rodar nada); Node, sem cache', () => {
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic', 'runtime'])
    expect(route.dynamic).toBe('force-dynamic')
    expect(route.runtime).toBe('nodejs')
  })
})
