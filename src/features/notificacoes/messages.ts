import { z } from 'zod'
import { isValidISODate, monthOf } from '@/domain/dates'
import { isAllowedTarget, type NotificationKind } from '@/domain/notifications'
import { MAX_CENTS, formatBRL } from '@/domain/money'
import { monthName } from '@/domain/recurrence'
import { eventText } from '@/features/familia/view-model'

export const PUSH_TITLE = 'Íris'

export type PushMessage = { body: string; url: string; tag: string; pay: boolean }

const name = z.string().trim().min(1).max(60)
const id = z.string().uuid()
const isoDate = z.string().refine(isValidISODate)

const billSchema = z.object({ name, id, due_on: isoDate, family: z.boolean() })
const incomeSchema = z.object({ name, id, due_on: isoDate })
const budgetSchema = z.object({ name })
const goalSchema = z.object({ name, id, remaining_cents: z.number().int().min(1).max(MAX_CENTS) })
const summarySchema = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) })
const familySchema = z.object({
  event_kind: z.enum(['member_left', 'member_deleted']),
  member_name: z.string().nullable().optional(),
  goal_name: z.string().nullable().optional(),
  amount_cents: z.number().int().min(0).max(MAX_CENTS).nullable().optional(),
})

function build(kind: NotificationKind, params: unknown): PushMessage | null {
  switch (kind) {
    case 'bill_tomorrow':
    case 'bill_today': {
      const p = billSchema.parse(params)
      const url = p.family ? `/familia/contas?pagar=${p.id}` : `/contas?mes=${monthOf(p.due_on)}&pagar=${p.id}`
      const body = kind === 'bill_tomorrow' ? `${p.name} vence amanhã. Quer marcar como paga?` : `Hoje é o dia de ${p.name}.`
      return { body, url, tag: `bill-${p.id}`, pay: true }
    }
    case 'income_today': {
      const p = incomeSchema.parse(params)
      return { body: `Hoje é o dia de receber ${p.name}.`, url: `/contas?mes=${monthOf(p.due_on)}`, tag: `income-${p.id}`, pay: false }
    }
    case 'budget_near': {
      const p = budgetSchema.parse(params)
      return { body: `Você já usou boa parte do que planejou para ${p.name}.`, url: '/planejamento', tag: `budget-${p.name}`, pay: false }
    }
    case 'goal_near': {
      const p = goalSchema.parse(params)
      return { body: `Faltam só ${formatBRL(p.remaining_cents)} para ${p.name}.`, url: `/metas/${p.id}`, tag: `goal-${p.id}`, pay: false }
    }
    case 'month_summary': {
      const p = summarySchema.parse(params)
      return {
        body: `Seu mês de ${monthName(Number(p.month.slice(5)))} está fechado. Quer ver como foi?`,
        url: '/relatorios?periodo=mes-passado', tag: `summary-${p.month}`, pay: false,
      }
    }
    case 'daily_reminder':
      return { body: 'Teve algum gasto hoje? Leva só alguns segundos.', url: '/anotar', tag: 'daily', pay: false }
    case 'comeback':
      return { body: 'Seu mês continua aqui. Quer atualizar?', url: '/inicio', tag: 'comeback', pay: false }
    case 'family_event': {
      const p = familySchema.parse(params)
      const body = eventText({
        id: '', kind: p.event_kind, memberName: p.member_name ?? null, goalName: p.goal_name ?? null,
        amountCents: p.amount_cents ?? null, createdAt: '',
      })
      return { body, url: '/familia', tag: 'family', pay: false }
    }
  }
}

// null quando os dados não servem; nunca lança.
export function notificationMessage(kind: NotificationKind, params: unknown): PushMessage | null {
  try {
    const m = build(kind, params)
    return m && isAllowedTarget(m.url) ? m : null
  } catch {
    return null
  }
}
