// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AuthLayout from './layout'

afterEach(() => cleanup())

test('o logo das telas de acesso volta para a landing', () => {
  render(<AuthLayout><h1>Entrar</h1></AuthLayout>)
  expect(screen.getByRole('link', { name: 'Íris, página inicial' }).getAttribute('href')).toBe('/')
})
