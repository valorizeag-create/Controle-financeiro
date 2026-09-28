import { expect, test } from 'vitest'
import { TX_COLUMNS, toTxRow, type TxRawRow } from './tx-row'

const raw: TxRawRow = {
  id: 't1', kind: 'expense', amount_cents: '10000', category_id: 'c1', source: null, note: 'Tênis', payment_method: null,
  occurred_on: '2026-10-10', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-09-10T12:00:00Z',
  card_id: 'k1', card_deleted: false, installment_plan_id: 'p1', installment_number: 2, installment_count: 3,
}

test('converte a linha do banco com cartão e parcela', () => {
  expect(toTxRow(raw)).toEqual({
    id: 't1', kind: 'expense', amountCents: 10000, categoryId: 'c1', source: null, note: 'Tênis', paymentMethod: null,
    occurredOn: '2026-10-10', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, createdAt: '2026-09-10T12:00:00Z',
    cardId: 'k1', cardDeleted: false, installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 3,
  })
})

test('registro comum: sem cartão e sem parcela', () => {
  const row = toTxRow({ ...raw, card_id: null, card_deleted: true, installment_plan_id: null, installment_number: null, installment_count: null })
  expect(row).toMatchObject({ cardId: null, cardDeleted: true, installmentPlanId: null, installmentNumber: null, installmentCount: null })
})

test('as colunas lidas incluem cartão e parcela', () => {
  for (const c of ['card_id', 'card_deleted', 'installment_plan_id', 'installment_number', 'installment_count']) expect(TX_COLUMNS).toContain(c)
})
