import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { isAllowedPushEndpoint } from './endpoint'

describe('isAllowedPushEndpoint: o servidor só chama serviços de push conhecidos', () => {
  test.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://db5p.notify.windows.com/w/?token=abc',
  ])('aceita %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(true))

  test.each([
    'http://fcm.googleapis.com/fcm/send/abc', 'https://localhost/x', 'https://169.254.169.254/latest/meta-data',
    'https://127.0.0.1:54321/rest/v1/', 'https://fcm.googleapis.com.evil.dev/x', 'https://evil.dev/fcm.googleapis.com',
    'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://notify.windows.com.evil.dev/',
    'https://evil.dev/?x=.push.apple.com/', 'https://evil.dev#@fcm.googleapis.com/x', 'https://fcm.googleapis.com@evil.dev/x',
    'https://[::1]/x', 'https://push.apple.com/x', 'https://xfcm.googleapis.com/x', 'https://fcm.googleapis.com',
    'https://fcm.googleapis.com/a b', 'https://fcm.googleapis.com/a\nb', 'https://FCM.googleapis.com/x',
    'https://fcm.googleapis.com\\@evil.dev/x', 'https://fcm.googleapis.com./x',
    'javascript:alert(1)', 'file:///etc/passwd', '', 'não é endereço', `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
  ])('recusa %j', (u) => expect(isAllowedPushEndpoint(u)).toBe(false))

  test('recusa o que não é texto', () => {
    expect(isAllowedPushEndpoint(null)).toBe(false)
    expect(isAllowedPushEndpoint(undefined)).toBe(false)
    expect(isAllowedPushEndpoint({})).toBe(false)
    expect(isAllowedPushEndpoint(['https://fcm.googleapis.com/x'])).toBe(false)
  })

  test('é a mesma lista do banco (a tabela e save_push_subscription)', () => {
    const sql = readFileSync('supabase/migrations/20261002000001_notificacoes.sql', 'utf8')
    const rule = String.raw`'^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/[^[:space:]]*$'`
    expect(sql.split(rule).length - 1).toBe(2)
  })
})
