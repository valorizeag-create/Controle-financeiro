import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import {
  buildExtrato, extratoHref, matchesQuery, normalizeText, parseExtratoFilters, type ExtratoFilters,
} from './view-model'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

const MERCADO = '11111111-1111-4111-8111-111111111111'
const SAUDE = '22222222-2222-4222-8222-222222222222'
const categories = [
  { id: MERCADO, name: 'Mercado', defaultKey: 'mercado' },
  { id: SAUDE, name: 'Saúde', defaultKey: 'saude' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Outros', defaultKey: 'outros' },
]
const today = '2026-09-22'
const transactions: TxRow[] = [
  row({ id: 't1', kind: 'expense', amountCents: 14230, occurredOn: '2026-09-22', categoryId: MERCADO, note: 'feira', paymentMethod: 'pix', createdAt: '2026-09-22T10:00:00Z' }),
  row({ id: 't2', kind: 'expense', amountCents: 123456, occurredOn: '2026-09-22', categoryId: SAUDE, createdAt: '2026-09-22T15:00:00Z' }),
  row({ id: 't3', kind: 'expense', amountCents: 3800, occurredOn: '2026-09-21', categoryId: MERCADO, note: 'Café' }),
  row({ id: 't4', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
  row({ id: 't5', kind: 'expense', amountCents: 5000, occurredOn: '2026-08-30', categoryId: MERCADO }),
  row({ id: 't6', kind: 'expense', amountCents: 20000, occurredOn: '2026-08-25', paidOn: '2026-09-19', categoryId: SAUDE }),
]
const f = (p: Partial<ExtratoFilters> = {}): ExtratoFilters => ({ month: '2026-09', kind: null, categoryId: null, q: '', ...p })
const build = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions })
const ids = (filters: ExtratoFilters) => build(filters).groups.flatMap((g) => g.rows.map((r) => r.id))

describe('parseExtratoFilters', () => {
  test('lê mês, tipo, categoria e busca; o que é inválido vira o padrão', () => {
    expect(parseExtratoFilters({}, today)).toEqual(f())
    expect(parseExtratoFilters({ mes: '2026-08', tipo: 'entradas', q: '  café ' }, today)).toEqual(f({ month: '2026-08', kind: 'income', q: 'café' }))
    expect(parseExtratoFilters({ mes: '1999-01', tipo: 'x', categoria: 'nao-e-id' }, today)).toEqual(f())
    expect(parseExtratoFilters({ tipo: 'gastos' }, today)).toEqual(f({ kind: 'expense' }))
  })
  test('categoria implica gastos e vence o tipo', () => {
    expect(parseExtratoFilters({ categoria: MERCADO, tipo: 'entradas' }, today)).toEqual(f({ kind: 'expense', categoryId: MERCADO }))
  })
  test('busca longa é cortada e parâmetro repetido usa o primeiro', () => {
    expect(parseExtratoFilters({ q: 'a'.repeat(80) }, today).q).toHaveLength(60)
    expect(parseExtratoFilters({ mes: ['2026-07', '2026-08'] }, today).month).toBe('2026-07')
  })
})

describe('extratoHref', () => {
  test('monta o endereço só com o necessário', () => {
    expect(extratoHref(f())).toBe('/extrato?mes=2026-09')
    expect(extratoHref(f({ kind: 'income', q: 'café' }))).toBe('/extrato?mes=2026-09&tipo=entradas&q=caf%C3%A9')
    expect(extratoHref(f({ kind: 'expense', categoryId: MERCADO }))).toBe(`/extrato?mes=2026-09&categoria=${MERCADO}`)
  })
  test('ida e volta: o endereço reproduz os mesmos filtros', () => {
    const original = f({ kind: 'expense', categoryId: MERCADO, q: 'feira' })
    const sp = Object.fromEntries(new URL(extratoHref(original), 'http://x').searchParams)
    expect(parseExtratoFilters(sp, today)).toEqual(original)
  })
})

describe('busca (Review Focus 1)', () => {
  test('ignora acento, maiúsculas e espaços', () => {
    expect(normalizeText('  Saúde   E  CAFÉ ')).toBe('saude e cafe')
    expect(matchesQuery(['Saúde', null], 100, 'saude')).toBe(true)
    expect(matchesQuery(['Mercado', 'Café'], 100, 'MERCADO cafe')).toBe(true)
    expect(matchesQuery(['Mercado', 'feira'], 100, 'mercado pix')).toBe(false)
  })
  test('encontra pelo valor, inteiro ou em parte, com vírgula, ponto, milhar ou R$', () => {
    expect(matchesQuery([], 14230, '142,30')).toBe(true)
    expect(matchesQuery([], 14230, '142,3')).toBe(true)
    expect(matchesQuery([], 14230, '142')).toBe(true)
    expect(matchesQuery([], 14230, 'R$ 142,30')).toBe(true)
    expect(matchesQuery([], 14230, 'r$142')).toBe(true)
    expect(matchesQuery([], 123456, '1.234,56')).toBe(true)
    expect(matchesQuery([], 123456, '1234,56')).toBe(true)
    expect(matchesQuery([], 123456, '1234.56')).toBe(true)
    expect(matchesQuery([], 14230, '999')).toBe(false)
  })
  test('busca vazia encontra tudo', () => {
    expect(matchesQuery(['Mercado'], 14230, '')).toBe(true)
    expect(matchesQuery(['Mercado'], 14230, '   ')).toBe(true)
  })
  test('no Extrato: nome, nota, origem, forma de pagamento e valor', () => {
    expect(ids(f({ q: 'saude' }))).toEqual(['t2', 't6'])
    expect(ids(f({ q: 'FEIRA' }))).toEqual(['t1'])
    expect(ids(f({ q: 'salario' }))).toEqual(['t4'])
    expect(ids(f({ q: 'pix' }))).toEqual(['t1'])
    expect(ids(f({ q: '1.234' }))).toEqual(['t2'])
    expect(ids(f({ q: 'cafe' }))).toEqual(['t3'])
  })
})

describe('buildExtrato', () => {
  test('agrupa pelo dia efetivo, do mais recente, com Hoje e Ontem', () => {
    const v = build(f())
    expect(v.monthLabel).toBe('setembro de 2026')
    expect(v.groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '19 de setembro', '5 de setembro'])
    expect(v.groups[0].rows.map((r) => r.id)).toEqual(['t2', 't1'])
    expect(v.groups[0].rows[1]).toEqual({ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230 })
    expect(v.groups[3].rows[0]).toEqual({ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000 })
    expect(v.empty).toBeNull()
  })
  test('conta paga com atraso aparece no dia em que foi paga (A1)', () => {
    const v = build(f())
    expect(v.groups.find((g) => g.date === '2026-09-19')?.rows.map((r) => r.id)).toEqual(['t6'])
    expect(ids(f({ month: '2026-08' }))).toEqual(['t5'])
  })
  test('filtra entradas, gastos e categoria', () => {
    expect(ids(f({ kind: 'income' }))).toEqual(['t4'])
    expect(ids(f({ kind: 'expense' }))).toEqual(['t2', 't1', 't3', 't6'])
    const v = build(f({ kind: 'expense', categoryId: MERCADO }))
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['t1', 't3'])
    expect(v.categoryName).toBe('Mercado')
  })
  test('busca vale dentro do mês escolhido', () => {
    expect(ids(f({ q: 'mercado' }))).toEqual(['t1', 't3'])
    expect(ids(f({ month: '2026-08', q: 'mercado' }))).toEqual(['t5'])
  })
  test('categoria que não é da pessoa é ignorada', () => {
    const v = build(f({ kind: 'expense', categoryId: '99999999-9999-4999-8999-999999999999' }))
    expect(v.filters.categoryId).toBeNull()
    expect(v.categoryName).toBeNull()
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['t2', 't1', 't3', 't6'])
  })
  test('estados vazios: sem registros, busca sem resultado e filtro sem resultado', () => {
    expect(build(f({ month: '2026-10' })).empty).toBe('no-records')
    expect(build(f({ q: 'xyz' })).empty).toBe('no-results')
    expect(build(f({ month: '2026-10', q: 'xyz' })).empty).toBe('no-results')
    expect(build(f({ month: '2026-08', kind: 'income' })).empty).toBe('no-matches')
  })
  test('registro pendente (conta a pagar, Plano 3) não aparece', () => {
    const v = buildExtrato({
      filters: f(), today, categories,
      transactions: [row({ id: 'p1', kind: 'expense', amountCents: 100, occurredOn: '2026-09-10', dueOn: '2026-09-10', status: 'pending', categoryId: MERCADO })],
    })
    expect(v.groups).toEqual([])
    expect(v.empty).toBe('no-records')
  })
})
