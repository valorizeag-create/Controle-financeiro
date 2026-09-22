import { expect, test } from 'vitest'
import { z } from 'zod'
import { firstFieldErrors, readFields } from './forms'

test('firstFieldErrors pega a primeira mensagem de cada campo', () => {
  const s = z.object({ a: z.string().min(2, { error: 'curto' }), b: z.number({ error: 'número' }) })
  const r = s.safeParse({ a: 'x', b: 'y' })
  expect(firstFieldErrors(r.error!)).toEqual({ a: 'curto', b: 'número' })
})

test('readFields lê só os campos pedidos, como texto', () => {
  const fd = new FormData()
  fd.set('a', 'um')
  fd.set('extra', 'ignorado')
  expect(readFields(fd, ['a', 'b'])).toEqual({ a: 'um', b: '' })
})
