import { z } from 'zod'
import { parseBRL } from '@/domain/money'
import { addDays, isValidISODate, type ISODate } from '@/domain/dates'

export const PAYMENT_METHODS = ['pix', 'cash', 'boleto', 'debit', 'credit', 'other'] as const

export function resolveWhen(when: string, date: string, today: ISODate): ISODate | null {
  if (when === 'today') return today
  if (when === 'yesterday') return addDays(today, -1)
  if (when === 'other' && isValidISODate(date)) return date
  return null
}

const amount = z.string().transform((raw, ctx) => {
  if (raw.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'Falta o valor.' })
    return z.NEVER
  }
  const cents = parseBRL(raw)
  if (cents === null) {
    ctx.addIssue({ code: 'custom', message: 'Esse valor não parece certo. Use apenas números.' })
    return z.NEVER
  }
  if (cents === 0) {
    ctx.addIssue({ code: 'custom', message: 'Falta o valor.' })
    return z.NEVER
  }
  return cents
})

const optionalText = (max: number) =>
  z.string().trim().max(max, { error: `Use até ${max} caracteres.` }).transform((s) => (s === '' ? null : s))

function withDate<T extends z.ZodRawShape>(shape: T, today: ISODate) {
  type ShapeOutput = z.output<z.ZodObject<T>>
  return z
    .object({ ...shape, when: z.string(), date: z.string() })
    .transform((raw, ctx) => {
      const v = raw as ShapeOutput & { when: string; date: string }
      const occurredOn = resolveWhen(v.when, v.date, today)
      if (!occurredOn) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Escolha o dia.' })
        return z.NEVER
      }
      const { when: _w, date: _d, ...rest } = v
      return { ...rest, occurredOn }
    })
}

export const makeExpenseSchema = (today: ISODate) =>
  withDate(
    {
      amount,
      categoryId: z.uuid({ error: 'Escolha uma categoria para esse gasto.' }),
      note: optionalText(140),
      paymentMethod: z
        .string()
        .transform((s) => (s === '' ? null : s))
        .pipe(z.enum(PAYMENT_METHODS).nullable()),
    },
    today,
  ).transform(({ amount: amountCents, ...rest }) => ({ amountCents, ...rest }))

export const makeIncomeSchema = (today: ISODate) =>
  withDate({ amount, source: optionalText(40) }, today).transform(({ amount: amountCents, ...rest }) => ({
    amountCents,
    ...rest,
  }))
