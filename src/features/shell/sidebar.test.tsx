// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// Sidebar importa `signOut`, uma server action que puxa @/lib/supabase/server
// (que usa 'server-only'); mockamos o módulo para manter este teste em jsdom.
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }))
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Sidebar } = await import('./sidebar')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('menu lateral lista as áreas que já existem e marca a atual', () => {
  pathname = '/categorias/nova'
  render(<Sidebar displayName="Ana" />)
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Contas', 'Planejamento', 'Metas', 'Cartões', 'Relatórios', 'Categorias', 'Configurações'])
  expect(screen.getByRole('link', { name: 'Categorias' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBeNull()
})

test('Sair da Íris pede confirmação: Sair ou Ficar', () => {
  render(<Sidebar displayName="Ana" />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da Íris' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Sair da Íris?' })
  expect(within(dialog).getByText('Seus dados continuam salvos.')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Sair' }).getAttribute('type')).toBe('submit')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ficar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
