import { expect, test } from 'vitest'
import { emailChangeSchema, TOKEN_HASH } from './schemas'

test('e-mail novo: aparado, em minúsculas, com a mensagem da copy', () => {
  expect(emailChangeSchema.parse({ email: '  Nova@Teste.Iris.dev ' })).toEqual({ email: 'nova@teste.iris.dev' })
  const bad = emailChangeSchema.safeParse({ email: 'sem-arroba' })
  expect(bad.success).toBe(false)
  if (!bad.success) expect(bad.error.issues[0].message).toBe('Confira o e-mail. Parece que falta alguma coisa.')
})

test('código do link: só o formato do Supabase', () => {
  for (const ok of ['a'.repeat(56), `pkce_${'b'.repeat(56)}`, 'AbC-_0123456789x']) expect(TOKEN_HASH.test(ok), ok).toBe(true)
  for (const no of ['', 'curto', 'a'.repeat(129), 'com espaço dentro 1234', 'a/b/c/d/e/f/g/h/i/j', '../../etc/passwd0000', 'x'.repeat(20) + '?y=1']) {
    expect(TOKEN_HASH.test(no), no).toBe(false)
  }
})
