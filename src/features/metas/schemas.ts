import { z } from 'zod'
import { amountField } from '@/features/registro/schemas'
import { MAX_GOAL_NAME } from '@/domain/goals'
import { monthOf, parseMonthKey, type ISODate, type MonthKey } from '@/domain/dates'

export const GOAL_MESSAGES = { deadline: 'Escolha um mês a partir de agora.' } as const

const MAX_DEADLINE: MonthKey = '2099-12'
const MIN_DEADLINE_EDIT: MonthKey = '2000-01'

const nameField = z.string().trim().min(1, { error: 'Falta o nome.' }).max(MAX_GOAL_NAME, { error: 'Use até 40 caracteres.' })

function deadlineField(minMonth: MonthKey) {
  return z.string().transform((raw, ctx) => {
    if (raw.trim() === '') return null
    const key = parseMonthKey(raw)
    if (key === null || key < minMonth || key > MAX_DEADLINE) {
      ctx.addIssue({ code: 'custom', message: GOAL_MESSAGES.deadline })
      return z.NEVER
    }
    return key
  })
}

export function makeGoalSchema(today: ISODate, mode: 'create' | 'edit' = 'create') {
  const minMonth = mode === 'create' ? monthOf(today) : MIN_DEADLINE_EDIT
  return z
    .object({
      name: nameField,
      target: amountField,
      deadline: deadlineField(minMonth),
    })
    .transform(({ name, target, deadline }) => ({ name, targetCents: target, deadline }))
}

export function makeUseSchema() {
  return z
    .object({
      amount: amountField,
      categoryId: z.uuid({ error: 'Escolha uma categoria para esse gasto.' }),
    })
    .transform(({ amount, categoryId }) => ({ amountCents: amount, categoryId }))
}
