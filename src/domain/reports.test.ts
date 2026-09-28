import { describe, expect, test } from 'vitest'
import { compareCategories, monthReports, sumCategories } from './reports'
import { spendingByCategory, type CategorizedTx } from './breakdown'
import { summarizeMonth, type GoalMovement } from './summary'

const tx = (p: Partial<CategorizedTx>): CategorizedTx => ({
  kind: 'expense', amountCents: 0, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, categoryId: 'c1', ...p,
})

describe('relatório de cada mês (RF-38)', () => {
  test('cada mês usa as mesmas regras do Seu mês (RNF-11, Review Focus 1)', () => {
    const transactions = [
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-08-05', categoryId: null }),
      tx({ amountCents: 372000, occurredOn: '2026-08-12' }),
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', categoryId: null }),
      tx({ amountCents: 100000, occurredOn: '2026-09-06', goalFundedCents: 40000 }),
      tx({ amountCents: 12000, occurredOn: '2026-08-30', paidOn: '2026-09-03', categoryId: 'c2' }),
      tx({ amountCents: 9000, status: 'pending', dueOn: '2026-09-25', categoryId: 'c2' }),
    ]
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 50000, occurredOn: '2026-08-10' },
      { kind: 'use', amountCents: 40000, occurredOn: '2026-09-06' },
    ]
    const input = { today: '2026-09-28', initialBalanceCents: 0, transactions, goalMovements }
    const reports = monthReports({ ...input, months: ['2026-08', '2026-09'] })
    for (const r of reports) {
      const s = summarizeMonth({ ...input, month: r.month })
      expect({ entrou: r.entrouCents, saiu: r.saiuCents, goalLine: r.goalLine }).toEqual({ entrou: s.entrouCents, saiu: s.saiuCents, goalLine: s.goalLine })
      expect(r.byCategory).toEqual(spendingByCategory(transactions, r.month))
    }
    expect(reports.map((r) => r.month)).toEqual(['2026-08', '2026-09'])
    expect(reports[0].goalLine).toEqual({ label: 'Guardado este mês', amountCents: 50000 })
    expect(reports[1].saiuCents).toBe(60000 + 12000)
  })
})

describe('comparação com o mês anterior (RF-39)', () => {
  test('maiores mudanças primeiro, sem as que não mudaram, até 3', () => {
    const current = [{ categoryId: 'c2', cents: 81000 }, { categoryId: 'c1', cents: 42000 }, { categoryId: 'c3', cents: 15000 }]
    const previous = [{ categoryId: 'c1', cents: 60000 }, { categoryId: 'c2', cents: 47000 }, { categoryId: 'c3', cents: 15000 }, { categoryId: 'c4', cents: 10000 }]
    expect(compareCategories(current, previous)).toEqual([
      { categoryId: 'c2', currentCents: 81000, previousCents: 47000, deltaCents: 34000 },
      { categoryId: 'c1', currentCents: 42000, previousCents: 60000, deltaCents: -18000 },
      { categoryId: 'c4', currentCents: 0, previousCents: 10000, deltaCents: -10000 },
    ])
    expect(compareCategories(current, previous, 1).map((c) => c.categoryId)).toEqual(['c2'])
  })

  test('empate na mudança: ordem pela categoria; nada mudou: lista vazia', () => {
    expect(compareCategories([{ categoryId: 'b', cents: 100 }, { categoryId: 'a', cents: 100 }], []).map((c) => c.categoryId)).toEqual(['a', 'b'])
    expect(compareCategories([{ categoryId: 'a', cents: 100 }], [{ categoryId: 'a', cents: 100 }])).toEqual([])
  })
})

test('soma das categorias no período', () => {
  expect(sumCategories([
    [{ categoryId: 'c1', cents: 100 }, { categoryId: 'c2', cents: 50 }],
    [{ categoryId: 'c1', cents: 20 }, { categoryId: 'c3', cents: 200 }],
  ])).toEqual([
    { categoryId: 'c3', cents: 200 },
    { categoryId: 'c1', cents: 120 },
    { categoryId: 'c2', cents: 50 },
  ])
})
