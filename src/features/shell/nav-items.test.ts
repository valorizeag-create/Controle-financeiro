import { expect, test } from 'vitest'
import { isSheetRoute } from './nav-items'

test('painéis que cobrem a tela não têm barra inferior', () => {
  expect(isSheetRoute('/anotar')).toBe(true)
  expect(isSheetRoute('/anotar/gasto')).toBe(true)
  expect(isSheetRoute('/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/extrato')).toBe(false)
  expect(isSheetRoute('/extrato/a/b')).toBe(false)
  expect(isSheetRoute('/anotarx')).toBe(false)
  expect(isSheetRoute('/inicio')).toBe(false)
})
