import { z } from 'zod'
import { parseBRL } from '@/domain/money'

export const PLAN_FIELD_PREFIX = 'plan.'
export const MAX_PLAN_FIELDS = 200
export const PLAN_INVALID = 'Esse valor não parece certo. Use apenas números.'

const categoryId = z.uuid()

export interface ParsedPlanFields {
  entries: { categoryId: string; amountCents: number | null }[]
  values: Record<string, string>
  fieldErrors: Record<string, string>
}

/** Lê um valor por categoria (`plan.{uuid}`); em branco ou zero tiram a categoria do planejado. */
export function parsePlanFields(fd: FormData): ParsedPlanFields | null {
  const entries: ParsedPlanFields['entries'] = []
  const values: Record<string, string> = {}
  const fieldErrors: Record<string, string> = {}
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith(PLAN_FIELD_PREFIX) || typeof raw !== 'string') continue
    const id = key.slice(PLAN_FIELD_PREFIX.length)
    if (!categoryId.safeParse(id).success) continue
    if (entries.length >= MAX_PLAN_FIELDS) return null
    values[key] = raw
    if (raw.trim() === '') {
      entries.push({ categoryId: id, amountCents: null })
      continue
    }
    const cents = parseBRL(raw)
    if (cents === null) {
      fieldErrors[key] = PLAN_INVALID
      entries.push({ categoryId: id, amountCents: null })
    } else {
      entries.push({ categoryId: id, amountCents: cents === 0 ? null : cents })
    }
  }
  return { entries, values, fieldErrors }
}
