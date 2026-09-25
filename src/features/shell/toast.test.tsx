// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { FLASH_COOKIE_NAME } from './flash-name'

// O layout autenticado permanece montado entre navegações no App Router (é o
// mesmo layout para /anotar e /inicio), então o Toast relê o cookie a cada
// troca de rota. Mockamos usePathname para simular a troca sem remontar.
let pathname = '/anotar'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Toast } = await import('./toast')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
