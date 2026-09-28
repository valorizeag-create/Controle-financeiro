import { expect, test } from 'vitest'
import { GOAL_COLUMNS, MOVEMENT_COLUMNS, toGoalRow, toMovementRow } from './types'

test('converte a meta do banco; prazo vira mês', () => {
  expect(
    toGoalRow({
      id: 'g1', name: 'Viagem para Salvador', target_cents: '400000', deadline: '2027-03-01', status: 'active',
      used_on: null, deleted_on: null, created_at: '2026-07-15T12:00:00Z',
    }),
  ).toEqual({
    id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active',
    usedOn: null, deletedOn: null, createdAt: '2026-07-15T12:00:00Z',
  })
  expect(
    toGoalRow({
      id: 'g2', name: 'Computador novo', target_cents: 500000, deadline: null, status: 'used',
      used_on: '2026-07-20', deleted_on: null, created_at: '2026-01-02T12:00:00Z',
    }),
  ).toMatchObject({ deadline: null, status: 'used', usedOn: '2026-07-20' })
})

test('converte o movimento do banco', () => {
  expect(
    toMovementRow({
      id: 'm1', goal_id: 'g1', kind: 'use', amount_cents: '230000', occurred_on: '2026-09-28',
      transaction_id: 't1', created_at: '2026-09-28T15:00:00Z',
    }),
  ).toEqual({
    id: 'm1', goalId: 'g1', kind: 'use', amountCents: 230000, occurredOn: '2026-09-28',
    transactionId: 't1', createdAt: '2026-09-28T15:00:00Z',
  })
})

test('colunas lidas', () => {
  for (const c of ['target_cents', 'deadline', 'status', 'used_on', 'deleted_on']) expect(GOAL_COLUMNS).toContain(c)
  for (const c of ['goal_id', 'kind', 'amount_cents', 'occurred_on', 'transaction_id']) expect(MOVEMENT_COLUMNS).toContain(c)
})
