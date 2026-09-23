// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Sidebar importa `signOut`, uma server action que puxa @/lib/supabase/server
// (que usa 'server-only'); mockamos o módulo para manter este teste em jsdom.
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }))

const { Sidebar } = await import('./sidebar')

afterEach(() => cleanup())

test('menu lateral marca a página atual e expõe o botão de sair', () => {
  render(<Sidebar current="/inicio" displayName="Ana" />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})
