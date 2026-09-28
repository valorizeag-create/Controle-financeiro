import { dayLabel, isInMonth, monthLabel, monthOf, parseMonthKey, type ISODate, type MonthKey } from '@/domain/dates'
import { formatBRL, type Cents } from '@/domain/money'
import { effectiveDate } from '@/domain/summary'
import { installmentBadge } from '@/domain/installments'
import type { Category, TxRow } from '@/features/registro/queries'
import { paymentText, type CardRow } from '@/features/cartoes/types'
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'

export type KindFilter = 'income' | 'expense' | null

export interface ExtratoFilters {
  month: MonthKey
  kind: KindFilter
  categoryId: string | null
  cardId: string | null
  q: string
}

export const MAX_QUERY_LENGTH = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SearchParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function parseExtratoFilters(sp: SearchParams, today: ISODate): ExtratoFilters {
  const categoria = first(sp.categoria)
  const tipo = first(sp.tipo)
  const cartao = first(sp.cartao)
  const categoryId = categoria && UUID.test(categoria) ? categoria : null
  const cardId = cartao && UUID.test(cartao) ? cartao : null
  // Categoria e cartão só existem em gastos: escolher um deles já filtra gastos.
  const kind: KindFilter = categoryId || cardId ? 'expense' : tipo === 'entradas' ? 'income' : tipo === 'gastos' ? 'expense' : null
  return {
    month: parseMonthKey(first(sp.mes)) ?? monthOf(today),
    kind,
    categoryId,
    cardId,
    q: (first(sp.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH),
  }
}

export function extratoParams(f: ExtratoFilters): Record<string, string> {
  const p: Record<string, string> = { mes: f.month }
  if (f.categoryId) p.categoria = f.categoryId
  else if (f.kind && !f.cardId) p.tipo = f.kind === 'income' ? 'entradas' : 'gastos'
  if (f.cardId) p.cartao = f.cardId
  if (f.q) p.q = f.q
  return p
}

export function extratoHref(f: ExtratoFilters): string {
  return `/extrato?${new URLSearchParams(extratoParams(f)).toString()}`
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Formas do mesmo valor que a pessoa pode digitar: "1.234,56", "1234,56", "1234.56".
function valueCandidates(cents: Cents): string[] {
  // formatBRL devolve "R$" + espaço não separável + número; \s cobre esse espaço.
  const grouped = formatBRL(cents).replace(/^R\$\s/, '')
  const plain = grouped.replace(/\./g, '')
  return [grouped, plain, plain.replace(',', '.')]
}

export function matchesQuery(texts: (string | null)[], cents: Cents, q: string): boolean {
  const tokens = normalizeText(q)
    .split(' ')
    .map((t) => t.replace(/^r\$/, ''))
    .filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = normalizeText(texts.filter((t): t is string => Boolean(t)).join(' '))
  const values = valueCandidates(cents)
  return tokens.every((t) => haystack.includes(t) || (/\d/.test(t) && values.some((v) => v.includes(t))))
}

export interface ExtratoRow {
  id: string
  kind: 'income' | 'expense' | 'goal'
  title: string
  subtitle: string | null
  cents: Cents
  href: string
  badge: string | null
}

// Movimentos que ganham uma linha própria no Extrato; "use" não entra (o gasto que ele gerou já aparece).
const GOAL_MOVEMENT_KINDS: ReadonlySet<GoalMovementRow['kind']> = new Set(['deposit', 'withdraw', 'return_on_exit'])

function goalHref(goalId: string, goalById: Map<string, GoalRow>): string {
  const goal = goalById.get(goalId)
  return goal && goal.deletedOn === null ? `/metas/${goalId}` : '/metas'
}

export interface ExtratoGroup {
  date: ISODate
  label: string
  rows: ExtratoRow[]
}

export type ExtratoEmpty = 'no-records' | 'no-results' | 'no-matches' | null

export interface ExtratoView {
  filters: ExtratoFilters
  monthLabel: string
  groups: ExtratoGroup[]
  empty: ExtratoEmpty
  categoryName: string | null
  cardName: string | null
}

export function buildExtrato(input: {
  filters: ExtratoFilters
  today: ISODate
  categories: Category[]
  transactions: TxRow[]
  cards: CardRow[]
  goals?: GoalRow[]
  movements?: GoalMovementRow[]
}): ExtratoView {
  const { today, categories, transactions, cards, goals = [], movements = [] } = input
  const nameOf = new Map(categories.map((c) => [c.id, c.name]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const categoryId = input.filters.categoryId && nameOf.has(input.filters.categoryId) ? input.filters.categoryId : null
  const cardId = input.filters.cardId && cardById.has(input.filters.cardId) ? input.filters.cardId : null
  const filters: ExtratoFilters = { ...input.filters, categoryId, cardId }

  const inMonth = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, filters.month)
  })

  const visible = inMonth.filter((t) => {
    if (filters.kind && t.kind !== filters.kind) return false
    if (categoryId && t.categoryId !== categoryId) return false
    if (cardId && t.cardId !== cardId) return false
    // A busca também precisa achar os rótulos que aparecem na linha (toRow): "Outros" e "Entrada".
    const displayedName = t.kind === 'income' ? (t.source ?? 'Entrada') : (nameOf.get(t.categoryId ?? '') ?? 'Outros')
    const payment = t.kind === 'expense' ? paymentText(t, cards) : null
    return matchesQuery([displayedName, t.note, payment], t.amountCents, filters.q)
  })

  // Linhas de "Guardado na meta"/"Tirado da meta": só aparecem sem filtro de tipo, categoria ou
  // cartão (não fazem sentido misturadas a esses filtros, que são de registros).
  const movementsInMonth = movements.filter((m) => GOAL_MOVEMENT_KINDS.has(m.kind) && isInMonth(m.occurredOn, filters.month))
  const hasNarrowingFilter = Boolean(filters.kind || categoryId || cardId)
  const visibleMovements = hasNarrowingFilter
    ? []
    : movementsInMonth.filter((m) => {
        const title = m.kind === 'deposit' ? 'Guardado na meta' : 'Tirado da meta'
        const goalName = goalById.get(m.goalId)?.name ?? null
        return matchesQuery([title, goalName], m.amountCents, filters.q)
      })

  type Item = { date: ISODate; createdAt: string; id: string; row: ExtratoRow }
  const txItems: Item[] = visible.map((t) => ({ date: effectiveDate(t)!, createdAt: t.createdAt, id: t.id, row: toRow(t, nameOf, cards, goalById) }))
  const movementItems: Item[] = visibleMovements.map((m) => ({ date: m.occurredOn, createdAt: m.createdAt, id: m.id, row: toGoalRow(m, goalById) }))

  const sorted = [...txItems, ...movementItems].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    const byCreation = b.createdAt.localeCompare(a.createdAt)
    if (byCreation !== 0) return byCreation
    return a.id.localeCompare(b.id)
  })

  const groups: ExtratoGroup[] = []
  for (const item of sorted) {
    let group = groups[groups.length - 1]
    if (!group || group.date !== item.date) {
      group = { date: item.date, label: dayLabel(item.date, today), rows: [] }
      groups.push(group)
    }
    group.rows.push(item.row)
  }

  const empty: ExtratoEmpty =
    sorted.length > 0
      ? null
      : filters.q
        ? 'no-results'
        : inMonth.length === 0 && movementsInMonth.length === 0
          ? 'no-records'
          : 'no-matches'

  return {
    filters,
    monthLabel: monthLabel(filters.month),
    groups,
    empty,
    categoryName: categoryId ? (nameOf.get(categoryId) ?? null) : null,
    cardName: cardId ? (cardById.get(cardId)?.nickname ?? null) : null,
  }
}

