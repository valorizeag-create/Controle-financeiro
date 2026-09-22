// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BottomNav } from './bottom-nav'

// vitest.config.ts não usa `globals: true`, então o auto-cleanup do
// @testing-library/react precisa ser registrado manualmente, senão o DOM
// de um teste vaza para o próximo.
afterEach(() => cleanup())

test('barra inferior marca a página atual e tem o botão Anotar', () => {
  render(<BottomNav current="/inicio" />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
})
