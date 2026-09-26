import { z } from 'zod'
import { parseBRL } from '@/domain/money'
import { signUpSchema } from '@/features/auth/schemas'

// Saldo inicial é opcional: vazio vale zero. Negativo não é aceito nesta versão
// (parseBRL não aceita sinal), e o texto de erro é o mesmo do Anotar.
export const initialBalanceSchema = z
  .object({
    initialBalance: z.string().transform((raw, ctx) => {
      if (raw.trim() === '') return 0
      const cents = parseBRL(raw)
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Esse valor não parece certo. Use apenas números.' })
        return z.NEVER
      }
      return cents
    }),
  })
  .transform(({ initialBalance }) => ({ initialBalanceCents: initialBalance }))

export const displayNameSchema = signUpSchema.pick({ displayName: true })
