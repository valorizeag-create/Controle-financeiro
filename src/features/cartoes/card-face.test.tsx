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

test('com bandeira: o logo dela aparece no lugar de "Íris", com o nome para leitor de tela', () => {
  for (const [brand, name] of [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'American Express']] as const) {
    render(<CardFace nickname="Nubank" kind="credit" color="purple" brand={brand} />)
    const face = screen.getByTestId('card-face')
    expect(face.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe(name)
    expect(face.textContent).not.toContain('Íris')
    cleanup()
  }
})

test('sem bandeira: continua "Íris" e nenhum logo', () => {
  render(<CardFace nickname="Nubank" kind="credit" color="purple" brand={null} />)
  const face = screen.getByTestId('card-face')
  expect(face.textContent).toContain('Íris')
  expect(face.querySelector('svg[role="img"]')).toBeNull()
})
