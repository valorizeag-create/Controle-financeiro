import { z } from 'zod'
import { parseBRL } from '@/domain/money'
import { addDays, isValidISODate, type ISODate } from '@/domain/dates'

export const PAYMENT_METHODS = ['pix', 'cash', 'boleto', 'debit', 'credit', 'other'] as const

const MIN_DATE: ISODate = '2000-01-01'

function withinBounds(date: ISODate, today: ISODate): boolean {
  return date >= MIN_DATE && date <= addDays(today, 365)
}

export function resolveWhen(when: string, date: string, today: ISODate): ISODate | null {
  let resolved: ISODate | null = null
  if (when === 'today') resolved = today
  else if (when === 'yesterday') resolved = addDays(today, -1)
  else if (when === 'other' && isValidISODate(date)) resolved = date
  if (resolved === null || !withinBounds(resolved, today)) return null
  return resolved
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
        .transform((s) => ((PAYMENT_METHODS as readonly string[]).includes(s) ? s : null))
        .pipe(z.enum(PAYMENT_METHODS).nullable()),
    },
    today,
  ).transform(({ amount: amountCents, ...rest }) => ({ amountCents, ...rest }))

export const makeIncomeSchema = (today: ISODate) =>
  withDate({ amount, source: optionalText(40) }, today).transform(({ amount: amountCents, ...rest }) => ({
    amountCents,
    ...rest,
  }))
