import { expect, test } from 'vitest'
import { BUDGET_COLUMNS, toBudgetRow } from './types'

test('converte o planejado do banco; mês vira AAAA-MM', () => {
  expect(toBudgetRow({ month: '2026-09-01', category_id: 'c1', amount_cents: '100000' })).toEqual({ month: '2026-09', categoryId: 'c1', amountCents: 100000 })
  for (const c of ['month', 'category_id', 'amount_cents']) expect(BUDGET_COLUMNS).toContain(c)
})
