// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CardFace } from './card-face'

afterEach(() => cleanup())

test('cartão desenhado: apelido, tipo, "Íris" e a cor; nenhum número', () => {
  render(<CardFace nickname="Nubank pessoal" kind="credit" color="purple" />)
  const face = screen.getByTestId('card-face')
  expect(face.textContent).toContain('Nubank pessoal')
  expect(face.textContent).toContain('Crédito')
  expect(face.textContent).toContain('Íris')
  expect(face.textContent).not.toMatch(/\d/)
  // jsdom normaliza cores hex para rgb() ao ler style.backgroundImage; #7a3fb0 == rgb(122, 63, 176).
  expect(face.style.backgroundImage).toContain('rgb(122, 63, 176)')
})
