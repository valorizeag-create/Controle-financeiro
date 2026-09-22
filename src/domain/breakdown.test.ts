import { expect, test } from 'vitest'
import { spendingByCategory, type CategorizedTx } from './breakdown'

const g = (categoryId: string, amountCents: number, occurredOn = '2026-09-10', extra: Partial<CategorizedTx> = {}): CategorizedTx => ({
  kind: 'expense', amountCents, occurredOn, status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, categoryId, ...extra,
})

test('soma por categoria, do maior para o menor, só no mês e só confirmados', () => {
  const result = spendingByCategory(
    [
      g('mercado', 50000), g('mercado', 39000), g('saude', 81000), g('casa', 72000),
      g('casa', 10000, '2026-08-30'),
      g('lazer', 5000, '2026-09-20', { status: 'pending', dueOn: '2026-09-20' }),
      { ...g('x', 0), kind: 'income', amountCents: 500000, categoryId: null },
    ],
    '2026-09',
  )
  expect(result).toEqual([
    { categoryId: 'mercado', cents: 89000 },
    { categoryId: 'saude', cents: 81000 },
    { categoryId: 'casa', cents: 72000 },
  ])
})

test('parte paga com meta não entra', () => {
  expect(spendingByCategory([g('lazer', 340000, '2026-09-15', { goalFundedCents: 300000 })], '2026-09')).toEqual([
    { categoryId: 'lazer', cents: 40000 },
  ])
})
