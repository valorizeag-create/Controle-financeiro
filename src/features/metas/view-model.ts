import { goalBalance, goalProgress, monthlySuggestion } from '@/domain/goals'
import { formatBRL, formatWholeBRL, type Cents } from '@/domain/money'
import { dayMonthLabel, dayMonthYearLabel, monthLabel, shortMonthLabel, type ISODate } from '@/domain/dates'
import { monthName } from '@/domain/recurrence'
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

export function summarizeGoal(goal: GoalRow, movements: GoalMovementRow[], today: ISODate): GoalSummary {
  const own = movements.filter((m) => m.goalId === goal.id)
  const balanceCents = goalBalance(own)
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
  concluded: { id: string; name: string; caption: string }[]
  empty: boolean
}

export function buildMetas(input: { goals: GoalRow[]; movements: GoalMovementRow[]; today: ISODate }): MetasView {
  const { goals, movements, today } = input
  const notDeleted = goals.filter((g) => g.deletedOn === null)
  const currentYear = today.slice(0, 4)

  const totalCents = notDeleted.reduce(
    (sum, g) => sum + goalBalance(movements.filter((m) => m.goalId === g.id)),
    0,
  )

  const active = notDeleted.filter((g) => g.status === 'active').map((g) => summarizeGoal(g, movements, today))

  const concluded = notDeleted
    .filter((g) => g.status === 'used')
    .sort((a, b) => (a.usedOn! < b.usedOn! ? 1 : a.usedOn! > b.usedOn! ? -1 : 0))
    .map((g) => {
      const usedOn = g.usedOn!
      const label = usedOn.slice(0, 4) === currentYear ? monthName(Number(usedOn.slice(5, 7))) : monthLabel(usedOn.slice(0, 7))
      return { id: g.id, name: g.name, caption: `${g.name} · usada em ${label}` }
    })

  return { totalCents, active, concluded, empty: notDeleted.length === 0 }
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