function toRow(t: TxRow, nameOf: Map<string, string>, cards: CardRow[], goalById: Map<string, GoalRow>): ExtratoRow {
  if (t.kind === 'income') {
    return { id: t.id, kind: 'income', title: t.source ?? 'Entrada', subtitle: null, cents: t.amountCents, href: `/extrato/${t.id}`, badge: null }
  }
  const category = nameOf.get(t.categoryId ?? '') ?? 'Outros'
  // Contas que se repetem criadas pelo Anotar sem nota guardam o nome da
  // categoria como nota (regra de negócio da recorrência); sem esta checagem
  // o Extrato mostraria "Mercado · Mercado".
  const hasNote = t.note && normalizeText(t.note) !== normalizeText(category)
  const title = hasNote ? `${category} · ${t.note}` : category
  const subtitle = paymentText(t, cards)
  // Gasto pago com uma meta (RN-01a): a etiqueta substitui a de parcela e o link leva à meta.
  if (t.goalId) {
    return {
      id: t.id,
      kind: 'expense',
      title,
      subtitle,
      cents: t.amountCents,
      href: goalHref(t.goalId, goalById),
      badge: `pago com a meta ${goalById.get(t.goalId)?.name ?? ''}`,
    }
  }
  const badge = t.installmentPlanId
    ? t.installmentNumber !== null && t.installmentCount !== null
      ? installmentBadge(t.installmentNumber, t.installmentCount)
      : 'restante das parcelas'
    : null
  const href = t.installmentPlanId ? `/extrato/parcelas/${t.installmentPlanId}` : `/extrato/${t.id}`
  return { id: t.id, kind: 'expense', title, subtitle, cents: t.amountCents, href, badge }
}

function toGoalRow(m: GoalMovementRow, goalById: Map<string, GoalRow>): ExtratoRow {
  return {
    id: m.id,
    kind: 'goal',
    title: m.kind === 'deposit' ? 'Guardado na meta' : 'Tirado da meta',
    subtitle: goalById.get(m.goalId)?.name ?? null,
    cents: m.amountCents,
    href: goalHref(m.goalId, goalById),
    badge: null,
  }
}
