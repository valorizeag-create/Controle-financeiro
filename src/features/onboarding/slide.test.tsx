// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OnboardingSlide, parseStep } from './slide'

afterEach(() => cleanup())

describe('parseStep', () => {
  test('aceita 1, 2 e 3; o resto volta ao começo', () => {
    expect(parseStep(undefined)).toBe(1)
    expect(parseStep('2')).toBe(2)
    expect(parseStep('3')).toBe(3)
    expect(parseStep('4')).toBe(1)
    expect(parseStep('abc')).toBe(1)
  })
})

describe('OnboardingSlide', () => {
  test('primeira tela: texto da copy, Próximo e Pular', () => {
    render(<OnboardingSlide step={1} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Aqui, tudo começa com um gasto.' })).toBeTruthy()
    expect(screen.getByText('Anote o que entrou e o que saiu, em segundos. A Íris organiza o resto.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Próximo' }).getAttribute('href')).toBe('/boas-vindas?passo=2')
    expect(screen.getByRole('link', { name: 'Pular' }).getAttribute('href')).toBe('/boas-vindas/saldo')
    expect(screen.getByText('Passo 1 de 3')).toBeTruthy()
  })
  test('segunda tela', () => {
    render(<OnboardingSlide step={2} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Veja para onde seu dinheiro vai.' })).toBeTruthy()
    expect(screen.getByText('Cada registro vai para uma categoria. Com poucos dias, seu mês já começa a fazer sentido.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Próximo' }).getAttribute('href')).toBe('/boas-vindas?passo=3')
  })
  test('última tela troca Próximo por Começar', () => {
    render(<OnboardingSlide step={3} />)
    expect(screen.getByRole('heading', { level: 1, name: 'No seu ritmo.' })).toBeTruthy()
    expect(screen.getByText('Esqueceu de anotar? Tudo bem. É só continuar de onde parou.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Próximo' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Começar' }).getAttribute('href')).toBe('/boas-vindas/saldo')
  })
})
