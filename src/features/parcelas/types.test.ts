import { expect, test } from 'vitest'
import { toPlanRow } from './types'

test('converte a compra do banco', () => {
  expect(toPlanRow({ id: 'p1', total_cents: '50000', installment_count: 5, purchased_on: '2026-07-30', status: 'settled', closed_on: '2026-09-30' })).toEqual({
    id: 'p1', totalCents: 50000, count: 5, purchasedOn: '2026-07-30', status: 'settled', closedOn: '2026-09-30',
  })
})
