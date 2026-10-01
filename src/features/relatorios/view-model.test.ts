import { describe, expect, test } from 'vitest'
import { formatCompactBRL } from '@/domain/money'
import type { GoalMovementRow } from '@/features/metas/types'
import type { TxRow } from '@/features/registro/queries'
import { buildSeuMes } from '@/features/seu-mes/view-model'
import { resolvePeriod } from './period'
import { buildRelatorios, sentenceText } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'
const profile = { displayName: 'Camila', initialBalanceCents: 0 }
const categories = [
  { id: 'c3', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c1', name: 'Comer fora', defaultKey: 'comer_fora' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
]
let seq = 0
const row = (p: Partial<TxRow> & Pick<TxRow, 'amountCents' | 'occurredOn'>): TxRow => ({
  id: `t${++seq}`, kind: 'expense', categoryId: 'c3', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, cardId: null, cardDeleted: false, installmentPlanId: null,
  installmentNumber: null, installmentCount: null, goalId: null, familyId: null, ...p,
})
const income = (occurredOn: string) => row({ kind: 'income', categoryId: null, source: 'Salário', amountCents: 500000, occurredOn })
const move = (p: Pick<GoalMovementRow, 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  id: `m${++seq}`, goalId: 'g1', transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

// Protótipo Relatórios: julho saiu R$ 4.310, agosto R$ 3.720, setembro R$ 3.460.
const transactions = [
  income('2026-07-05'), row({ amountCents: 431000, occurredOn: '2026-07-10' }),
  income('2026-08-05'), row({ categoryId: 'c1', amountCents: 60000, occurredOn: '2026-08-10' }),
  row({ categoryId: 'c2', amountCents: 47000, occurredOn: '2026-08-11' }), row({ amountCents: 265000, occurredOn: '2026-08-12' }),
  income('2026-09-05'), row({ categoryId: 'c1', amountCents: 42000, occurredOn: '2026-09-10' }),
  row({ categoryId: 'c2', amountCents: 81000, occurredOn: '2026-09-11' }), row({ amountCents: 223000, occurredOn: '2026-09-12' }),
]
const goalMovements = [
  move({ kind: 'deposit', amountCents: 30000, occurredOn: '2026-08-10' }),
  move({ kind: 'withdraw', amountCents: 10000, occurredOn: '2026-09-02' }),
]
const build = (params: Parameters<typeof resolvePeriod>[0], tx = transactions, moves = goalMovements, t = today) =>
  buildRelatorios({ period: resolvePeriod(params, t), today: t, profile, categories, transactions: tx, goalMovements: moves })

describe('relatórios dos últimos 3 meses (protótipo)', () => {
  const v = build({})

  test('o que mudou: resumo do último mês e comparações em frases, antes dos gráficos (RF-38, RF-39)', () => {
    expect(v.empty).toBe(false)
    expect(sentenceText(v.summary)).toBe(`Em setembro, entrou ${brl('5.000')} e saiu ${brl('3.460')}.`)
    expect(v.summary.filter((p) => typeof p !== 'string')).toEqual([{ value: brl('5.000') }, { value: brl('3.460') }])
    expect(v.changes.map(sentenceText)).toEqual([
      `Você gastou ${brl('420')} a menos com Mercado do que no mês passado.`,
      `Seus gastos com Saúde subiram ${brl('340')} em relação ao mês passado.`,
      `Você gastou ${brl('180')} a menos com Comer fora do que no mês passado.`,
    ])
  })

  test('mês a mês: entrou, saiu e guardado, do mais recente para o mais antigo', () => {
    expect(v.months).toEqual([
      { month: '2026-09', label: 'Setembro', current: true, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('3.460')}`, goalText: `Tirado das metas ${brl('100')}` },
      { month: '2026-08', label: 'Agosto', current: false, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('3.720')}`, goalText: `Guardado ${brl('300')}` },
      { month: '2026-07', label: 'Julho', current: false, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('4.310')}`, goalText: null },
    ])
  })

  test('gráfico "Entrou e saiu" em ordem crescente, com alturas relativas ao maior valor', () => {
    expect(v.chart?.map((b) => [b.label, b.entrouHeight, b.saiuHeight, b.saiuText])).toEqual([
      ['Julho', 100, 86, brl('4.310')],
      ['Agosto', 100, 74, brl('3.720')],
      ['Setembro', 100, 69, brl('3.460')],
    ])
  })

  test('para onde o dinheiro foi no período, somando os meses', () => {
    expect(v.categories.map((c) => [c.name, c.cents])).toEqual([['Mercado', 919000], ['Saúde', 128000], ['Comer fora', 102000]])
    expect(v.categories[0].share).toBe(1)
  })
})

test('um mês só: sem gráfico; comparação com o mês anterior mesmo fora do período', () => {
  const v = build({ periodo: 'este-mes' })
  expect(v.chart).toBeNull()
  expect(v.months).toHaveLength(1)
  expect(v.changes).toHaveLength(3)
})

test('meses de outro ano levam o ano; mais de 4 meses usam o nome curto no gráfico', () => {
  const v = build({ periodo: 'personalizado', de: '2025-11', ate: '2026-01' }, [], [move({ kind: 'deposit', amountCents: 100, occurredOn: '2025-11-02' })])
  expect(v.months.map((m) => m.label)).toEqual(['Janeiro', 'Dezembro de 2025', 'Novembro de 2025'])
  expect(sentenceText(v.summary)).toBe(`Em janeiro, entrou ${brl('0')} e saiu ${brl('0')}.`)
  expect(v.chart?.map((b) => [b.entrouHeight, b.saiuHeight])).toEqual([[0, 0], [0, 0], [0, 0]])
  expect(build({ periodo: 'personalizado', de: '2026-01', ate: '2026-06' }).chart?.map((b) => b.label)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'])
})

test('sem nenhum registro confirmado nem movimento de meta: vazio da copy', () => {
  expect(build({}, [], []).empty).toBe(true)
  expect(build({}, [row({ amountCents: 100, occurredOn: '2026-09-01', status: 'pending', dueOn: '2026-09-20' })], []).empty).toBe(true)
  expect(build({}, [], [move({ kind: 'deposit', amountCents: 100, occurredOn: '2026-09-01' })]).empty).toBe(false)
})

test('relatório de um mês bate com o Seu mês: meta, conta paga com atraso e conta a pagar (Review Focus 1)', () => {
  const tx = [
    income('2026-09-05'),
    row({ categoryId: 'c1', amountCents: 50000, occurredOn: '2026-09-06', goalId: 'g1', goalFundedCents: 20000 }),
    row({ categoryId: 'c2', amountCents: 12000, occurredOn: '2026-08-30', paidOn: '2026-09-03' }),
    row({ categoryId: 'c2', amountCents: 9000, occurredOn: '2026-09-25', status: 'pending', dueOn: '2026-09-25' }),
  ]
  const moves = [move({ kind: 'deposit', amountCents: 20000, occurredOn: '2026-08-10' }), move({ kind: 'use', amountCents: 20000, occurredOn: '2026-09-06' })]
  const seu = buildSeuMes({ month: '2026-09', today, profile, categories, transactions: tx, goals: [], goalMovements: moves, budgets: [] })
  const v = build({ periodo: 'este-mes' }, tx, moves)
  expect(v.months[0].entrouText).toBe(`Entrou ${formatCompactBRL(seu.summary.entrouCents)}`)
  expect(v.months[0].saiuText).toBe(`Saiu ${formatCompactBRL(seu.summary.saiuCents)}`)
  expect(v.categories).toEqual(seu.categories)
})
