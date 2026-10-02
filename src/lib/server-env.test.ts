import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { readJobConfig, readMailConfig, readPushConfig } = await import('./server-env')

const PUB = `B${'A'.repeat(86)}`
const PRIV = 'A'.repeat(43)

describe('variáveis só do servidor: ausente ou malformado desliga o recurso, nunca derruba o app', () => {
  test('push', () => {
    expect(readPushConfig({})).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'contato' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'curta', VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: 'curta', VAPID_SUBJECT: 'mailto:a@b.dev' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev\nx' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev' }))
      .toEqual({ publicKey: PUB, privateKey: PRIV, subject: 'mailto:a@b.dev' })
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'https://iris.app/contato' }))
      .toEqual({ publicKey: PUB, privateKey: PRIV, subject: 'https://iris.app/contato' })
  })

  test('a chave privada do push nunca é lida de uma variável pública', () => {
    expect(readPushConfig({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, NEXT_PUBLIC_VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev',
    })).toBeNull()
  })

  test('e-mail', () => {
    expect(readMailConfig({})).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1' })).toBeNull() // falta o remetente
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', MAIL_FROM: 'Íris <oi@iris.dev>\nBcc: x@y.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', MAIL_FROM: 'sem arroba' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '99999', MAIL_FROM: 'oi@iris.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: 'abc', MAIL_FROM: 'oi@iris.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: 'smtp x.dev', MAIL_FROM: 'oi@iris.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_USER: 'u', MAIL_FROM: 'oi@iris.dev' })).toBeNull() // usuário sem senha
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PASS: 'p', MAIL_FROM: 'oi@iris.dev' })).toBeNull() // senha sem usuário
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '54325', MAIL_FROM: 'Íris <oi@iris.dev>' }))
      .toEqual({ host: '127.0.0.1', port: 54325, secure: false, user: null, pass: null, from: 'Íris <oi@iris.dev>' })
    expect(readMailConfig({ SMTP_HOST: 'smtp.x.dev', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'oi@iris.dev' }))
      .toEqual({ host: 'smtp.x.dev', port: 587, secure: true, user: 'u', pass: 'p', from: 'oi@iris.dev' })
  })

  test('variável vazia (linha sem valor no .env) é o mesmo que ausente', () => {
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '', SMTP_SECURE: '', SMTP_USER: '', SMTP_PASS: '', MAIL_FROM: 'oi@iris.dev' }))
      .toEqual({ host: '127.0.0.1', port: 587, secure: false, user: null, pass: null, from: 'oi@iris.dev' })
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: '' })).toBeNull()
  })

  test('tarefa: só o segredo, gerado (43 a 128 caracteres de base64url); a chave de serviço não entra', () => {
    const secret = 's'.repeat(43)
    expect(readJobConfig({})).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 'curto' })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 's'.repeat(42) })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 's'.repeat(129) })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: `${'s'.repeat(42)}=` })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: `${'s'.repeat(42)} ` })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: secret })).toEqual({ secret })
    expect(readJobConfig({ JOB_SECRET: 'A-_9'.repeat(32) })).toEqual({ secret: 'A-_9'.repeat(32) })
    // Outras variáveis do ambiente não mudam nem entram no resultado.
    expect(readJobConfig({ JOB_SECRET: secret, OUTRA_CHAVE: 'x'.repeat(40) })).toEqual({ secret })
  })

  test('sem argumento, lê o ambiente do processo', () => {
    vi.stubEnv('JOB_SECRET', 'j'.repeat(43))
    expect(readJobConfig()).toEqual({ secret: 'j'.repeat(43) })
    vi.unstubAllEnvs()
  })
})
