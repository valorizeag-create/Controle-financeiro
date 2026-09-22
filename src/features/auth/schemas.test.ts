import { expect, test } from 'vitest'
import { resetSchema, signInSchema, signUpSchema } from './schemas'
import { firstFieldErrors } from '@/lib/forms'

test('cadastro válido normaliza o e-mail', () => {
  const r = signUpSchema.parse({ displayName: ' Camila ', email: ' Camila@Email.com ', password: '12345678' })
  expect(r).toEqual({ displayName: 'Camila', email: 'camila@email.com', password: '12345678' })
})

test('cadastro inválido traz as mensagens da copy', () => {
  const r = signUpSchema.safeParse({ displayName: '', email: 'camila@', password: '123' })
  expect(r.success).toBe(false)
  expect(firstFieldErrors(r.error!)).toEqual({
    displayName: 'Falta o seu nome.',
    email: 'Confira o e-mail. Parece que falta alguma coisa.',
    password: 'A senha precisa ter pelo menos 8 caracteres.',
  })
})

test('entrar exige senha', () => {
  const r = signInSchema.safeParse({ email: 'a@b.com', password: '' })
  expect(firstFieldErrors(r.error!)).toEqual({ password: 'Falta a senha.' })
})

test('recuperar senha exige e-mail válido', () => {
  expect(resetSchema.safeParse({ email: 'x' }).success).toBe(false)
})

test('senha tem limite de 72 bytes (bcrypt), não 72 caracteres', () => {
  const long = signUpSchema.safeParse({ displayName: 'Camila', email: 'a@b.com', password: 'á'.repeat(40) })
  expect(long.success).toBe(false)
  expect(firstFieldErrors(long.error!)).toEqual({ password: 'Use até 72 caracteres.' })

  const ok = signUpSchema.safeParse({ displayName: 'Camila', email: 'a@b.com', password: 'a'.repeat(72) })
  expect(ok.success).toBe(true)
})
