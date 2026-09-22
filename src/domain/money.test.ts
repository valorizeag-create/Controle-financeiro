import { describe, expect, test } from 'vitest'
import { formatBRL, MAX_CENTS, parseBRL } from './money'

describe('parseBRL', () => {
  test.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['12,5', 1250],
    ['12,', 1200],
    [',50', 50],
    ['0,99', 99],
    ['R$ 10', 1000],
    ['R$\u00a01.000,00', 100000],
    ['  142,30 ', 14230],
    ['1.5', 150],
    ['1.23', 123],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['5000', 500000],
    ['0', 0],
    ['99.999.999,99', MAX_CENTS],
  ])('%s → %i', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  test.each([
    '', 'abc', '-10', '10,999', '1,234,5', '1.23.4', '12a', '100.000.000,00', '1..2',
    ',', 'R$ ,', '.',
    '1 2', '1\t0', '1 234,56',
  ])('rejeita %s', (input) => {
    expect(parseBRL(input)).toBeNull()
  })
})

describe('formatBRL', () => {
  test('formata com R$ e espaço não separável', () => {
    expect(formatBRL(123456)).toBe('R$\u00a01.234,56')
    expect(formatBRL(0)).toBe('R$\u00a00,00')
  })
  test('negativo usa sinal de menos tipográfico', () => {
    expect(formatBRL(-14230)).toBe('\u2212R$\u00a0142,30')
  })
})
