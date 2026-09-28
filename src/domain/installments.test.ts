import { describe, expect, test } from 'vitest'
import {
  MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentBadge, isFutureInstallment, remainingInstallments, splitInstallments,
} from './installments'
import { summarizeMonth, type LedgerTx } from './summary'

describe('dividir a compra em parcelas (RN-07)', () => {
  test('uma por mês, a 1ª no mês da compra, no mesmo dia', () => {
    expect(splitInstallments(30000, 3, '2026-09-10')).toEqual([
      { number: 1, amountCents: 10000, occurredOn: '2026-09-10' },
      { number: 2, amountCents: 10000, occurredOn: '2026-10-10' },
      { number: 3, amountCents: 10000, occurredOn: '2026-11-10' },
    ])
  })

  test('centavos que sobram vão para a 1ª; a soma é sempre o total (Review Focus 1)', () => {
    expect(splitInstallments(10000, 3, '2026-09-10').map((i) => i.amountCents)).toEqual([3334, 3333, 3333])
    const cases: [number, number][] = [[10000, 3], [99999, 7], [1234567, 12], [48, 48], [9_999_999_999, 48]]
    for (const [total, n] of cases) {
      const parts = splitInstallments(total, n, '2026-01-31')
      expect(parts).toHaveLength(n)
      expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(total)
      expect(parts.every((p) => Number.isInteger(p.amountCents) && p.amountCents > 0)).toBe(true)
      expect(Math.max(...parts.map((p) => p.amountCents)) - Math.min(...parts.map((p) => p.amountCents))).toBeLessThan(n)
    }
  })

  test('dia que o mês não tem cai no último dia; vira o ano (Review Focus 2)', () => {
    expect(splitInstallments(40000, 4, '2026-11-30').map((i) => i.occurredOn)).toEqual([
      '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28',
    ])
    expect(splitInstallments(30000, 3, '2027-12-31').map((i) => i.occurredOn)).toEqual(['2027-12-31', '2028-01-31', '2028-02-29'])
  })

  test('limites do número de parcelas', () => {
    expect(MIN_INSTALLMENTS).toBe(2)
    expect(MAX_INSTALLMENTS).toBe(48)
  })
})

describe('parcelas futuras (Review Focus 3)', () => {
  test('a de hoje já contou; só depois de hoje é futura', () => {
    expect(isFutureInstallment('2026-09-30', '2026-09-30')).toBe(false)
    expect(isFutureInstallment('2026-09-29', '2026-09-30')).toBe(false)
    expect(isFutureInstallment('2026-10-01', '2026-09-30')).toBe(true)
  })

  test('o que falta: quantas e quanto', () => {
    const parts = splitInstallments(50000, 5, '2026-07-30')
    expect(remainingInstallments(parts, '2026-09-30')).toEqual({ count: 2, cents: 20000 })
    expect(remainingInstallments(parts, '2026-11-30')).toEqual({ count: 0, cents: 0 })
  })

  test('rótulo do protótipo', () => {
    expect(installmentBadge(2, 5)).toBe('parcela 2 de 5')
  })
})

test('cada mês mostra a sua parcela em "Saiu"; o Saldo total só conta até hoje (decisão 2)', () => {
  const ledger: LedgerTx[] = splitInstallments(30000, 3, '2026-09-10').map((p) => ({
    kind: 'expense', amountCents: p.amountCents, occurredOn: p.occurredOn, status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0,
  }))
  const at = (month: string) => summarizeMonth({ month, today: '2026-09-30', initialBalanceCents: 0, transactions: ledger, goalMovements: [] })
  expect(at('2026-09').saiuCents).toBe(10000)
  expect(at('2026-10').saiuCents).toBe(10000)
  expect(at('2026-12').saiuCents).toBe(0)
  expect(at('2026-09').saldoTotalCents).toBe(-10000)
})
