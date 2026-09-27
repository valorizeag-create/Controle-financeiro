import { z } from 'zod'
import { amountField } from '@/features/registro/schemas'
import type { Frequency } from '@/domain/recurrence'

const nameField = z.string().trim().min(1, { error: 'Falta o nome.' }).max(40, { error: 'Use até 40 caracteres.' })

const dayField = z
  .string()
  .transform((raw, ctx) => {
    if (!/^\d{1,2}$/.test(raw)) {
      ctx.addIssue({ code: 'custom', message: 'Escolha o dia.' })
      return z.NEVER
    }
    const n = Number(raw)
    if (n < 1 || n > 31) {
      ctx.addIssue({ code: 'custom', message: 'Escolha o dia.' })
      return z.NEVER
    }
    return n
  })

const optionalSource = (max: number) =>
  z.string().trim().max(max, { error: `Use até ${max} caracteres.` }).transform((s) => (s === '' ? null : s))

export const billSchema = z
  .object({
    name: nameField,
    amount: amountField,
    categoryId: z.uuid({ error: 'Escolha uma categoria para esse gasto.' }),
    frequency: z.enum(['monthly', 'yearly']).catch('monthly'),
    dueDay: dayField,
    dueMonth: z.string(),
  })
  .transform((raw, ctx) => {
    let dueMonth: number | null = null
    if (raw.frequency === 'yearly') {
      const n = Number(raw.dueMonth)
      if (!/^\d{1,2}$/.test(raw.dueMonth) || n < 1 || n > 12) {
        ctx.addIssue({ code: 'custom', path: ['dueMonth'], message: 'Escolha o mês.' })
        return z.NEVER
      }
      dueMonth = n
    }
    return {
      name: raw.name,
      amountCents: raw.amount,
      categoryId: raw.categoryId,
      frequency: raw.frequency as Frequency,
      dueDay: raw.dueDay,
      dueMonth,
    }
  })

export function makeRecurrenceEditSchema(kind: 'income' | 'expense') {
  const shape =
    kind === 'income'
      ? { name: nameField, amount: amountField, source: optionalSource(40), dueDay: dayField }
      : { name: nameField, amount: amountField, categoryId: z.uuid({ error: 'Escolha uma categoria para esse gasto.' }), dueDay: dayField }

  return z.object(shape).transform((raw) => ({
    name: raw.name,
    amountCents: raw.amount,
    categoryId: kind === 'expense' ? (raw as { categoryId: string }).categoryId : null,
    source: kind === 'income' ? (raw as { source: string | null }).source : null,
    dueDay: raw.dueDay,
  }))
}
