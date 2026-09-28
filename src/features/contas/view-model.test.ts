import { describe, expect, test } from 'vitest'
import { buildContas, parseContasTab, txName } from './view-model'
import type { TxRow } from '@/features/registro/queries'
import type { RecurrenceRow } from './types'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`,
  cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const bill = (id: string, note: string, cents: number, dueOn: string, extra: Partial<TxRow> = {}) =>
  row({ id, kind: 'expense', amountCents: cents, occurredOn: dueOn, dueOn, status: 'pending', note, categoryId: 'c1', ...extra })
const categories = [{ id: 'c1', name: 'Casa', defaultKey: 'casa' }]
const profile = { displayName: 'Camila', initialBalanceCents: 0 }
const rec = (p: Partial<RecurrenceRow> & Pick<RecurrenceRow, 'id' | 'name'>): RecurrenceRow => ({
  kind: 'expense', amountCents: 18000, categoryId: 'c1', source: null, frequency: 'monthly', dueDay: 25, dueMonth: null,
  startsOn: '2026-09-25', endedOn: null, ...p,
})

const transactions: TxRow[] = [
  row({ id: 'sal', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
  bill('luz', 'Luz', 18000, '2026-09-25'),
  bill('net', 'Internet', 12000, '2026-09-28'),
  bill('esc', 'Escola de inglês', 30000, '2026-09-30'),
  bill('agua', 'Água', 9000, '2026-09-10'),
  bill('gas', 'Gás', 7000, '2026-08-20'),
  bill('ipva', 'IPVA', 50000, '2026-09-15', { status: 'confirmed', paidOn: '2026-09-16' }),
  bill('tv', 'TV', 5000, '2026-08-28', { status: 'confirmed', paidOn: '2026-09-02' }),
  row({ id: 'fre', kind: 'income', amountCents: 80000, occurredOn: '2026-09-30', dueOn: '2026-09-30', status: 'pending', note: 'Freela mensal' }),
]
const base = { month: '2026-09', today: '2026-09-22', profile, categories, transactions, recurrences: [] }

describe('buildContas', () => {
  test('a pagar: ainda não vencidas, por data, com o prazo do protótipo', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['Luz', `${brl('180,00')} · vence dia 25 · em 3 dias`],
      ['Internet', `${brl('120,00')} · vence dia 28 · em 6 dias`],
      ['Escola de inglês', `${brl('300,00')} · vence dia 30 · em 8 dias`],
    ])
    expect(v.counts).toEqual({ 'a-pagar': 3, pagas: 2, vencidas: 2 })
  })

  test('vencidas: calmas, incluindo a do mês passado ainda não paga (decisão 1)', () => {
    const v = buildContas({ ...base, tab: 'vencidas' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['Gás', `${brl('70,00')} · venceu em 20 de agosto`],
      ['Água', `${brl('90,00')} · venceu em 10 de setembro`],
    ])
    expect(v.bills.map((b) => b.caption).join(' ')).not.toMatch(/atrasad/i)
  })

  test('pagas: pelo mês do pagamento (A1), a mais recente primeiro', () => {
    const v = buildContas({ ...base, tab: 'pagas' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['IPVA', `${brl('500,00')} · paga em 16 de setembro`],
      ['TV', `${brl('50,00')} · paga em 2 de setembro`],
    ])
  })

  test('resumo usa a mesma regra do Seu mês', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.aPagarLabel).toBe('A pagar em setembro')
    expect(v.aPagarCents).toBe(18000 + 12000 + 30000 + 9000 + 7000)
    expect(v.disponivelDepoisCents).toBe(500000 - 50000 - 5000 - v.aPagarCents)
  })

  test('entradas a receber com "previsto para dia"', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.incomes.map((i) => [i.id, i.name, i.caption])).toEqual([['fre', 'Freela mensal', `${brl('800,00')} · previsto para dia 30`]])
  })

  test('mesmo dia de vencimento: ordem estável por nome, depois por id', () => {
    const tied = [
      ...transactions,
      bill('z-id', 'Mesmo nome', 4000, '2026-09-25'),
      bill('a-id', 'Mesmo nome', 4000, '2026-09-25'),
    ]
    const v = buildContas({ ...base, transactions: tied, tab: 'a-pagar' })
    const sameDayNames = v.bills.filter((b) => b.name === 'Mesmo nome').map((b) => b.id)
    expect(sameDayNames).toEqual(['a-id', 'z-id'])
    // "Luz" também vence dia 25: entra antes de "Mesmo nome" por ordem alfabética.
    expect(v.bills.map((b) => b.name).indexOf('Luz')).toBeLessThan(v.bills.map((b) => b.name).indexOf('Mesmo nome'))
  })

  test('mês passado: o que ficou sem pagar aparece como vencida, nada a pagar', () => {
    const v = buildContas({ ...base, month: '2026-08', tab: 'vencidas' })
    expect(v.isCurrentMonth).toBe(false)
    expect(v.counts['a-pagar']).toBe(0)
    expect(v.bills.map((b) => b.name)).toEqual(['Gás'])
  })

  test('contas e entradas que se repetem ficam separadas; encerradas somem', () => {
    const v = buildContas({
      ...base,
      tab: 'a-pagar',
      recurrences: [
        rec({ id: 'r1', name: 'Luz' }),
        rec({ id: 'r2', name: 'IPVA', frequency: 'yearly', dueDay: 10, dueMonth: 1 }),
        rec({ id: 'r3', name: 'Freela', kind: 'income', categoryId: null, dueDay: 30 }),
        rec({ id: 'r4', name: 'Academia', endedOn: '2026-09-01' }),
      ],
    })
    expect(v.recurringBills.map((r) => [r.name, r.caption])).toEqual([
      ['IPVA', 'Todo ano · janeiro'],
      ['Luz', 'Todo mês · dia 25'],
    ])
    expect(v.recurringIncomes.map((r) => [r.name, r.caption])).toEqual([['Freela', 'Todo mês · dia 30']])
  })
})

test('parseContasTab aceita só as três abas', () => {
  expect(parseContasTab('pagas')).toBe('pagas')
  expect(parseContasTab('vencidas')).toBe('vencidas')
  expect(parseContasTab('x')).toBe('a-pagar')
  expect(parseContasTab(undefined)).toBe('a-pagar')
})

test('txName: nota, senão categoria/origem', () => {
  expect(txName(row({ id: 'a', kind: 'expense', amountCents: 1, occurredOn: '2026-09-01', categoryId: 'c1' }), categories)).toBe('Casa')
  expect(txName(row({ id: 'b', kind: 'expense', amountCents: 1, occurredOn: '2026-09-01', categoryId: 'zz' }), categories)).toBe('Outros')
  expect(txName(row({ id: 'c', kind: 'income', amountCents: 1, occurredOn: '2026-09-01' }), categories)).toBe('Entrada')
  expect(txName(row({ id: 'd', kind: 'income', amountCents: 1, occurredOn: '2026-09-01', source: 'Freela' }), categories)).toBe('Freela')
})
