// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { FLASH_COOKIE_NAME } from './flash-name'

// O layout autenticado permanece montado entre navegações no App Router (é o
// mesmo layout para /anotar e /inicio), então o Toast relê o cookie a cada
// troca de rota. Mockamos usePathname para simular a troca sem remontar.
// Quando a Server Action redireciona para a mesma tela a rota não troca: aí o
// Toast acompanha o próprio cookie (cookieStore e uma conferida curta).
let pathname = '/anotar'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Toast } = await import('./toast')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
})

test('mostra o aviso ao navegar para a rota de destino após a Server Action', () => {
  pathname = '/anotar'
  const { rerender } = render(<Toast />)
  expect(screen.queryByRole('status')).toBeNull()

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  pathname = '/inicio'
  rerender(<Toast />)

  expect(screen.getByRole('status').textContent).toContain('Anotado.')
})

test('o aviso some depois de 4 s mesmo se a pessoa trocar de página antes', () => {
  vi.useFakeTimers()
  pathname = '/anotar'
  const { rerender } = render(<Toast />)

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  pathname = '/inicio'
  rerender(<Toast />)
  expect(screen.getByRole('status').textContent).toContain('Anotado.')

  act(() => {
    vi.advanceTimersByTime(1000)
  })
  pathname = '/extrato'
  rerender(<Toast />)
  expect(screen.getByRole('status')).toBeTruthy()

  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(screen.queryByRole('status')).toBeNull()
})

// ---- Revisão final do Plano 7 (I1): a Server Action redireciona para a mesma tela ----

test('mesma rota: o aviso aparece sem trocar de página', () => {
  vi.useFakeTimers()
  pathname = '/familia'
  render(<Toast />)
  expect(screen.queryByRole('status')).toBeNull()

  // A resposta da Server Action grava o cookie; a rota continua a mesma.
  document.cookie = `${FLASH_COOKIE_NAME}=${encodeURIComponent('Você saiu da família.')}`
  act(() => {
    vi.advanceTimersByTime(1000)
  })

  expect(screen.getByRole('status').textContent).toContain('Você saiu da família.')
  expect(document.cookie).not.toContain(FLASH_COOKIE_NAME)
})

test('mesma rota: o aviso some depois de 4 s e não volta', () => {
  vi.useFakeTimers()
  pathname = '/familia'
  render(<Toast />)
  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(screen.getAllByRole('status')).toHaveLength(1)

  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(screen.getByRole('status')).toBeTruthy()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(screen.queryByRole('status')).toBeNull()
  act(() => {
    vi.advanceTimersByTime(10000)
  })
  expect(screen.queryByRole('status')).toBeNull()
})

test('mesma rota: dois avisos iguais seguidos aparecem os dois', () => {
  vi.useFakeTimers()
  pathname = '/familia/contas'
  render(<Toast />)
  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  act(() => {
    vi.advanceTimersByTime(4000)
  })
  expect(screen.queryByRole('status')).toBeNull()

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(screen.getByRole('status').textContent).toContain('Anotado.')
})

test('outra rota: o aviso lido antes da troca não aparece de novo depois dela', () => {
  vi.useFakeTimers()
  pathname = '/anotar'
  const { rerender } = render(<Toast />)
  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(screen.getAllByRole('status')).toHaveLength(1)

  // O redirecionamento chega depois: o cookie já foi lido e apagado.
  pathname = '/inicio'
  rerender(<Toast />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  // O prazo de 4 s conta da primeira vez que apareceu; a troca de rota não o reinicia.
  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(screen.getAllByRole('status')).toHaveLength(1)
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(screen.queryByRole('status')).toBeNull()
})

test('aba escondida: não lê o cookie; ao voltar, o aviso aparece', () => {
  vi.useFakeTimers()
  pathname = '/familia'
  render(<Toast />)
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(screen.queryByRole('status')).toBeNull()

  visibility.mockReturnValue('visible')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(screen.getByRole('status').textContent).toContain('Anotado.')
})

test('com cookieStore: o aviso aparece na hora em que o cookie muda, uma vez só', () => {
  vi.useFakeTimers()
  const store = new EventTarget()
  vi.stubGlobal('cookieStore', store)
  pathname = '/familia'
  const { unmount } = render(<Toast />)

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  act(() => {
    store.dispatchEvent(new Event('change'))
  })
  expect(screen.getAllByRole('status')).toHaveLength(1)
  // Apagar o cookie também avisa uma mudança: nada novo para mostrar.
  act(() => {
    store.dispatchEvent(new Event('change'))
    vi.advanceTimersByTime(1000)
  })
  expect(screen.getAllByRole('status')).toHaveLength(1)

  // Depois de desmontar, ninguém mais ouve o cookie.
  unmount()
  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  store.dispatchEvent(new Event('change'))
  vi.advanceTimersByTime(5000)
  expect(document.cookie).toContain(FLASH_COOKIE_NAME)
})
