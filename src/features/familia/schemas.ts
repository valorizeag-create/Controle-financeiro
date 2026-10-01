import { z } from 'zod'

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
