import { z } from 'zod'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Confira o e-mail. Parece que falta alguma coisa.' }))

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, { error: 'Falta o seu nome.' }).max(60, { error: 'Use até 60 caracteres.' }),
  email,
  password: z
    .string()
    .min(8, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
    .max(72, { error: 'Use até 72 caracteres.' }),
})

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Falta a senha.' }),
})

export const resetSchema = z.object({ email })

export const newPasswordSchema = signUpSchema.pick({ password: true })
