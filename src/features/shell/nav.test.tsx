// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// BottomNav e Sidebar usam usePathname (App Router não re-renderiza layouts
// em navegação client-side, então a página "atual" precisa vir do próprio
// componente cliente, não de um prop calculado no servidor).
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { BottomNav } = await import('./bottom-nav')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('barra inferior marca a página atual e tem o botão Anotar', () => {
  pathname = '/inicio'
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
})

test('barra inferior fica escondida em rotas que começam com /anotar', () => {
  pathname = '/anotar'
  render(<BottomNav />)
  expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull()

  pathname = '/anotar/gasto'
  render(<BottomNav />)
  expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull()
})
