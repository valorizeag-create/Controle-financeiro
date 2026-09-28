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
  expect(SIDEBAR_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/contas', '/planejamento', '/metas', '/cartoes', '/relatorios', '/categorias', '/configuracoes'])
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/metas', '/mais'])
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
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/metas', '/mais'])
  expect(isActive('/cartoes', mais)).toBe(true)
  expect(isActive('/cartoes/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', mais)).toBe(true)
  for (const p of ['/cartoes', '/cartoes/novo', '/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) expect(isSheetRoute(p)).toBe(false)
  const extrato = SIDEBAR_ITEMS.find((i) => i.href === '/extrato')!
  expect(isActive('/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', extrato)).toBe(true)
})

test('Metas: barra inferior entre Anotar e Mais; menu lateral depois de Contas; guardar, tirar, usar e sobra são painéis', () => {
  const metas = BOTTOM_NAV_ITEMS.find((i) => i.href === '/metas')!
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
  expect(isActive(`/metas/${ID}/guardar`, metas)).toBe(true)
  expect(isActive('/metas', mais)).toBe(false)
  for (const p of ['guardar', 'tirar', 'usar', 'sobra']) expect(isSheetRoute(`/metas/${ID}/${p}`)).toBe(true)
  for (const p of ['/metas', '/metas/nova', `/metas/${ID}`, `/metas/${ID}/editar`, `/metas/${ID}/guardar/x`]) expect(isSheetRoute(p)).toBe(false)
})

test('Planejamento e Relatórios: menu lateral na ordem do protótipo; no celular ficam em Mais; não são painéis', () => {
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  const planejamento = SIDEBAR_ITEMS.find((i) => i.href === '/planejamento')!
  expect(isActive('/planejamento', mais)).toBe(true)
  expect(isActive('/planejamento/editar', mais)).toBe(true)
  expect(isActive('/relatorios', mais)).toBe(true)
  expect(isActive('/planejamento/editar', planejamento)).toBe(true)
  expect(isActive('/planejamentos', planejamento)).toBe(false)
  for (const p of ['/planejamento', '/planejamento/editar', '/relatorios']) expect(isSheetRoute(p)).toBe(false)
})
