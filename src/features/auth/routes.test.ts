import { expect, test } from 'vitest'
import { isAnonOnlyPath, isPublicPath, safeNext } from './routes'

test('rotas públicas e rotas só para quem não entrou', () => {
  expect(isPublicPath('/entrar')).toBe(true)
  expect(isPublicPath('/auth/callback')).toBe(true)
  expect(isPublicPath('/inicio')).toBe(false)
  expect(isPublicPath('/nova-senha')).toBe(false)
  expect(isAnonOnlyPath('/criar-cadastro')).toBe(true)
  expect(isAnonOnlyPath('/inicio')).toBe(false)
})

test('safeNext só aceita caminhos internos', () => {
  expect(safeNext('/nova-senha')).toBe('/nova-senha')
  expect(safeNext('//malicioso.com')).toBe('/inicio')
  expect(safeNext('https://malicioso.com')).toBe('/inicio')
  expect(safeNext('/\\malicioso.com')).toBe('/inicio')
  expect(safeNext(null)).toBe('/inicio')
})
