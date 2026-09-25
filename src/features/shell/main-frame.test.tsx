// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { MainFrame } = await import('./main-frame')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('reserva espaço para a barra inferior nas telas comuns', () => {
  pathname = '/inicio'
  const { container } = render(<MainFrame><p>conteúdo</p></MainFrame>)
  const frame = container.firstChild as HTMLElement
  expect(frame.className).toContain('pb-28')
  expect(frame.className).toContain('md:pb-10')
})

test('não deixa faixa vazia sob os painéis de Anotar e Editar', () => {
  for (const p of ['/anotar', '/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) {
    pathname = p
    const { container, unmount } = render(<MainFrame><p>conteúdo</p></MainFrame>)
    const frame = container.firstChild as HTMLElement
    expect(frame.className).not.toContain('pb-28')
    expect(frame.className).not.toContain('md:pb-10')
    unmount()
  }
})
