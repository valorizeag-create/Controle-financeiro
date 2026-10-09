import { z } from 'zod'
import { isValidISODate } from '@/domain/dates'

export const importLineSchema = z
  .object({
    importKey: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.enum(['income', 'expense']),
    amountCents: z.number().int().min(1).max(9_999_999_999),
    occurredOn: z.string().refine(isValidISODate),
    categoryId: z.uuid().nullable(),
    source: z.string().max(40).nullable(),
    note: z.string().max(140),
    billId: z.uuid().nullable(),
    merchantKey: z.string().max(60).nullable(),
  })
  // Gasto novo precisa de categoria; gasto que baixa uma conta a pagar já a tem.
  .refine((l) => l.kind !== 'expense' || l.billId !== null || l.categoryId !== null, { path: ['categoryId'] })

export const importSchema = z.object({
  cardId: z.uuid().nullable(),
  lines: z.array(importLineSchema).min(1).max(1000),
})

export type ImportLine = z.infer<typeof importLineSchema>
export type ImportPayload = z.infer<typeof importSchema>
