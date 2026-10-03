// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), usePathname: () => '/inicio' }))
vi.mock('@/lib/supabase/server', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/features/perfil/queries', () => ({ getOnboardedAt: async () => ({ display_name: 'Ana', onboarded_at: '2026-01-01' }) }))
vi.mock('@/features/onboarding/gate', () => ({ needsOnboarding: () => false }))
vi.mock('@/features/shell/sidebar', () => ({ Sidebar: () => <aside><a href="/inicio">Seu mês</a></aside> }))
vi.mock('@/features/shell/bottom-nav', () => ({ BottomNav: () => null }))
vi.mock('@/features/shell/toast', () => ({ Toast: () => null }))
vi.mock('@/features/notificacoes/push-sync', () => ({ PushSync: () => null }))

const { default: AppLayout } = await import('./layout')
afterEach(() => cleanup())

test('pular para o conteúdo vem antes do menu e aponta para o conteúdo da tela', async () => {
  const { container } = render(await AppLayout({ children: <main><h1>Seu mês</h1></main> }))
  const first = container.querySelector('a') as HTMLAnchorElement
  expect(first.textContent).toBe('Pular para o conteúdo')
  expect(container.querySelector('#conteudo')?.textContent).toContain('Seu mês')
})
