import { describe, expect, test } from 'vitest'
import { COMEBACK_DAYS, DAILY_REMINDER_HOUR, GOAL_NEAR_TENTHS, NOTIFICATION_KINDS, PREF_DEFAULTS, PREF_KINDS, PREF_LABELS, PREF_ORDER, REMINDER_HOUR, isAllowedTarget, isPrefKind, prefOf, resolvePrefs } from './notifications'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

describe('preferências', () => {
  test('tudo ligado por padrão, menos o lembrete para anotar (RF-47)', () => {
    expect(PREF_DEFAULTS).toEqual({ bills: true, income: true, budget: true, goal: true, summary: true, daily: false, comeback: true, family: true })
  })
  test('cada tipo de aviso tem uma chave de preferência, e cada chave tem rótulo e posição', () => {
    for (const k of NOTIFICATION_KINDS) expect(PREF_KINDS).toContain(prefOf(k))
    expect(prefOf('bill_tomorrow')).toBe('bills')
    expect(prefOf('bill_today')).toBe('bills')
    expect([...PREF_ORDER].sort()).toEqual([...PREF_KINDS].sort())
    for (const k of PREF_KINDS) expect(PREF_LABELS[k].length).toBeGreaterThan(0)
    expect(PREF_LABELS.bills).toBe('Contas perto do vencimento')
    expect(PREF_LABELS.daily).toBe('Lembrete para anotar')
  })
  test('resolvePrefs: linha gravada vence o padrão; tipo desconhecido é ignorado', () => {
    expect(resolvePrefs([])).toEqual(PREF_DEFAULTS)
    expect(resolvePrefs([{ kind: 'daily', enabled: true }, { kind: 'bills', enabled: false }, { kind: 'x', enabled: false }]))
      .toEqual({ ...PREF_DEFAULTS, daily: true, bills: false })
  })
  test('isPrefKind', () => {
    expect(isPrefKind('goal')).toBe(true)
    expect(isPrefKind('bill_today')).toBe(false)
    expect(isPrefKind(null)).toBe(false)
  })
  test('constantes: lembrete de contas às 9h, de anotar às 21h', () => {
    expect([COMEBACK_DAYS, GOAL_NEAR_TENTHS, REMINDER_HOUR, DAILY_REMINDER_HOUR]).toEqual([5, 1, 9, 21])
  })
})

describe('isAllowedTarget: só caminhos internos de uma lista fixa', () => {
  test.each([
    '/inicio', '/anotar', '/planejamento', '/familia', '/relatorios?periodo=mes-passado',
    '/contas?mes=2026-10', `/contas?mes=2026-10&pagar=${ID}`, `/familia/contas?pagar=${ID}`, `/metas/${ID}`,
  ])('aceita %s', (p) => expect(isAllowedTarget(p)).toBe(true))
  test.each([
    '', '/', '//evil.com', 'https://evil.com', '/\\evil.com', '/inicio?next=//evil.com', '/contas?pagar=abc',
    '/contas?mes=2026-13&pagar=' + ID, '/metas/abc', '/metas/' + ID + '/usar', '/configuracoes', '/entrar', '/inicio\n', ' /inicio',
    '/inicio\\', '\\\\evil.com', '/%2F/evil.com', '/%2e%2e/entrar', '/inicio%0a', '/inicio\r\nX: y', '/inicio\0', '/inicio\t',
    '/INICIO', '/inicio/', '/inicio#x', '/inicio?', `/metas/${ID.toUpperCase()}`, 'javascript:alert(1)', '/\\/evil.com',
    `/contas?mes=2026-10&pagar=${ID}&x=1`, `/contas?pagar=${ID}&mes=2026-10`, '/inicio' + 'a'.repeat(300),
  ])('recusa %j', (p) => expect(isAllowedTarget(p)).toBe(false))
  test('entrada que não é texto é recusada', () => {
    expect(isAllowedTarget(undefined as unknown as string)).toBe(false)
    expect(isAllowedTarget(null as unknown as string)).toBe(false)
  })
})
