import { expect, test } from 'vitest'
import { toRecurrenceRow } from './types'

test('converte a linha do banco (bigint vem como texto ou número)', () => {
  expect(
    toRecurrenceRow({
      id: 'r1', kind: 'expense', name: 'Luz', amount_cents: '18000', category_id: 'c1', source: null,
      frequency: 'yearly', due_day: 10, due_month: 1, starts_on: '2027-01-10', ended_on: null,
    }),
  ).toEqual({
    id: 'r1', kind: 'expense', name: 'Luz', amountCents: 18000, categoryId: 'c1', source: null,
    frequency: 'yearly', dueDay: 10, dueMonth: 1, startsOn: '2027-01-10', endedOn: null,
  })
})
