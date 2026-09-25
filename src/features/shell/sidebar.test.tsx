// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Sidebar importa `signOut`, uma server action que puxa @/lib/supabase/server
// (que usa 'server-only'); mockamos o módulo para manter este teste em jsdom.
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }))
// Sidebar usa usePathname para saber a página atual (layouts não re-renderizam
// em navegação client-side no App Router).
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Sidebar } = await import('./sidebar')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('menu lateral marca a página atual e expõe o botão de sair', () => {
  pathname = '/inicio'
  render(<Sidebar displayName="Ana" />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})
