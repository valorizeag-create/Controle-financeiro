import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import type { BudgetRow } from './types'
import { buildPlanForm, buildPlanejamento, buildPlannedCard } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'
const ADJUST = 'Quer ajustar o valor deste mês?'

const categories = [
  { id: 'c3', name: 'Casa', defaultKey: 'casa' },
  { id: 'c1', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c5', name: 'Transporte', defaultKey: 'transporte' },
  { id: 'c4', name: 'Comer fora', defaultKey: 'comer_fora' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
  { id: 'c6', name: 'Lazer', defaultKey: 'lazer' },
  { id: 'c7', name: 'Outros', defaultKey: 'outros' },
]
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'categoryId'>): TxRow => ({
  kind: 'expense', occurredOn: '2026-09-10', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: '2026-09-10T12:00:00Z', cardId: null, cardDeleted: false, installmentPlanId: null,
  installmentNumber: null, installmentCount: null, goalId: null, familyId: null, ...p,
})
const budget = (categoryId: string, amountCents: number, month = '2026-09'): BudgetRow => ({ month, categoryId, amountCents })

// Protótipo Planejamento (setembro): Casa 720/900, Mercado 890/1.000, Transporte 380/300,
// Comer fora 420/400, Saúde 810/900, Lazer 150/300.
const transactions = [
  row({ id: 't1', categoryId: 'c3', amountCents: 72000, occurredOn: '2026-08-28', paidOn: '2026-09-02' }),
  row({ id: 't2', categoryId: 'c3', amountCents: 50000, status: 'pending', dueOn: '2026-09-20' }),
  row({ id: 't3', categoryId: 'c1', amountCents: 60000 }),
  row({ id: 't4', categoryId: 'c1', amountCents: 50000, goalId: 'g1', goalFundedCents: 21000 }),
  row({ id: 't5', categoryId: 'c5', amountCents: 38000 }),
  row({ id: 't6', categoryId: 'c4', amountCents: 42000 }),
  row({ id: 't7', categoryId: 'c2', amountCents: 81000 }),
  row({ id: 't8', categoryId: 'c6', amountCents: 15000 }),
  row({ id: 't9', categoryId: null, kind: 'income', amountCents: 500000, source: 'Salário' }),
]
const budgets = [
  budget('c6', 30000), budget('c2', 90000), budget('c4', 40000), budget('c5', 30000), budget('c1', 100000), budget('c3', 90000),
  budget('c1', 99999, '2026-08'), budget('sumiu', 5000),
]

describe('tela do planejamento (RF-22, RF-23)', () => {
  test('protótipo: total, dentro em 4 de 6, linhas na ordem das categorias com os textos da copy', () => {
    const v = buildPlanejamento({ month: '2026-09', today, categories, transactions, budgets })
    expect(v.empty).toBe(false)
    expect(v.heroLabel).toBe('Planejado para setembro')
    expect(v.totalCents).toBe(380000)
    expect(v.withinText).toBe('Você está dentro do planejado em 4 de 6 categorias.')
    expect(v.editHref).toBe('/planejamento/editar?mes=2026-09')
    expect(v.repeatFrom).toBeNull()
    expect(v.lines.map((l) => [l.name, l.amountsText, l.state, l.statusText])).toEqual([
      ['Casa', `${brl('720')} de ${brl('900')}`, 'within', `Ainda tem ${brl('180')} disponível.`],
      ['Mercado', `${brl('890')} de ${brl('1.000')}`, 'within', `Ainda tem ${brl('110')} disponível.`],
      ['Transporte', `${brl('380')} de ${brl('300')}`, 'over', `Passou ${brl('80')} do planejado.`],
      ['Comer fora', `${brl('420')} de ${brl('400')}`, 'over', `Passou ${brl('20')} do planejado.`],
      ['Saúde', `${brl('810')} de ${brl('900')}`, 'near', 'Falta pouco para chegar ao que você planejou.'],
      ['Lazer', `${brl('150')} de ${brl('300')}`, 'within', `Ainda tem ${brl('150')} disponível.`],
    ])
    expect(v.lines[3]).toMatchObject({ percent: 100, adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4' })
  })

  test('o link de ajuste (texto da copy) vem em toda categoria que passou, e só nelas', () => {
    const v = buildPlanejamento({ month: '2026-09', today, categories, transactions, budgets })
    expect(v.lines.map((l) => [l.name, l.adjustLabel])).toEqual([
      ['Casa', null],
      ['Mercado', null],
      ['Transporte', ADJUST],
      ['Comer fora', ADJUST],
      ['Saúde', null],
      ['Lazer', null],
    ])
  })

  test('mês sem planejado: vazio, com "Repetir" quando o mês anterior tem (RF-24)', () => {
    const v = buildPlanejamento({ month: '2026-10', today, categories, transactions, budgets })
    expect(v.empty).toBe(true)
    expect(v.repeatFrom).toEqual({ label: 'Repetir o planejamento de setembro' })
    expect(buildPlanejamento({ month: '2026-08', today, categories, transactions, budgets: [] }).repeatFrom).toBeNull()
  })

  test('mês de outro ano leva o ano no nome', () => {
    const v = buildPlanejamento({ month: '2027-01', today, categories, transactions: [], budgets: [budget('c1', 1000, '2027-01'), budget('c1', 1000, '2026-12')] })
    expect(v.heroLabel).toBe('Planejado para janeiro de 2027')
    expect(buildPlanejamento({ month: '2027-02', today, categories, transactions: [], budgets: [budget('c1', 1000, '2027-01')] }).repeatFrom).toEqual({
      label: 'Repetir o planejamento de janeiro de 2027',
    })
  })
})

describe('bloco "Planejado" do Seu mês (RF-33)', () => {
  test('até 3 categorias, as mais usadas primeiro; só no mês atual e com planejado', () => {
    const card = buildPlannedCard({ month: '2026-09', today, categories, transactions, budgets })
    expect(card?.withinText).toBe('Você está dentro do planejado em 4 de 6 categorias.')
    expect(card?.lines.map((l) => l.name)).toEqual(['Transporte', 'Comer fora', 'Saúde'])
    expect(card?.lines.map((l) => l.adjustLabel)).toEqual([ADJUST, ADJUST, null])
    expect(buildPlannedCard({ month: '2026-08', today, categories, transactions, budgets })).toBeNull()
    expect(buildPlannedCard({ month: '2026-09', today, categories, transactions, budgets: [] })).toBeNull()
  })

  test('frase de abertura: a categoria dentro/perto com menos sobrando (protótipo: Saúde, R$ 90)', () => {
    const card = buildPlannedCard({ month: '2026-09', today, categories, transactions, budgets })
    expect(card?.leadText).toBe(`Você ainda tem ${brl('90')} para Saúde este mês.`)
  })

  test('frase de abertura: empate no que sobra vai por nome', () => {
    const cats = [
      { id: 'a', name: 'Zeta', defaultKey: null },
      { id: 'b', name: 'Alfa', defaultKey: null },
    ]
    const card = buildPlannedCard({ month: '2026-09', today, categories: cats, transactions: [], budgets: [budget('a', 10000), budget('b', 10000)] })
    expect(card?.leadText).toBe(`Você ainda tem ${brl('100')} para Alfa este mês.`)
  })

  test('frase de abertura: categoria exatamente no planejado (sobra 0) não abre a frase; vale a que ainda tem', () => {
    const cats = [
      { id: 'a', name: 'Alfa', defaultKey: null },
      { id: 'b', name: 'Beta', defaultKey: null },
    ]
    const tx = [row({ id: 'x1', categoryId: 'a', amountCents: 10000 }), row({ id: 'x2', categoryId: 'b', amountCents: 5000 })]
    const card = buildPlannedCard({ month: '2026-09', today, categories: cats, transactions: tx, budgets: [budget('a', 10000), budget('b', 20000)] })
    expect(card?.leadText).toBe(`Você ainda tem ${brl('150')} para Beta este mês.`)
  })

  test('frase de abertura: tudo exatamente no planejado, sem categoria com sobra nem que passou: sem frase', () => {
    const cats = [{ id: 'a', name: 'Alfa', defaultKey: null }]
    const tx = [row({ id: 'x1', categoryId: 'a', amountCents: 10000 })]
    const card = buildPlannedCard({ month: '2026-09', today, categories: cats, transactions: tx, budgets: [budget('a', 10000)] })
    expect(card).not.toBeNull()
    expect(card?.leadText).toBeNull()
  })

  test('frase de abertura: uma no planejado exato e outra que passou, abre com a que passou', () => {
    const cats = [
      { id: 'a', name: 'Alfa', defaultKey: null },
      { id: 'b', name: 'Beta', defaultKey: null },
    ]
    const tx = [row({ id: 'x1', categoryId: 'a', amountCents: 10000 }), row({ id: 'x2', categoryId: 'b', amountCents: 12000 })]
    const card = buildPlannedCard({ month: '2026-09', today, categories: cats, transactions: tx, budgets: [budget('a', 10000), budget('b', 10000)] })
    expect(card?.leadText).toBe(`Beta: Passou ${brl('20')} do planejado.`)
  })

  test('frase de abertura: se todas passaram, abre com a que mais passou, com o nome da categoria', () => {
    const cats = categories.filter((c) => ['c5', 'c4'].includes(c.id))
    const card = buildPlannedCard({ month: '2026-09', today, categories: cats, transactions, budgets: [budget('c5', 30000), budget('c4', 40000)] })
    expect(card?.leadText).toBe(`Transporte: Passou ${brl('80')} do planejado.`)
    expect(card?.withinText).toBe('Você está dentro do planejado em 0 de 2 categorias.')
  })
})

test('formulário: um campo por categoria, com o planejado atual e o foco na categoria pedida', () => {
  const v = buildPlanForm({ month: '2026-09', categories, budgets, focusCategoryId: 'c4' })
  expect(v.monthText).toBe('Setembro de 2026')
  expect(v.fields.map((f) => [f.categoryId, f.name, f.value, f.autoFocus])).toEqual([
    ['c3', 'Casa', '900,00', false],
    ['c1', 'Mercado', '1000,00', false],
    ['c5', 'Transporte', '300,00', false],
    ['c4', 'Comer fora', '400,00', true],
    ['c2', 'Saúde', '900,00', false],
    ['c6', 'Lazer', '300,00', false],
    ['c7', 'Outros', '', false],
  ])
})
