// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Celebrate } from './celebrate'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const dots = (c: HTMLElement) => c.querySelectorAll('[data-celebrate] > span').length

test('na primeira vez que a meta aparece concluída, os pontinhos estouram (escondidos do leitor de tela)', () => {
  const { container } = render(<Celebrate id="g1" />)
  expect(dots(container)).toBe(10)
  expect(container.querySelector('[data-celebrate]')?.getAttribute('aria-hidden')).toBe('true')
})

test('comemora uma vez só por meta neste aparelho', () => {
  render(<Celebrate id="g1" />)
  cleanup()
  const again = render(<Celebrate id="g1" />)
  expect(dots(again.container)).toBe(0)
  cleanup()
  const other = render(<Celebrate id="g2" />)
  expect(dots(other.container)).toBe(10)
})

test('sem acesso ao armazenamento do navegador, comemora mesmo assim', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  const { container } = render(<Celebrate id="g1" />)
  expect(dots(container)).toBe(10)
})
