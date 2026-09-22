// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'
import { Money } from './money'
import { TextField } from './text-field'

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
    expect(input.getAttribute('aria-describedby')).toContain('email-error')
    expect(screen.getByText('Confira o e-mail.')).toBeTruthy()
  })
})
