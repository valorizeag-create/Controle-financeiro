import { expect, test } from 'vitest'
import { BOTTOM_NAV_ITEMS, SIDEBAR_ITEMS, isActive, isSheetRoute } from './nav-items'

test('painéis que cobrem a tela não têm barra inferior', () => {
  expect(isSheetRoute('/anotar')).toBe(true)
  expect(isSheetRoute('/anotar/gasto')).toBe(true)
  expect(isSheetRoute('/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/extrato')).toBe(false)
  expect(isSheetRoute('/extrato/a/b')).toBe(false)
  expect(isSheetRoute('/anotarx')).toBe(false)
  expect(isSheetRoute('/inicio')).toBe(false)
})

test('isActive reconhece a página e as subpáginas, sem confundir prefixos', () => {
  const extrato = SIDEBAR_ITEMS.find((i) => i.href === '/extrato')!
  expect(isActive('/extrato', extrato)).toBe(true)
  expect(isActive('/extrato/abc', extrato)).toBe(true)
  expect(isActive('/extratos', extrato)).toBe(false)
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(isActive('/configuracoes', mais)).toBe(true)
  expect(isActive('/inicio', mais)).toBe(false)
})
