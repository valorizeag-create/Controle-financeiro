import { expect, test, vi } from 'vitest'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { readFlash } from '@/features/shell/flash-read'
import { FLASH_COOKIE_NAME } from '@/features/shell/flash-name'

// `cookies()` numa Server Action devolve um ResponseCookies; usamos a classe real
// para exercitar o próprio setFlash, inclusive a codificação feita pelo Next.
const jar = vi.hoisted(() => ({ store: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => jar.store }))

const { setFlash } = await import('./flash')

function flashSetCookie(headers: Headers): string {
  const all = headers.getSetCookie()
  const line = all.find((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))
  if (!line) throw new Error('setFlash não gravou o cookie')
  return line
}

test('setFlash grava o texto puro: o navegador lê exatamente a mensagem', async () => {
  const headers = new Headers()
  jar.store = new ResponseCookies(headers)

  await setFlash('Anotado. Mais R$ 5.000,00 no seu mês.')

  const line = flashSetCookie(headers)
  expect(readFlash(line.split(';')[0])).toBe('Anotado. Mais R$ 5.000,00 no seu mês.')
})

test('setFlash vale para o site todo, dura 30 s e só vai em navegação do próprio site', async () => {
  const headers = new Headers()
  jar.store = new ResponseCookies(headers)

  await setFlash('Alterações salvas.')

  const line = flashSetCookie(headers).toLowerCase()
  expect(line).toContain('path=/')
  expect(line).toContain('max-age=30')
  expect(line).toContain('samesite=lax')
})
