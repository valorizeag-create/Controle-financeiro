import { expect, test } from 'vitest'
import { TX_COLUMNS, toTxRow, type TxRawRow } from './tx-row'

const raw: TxRawRow = {
  id: 't1', kind: 'expense', amount_cents: '10000', category_id: 'c1', source: null, note: 'Tênis', payment_method: null,
  occurred_on: '2026-10-10', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-09-10T12:00:00Z',
  card_id: 'k1', card_deleted: false, installment_plan_id: 'p1', installment_number: 2, installment_count: 3,
  goal_id: 'g1', goal_funded_cents: '6000', family_id: null,
}

test('converte a linha do banco com cartão e parcela', () => {
  expect(toTxRow(raw)).toEqual({
    id: 't1', kind: 'expense', amountCents: 10000, categoryId: 'c1', source: null, note: 'Tênis', paymentMethod: null,
    occurredOn: '2026-10-10', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 6000, createdAt: '2026-09-10T12:00:00Z',
    cardId: 'k1', cardDeleted: false, installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 3, goalId: 'g1', familyId: null,
  })
})

test('registro comum: sem cartão e sem parcela', () => {
  const row = toTxRow({
    ...raw, card_id: null, card_deleted: true, installment_plan_id: null, installment_number: null, installment_count: null,
    goal_id: null, goal_funded_cents: 0,
  })
  expect(row).toMatchObject({
    cardId: null, cardDeleted: true, installmentPlanId: null, installmentNumber: null, installmentCount: null,
    goalId: null, goalFundedCents: 0,
  })
})

test('as colunas lidas incluem cartão e parcela', () => {
  for (const c of ['card_id', 'card_deleted', 'installment_plan_id', 'installment_number', 'installment_count', 'goal_id', 'goal_funded_cents', 'family_id']) expect(TX_COLUMNS).toContain(c)
})

test('leva family_id para familyId (nulo e um id)', () => {
  expect(toTxRow(raw).familyId).toBeNull()
  expect(toTxRow({ ...raw, family_id: 'f1' }).familyId).toBe('f1')
})
