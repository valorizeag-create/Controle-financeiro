// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('@/features/familia/queries', () => ({ loadFamilySummary: async () => null }))
vi.mock('@/features/perfil/queries', () => ({ loadProfile: async () => ({ displayName: 'Ana' }) }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sair da Íris</button> }))

const { default: MaisPage } = await import('./page')
afterEach(() => cleanup())

test('Importar extrato vem logo depois de Contas e leva a /extrato/importar', async () => {
  render(await MaisPage())
  const nav = screen.getByRole('navigation', { name: 'Mais opções' })
  const links = within(nav).getAllByRole('link')
  expect(links.map((l) => l.textContent)).toEqual(['Contas', 'Importar extrato', 'Planejamento', 'Cartões', 'Relatórios', 'Família', 'Categorias'])
  expect(links[1].getAttribute('href')).toBe('/extrato/importar')
})
