import { z } from 'zod'
import { addDays, isValidISODate, todayInSaoPaulo } from '@/domain/dates'

// Datas de extrato plausíveis: de 2000 até um ano depois de hoje (no fuso de São Paulo).
const plausibleDate = (d: string) => isValidISODate(d) && d >= '2000-01-01' && d <= addDays(todayInSaoPaulo(), 365)

export const importLineSchema = z
  .object({
    importKey: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.enum(['income', 'expense']),
    amountCents: z.number().int().min(1).max(9_999_999_999),
    occurredOn: z.string().refine(plausibleDate),
    categoryId: z.uuid().nullable(),
    source: z.string().max(40).nullable(),
    note: z.string().max(140),
    billId: z.uuid().nullable(),
    merchantKey: z.string().max(60).nullable(),
  })
  // Gasto novo precisa de categoria; gasto que baixa uma conta a pagar já a tem.
  .refine((l) => l.kind !== 'expense' || l.billId !== null || l.categoryId !== null, { path: ['categoryId'] })
  // Entrada tem só origem; gasto tem só categoria (ou conta a pagar).
  .refine((l) => l.kind !== 'income' || (l.categoryId === null && l.billId === null), { path: ['categoryId'] })
  .refine((l) => l.kind !== 'expense' || l.source === null, { path: ['source'] })

export const importSchema = z.object({
  cardId: z.uuid().nullable(),
  lines: z.array(importLineSchema).min(1).max(1000),
})

export type ImportLine = z.infer<typeof importLineSchema>
export type ImportPayload = z.infer<typeof importSchema>
