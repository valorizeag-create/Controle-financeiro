import { describe, expect, test } from 'vitest'
import {
  addDays, addMonths, dayLabel, isInMonth, isValidISODate, monthLabel, monthOf, parseMonthKey, todayInSaoPaulo,
} from './dates'

describe('todayInSaoPaulo', () => {
  test('23h30 de 30/09 em Brasília ainda é 30/09', () => {
    expect(todayInSaoPaulo(new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-30')
  })
  test('00h10 de 01/10 em Brasília já é 01/10', () => {
    expect(todayInSaoPaulo(new Date('2026-10-01T03:10:00Z'))).toBe('2026-10-01')
  })
})

describe('aritmética de datas', () => {
  test('addDays atravessa mês e ano', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  test('addMonths atravessa ano', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
  test('monthOf e isInMonth', () => {
    expect(monthOf('2026-09-22')).toBe('2026-09')
    expect(isInMonth('2026-09-30', '2026-09')).toBe(true)
    expect(isInMonth('2026-10-01', '2026-09')).toBe(false)
  })
})

describe('validação', () => {
  test('parseMonthKey', () => {
    expect(parseMonthKey('2026-09')).toBe('2026-09')
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('abc')).toBeNull()
    expect(parseMonthKey(undefined)).toBeNull()
    expect(parseMonthKey('1999-12')).toBeNull()
    expect(parseMonthKey('2100-01')).toBeNull()
  })
  test('isValidISODate recusa dia inexistente', () => {
    expect(isValidISODate('2026-02-28')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-9-1')).toBe(false)
  })
})

describe('rótulos', () => {
  test('monthLabel', () => {
    expect(monthLabel('2026-09')).toBe('setembro de 2026')
  })
  test('dayLabel', () => {
    expect(dayLabel('2026-09-22', '2026-09-22')).toBe('Hoje')
    expect(dayLabel('2026-09-21', '2026-09-22')).toBe('Ontem')
    expect(dayLabel('2026-09-19', '2026-09-22')).toBe('19 de setembro')
  })
})
