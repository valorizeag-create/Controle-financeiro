import { spendingByCategory } from '@/domain/breakdown'
import { dayLabel, isInMonth, monthLabel, monthOf, type ISODate, type MonthKey } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { dueText } from '@/domain/recurrence'
import { effectiveDate, summarizeMonth, type MonthSummary } from '@/domain/summary'
import { txName } from '@/features/contas/view-model'
import { pickFeatured, summarizeGoal } from '@/features/metas/view-model'
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'
import type { Category, Profile, TxRow } from '@/features/registro/queries'
import { buildPlannedCard, type PlannedCardView } from '@/features/planejamento/view-model'
import type { BudgetRow } from '@/features/planejamento/types'

export interface SeuMesView {
  month: MonthKey
  label: string
  isCurrentMonth: boolean
  summary: MonthSummary
  biggest: { name: string; cents: number } | null
  categories: { name: string; cents: number; share: number }[]
  recent: { id: string; title: string; subtitle: string; cents: number; kind: 'income' | 'expense' }[]
  upcoming: { id: string; name: string; amountCents: number; dueText: string }[]
  planned: PlannedCardView | null
  featured: { id: string; name: string; percent: number; remainingText: string; caption: string; guardarHref: string } | null
}

export function buildSeuMes(input: {
  month: MonthKey
  today: ISODate
  profile: Profile
  categories: Category[]
  transactions: TxRow[]
  goals: GoalRow[]
  goalMovements: GoalMovementRow[]
  budgets: BudgetRow[]
}): SeuMesView {
  const { month, today, profile, categories, transactions, goals, goalMovements, budgets } = input
  const nameOf = new Map(categories.map((c) => [c.id, c.name]))

  const summary = summarizeMonth({
    month,
    today,
    initialBalanceCents: profile.initialBalanceCents,
    transactions,
    goalMovements,
  })

  const totals = spendingByCategory(transactions, month)
  const top = totals[0]?.cents ?? 0
  const cats = totals.map((t) => ({ name: nameOf.get(t.categoryId) ?? 'Outros', cents: t.cents, share: top ? t.cents / top : 0 }))

  const monthTx = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, month)
  })

  const recent = [...monthTx]
    .sort((a, b) => {
      const dateDiff = effectiveDate(b)!.localeCompare(effectiveDate(a)!)
      if (dateDiff !== 0) return dateDiff
      return b.createdAt.localeCompare(a.createdAt)
    })
    .slice(0, 3)
    .map((t) => ({
      id: t.id,
      title: t.kind === 'income' ? t.source ?? 'Entrada' : nameOf.get(t.categoryId ?? '') ?? 'Outros',
      subtitle: dayLabel(effectiveDate(t)!, today),
      cents: t.amountCents,
      kind: t.kind,
    }))

  const isCurrentMonth = month === monthOf(today)
  const upcoming = isCurrentMonth
    ? transactions
        .filter((t): t is TxRow & { dueOn: ISODate } => t.kind === 'expense' && t.status === 'pending' && t.dueOn !== null && monthOf(t.dueOn) <= month)
        // Mesmo dia de vencimento: ordem estável por nome e, por fim, por id.
        .sort((a, b) => {
          if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
          const nameA = txName(a, categories)
          const nameB = txName(b, categories)
          if (nameA !== nameB) return nameA < nameB ? -1 : 1
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        })
        .slice(0, 3)
        .map((t) => ({ id: t.id, name: txName(t, categories), amountCents: t.amountCents, dueText: dueText(t.dueOn, today) }))
    : []

  const featured = isCurrentMonth
    ? (() => {
        const summaries = goals.filter((g) => g.deletedOn === null).map((g) => summarizeGoal(g, goalMovements, today))
        const pick = pickFeatured(summaries)
        if (!pick) return null
        const caption =
          `${formatBRL(pick.balanceCents)} de ${formatBRL(pick.goal.targetCents)}` +
          (pick.goal.deadline ? ` · até ${monthLabel(pick.goal.deadline)}` : '')
        return {
          id: pick.goal.id,
          name: pick.goal.name,
          percent: pick.percent,
          remainingText: pick.remainingText!,
          caption,
          guardarHref: `/metas/${pick.goal.id}/guardar`,
        }
      })()
    : null

  return {
    month,
    label: monthLabel(month),
    isCurrentMonth,
    summary,
    biggest: cats[0] ? { name: cats[0].name, cents: cats[0].cents } : null,
    categories: cats,
    recent,
    upcoming,
    planned: buildPlannedCard({ month, today, categories, transactions, budgets }),
    featured,
  }
}
