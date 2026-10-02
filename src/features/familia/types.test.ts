import { expect, test } from 'vitest'
import {
  EVENT_COLUMNS,
  FAMILY_GOAL_COLUMNS,
  toEventRow,
  toFamilyBillRow,
  toFamilyExpenseRow,
  toFamilyGoalRow,
  toFamilyRecurrenceRow,
  toInviteRow,
  toMemberRow,
} from './types'

test('gasto da família: valor em centavos, data efetiva e autor sem nome', () => {
  expect(
    toFamilyExpenseRow({
      id: 'e1', effective_on: '2026-09-10', amount_cents: '31240', category_key: 'mercado', category_name: 'Mercado',
      note: null, author_id: 'u2', author_name: null, created_at: '2026-09-10T12:00:00Z', can_adjust: true,
    }),
  ).toEqual({
    id: 'e1', effectiveOn: '2026-09-10', amountCents: 31240, categoryKey: 'mercado', categoryName: 'Mercado',
    note: null, authorId: 'u2', authorName: null, createdAt: '2026-09-10T12:00:00Z', canAdjust: true,
  })
})

test('gasto da família: só pode ajustar quando o banco disse que sim', () => {
  const raw = {
    id: 'e1', effective_on: '2026-09-10', amount_cents: 100, category_key: null, category_name: 'Outros',
    note: null, author_id: 'u2', author_name: 'Bia', created_at: 'c',
  }
  expect(toFamilyExpenseRow({ ...raw, can_adjust: false }).canAdjust).toBe(false)
  // Resposta sem a coluna, nula ou com outro valor: fica sem ajuste.
  expect(toFamilyExpenseRow(raw as never).canAdjust).toBe(false)
  expect(toFamilyExpenseRow({ ...raw, can_adjust: null }).canAdjust).toBe(false)
  expect(toFamilyExpenseRow({ ...raw, can_adjust: 'true' as never }).canAdjust).toBe(false)
})

test('molde da família: dia e mês viram número', () => {
  expect(
    toFamilyRecurrenceRow({
      id: 'r1', name: 'Aluguel', amount_cents: '150000', frequency: 'yearly',
      due_day: '5' as unknown as number, due_month: '3' as unknown as number, author_id: 'u1',
    }),
  ).toEqual({ id: 'r1', name: 'Aluguel', amountCents: 150000, frequency: 'yearly', dueDay: 5, dueMonth: 3, authorId: 'u1' })
  expect(
    toFamilyRecurrenceRow({ id: 'r2', name: 'Luz', amount_cents: 9000, frequency: 'monthly', due_day: 10, due_month: null, author_id: 'u1' }).dueMonth,
  ).toBeNull()
})

test('conta da família a pagar', () => {
  expect(toFamilyBillRow({ id: 'b1', name: 'Luz', amount_cents: '9000', due_on: '2026-10-10', author_id: null })).toEqual({
    id: 'b1', name: 'Luz', amountCents: 9000, dueOn: '2026-10-10', authorId: null,
  })
})

test('aviso: valor e nome podem ser nulos; as colunas nunca trazem member_id', () => {
  expect(
    toEventRow({ id: 'v1', kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null, created_at: '2026-09-10T12:00:00Z' }),
  ).toEqual({ id: 'v1', kind: 'member_deleted', memberName: null, goalName: null, amountCents: null, createdAt: '2026-09-10T12:00:00Z' })
  expect(toEventRow({ id: 'v2', kind: 'member_left', member_name: 'Ana', goal_name: 'Viagem', amount_cents: '5000', created_at: 'x' }).amountCents).toBe(5000)
  expect(EVENT_COLUMNS).not.toContain('member_id')
})

test('participação e convite', () => {
  expect(toMemberRow({ user_id: null, role: 'member', display_name: null, joined_at: 'j', left_at: 'l' })).toEqual({
    userId: null, role: 'member', displayName: null, joinedAt: 'j', leftAt: 'l',
  })
  expect(toInviteRow({ id: 'i1', expires_at: 'x' })).toEqual({ id: 'i1', expiresAt: 'x' })
})

test('meta da família: soma guardada e quem criou', () => {
  expect(FAMILY_GOAL_COLUMNS).toContain('family_id, created_by')
  const g = toFamilyGoalRow(
    {
      id: 'g1', name: 'Viagem', target_cents: '900000', deadline: '2027-01-01', status: 'active', used_on: null,
      deleted_on: null, created_at: 'c', family_id: 'f1', created_by: null,
    },
    300000,
  )
  expect(g).toMatchObject({ id: 'g1', targetCents: 900000, deadline: '2027-01', familyId: 'f1', createdBy: null, savedCents: 300000 })
})
