import { describe, expect, test } from 'vitest'
import {
  CATCH_UP_MONTHS, daysInMonth, daysUntil, dueDateIn, dueText, monthName, nextDueOnOrAfter, occursIn,
  recurrenceLabel, relativeDue, type RecurrenceRule,
} from './recurrence'

const monthly = (dueDay: number): RecurrenceRule => ({ frequency: 'monthly', dueDay, dueMonth: null })
const yearly = (dueDay: number, dueMonth: number): RecurrenceRule => ({ frequency: 'yearly', dueDay, dueMonth })

describe('dia de vencimento ajustado ao mês (Review Focus 2)', () => {
  test('tamanho dos meses, com ano bissexto', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
  })

  test('dia 31 vira o último dia de meses mais curtos', () => {
    expect(dueDateIn('2027-02', 31)).toBe('2027-02-28')
    expect(dueDateIn('2028-02', 31)).toBe('2028-02-29')
    expect(dueDateIn('2026-04', 31)).toBe('2026-04-30')
    expect(dueDateIn('2026-10', 31)).toBe('2026-10-31')
    expect(dueDateIn('2026-10', 5)).toBe('2026-10-05')
  })

  test('29 de fevereiro anual cai em 28 em ano não bissexto', () => {
    expect(nextDueOnOrAfter(yearly(29, 2), '2026-09-30')).toBe('2027-02-28')
    expect(nextDueOnOrAfter(yearly(29, 2), '2027-03-01')).toBe('2028-02-29')
  })
})

describe('próximo vencimento a partir de hoje', () => {
  test('mensal: hoje conta; dia que já passou vai para o mês seguinte', () => {
    expect(nextDueOnOrAfter(monthly(30), '2026-09-30')).toBe('2026-09-30')
    expect(nextDueOnOrAfter(monthly(25), '2026-09-30')).toBe('2026-10-25')
    expect(nextDueOnOrAfter(monthly(31), '2026-09-30')).toBe('2026-09-30')
    expect(nextDueOnOrAfter(monthly(10), '2026-12-15')).toBe('2027-01-10')
  })

  test('anual: este ano se ainda não passou, senão o ano que vem', () => {
    expect(nextDueOnOrAfter(yearly(10, 1), '2026-09-30')).toBe('2027-01-10')
    expect(nextDueOnOrAfter(yearly(15, 10), '2026-09-30')).toBe('2026-10-15')
  })

  test('anual só acontece no mês dele', () => {
    expect(occursIn(yearly(10, 1), '2027-01')).toBe(true)
    expect(occursIn(yearly(10, 1), '2026-09')).toBe(false)
    expect(occursIn(monthly(10), '2026-09')).toBe(true)
  })

  test('recupera no máximo 3 meses de quem ficou sem abrir', () => {
    expect(CATCH_UP_MONTHS).toBe(3)
  })
})

describe('textos de prazo, sempre calmos', () => {
  test('dias até o vencimento', () => {
    expect(daysUntil('2026-09-30', '2026-10-03')).toBe(3)
    expect(daysUntil('2026-09-30', '2026-09-28')).toBe(-2)
  })

  test('relativeDue e dueText', () => {
    expect(relativeDue('2026-09-30', '2026-09-30')).toBe('hoje')
    expect(relativeDue('2026-10-01', '2026-09-30')).toBe('amanhã')
    expect(relativeDue('2026-10-03', '2026-09-30')).toBe('em 3 dias')
    expect(dueText('2026-09-30', '2026-09-30')).toBe('vence hoje')
    expect(dueText('2026-10-01', '2026-09-30')).toBe('vence amanhã')
    expect(dueText('2026-10-08', '2026-09-30')).toBe('vence em 8 dias')
    expect(dueText('2026-09-10', '2026-09-30')).toBe('venceu em 10 de setembro')
    expect(dueText('2026-09-10', '2026-09-30')).not.toMatch(/atrasad/i)
  })

  test('rótulos das recorrências (protótipo)', () => {
    expect(monthName(1)).toBe('janeiro')
    expect(recurrenceLabel(monthly(25))).toBe('Todo mês · dia 25')
    expect(recurrenceLabel(yearly(10, 1))).toBe('Todo ano · janeiro')
  })
})
