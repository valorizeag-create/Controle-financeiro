import { describe, expect, test } from 'vitest'
import { importLineSchema, importSchema } from './schemas'

const KEY = 'a'.repeat(64)
const CAT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

const line = (over: Record<string, unknown> = {}) => ({
  importKey: KEY,
  kind: 'expense',
  amountCents: 1250,
  occurredOn: '2026-09-10',
  categoryId: CAT,
  source: null,
  note: 'Padaria',
  billId: null,
  merchantKey: 'padaria',
  ...over,
})

describe('importLineSchema', () => {
  test('aceita uma linha completa', () => {
    expect(importLineSchema.safeParse(line()).success).toBe(true)
  })

  test('recusa valor zero, acima do limite e não inteiro', () => {
    for (const amountCents of [0, 10_000_000_000, 1.5, -1]) {
      expect(importLineSchema.safeParse(line({ amountCents })).success).toBe(false)
    }
    expect(importLineSchema.safeParse(line({ amountCents: 9_999_999_999 })).success).toBe(true)
  })

  test('recusa chave fora do formato', () => {
    for (const importKey of ['abc', 'g'.repeat(64), 'A'.repeat(64), 'a'.repeat(65)]) {
      expect(importLineSchema.safeParse(line({ importKey })).success).toBe(false)
    }
  })

  test('gasto sem categoria e sem conta a pagar é recusado; com conta a pagar passa', () => {
    expect(importLineSchema.safeParse(line({ categoryId: null })).success).toBe(false)
    expect(importLineSchema.safeParse(line({ categoryId: null, billId: CAT })).success).toBe(true)
  })

  test('entrada não exige categoria', () => {
    expect(importLineSchema.safeParse(line({ kind: 'income', categoryId: null, source: 'Salário' })).success).toBe(true)
  })

  test('limites de texto e data', () => {
    expect(importLineSchema.safeParse(line({ note: 'x'.repeat(141) })).success).toBe(false)
    expect(importLineSchema.safeParse(line({ source: 'x'.repeat(41) })).success).toBe(false)
    expect(importLineSchema.safeParse(line({ merchantKey: 'x'.repeat(61) })).success).toBe(false)
    expect(importLineSchema.safeParse(line({ occurredOn: '2026-02-31' })).success).toBe(false)
    expect(importLineSchema.safeParse(line({ billId: 'nao-e-uuid' })).success).toBe(false)
  })
})

describe('importSchema', () => {
  test('recusa lista vazia e mais de 1.000 linhas', () => {
    expect(importSchema.safeParse({ cardId: null, lines: [] }).success).toBe(false)
    expect(importSchema.safeParse({ cardId: null, lines: Array.from({ length: 1001 }, () => line()) }).success).toBe(false)
    expect(importSchema.safeParse({ cardId: null, lines: Array.from({ length: 1000 }, () => line()) }).success).toBe(true)
  })

  test('cardId precisa ser uuid ou null', () => {
    expect(importSchema.safeParse({ cardId: 'x', lines: [line()] }).success).toBe(false)
    expect(importSchema.safeParse({ cardId: CAT, lines: [line()] }).success).toBe(true)
  })
})
