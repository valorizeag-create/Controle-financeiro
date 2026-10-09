// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PageSkeleton } from './skeleton'

afterEach(() => cleanup())

test('enquanto carrega: o marco principal avisa que está ocupado e os blocos ficam fora do leitor de tela', () => {
  render(<PageSkeleton variant="mes" />)
  const main = screen.getByRole('main')
  expect(main.getAttribute('aria-busy')).toBe('true')
  const blocks = main.querySelectorAll('.animate-brilho')
  expect(blocks.length).toBeGreaterThan(3)
  for (const b of blocks) expect(b.closest('[aria-hidden="true"]')).not.toBeNull()
  expect(main.textContent).toBe('')
})

test('a versão de lista tem várias linhas e nenhum bloco grande de destaque', () => {
  render(<PageSkeleton variant="lista" />)
  const main = screen.getByRole('main')
  expect(main.querySelectorAll('[data-linha]').length).toBeGreaterThanOrEqual(5)
  expect(main.querySelector('[data-destaque]')).toBeNull()
})
