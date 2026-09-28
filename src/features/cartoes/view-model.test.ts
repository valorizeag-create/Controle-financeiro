import { expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import { buildCartoes } from './view-model'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'occurredOn'>): TxRow => ({
  kind: 'expense', categoryId: 'c1', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, cardId: null, cardDeleted: false,
  installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const cards = [
  { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const },
  { id: 'k2', nickname: 'Inter', kind: 'debit' as const, color: 'orange' as const },
]

test('cada cartão com o gasto do mês, parcelas incluídas, e o caminho para os gastos (RF-59)', () => {
  const transactions = [
    row({ id: 'a', amountCents: 120000, occurredOn: '2026-09-05', cardId: 'k1' }),
    row({ id: 'b', amountCents: 8450, occurredOn: '2026-09-20', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 5 }),
    row({ id: 'c', amountCents: 8450, occurredOn: '2026-10-20', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 3, installmentCount: 5 }),
    row({ id: 'd', amountCents: 5000, occurredOn: '2026-09-10', paymentMethod: 'pix' }),
  ]
  const v = buildCartoes({ month: '2026-09', cards, transactions })
  expect(v.label).toBe('setembro de 2026')
  expect(v.items.map((i) => [i.card.nickname, i.spentCents, i.spentLabel, i.gastosHref])).toEqual([
    ['Nubank pessoal', 128450, 'Gasto neste cartão em setembro', '/extrato?mes=2026-09&cartao=k1'],
    ['Inter', 0, 'Gasto neste cartão em setembro', '/extrato?mes=2026-09&cartao=k2'],
  ])
  expect(v.items.map((i) => i.spentLabel).join(' ')).not.toMatch(/fatura/i)
})
