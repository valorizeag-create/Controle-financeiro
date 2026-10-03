import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { authEmailTestIsLocal, inviteTestIsLocal, isLocalHost, isLocalUrl, jobTestIsLocal } from '../../../tests/e2e/local-only'

// Os testes de ponta a ponta da tarefa e do convite por e-mail entregam avisos e enviam e-mail.
// Esta guarda decide se eles podem rodar: só com tudo na própria máquina.
const LOCAL_DB = 'http://127.0.0.1:54321'
const HOSTED_DB = 'https://projeto.supabase.co'

describe('guarda "só local" dos testes de ponta a ponta', () => {
  test('o que é local', () => {
    for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://localhost', 'http://127.0.0.1/', 'https://localhost:8443']) {
      expect(isLocalUrl(url), url).toBe(true)
    }
    for (const url of [
      HOSTED_DB, 'http://projeto.supabase.co', 'http://192.168.0.10:54321', 'http://host.docker.internal:54321',
      'http://localhost.evil.dev', 'http://127.0.0.1.evil.dev', 'http://localhost@evil.dev', 'http://evil.dev/localhost',
      'http://evil.dev#@localhost', 'http://0.0.0.0:54321', 'localhost:54321', '', ' ', undefined,
    ]) {
      expect(isLocalUrl(url), String(url)).toBe(false)
    }
    expect(isLocalHost('127.0.0.1')).toBe(true)
    expect(isLocalHost('localhost')).toBe(true)
    for (const host of ['smtp.resend.com', 'localhost.evil.dev', '127.0.0.1.evil.dev', 'LOCALHOST ', '', undefined]) {
      expect(isLocalHost(host), String(host)).toBe(false)
    }
  })

  test('tarefa: banco local, e e-mail desligado ou local', () => {
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB })).toBe(true)
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: '' })).toBe(true)
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: '127.0.0.1' })).toBe(true)
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: 'smtp.resend.com' })).toBe(false)
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB })).toBe(false)
    expect(jobTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB, SMTP_HOST: '127.0.0.1' })).toBe(false)
    expect(jobTestIsLocal({})).toBe(false)
  })

  test('convite por e-mail: banco local e servidor de e-mail local', () => {
    expect(inviteTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: '127.0.0.1' })).toBe(true)
    expect(inviteTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: 'localhost' })).toBe(true)
    expect(inviteTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB })).toBe(false)
    expect(inviteTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB, SMTP_HOST: 'smtp.resend.com' })).toBe(false)
    expect(inviteTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB, SMTP_HOST: '127.0.0.1' })).toBe(false)
    expect(inviteTestIsLocal({})).toBe(false)
  })

  test('troca de e-mail: só com o banco local', () => {
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB })).toBe(true)
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB })).toBe(false)
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB, SMTP_HOST: '127.0.0.1' })).toBe(false)
    expect(authEmailTestIsLocal({})).toBe(false)
  })

  test('os dois testes que entregam ou enviam usam a guarda antes de criar qualquer coisa', () => {
    const spec = readFileSync('tests/e2e/plano8.spec.ts', 'utf8').replace(/\r\n/g, '\n')
    const body = (title: string) => {
      const start = spec.indexOf(`test('${title}`)
      expect(start, title).toBeGreaterThan(-1)
      const next = spec.indexOf('\ntest(', start + 1)
      return spec.slice(start, next === -1 ? undefined : next)
    }
    const job = body('desktop: com o código de disparo, a tarefa pega o lote')
    expect(job).toContain('test.skip(!jobTestIsLocal(), LOCAL_ONLY)')
    expect(job.indexOf('test.skip(!jobTestIsLocal(), LOCAL_ONLY)')).toBeLessThan(job.indexOf('makeUser('))
    const invite = body('desktop: convite por e-mail')
    expect(invite).toContain('test.skip(!inviteTestIsLocal(), LOCAL_ONLY)')
    expect(invite.indexOf('test.skip(!inviteTestIsLocal(), LOCAL_ONLY)')).toBeLessThan(invite.indexOf('makeUser('))
  })
})
