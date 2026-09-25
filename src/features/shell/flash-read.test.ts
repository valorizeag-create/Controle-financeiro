import { expect, test } from 'vitest'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { readFlash } from './flash-read'
import { FLASH_COOKIE_NAME } from './flash-name'

// Reproduz exatamente o que `cookies().set(...)` faz em uma Server Action:
// ResponseCookies (usada internamente pelo Next) já codifica o valor com
// encodeURIComponent. Se `setFlash` também codificasse, o navegador
// receberia uma dupla codificação e o usuário veria "%20" na tela.
function setCookieValue(message: string): string {
  const headers = new Headers()
  new ResponseCookies(headers).set(FLASH_COOKIE_NAME, message, { path: '/', maxAge: 30, sameSite: 'lax' })
  const setCookie = headers.get('set-cookie') ?? ''
  return setCookie.split(';')[0]
}

test('não sofre dupla codificação ao passar pelo serializador de cookies do Next', () => {
  const pairEmpty = setCookieValue('Anotado. Seu mês já está atualizado.')
  expect(readFlash(pairEmpty)).toBe('Anotado. Seu mês já está atualizado.')

  const pairValue = setCookieValue('Anotado. Mais R$ 5.000,00 no seu mês.')
  expect(readFlash(pairValue)).toBe('Anotado. Mais R$ 5.000,00 no seu mês.')
})

test('decodifica a mensagem quando o cookie existe', () => {
  expect(readFlash('iris_flash=Ol%C3%A1')).toBe('Olá')
})

test('retorna null quando o cookie não existe', () => {
  expect(readFlash('outro=1')).toBeNull()
})

test('retorna null, sem lançar, para uma sequência de escape inválida', () => {
  expect(readFlash('iris_flash=%E0%A4%A')).toBeNull()
})

test('preserva "=" dentro do valor', () => {
  expect(readFlash('iris_flash=a=b')).toBe('a=b')
})
