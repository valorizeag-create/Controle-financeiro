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

test('Contas: menu lateral depois de Extrato; no celular fica dentro de Mais', () => {
  expect(SIDEBAR_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/contas', '/cartoes', '/categorias', '/configuracoes'])
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/mais'])
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(isActive('/contas', mais)).toBe(true)
  expect(isActive('/contas/recorrencia/abc', mais)).toBe(true)
})

test('painel "Recebi" cobre a tela; a lista de contas não', () => {
  expect(isSheetRoute('/contas/receber/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/contas')).toBe(false)
  expect(isSheetRoute('/contas/receber')).toBe(false)
  expect(isSheetRoute('/contas/nova')).toBe(false)
})

test('Cartões: menu lateral depois de Contas; no celular dentro de Mais; nada disso é painel', () => {
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/mais'])
  expect(isActive('/cartoes', mais)).toBe(true)
  expect(isActive('/cartoes/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', mais)).toBe(true)
  for (const p of ['/cartoes', '/cartoes/novo', '/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) expect(isSheetRoute(p)).toBe(false)
  const extrato = SIDEBAR_ITEMS.find((i) => i.href === '/extrato')!
  expect(isActive('/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', extrato)).toBe(true)
})
