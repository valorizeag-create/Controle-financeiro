import { describe, expect, test } from 'vitest'
import { NEAR_LIMIT_PERCENT, budgetLines, budgetState, withinCount } from './planning'
import { spendingByCategory, type CategorizedTx } from './breakdown'

const tx = (p: Partial<CategorizedTx>): CategorizedTx => ({
  kind: 'expense', amountCents: 0, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, categoryId: 'c1', ...p,
})

describe('estado do planejado (RF-23)', () => {
  test('passou só quando o gasto é maior; perto a partir de 90%, inclusive igual', () => {
    expect(NEAR_LIMIT_PERCENT).toBe(90)
    expect(budgetState(0, 100000)).toBe('within')
    expect(budgetState(89999, 100000)).toBe('within')
    expect(budgetState(90000, 100000)).toBe('near')
    expect(budgetState(100000, 100000)).toBe('near')
    expect(budgetState(100001, 100000)).toBe('over')
  })
})

describe('linhas do planejado', () => {
  test('protótipo Planejamento: valores, percentuais, quanto falta e quanto passou; 4 de 6 dentro', () => {
    const planned = [
      { categoryId: 'casa', plannedCents: 90000 },
      { categoryId: 'mercado', plannedCents: 100000 },
      { categoryId: 'transporte', plannedCents: 30000 },
      { categoryId: 'comer', plannedCents: 40000 },
      { categoryId: 'saude', plannedCents: 90000 },
      { categoryId: 'lazer', plannedCents: 30000 },
    ]
    const transactions = [
      tx({ categoryId: 'casa', amountCents: 72000 }),
      tx({ categoryId: 'mercado', amountCents: 89000 }),
      tx({ categoryId: 'transporte', amountCents: 38000 }),
      tx({ categoryId: 'comer', amountCents: 42000 }),
      tx({ categoryId: 'saude', amountCents: 81000 }),
      tx({ categoryId: 'lazer', amountCents: 15000 }),
    ]
    const lines = budgetLines({ month: '2026-09', transactions, planned })
    expect(lines.map((l) => [l.categoryId, l.spentCents, l.state, l.percent, l.remainingCents, l.overCents])).toEqual([
      ['casa', 72000, 'within', 80, 18000, 0],
      ['mercado', 89000, 'within', 89, 11000, 0],
      ['transporte', 38000, 'over', 100, 0, 8000],
      ['comer', 42000, 'over', 100, 0, 2000],
      ['saude', 81000, 'near', 90, 9000, 0],
      ['lazer', 15000, 'within', 50, 15000, 0],
    ])
    expect(lines[2].usage).toBeCloseTo(38000 / 30000)
    expect(withinCount(lines)).toBe(4)
  })

  test('o gasto é o mesmo de "Para onde seu dinheiro vai": parte paga com meta fora, conta paga no mês em que foi paga, a pagar não conta (RN-01a, A1, Review Focus 1)', () => {
    const transactions = [
      tx({ amountCents: 50000, goalFundedCents: 21000 }),
      tx({ amountCents: 30000, occurredOn: '2026-08-28', paidOn: '2026-09-02' }),
      tx({ amountCents: 40000, status: 'pending', dueOn: '2026-09-20' }),
      tx({ amountCents: 7000, occurredOn: '2026-10-01' }),
      tx({ kind: 'income', amountCents: 500000, categoryId: null }),
      tx({ amountCents: 1000, categoryId: 'c2' }),
    ]
    const [line] = budgetLines({ month: '2026-09', transactions, planned: [{ categoryId: 'c1', plannedCents: 100000 }] })
    expect(line.spentCents).toBe(29000 + 30000)
    expect(spendingByCategory(transactions, '2026-09').find((t) => t.categoryId === 'c1')?.cents).toBe(line.spentCents)
  })

  test('categoria planejada sem gasto: 0%, dentro, falta tudo', () => {
    expect(budgetLines({ month: '2026-09', transactions: [], planned: [{ categoryId: 'c1', plannedCents: 30000 }] })).toEqual([
      { categoryId: 'c1', plannedCents: 30000, spentCents: 0, remainingCents: 30000, overCents: 0, percent: 0, usage: 0, state: 'within' },
    ])
    expect(withinCount([])).toBe(0)
  })
})
