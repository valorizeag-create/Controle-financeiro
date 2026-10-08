// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/features/pwa/install-card', () => ({ InstallCard: (p: Record<string, unknown>) => { seen.props = p; return null } }))
const { default: InstalarPage } = await import('./page')
afterEach(() => cleanup())

test('Configurações → Instalar usa o cartão largo e volta para Configurações', () => {
  const { container } = render(<InstalarPage />)
  expect(seen.props).toEqual({ nextHref: '/configuracoes', wide: true })
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[880px]')
})
