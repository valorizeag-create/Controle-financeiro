import { z } from 'zod'
import type { ISODate } from '@/domain/dates'
import { amountField, resolveWhen } from '@/features/registro/schemas'
import { dayField, nameField } from '@/features/contas/schemas'

export const familyNameSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, { error: 'Falta o nome.' }).max(40, { error: 'Use até 40 caracteres.' })),
})

// 24 bytes aleatórios em base64url: o código do convite é um segredo.
export const INVITE_CODE = /^[A-Za-z0-9_-]{32}$/
export const inviteCodeSchema = z.string().regex(INVITE_CODE)
export const memberIdSchema = z.uuid()

export function inviteLink(siteUrl: string, code: string): string {
  return `${siteUrl}/convite/${code}`
}

// "Gasto da família" na edição: um gasto que já tem família nunca muda para outra (decisão 97).
export function familyPatch(input: {
  existingFamilyId: string | null
  wantsFamily: boolean
  myFamilyId: string | null
}): { family_id?: string | null } {
  if (!input.wantsFamily) return input.existingFamilyId ? { family_id: null } : {}
  if (input.existingFamilyId) return {}
  return input.myFamilyId ? { family_id: input.myFamilyId } : {}
}

// Para onde voltar depois de pagar uma conta da família: só as duas telas da família.
const FAMILY_RETURN = /^\/(inicio\/familia|familia\/contas)(\?mes=20\d{2}-(0[1-9]|1[0-2]))?$/

export function familyReturnPath(raw: string): string {
  return FAMILY_RETURN.test(raw) ? raw : '/familia/contas'
}

// Edição do administrador: valor, data e nota (a categoria continua a de quem registrou).
export const makeFamilyExpenseSchema = (today: ISODate) =>
  z
    .object({
      amount: amountField,
      note: z.string().trim().max(140, { error: 'Use até 140 caracteres.' }).transform((s) => (s === '' ? null : s)),
      when: z.string(),
      date: z.string(),
    })
    .transform((raw, ctx) => {
      const occurredOn = resolveWhen(raw.when, raw.date, today)
      if (!occurredOn) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Escolha o dia.' })
        return z.NEVER
      }
      return { amountCents: raw.amount, occurredOn, note: raw.note }
    })

export const familyBillSchema = z
  .object({ name: nameField, amount: amountField, dueDay: dayField })
  .transform((raw) => ({ name: raw.name, amountCents: raw.amount, dueDay: raw.dueDay }))
