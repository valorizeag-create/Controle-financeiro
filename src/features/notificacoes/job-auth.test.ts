import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { secretMatches, triggerToken, TRIGGER_HEADER } = await import('./job-auth')

describe('secretMatches', () => {
  const secret = 's'.repeat(40)
  test('igual', () => expect(secretMatches(secret, secret)).toBe(true))
  test.each([null, '', 'x', 's'.repeat(39), 's'.repeat(41), `${'s'.repeat(39)}S`, ` ${secret}`, `${secret}\n`])('recusa %j sem lançar', (given) => {
    expect(secretMatches(given, secret)).toBe(false)
  })
  test('valor enorme também é só recusado', () => expect(secretMatches('x'.repeat(100_000), secret)).toBe(false))
  test('o que não é texto é recusado', () => {
    expect(secretMatches(undefined as unknown as string, secret)).toBe(false)
    expect(secretMatches(['s'.repeat(40)] as unknown as string, secret)).toBe(false)
  })
  test('segredo esperado vazio nunca casa', () => expect(secretMatches('', '')).toBe(false))
})

describe('triggerToken: o código de disparo que o agendador manda no cabeçalho', () => {
  const secret = 's'.repeat(43)
  test('HMAC-SHA256(JOB_SECRET, "iris-job-trigger-v1") em base64url — o mesmo cálculo do banco e do README', () => {
    expect(triggerToken(secret)).toBe('oDFlHtZPh0l6BNv3SeKUFW4BpSwJQCYmpNqFkS2vBw4')
    expect(triggerToken(secret)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  test('não é o segredo, e muda com ele', () => {
    expect(triggerToken(secret)).not.toBe(secret)
    expect(triggerToken(`${'s'.repeat(42)}t`)).not.toBe(triggerToken(secret))
  })
  test('cabeçalho', () => expect(TRIGGER_HEADER).toBe('x-iris-job-trigger'))
})
