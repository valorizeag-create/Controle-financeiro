import { goalBalance, goalProgress, monthlySuggestion } from '@/domain/goals'
import { formatBRL, formatWholeBRL, type Cents } from '@/domain/money'
import { dayMonthLabel, dayMonthYearLabel, monthLabel, shortMonthLabel, type ISODate } from '@/domain/dates'
import { monthName } from '@/domain/recurrence'
import { normalizeText } from '@/features/extrato/view-model'
import type { FamilyGoalRow } from '@/features/familia/types'
import type { GoalMovementRow, GoalRow } from './types'

export interface GoalSummary {
  goal: GoalRow
  balanceCents: Cents
  percent: number
  remainingCents: Cents
  complete: boolean
  remainingText: string | null
  shortRemaining: string
  deadlineShort: string
  suggestion: { untilLabel: string; perMonth: string } | null
}

// `totalCents` é para a meta da família: o total de todos (A4 B); sem ele, o saldo vem dos movimentos de quem pede.
export function summarizeGoal(goal: GoalRow, movements: GoalMovementRow[], today: ISODate, totalCents?: Cents): GoalSummary {
  const own = movements.filter((m) => m.goalId === goal.id)
  const balanceCents = totalCents ?? goalBalance(own)
  const { percent, remainingCents, complete } = goalProgress(balanceCents, goal.targetCents)

  const remainingText = complete ? null : `Faltam ${formatBRL(remainingCents)} para ${goal.name}.`
  const shortRemaining = complete ? 'Meta completa' : `Faltam ${formatBRL(remainingCents)}`
  const deadlineShort = goal.deadline ? `até ${shortMonthLabel(goal.deadline)}` : 'sem prazo'

  const suggestionCents =
    goal.status === 'active' && !complete ? monthlySuggestion({ remainingCents, deadline: goal.deadline, today }) : null
  const suggestion =
    suggestionCents !== null && goal.deadline !== null
      ? { untilLabel: monthLabel(goal.deadline), perMonth: `${formatWholeBRL(suggestionCents)} por mês` }
      : null

  return { goal, balanceCents, percent, remainingCents, complete, remainingText, shortRemaining, deadlineShort, suggestion }
}

export interface MetasView {
  totalCents: Cents
  active: GoalSummary[]
  family: { id: string; name: string; percent: number; remainingCents: Cents; myPartCents: Cents }[]
  concluded: { id: string; name: string; caption: string }[]
  empty: boolean
}

export function buildMetas(input: {
  goals: GoalRow[]
  movements: GoalMovementRow[]
  today: ISODate
  familyGoals?: FamilyGoalRow[]
}): MetasView {
  const { goals, movements, today, familyGoals = [] } = input
  const familyAlive = familyGoals.filter((g) => g.deletedOn === null)
  const notDeleted = goals.filter((g) => g.deletedOn === null)
  const currentYear = today.slice(0, 4)

  // Inclui a parte da própria pessoa nas metas da família (decisão 104): os movimentos são só dela.
  const totalCents = [...notDeleted, ...familyAlive].reduce(
    (sum, g) => sum + goalBalance(movements.filter((m) => m.goalId === g.id)),
    0,
  )

  const active = notDeleted.filter((g) => g.status === 'active').map((g) => summarizeGoal(g, movements, today))

  const family = familyAlive
    .filter((g) => g.status === 'active')
    .map((g) => {
      const { percent, remainingCents } = goalProgress(g.savedCents, g.targetCents)
      return {
        id: g.id,
        name: g.name,
        percent,
        remainingCents,
        myPartCents: goalBalance(movements.filter((m) => m.goalId === g.id)),
      }
    })

  const concluded = [...notDeleted, ...familyAlive]
    .filter((g) => g.status === 'used')
    .sort((a, b) => (a.usedOn! < b.usedOn! ? 1 : a.usedOn! > b.usedOn! ? -1 : 0))
    .map((g) => {
      const usedOn = g.usedOn!
      const label = usedOn.slice(0, 4) === currentYear ? monthName(Number(usedOn.slice(5, 7))) : monthLabel(usedOn.slice(0, 7))
      return { id: g.id, name: g.name, caption: `${g.name} · usada em ${label}` }
    })

  return { totalCents, active, family, concluded, empty: notDeleted.length === 0 && familyAlive.length === 0 }
}

export interface GoalHistoryItem {
  id: string
  label: 'Guardou' | 'Tirou' | 'Usou'
  dateLabel: string
  amountText: string
  positive: boolean
  transactionId: string | null
}

export interface GoalDetailView {
  summary: GoalSummary
  state: 'active' | 'complete' | 'used'
  celebration: string | null
  usedText: string | null
  balanceText: string
  canDeposit: boolean
  canWithdraw: boolean
  canUse: boolean
  history: GoalHistoryItem[]
}

export interface FamilyGoalDetailView extends GoalDetailView {
  myPartCents: Cents
}

