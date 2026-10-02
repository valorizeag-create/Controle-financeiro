import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'
import {
  buildExtrato, extratoHref, matchesQuery, normalizeText, parseExtratoFilters, type ExtratoFilters,
} from './view-model'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`,
  cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null, familyId: null, ...p,
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
const f = (p: Partial<ExtratoFilters> = {}): ExtratoFilters => ({ month: '2026-09', kind: null, categoryId: null, cardId: null, q: '', ...p })
const build = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions, cards: [], goals: [], movements: [] })
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
  test('busca pelos rótulos exibidos quando não há categoria/origem (fix round 1)', () => {
    const semCategoriaOuOrigem: TxRow[] = [
      row({ id: 'e1', kind: 'expense', amountCents: 1000, occurredOn: '2026-09-10', categoryId: null }),
      row({ id: 'i1', kind: 'income', amountCents: 2000, occurredOn: '2026-09-11', source: null }),
    ]
    const v = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions: semCategoriaOuOrigem, cards: [] })
    const idsOf = (filters: ExtratoFilters) => v(filters).groups.flatMap((g) => g.rows.map((r) => r.id))
    expect(idsOf(f({ q: 'outros' }))).toEqual(['e1'])
    expect(idsOf(f({ q: 'entrada' }))).toEqual(['i1'])
  })
})

describe('buildExtrato — metas da família', () => {
  const famGoal = (p: { deletedOn: string | null }) => ({
    id: 'fg1', name: 'Reforma', targetCents: 1000000, deadline: null, status: 'used' as const, usedOn: '2026-09-10', deletedOn: p.deletedOn, createdAt: '2026-07-01T12:00:00Z',
  })
  const input = (goals: ReturnType<typeof famGoal>[]) => ({
    filters: f(),
    today: '2026-09-22',
    categories: [],
    cards: [],
    goals,
    transactions: [row({ id: 'u1', kind: 'expense', amountCents: 5000, occurredOn: '2026-09-22', goalId: 'fg1', familyId: 'fam1' })],
    movements: [
      { id: 'm1', goalId: 'fg1', kind: 'withdraw' as const, amountCents: 3000, occurredOn: '2026-09-21', transactionId: null, createdAt: '2026-09-21T12:00:00Z' },
    ],
  })

  test('meta da família conhecida: dá nome e link às linhas da própria pessoa', () => {
    const rows = buildExtrato(input([famGoal({ deletedOn: null })])).groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.id === 'u1')).toMatchObject({ badge: 'pago com a meta Reforma', href: '/metas/fg1', family: true })
    expect(rows.find((r) => r.id === 'm1')).toMatchObject({ subtitle: 'Reforma', href: '/metas/fg1' })
  })

  test('meta da família excluída continua nomeada, sem link para a tela dela', () => {
    const rows = buildExtrato(input([famGoal({ deletedOn: '2026-09-22' })])).groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.id === 'u1')).toMatchObject({ badge: 'pago com a meta Reforma', href: '/metas' })
    expect(rows.find((r) => r.id === 'm1')).toMatchObject({ subtitle: 'Reforma', href: '/metas' })
  })

  test('nome que não pôde ser lido: sem selo solto "pago com a meta "', () => {
    const rows = buildExtrato(input([])).groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.id === 'u1')?.badge).toBeNull()
  })
})

describe('buildExtrato', () => {
  test('family é verdadeiro só para registro com familyId', () => {
    const v = buildExtrato({
      filters: f(),
      today: '2026-09-22',
      categories: [],
      cards: [],
      transactions: [
        row({ id: 'a', kind: 'expense', amountCents: 1000, occurredOn: '2026-09-22', familyId: 'fam1' }),
        row({ id: 'b', kind: 'expense', amountCents: 1000, occurredOn: '2026-09-22' }),
      ],
    })
    expect(Object.fromEntries(v.groups[0].rows.map((r) => [r.id, r.family]))).toEqual({ a: true, b: false })
  })
  test('agrupa pelo dia efetivo, do mais recente, com Hoje e Ontem', () => {
    const v = build(f())
    expect(v.monthLabel).toBe('setembro de 2026')
    expect(v.groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '19 de setembro', '5 de setembro'])
    expect(v.groups[0].rows.map((r) => r.id)).toEqual(['t2', 't1'])
    expect(v.groups[0].rows[1]).toEqual({ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230, href: '/extrato/t1', badge: null, family: false })
    expect(v.groups[3].rows[0]).toEqual({ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000, href: '/extrato/t4', badge: null, family: false })
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
      cards: [],
    })
    expect(v.groups).toEqual([])
    expect(v.empty).toBe('no-records')
  })
  test('não repete o nome da categoria como nota (revisão final do Plano 3)', () => {
    // Conta que se repete criada pelo Anotar sem nota: a nota da ocorrência
    // cai no nome da categoria ("Mercado"). Sem essa checagem o Extrato
    // mostraria "Mercado · Mercado".
    const v = buildExtrato({
      filters: f(), today, categories,
      transactions: [
        row({ id: 'r1', kind: 'expense', amountCents: 500, occurredOn: '2026-09-10', categoryId: MERCADO, note: 'Mercado' }),
        row({ id: 'r2', kind: 'expense', amountCents: 700, occurredOn: '2026-09-11', categoryId: MERCADO, note: '  mercado  ' }),
        row({ id: 'r3', kind: 'expense', amountCents: 900, occurredOn: '2026-09-12', categoryId: MERCADO, note: 'Feira' }),
      ],
      cards: [],
    })
    const rows = v.groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.id === 'r1')?.title).toBe('Mercado')
    expect(rows.find((r) => r.id === 'r2')?.title).toBe('Mercado')
    expect(rows.find((r) => r.id === 'r3')?.title).toBe('Mercado · Feira')
  })
})

const K1 = '44444444-4444-4444-8444-444444444444'
const cards = [{ id: K1, nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const }]
const withCards: TxRow[] = [
  row({ id: 'c1', kind: 'expense', amountCents: 12000, occurredOn: '2026-09-20', categoryId: MERCADO, cardId: K1 }),
  row({ id: 'c2', kind: 'expense', amountCents: 10000, occurredOn: '2026-09-10', categoryId: SAUDE, note: 'Óculos', cardId: K1, installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 5 }),
  row({ id: 'c3', kind: 'expense', amountCents: 18000, occurredOn: '2026-09-15', categoryId: SAUDE, note: 'Óculos', cardDeleted: true, installmentPlanId: 'p2' }),
  row({ id: 'c4', kind: 'expense', amountCents: 3000, occurredOn: '2026-09-12', categoryId: MERCADO, paymentMethod: 'pix' }),
]
const buildWith = (p: Partial<ExtratoFilters>) => buildExtrato({ filters: f(p), today, categories, transactions: withCards, cards })

describe('cartões e parcelas no Extrato (RF-60, RF-14)', () => {
  test('lê e escreve o filtro de cartão; cartão implica gastos', () => {
    expect(parseExtratoFilters({ cartao: K1, tipo: 'entradas' }, today)).toEqual(f({ kind: 'expense', cardId: K1 }))
    expect(parseExtratoFilters({ cartao: 'x' }, today)).toEqual(f())
    expect(extratoHref(f({ kind: 'expense', cardId: K1 }))).toBe(`/extrato?mes=2026-09&cartao=${K1}`)
    expect(extratoHref(f({ kind: 'expense', categoryId: MERCADO, cardId: K1, q: 'x' }))).toBe(`/extrato?mes=2026-09&categoria=${MERCADO}&cartao=${K1}&q=x`)
  })

  test('filtra pelo cartão; cartão desconhecido é ignorado', () => {
    const v = buildWith({ kind: 'expense', cardId: K1 })
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c1', 'c2'])
    expect(v.cardName).toBe('Nubank pessoal')
    const unknown = buildWith({ kind: 'expense', cardId: '55555555-5555-4555-8555-555555555555' })
    expect(unknown.filters.cardId).toBeNull()
    expect(unknown.cardName).toBeNull()
  })

  test('cada linha: cartão (ou "Cartão excluído", ou a forma), selo da parcela e link da compra (Review Focus 4)', () => {
    const rows = Object.fromEntries(buildWith({}).groups.flatMap((g) => g.rows).map((r) => [r.id, r]))
    expect(rows.c1).toMatchObject({ subtitle: 'Nubank pessoal', badge: null, href: '/extrato/c1' })
    expect(rows.c2).toMatchObject({ title: 'Saúde · Óculos', subtitle: 'Nubank pessoal', badge: 'parcela 2 de 5', href: '/extrato/parcelas/p1' })
    expect(rows.c3).toMatchObject({ subtitle: 'Cartão excluído', badge: 'restante das parcelas', href: '/extrato/parcelas/p2' })
    expect(rows.c4).toMatchObject({ subtitle: 'Pix', badge: null })
  })

  test('busca acha pelo apelido do cartão e por "Cartão excluído"', () => {
    expect(buildWith({ q: 'nubank' }).groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c1', 'c2'])
    expect(buildWith({ q: 'excluido' }).groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c3'])
  })
})

describe('metas no Extrato (protótipo, RN-01a)', () => {
  const goals: GoalRow[] = [
    { id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: null, status: 'used', usedOn: '2026-09-21', deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
    { id: 'g2', name: 'Reserva', targetCents: 100000, deadline: null, status: 'active', usedOn: null, deletedOn: '2026-09-20', createdAt: '2026-07-01T12:00:00Z' },
  ]
  const mv = (p: Pick<GoalMovementRow, 'id' | 'goalId' | 'kind' | 'amountCents' | 'occurredOn'> & Partial<GoalMovementRow>): GoalMovementRow => ({
    transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
  })
  const movements = [
    mv({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
    mv({ id: 'm2', goalId: 'g2', kind: 'withdraw', amountCents: 5000, occurredOn: '2026-09-20' }),
    mv({ id: 'm3', goalId: 'g1', kind: 'use', amountCents: 20000, occurredOn: '2026-09-21', transactionId: 'tg' }),
    mv({ id: 'm4', goalId: 'g1', kind: 'deposit', amountCents: 100, occurredOn: '2026-08-31' }),
  ]
  const withGoal = [row({ id: 'tg', kind: 'expense', amountCents: 23000, occurredOn: '2026-09-21', categoryId: MERCADO, goalId: 'g1', goalFundedCents: 20000 })]
  const buildGoals = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions: withGoal, cards: [], goals, movements })

  test('guardar e tirar aparecem; o gasto pago com meta leva a etiqueta e abre a meta', () => {
    const rows = buildGoals(f()).groups.flatMap((g) => g.rows)
    expect(rows.map((r) => [r.kind, r.title, r.subtitle, r.cents, r.href, r.badge])).toEqual([
      ['expense', 'Mercado', null, 23000, '/metas/g1', 'pago com a meta Viagem para Salvador'],
      ['goal', 'Tirado da meta', 'Reserva', 5000, '/metas', null],
      ['goal', 'Guardado na meta', 'Viagem para Salvador', 30000, '/metas/g1', null],
    ])
  })

  test('com filtro de tipo, categoria ou cartão, os movimentos saem; a busca acha pelo nome da meta', () => {
    for (const filters of [f({ kind: 'expense' }), f({ kind: 'income' }), f({ categoryId: MERCADO, kind: 'expense' })]) {
      expect(buildGoals(filters).groups.flatMap((g) => g.rows).some((r) => r.kind === 'goal')).toBe(false)
    }
    expect(buildGoals(f({ q: 'reserva' })).groups.flatMap((g) => g.rows.map((r) => r.title))).toEqual(['Tirado da meta'])
  })

  test('mês só com movimentos de meta não é "nenhum registro"', () => {
    const v = buildExtrato({ filters: f(), today, categories, transactions: [], cards: [], goals, movements })
    expect(v.empty).toBeNull()
  })
})
