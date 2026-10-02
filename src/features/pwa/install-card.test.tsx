// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  standalone: false,
  ios: false,
  event: null as null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> },
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: h.replace }) }))
vi.mock('@/features/notificacoes/push-client', () => ({ isStandalone: () => h.standalone, isIOS: () => h.ios }))
vi.mock('./install-prompt', () => ({
  takeInstallPrompt: () => { const e = h.event; h.event = null; return e },
  peekInstallPrompt: () => h.event !== null,
  onInstallable: () => () => {},
}))

const { InstallCard } = await import('./install-card')
const TEXT = 'Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.'

beforeEach(() => { h.standalone = false; h.ios = false; h.event = null; h.push.mockClear(); h.replace.mockClear() })
afterEach(() => cleanup())

describe('InstallCard (RF-07)', () => {
  test('título e frase aprovados; "Agora não" leva adiante; nunca "baixe"', () => {
    const { container } = render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeTruthy()
    expect(screen.getByText(TEXT)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Agora não' }).getAttribute('href')).toBe('/boas-vindas/primeiro-gasto')
    expect(container.textContent?.toLowerCase()).not.toMatch(/baix|loja|store/)
    expect(container.textContent).not.toContain('!')
  })
  test('navegador que oferece a instalação: o botão abre o convite do navegador e, aceito, segue', async () => {
    const prompt = vi.fn(async () => {})
    h.event = { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }
    render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à tela de início' }))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/boas-vindas/primeiro-gasto'))
    expect(prompt).toHaveBeenCalled()
  })
  test('convite recusado: fica na tela, sem insistir', async () => {
    h.event = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
    render(<InstallCard nextHref="/x" />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à tela de início' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull())
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Agora não' })).toBeTruthy()
  })
  test('iPhone: a instrução do protótipo, sem botão que não funciona', () => {
    h.ios = true
    render(<InstallCard nextHref="/x" />)
    expect(screen.getByText('No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull()
  })
  test('outros navegadores: instrução pelo menu', () => {
    render(<InstallCard nextHref="/x" />)
    expect(screen.getByText('No menu do navegador, escolha "Instalar" ou "Adicionar à tela de início".')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull()
  })
  test('já instalada: no onboarding pula a tela; em Configurações diz que já está', async () => {
    h.standalone = true
    render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" skipWhenInstalled />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/boas-vindas/primeiro-gasto'))
    cleanup()
    render(<InstallCard nextHref="/configuracoes" />)
    expect(screen.getByText('A Íris já está na sua tela de início.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/configuracoes')
    expect(screen.queryByRole('link', { name: 'Agora não' })).toBeNull()
  })
})
