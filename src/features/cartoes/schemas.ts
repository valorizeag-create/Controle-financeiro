import { z } from 'zod'
import { CARD_COLORS } from './palette'
import type { CardColor } from './types'

const colorKeys = CARD_COLORS.map((c) => c.key) as [CardColor, ...CardColor[]]

export const cardSchema = z.object({
  nickname: z.string().trim().min(1, { error: 'Falta o nome.' }).max(30, { error: 'Use até 30 caracteres.' }),
  kind: z.enum(['credit', 'debit']).catch('credit'),
  color: z.enum(colorKeys).catch('green'),
})
