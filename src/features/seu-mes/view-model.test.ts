import { expect, test } from 'vitest'
import { buildSeuMes } from './view-model'
import type { TxRow } from '@/features/registro/queries'
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'

const goalRow = (p: Partial<GoalRow> & Pick<GoalRow, 'id' | 'name'>): GoalRow => ({
  targetCents: 400000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z', ...p,
})
const move = (p: Pick<GoalMovementRow, 'id' | 'goalId' | 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`,
  cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const categories = [
  { id: 'c1', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
]

test('monta o Seu mês com maior gasto, categorias e últimos registros', () => {
  const v = buildSeuMes({
    month: '2026-09', today: '2026-09-22', profile: { displayName: 'Camila', initialBalanceCents: 600000 }, categories,
    transactions: [
      row({ id: 't1', kind: 'expense', amountCents: 14230, occurredOn: '2026-09-22', categoryId: 'c1' }),
      row({ id: 't2', kind: 'expense', amountCents: 81000, occurredOn: '2026-09-20', categoryId: 'c2' }),
      row({ id: 't3', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
      row({ id: 't4', kind: 'expense', amountCents: 5000, occurredOn: '2026-08-30', categoryId: 'c1' }),
    ],
    goals: [], goalMovements: [], budgets: [],
  })
  expect(v.label).toBe('setembro de 2026')
  expect(v.isCurrentMonth).toBe(true)
  expect(v.summary.disponivelCents).toBe(500000 - 14230 - 81000)
  expect(v.summary.saldoTotalCents).toBe(600000 + 500000 - 14230 - 81000 - 5000)
  expect(v.biggest).toEqual({ name: 'Saúde', cents: 81000 })
  expect(v.categories.map((c) => c.name)).toEqual(['Saúde', 'Mercado'])
  expect(v.categories[0].share).toBe(1)
  expect(v.recent.map((r) => [r.title, r.subtitle])).toEqual([
    ['Mercado', 'Hoje'],
    ['Saúde', '20 de setembro'],
    ['Salário', '5 de setembro'],
  ])
})

test('mês sem registros', () => {
  const v = buildSeuMes({ month: '2026-10', today: '2026-09-22', profile: { displayName: 'C', initialBalanceCents: 0 }, categories, transactions: [], goals: [], goalMovements: [], budgets: [] })
  expect(v.isCurrentMonth).toBe(false)
  expect(v.biggest).toBeNull()
})

test('últimos registros ordenados pela data efetiva, não pela data do lançamento', () => {
  const v = buildSeuMes({
    month: '2026-09', today: '2026-09-30', profile: { displayName: 'Camila', initialBalanceCents: 0 }, categories,
    transactions: [
      row({ id: 't1', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
      row({ id: 't2', kind: 'expense', amountCents: 20000, occurredOn: '2026-08-25', paidOn: '2026-09-21', categoryId: 'c1' }),
    ],
    goals: [], goalMovements: [], budgets: [],
  })
  expect(v.recent[0]).toMatchObject({ title: 'Mercado', subtitle: '21 de setembro' })
})

test('Próximas contas: vencidas primeiro, até 3, só no mês atual', () => {
  const bill = (id: string, note: string, dueOn: string, extra: Partial<TxRow> = {}) =>
    row({ id, kind: 'expense', amountCents: 1000, occurredOn: dueOn, dueOn, status: 'pending', note, categoryId: 'c1', ...extra })
  const transactions = [
    bill('luz', 'Luz', '2026-09-25'),
    bill('agua', 'Água', '2026-09-10'),
    bill('gas', 'Gás', '2026-08-20'),
    bill('net', 'Internet', '2026-09-28'),
    bill('out', 'Outubro', '2026-10-05'),
    bill('paga', 'Paga', '2026-09-23', { status: 'confirmed', paidOn: '2026-09-21' }),
    row({ id: 'fre', kind: 'income', amountCents: 80000, occurredOn: '2026-09-24', dueOn: '2026-09-24', status: 'pending' }),
  ]
  const profile = { displayName: 'C', initialBalanceCents: 0 }
  const v = buildSeuMes({ month: '2026-09', today: '2026-09-22', profile, categories, transactions, goals: [], goalMovements: [], budgets: [] })
  expect(v.upcoming.map((u) => [u.name, u.dueText])).toEqual([
    ['Gás', 'venceu em 20 de agosto'],
    ['Água', 'venceu em 10 de setembro'],
    ['Luz', 'vence em 3 dias'],
  ])
  expect(buildSeuMes({ month: '2026-08', today: '2026-09-22', profile, categories, transactions, goals: [], goalMovements: [], budgets: [] }).upcoming).toEqual([])
})

test('Próximas contas: mesmo dia de vencimento tem ordem estável por nome, depois por id', () => {
  const bill = (id: string, note: string, dueOn: string) =>
    row({ id, kind: 'expense', amountCents: 1000, occurredOn: dueOn, dueOn, status: 'pending', note, categoryId: 'c1' })
  const transactions = [bill('z-id', 'Mesmo nome', '2026-09-25'), bill('a-id', 'Mesmo nome', '2026-09-25')]
  const profile = { displayName: 'C', initialBalanceCents: 0 }
  const v = buildSeuMes({ month: '2026-09', today: '2026-09-22', profile, categories, transactions, goals: [], goalMovements: [], budgets: [] })
  expect(v.upcoming.map((u) => u.id)).toEqual(['a-id', 'z-id'])
})

test('guardar e tirar entram nos números do mês (RN-01, RN-13, RN-14)', () => {
  const v = buildSeuMes({ budgets: [],
    month: '2026-09', today: '2026-09-22', profile: { displayName: 'C', initialBalanceCents: 0 }, categories,
    transactions: [row({ id: 't1', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' })],
    goals: [goalRow({ id: 'g1', name: 'Viagem para Salvador' })],
    goalMovements: [
      move({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
      move({ id: 'm2', goalId: 'g1', kind: 'withdraw', amountCents: 5000, occurredOn: '2026-09-20' }),
    ],
  })
  expect(v.summary.goalLine).toEqual({ label: 'Guardado este mês', amountCents: 25000 })
  expect(v.summary.disponivelCents).toBe(475000)
  expect(v.summary.guardadoTotalCents).toBe(25000)
  expect(v.summary.saldoTotalCents).toBe(500000)
})

test('meta em destaque do protótipo, só no mês atual', () => {
  const input = {
    profile: { displayName: 'C', initialBalanceCents: 0 }, categories, transactions: [], budgets: [],
    goals: [goalRow({ id: 'g1', name: 'Viagem para Salvador', deadline: '2027-03' }), goalRow({ id: 'g2', name: 'Antiga', deletedOn: '2026-09-01' })],
    goalMovements: [
      move({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 248000, occurredOn: '2026-09-19' }),
      move({ id: 'm2', goalId: 'g2', kind: 'deposit', amountCents: 399000, occurredOn: '2026-08-19' }),
      move({ id: 'm3', goalId: 'g2', kind: 'withdraw', amountCents: 399000, occurredOn: '2026-09-01' }),
    ],
  }
  const NBSP = String.fromCharCode(0xa0)
  const v = buildSeuMes({ ...input, month: '2026-09', today: '2026-09-22' })
  expect(v.featured).toEqual({
    id: 'g1', name: 'Viagem para Salvador', percent: 62,
    remainingText: `Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`,
    caption: `R$${NBSP}2.480,00 de R$${NBSP}4.000,00 · até março de 2027`,
    guardarHref: '/metas/g1/guardar',
  })
  expect(buildSeuMes({ ...input, month: '2026-08', today: '2026-09-22' }).featured).toBeNull()
})

test('bloco "Planejado" só no mês atual e com planejado (RF-33)', () => {
  const input = {
    profile: { displayName: 'C', initialBalanceCents: 0 }, categories, goals: [], goalMovements: [],
    transactions: [row({ id: 't1', kind: 'expense', amountCents: 42000, occurredOn: '2026-09-10', categoryId: 'c1' })],
    budgets: [{ month: '2026-09', categoryId: 'c1', amountCents: 40000 }],
  }
  const v = buildSeuMes({ ...input, month: '2026-09', today: '2026-09-22' })
  expect(v.planned?.withinText).toBe('Você está dentro do planejado em 0 de 1 categorias.')
  expect(v.planned?.lines.map((l) => [l.name, l.state])).toEqual([['Mercado', 'over']])
  expect(buildSeuMes({ ...input, month: '2026-08', today: '2026-09-22' }).planned).toBeNull()
  expect(buildSeuMes({ ...input, budgets: [], month: '2026-09', today: '2026-09-22' }).planned).toBeNull()
})
