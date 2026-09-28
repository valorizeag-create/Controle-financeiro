// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

// BottomNav usa usePathname (App Router não re-renderiza layouts em navegação
// client-side, então a página atual vem do próprio componente cliente).
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { BottomNav } = await import('./bottom-nav')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('barra inferior: Seu mês, Extrato, Anotar e Mais, nesta ordem', () => {
  render(<BottomNav />)
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Anotar', 'Mais'])
  expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
})

test('barra inferior marca a página atual', () => {
  pathname = '/inicio'
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Extrato' }).getAttribute('aria-current')).toBeNull()
})

test('Categorias e Configurações ficam dentro de Mais', () => {
  for (const p of ['/mais', '/contas', '/contas/nova', '/categorias', '/categorias/nova', '/configuracoes/nome']) {
    pathname = p
    const { unmount } = render(<BottomNav />)
    expect(screen.getByRole('link', { name: 'Mais' }).getAttribute('aria-current')).toBe('page')
    unmount()
  }
})

test('barra inferior fica escondida nos painéis de Anotar e Editar', () => {
  for (const p of ['/anotar', '/anotar/gasto', '/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', '/contas/receber/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) {
    pathname = p
    const { unmount } = render(<BottomNav />)
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull()
    unmount()
  }
})
