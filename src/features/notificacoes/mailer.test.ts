import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { getMailer, memoryMailer, smtpMailer } = await import('./mailer')

const config = { host: '127.0.0.1', port: 54325, secure: false, user: null, pass: null, from: 'Íris <oi@iris.dev>' }
const mail = { to: 'ana@teste.iris.dev', subject: 'Assunto', text: 'Texto', html: '<p>Texto</p>' }
const LIMITS = { connectionTimeout: 4000, greetingTimeout: 4000, socketTimeout: 5000, disableFileAccess: true, disableUrlAccess: true }

afterEach(() => vi.unstubAllEnvs())

describe('mailer', () => {
  test('SMTP local (caixa de e-mail do Supabase): usa a configuração e envia texto e HTML', async () => {
    const sendMail = vi.fn(async () => ({}))
    const createTransport = vi.fn(() => ({ sendMail }))
    await smtpMailer(config, createTransport).send(mail)
    expect(createTransport).toHaveBeenCalledWith({ host: '127.0.0.1', port: 54325, secure: false, requireTLS: false, auth: undefined, ...LIMITS })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledWith({ from: config.from, ...mail })
  })

  test('SMTP com usuário e senha', async () => {
    const createTransport = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))
    await smtpMailer({ ...config, user: 'u', pass: 'p' }, createTransport).send(mail)
    expect(createTransport).toHaveBeenCalledWith({
      host: '127.0.0.1', port: 54325, secure: false, requireTLS: false, auth: { user: 'u', pass: 'p' }, ...LIMITS,
    })
  })

  test('fora da máquina local a conexão é sempre cifrada', async () => {
    const createTransport = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))
    await smtpMailer({ ...config, host: 'smtp.x.dev', port: 587, user: 'u', pass: 'p' }, createTransport).send(mail)
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: false, requireTLS: true }))
    await smtpMailer({ ...config, host: 'smtp.x.dev', port: 465, secure: true }, createTransport).send(mail)
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true, requireTLS: false }))
    await smtpMailer({ ...config, host: 'localhost' }, createTransport).send(mail)
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: false, requireTLS: false }))
  })

  test('um destinatário por mensagem: sem cópia, sem cópia oculta, sem campos a mais', async () => {
    const sendMail = vi.fn(async (_m: Record<string, unknown>) => ({}))
    const extra = { ...mail, cc: 'x@y.dev', bcc: 'z@y.dev', attachments: [{ path: '/etc/passwd' }], headers: { 'X-A': 'b' } }
    await smtpMailer(config, () => ({ sendMail })).send(extra)
    expect(Object.keys(sendMail.mock.calls[0][0]).sort()).toEqual(['from', 'html', 'subject', 'text', 'to'])
  })

  test('destinatário ou assunto com quebra de linha, ou mais de um endereço, é recusado antes de enviar', async () => {
    const sendMail = vi.fn(async () => ({}))
    const createTransport = vi.fn(() => ({ sendMail }))
    const mailer = smtpMailer(config, createTransport)
    await expect(mailer.send({ ...mail, to: 'a@b.dev\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, to: 'a@b.dev\r\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, subject: 'Oi\r\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, subject: 'Oi\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, subject: '' })).rejects.toThrow()
    for (const to of ['a@b.dev, x@y.dev', 'a@b.dev;x@y.dev', 'a@b.dev x@y.dev', 'Ana <a@b.dev>', 'a@b.dev@c.dev', 'sem-arroba', '', `${'a'.repeat(250)}@b.dev`]) {
      await expect(mailer.send({ ...mail, to })).rejects.toThrow()
    }
    await expect(mailer.send({ ...mail, to: ['a@b.dev', 'x@y.dev'] as unknown as string })).rejects.toThrow()
    expect(createTransport).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  test('o erro de quem recusa não carrega o endereço', async () => {
    const mailer = smtpMailer(config, () => ({ sendMail: vi.fn(async () => ({})) }))
    await expect(mailer.send({ ...mail, to: 'vitima@teste.iris.dev, x@y.dev' })).rejects.toThrow(/^mail$/)
  })

  test('falha do servidor de e-mail chega a quem chamou (que decide tentar depois)', async () => {
    const mailer = smtpMailer(config, () => ({ sendMail: vi.fn(async () => { throw new Error('smtp') }) }))
    await expect(mailer.send(mail)).rejects.toThrow()
  })

  test('memória (testes): guarda o que foi enviado', async () => {
    const m = memoryMailer()
    await m.send(mail)
    expect(m.sent).toEqual([mail])
  })
})

describe('getMailer', () => {
  test('sem servidor de e-mail no ambiente: desligado, sem erro', () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('MAIL_FROM', '')
    expect(getMailer()).toBeNull()
  })
  test('com servidor e remetente: devolve quem envia', () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    vi.stubEnv('SMTP_PORT', '54325')
    vi.stubEnv('SMTP_SECURE', '')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', '')
    vi.stubEnv('MAIL_FROM', 'Íris <oi@iris.dev>')
    expect(typeof getMailer()?.send).toBe('function')
  })
})
