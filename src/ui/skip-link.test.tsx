// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CONTENT_ID, SkipLink } from './skip-link'

afterEach(() => cleanup())

test('"Pular para o conteúdo": escondido até receber foco, alvo de 44 px, leva ao conteúdo', () => {
  render(<SkipLink />)
  const link = screen.getByRole('link', { name: 'Pular para o conteúdo' })
  expect(link.getAttribute('href')).toBe(`#${CONTENT_ID}`)
  expect(CONTENT_ID).toBe('conteudo')
  expect(link.className).toContain('sr-only')
  expect(link.className).toContain('focus:not-sr-only')
  expect(link.className).toContain('min-h-11')
})
