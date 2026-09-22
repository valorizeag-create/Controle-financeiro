// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Button } from './button'
import { Money } from './money'
import { TextField } from './text-field'

// vitest.config.ts não usa `globals: true`, então o auto-cleanup do
// @testing-library/react (que depende de um `afterEach` global) não é
// registrado sozinho — sem isso, o DOM de um teste vaza para o próximo.
afterEach(() => cleanup())

describe('componentes base', () => {
  test('Money formata centavos', () => {
    render(<Money cents={-14230} />)
    // normalizer preserva o NBSP entre "R$" e o valor: o normalizador padrão
    // do testing-library colapsa   em espaço comum via /\s+/g, o que
    // impediria a comparação exata com o texto produzido por formatBRL.
    expect(
      screen.getByText('−R$ 142,30', { normalizer: (text) => text })
    ).toBeTruthy()
  })
  test('Button com href vira link', () => {
    render(<Button href="/anotar">Anotar</Button>)
    expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
  })
  test('TextField liga rótulo, dica e erro ao campo', () => {
    render(<TextField name="email" label="Seu e-mail" hint="dica" error="Confira o e-mail." />)
    const input = screen.getByLabelText('Seu e-mail')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    // com erro, a dica não é renderizada (ver componente), então
    // aria-describedby não pode referenciar um id inexistente.
    expect(input.getAttribute('aria-describedby')).toBe('email-error')
    expect(screen.getByText('Confira o e-mail.')).toBeTruthy()
  })
  test('TextField com apenas dica liga aria-describedby à dica', () => {
    render(<TextField name="email" label="Seu e-mail" hint="dica" />)
    const input = screen.getByLabelText('Seu e-mail')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.getAttribute('aria-describedby')).toBe('email-hint')
  })
})