function historyLabel(kind: GoalMovementRow['kind']): GoalHistoryItem['label'] {
  if (kind === 'deposit') return 'Guardou'
  if (kind === 'use') return 'Usou'
  return 'Tirou'
}

export function buildGoalDetail(input: { goal: GoalRow; movements: GoalMovementRow[]; today: ISODate }): GoalDetailView {
  const { goal, movements, today } = input
  const own = movements.filter((m) => m.goalId === goal.id)
  const summary = summarizeGoal(goal, movements, today)

  const state: GoalDetailView['state'] = goal.status === 'used' ? 'used' : summary.complete ? 'complete' : 'active'
  const celebration = state === 'complete' ? `Você chegou lá. ${goal.name} está completa.` : null
  const usedText = state === 'used' ? `Usada em ${dayMonthYearLabel(goal.usedOn!)}.` : null
  const balanceText = `Você tem ${formatBRL(summary.balanceCents)} guardados em ${goal.name}.`

  const canDeposit = goal.status === 'active'
  const canWithdraw = summary.balanceCents > 0
  const canUse = goal.status === 'active' && summary.balanceCents > 0

  const currentYear = today.slice(0, 4)
  const dateLabel = (d: ISODate) => (d.slice(0, 4) === currentYear ? dayMonthLabel(d) : dayMonthYearLabel(d))

  const history: GoalHistoryItem[] = own.map((m) => {
    const positive = m.kind === 'deposit'
    return {
      id: m.id,
      label: historyLabel(m.kind),
      dateLabel: dateLabel(m.occurredOn),
      amountText: `${positive ? '+' : '−'} ${formatBRL(m.amountCents)}`,
      positive,
      transactionId: m.kind === 'use' ? m.transactionId : null,
    }
  })

  return { summary, state, celebration, usedText, balanceText, canDeposit, canWithdraw, canUse, history }
}

// Meta da família (A4 B): o resumo mostra o total de todos; o histórico e "Sua parte" são só da pessoa.
// Tirar vale na parte própria, mesmo com a meta usada (a sobra de cada um, RN-22c); usar é decisão do administrador (a tela confere o papel).
export function buildFamilyGoalDetail(input: {
  goal: FamilyGoalRow
  movements: GoalMovementRow[]
  today: ISODate
}): FamilyGoalDetailView {
  const { goal, movements, today } = input
  const base = buildGoalDetail({ goal, movements, today })
  const own = movements.filter((m) => m.goalId === goal.id)
  const summary = summarizeGoal(goal, own, today, goal.savedCents)
  const myPartCents = goalBalance(own)
  const state: GoalDetailView['state'] = goal.status === 'used' ? 'used' : summary.complete ? 'complete' : 'active'
  return {
    ...base,
    summary,
    state,
    celebration: state === 'complete' ? `Você chegou lá. ${goal.name} está completa.` : null,
    canWithdraw: myPartCents > 0,
    canUse: goal.status === 'active' && goal.savedCents > 0,
    myPartCents,
  }
}

function compareFeatured(a: GoalSummary, b: GoalSummary): number {
  if (a.percent !== b.percent) return b.percent - a.percent
  const ad = a.goal.deadline
  const bd = b.goal.deadline
  if (ad !== bd) {
    if (ad === null) return 1
    if (bd === null) return -1
    return ad < bd ? -1 : 1
  }
  return a.goal.createdAt < b.goal.createdAt ? -1 : a.goal.createdAt > b.goal.createdAt ? 1 : 0
}

export function pickFeatured(summaries: GoalSummary[]): GoalSummary | null {
  const candidates = summaries.filter((s) => s.goal.status === 'active' && !s.complete)
  if (candidates.length === 0) return null
  return [...candidates].sort(compareFeatured)[0]
}

export interface GoalFundedExpenseView {
  title: string
  amountCents: Cents
  payment: string | null
  badge: string
  notice: string
}

// M-3: o gasto pago com a meta abre a própria meta (decisão 66); quando a
// meta foi excluída não há mais tela dela, então o Extrato mostra o gasto
// aqui mesmo, só para ver — nunca editado nem excluído (o vínculo com o uso
// precisa continuar batendo, RNF-11).
export function buildGoalFundedExpense(input: {
  categoryName: string
  note: string | null
  amountCents: Cents
  payment: string | null
  goalName: string
}): GoalFundedExpenseView {
  const { categoryName, note, amountCents, payment, goalName } = input
  const hasNote = Boolean(note) && normalizeText(note!) !== normalizeText(categoryName)
  const title = hasNote ? `${categoryName} · ${note}` : categoryName
  return {
    title,
    amountCents,
    payment,
    badge: `pago com a meta ${goalName}`,
    notice: `A meta ${goalName} foi excluída. Este gasto continua no seu histórico, mas não pode ser editado nem excluído.`,
  }
}
