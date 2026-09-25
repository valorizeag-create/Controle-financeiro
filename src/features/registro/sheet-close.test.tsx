// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SheetClose } from './sheet-close'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

test('é um link para o destino, com nome acessível "Fechar"', () => {
  render(<SheetClose href="/inicio" />)
  expect(screen.getByRole('link', { name: 'Fechar' }).getAttribute('href')).toBe('/inicio')
})

test('com algo digitado, pergunta antes de descartar', () => {
  const form = document.createElement('form')
  form.setAttribute('data-dirty', 'true')
  document.body.appendChild(form)

  render(<SheetClose href="/extrato?mes=2026-09" />)
  fireEvent.click(screen.getByRole('link', { name: 'Fechar' }))

  const dialog = screen.getByRole('alertdialog', { name: 'Descartar este registro?' })
  expect(dialog.textContent).toContain('O que você digitou não será salvo.')
  expect(screen.getByRole('link', { name: 'Descartar' }).getAttribute('href')).toBe('/extrato?mes=2026-09')

  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
