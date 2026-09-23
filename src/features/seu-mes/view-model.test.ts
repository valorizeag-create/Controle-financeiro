import { expect, test } from 'vitest'
import { buildSeuMes } from './view-model'
import type { TxRow } from '@/features/registro/queries'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
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
  const v = buildSeuMes({ month: '2026-10', today: '2026-09-22', profile: { displayName: 'C', initialBalanceCents: 0 }, categories, transactions: [] })
  expect(v.hasAnyInMonth).toBe(false)
  expect(v.isCurrentMonth).toBe(false)
  expect(v.biggest).toBeNull()
})
