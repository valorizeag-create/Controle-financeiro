// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FLASH_COOKIE_NAME } from './flash-name'

// O layout autenticado permanece montado entre navegações no App Router (é o
// mesmo layout para /anotar e /inicio), então o Toast só lia o cookie uma vez
// em useEffect(..., []). Depois que a Server Action de /anotar redireciona
// para /inicio, o cookie chega mas o aviso nunca aparece. Mockamos
// usePathname para simular a troca de rota sem remontar o componente.
let pathname = '/anotar'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Toast } = await import('./toast')

afterEach(() => {
  cleanup()
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
