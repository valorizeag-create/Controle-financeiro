import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import type { PlanRow } from './types'
import { buildPurchase } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'occurredOn'>): TxRow => ({
  kind: 'expense', categoryId: 'c1', source: null, note: 'Tênis', paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: '2026-07-10T12:00:00Z', cardId: 'k1', cardDeleted: false,
  installmentPlanId: 'p1', installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const inst = (n: number, occurredOn: string, extra: Partial<TxRow> = {}) =>
  row({ id: `i${n}`, amountCents: 10000, occurredOn, installmentNumber: n, installmentCount: 5, ...extra })
const categories = [{ id: 'c1', name: 'Compras', defaultKey: 'compras' }]
const cards = [{ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const }]
const plan: PlanRow = { id: 'p1', totalCents: 50000, count: 5, purchasedOn: '2026-07-10', status: 'active', closedOn: null }
const five = [inst(1, '2026-07-10'), inst(2, '2026-08-10'), inst(3, '2026-09-10'), inst(4, '2026-10-10'), inst(5, '2026-11-10')]
const today = '2026-09-30'

describe('buildPurchase (RF-14)', () => {
  test('compra ativa: total, cartão, o que falta e as parcelas', () => {
    const v = buildPurchase({ plan, rows: five, categories, cards, today })
    expect(v).toMatchObject({
      id: 'p1', title: 'Tênis', totalText: `${brl('500,00')} em 5 parcelas`, payment: 'Nubank pessoal',
      remainingText: `Faltam 2 parcelas: ${brl('200,00')}.`, statusText: null, canClose: true, remainingCents: 20000,
    })
    expect(v.rows.map((r) => [r.title, r.detail, r.amountCents])).toEqual([
      ['Parcela 1 de 5', '10 de julho de 2026', 10000],
      ['Parcela 2 de 5', '10 de agosto de 2026', 10000],
      ['Parcela 3 de 5', '10 de setembro de 2026', 10000],
      ['Parcela 4 de 5', '10 de outubro de 2026', 10000],
      ['Parcela 5 de 5', '10 de novembro de 2026', 10000],
    ])
  })

  test('uma só falta: singular', () => {
    expect(buildPurchase({ plan, rows: five, categories, cards, today: '2026-10-10' }).remainingText).toBe(`Falta 1 parcela: ${brl('100,00')}.`)
  })

  test('parcela de hoje já contou; sem futura, nada a quitar (Review Focus 3)', () => {
    const v = buildPurchase({ plan, rows: five, categories, cards, today: '2026-11-10' })
    expect(v).toMatchObject({ remainingText: null, canClose: false, remainingCents: 0 })
  })

  test('quitada: restante no fim, sem ações', () => {
    const rows = [...five.slice(0, 3), row({ id: 'q', amountCents: 18000, occurredOn: '2026-09-30' })]
    const v = buildPurchase({ plan: { ...plan, status: 'settled', closedOn: '2026-09-30' }, rows, categories, cards, today })
    expect(v).toMatchObject({ statusText: 'Quitada em 30 de setembro.', remainingText: null, canClose: false })
    expect(v.rows.at(-1)).toEqual({ id: 'q', title: 'Restante quitado', detail: '30 de setembro de 2026', amountCents: 18000 })
  })

  test('devolvida', () => {
    const v = buildPurchase({ plan: { ...plan, status: 'refunded', closedOn: '2026-09-30' }, rows: five.slice(0, 3), categories, cards, today })
    expect(v).toMatchObject({ statusText: 'Devolvida em 30 de setembro.', canClose: false })
    expect(v.rows).toHaveLength(3)
  })

  test('sem nota usa a categoria; cartão excluído aparece assim', () => {
    const rows = five.map((r) => ({ ...r, note: null, cardId: null, cardDeleted: true }))
    expect(buildPurchase({ plan, rows, categories, cards, today })).toMatchObject({ title: 'Compras', payment: 'Cartão excluído' })
  })
})
