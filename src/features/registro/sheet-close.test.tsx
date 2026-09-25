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

test('com algo digitado no painel, pergunta antes de descartar', () => {
  const { container } = render(
    <div data-sheet="">
      <SheetClose href="/extrato?mes=2026-09" />
    </div>,
  )
  const form = document.createElement('form')
  form.setAttribute('data-dirty', 'true')
  container.querySelector('[data-sheet]')!.appendChild(form)

  fireEvent.click(screen.getByRole('link', { name: 'Fechar' }))

  const dialog = screen.getByRole('alertdialog', { name: 'Descartar este registro?' })
  expect(dialog.textContent).toContain('O que você digitou não será salvo.')
  expect(screen.getByRole('link', { name: 'Descartar' }).getAttribute('href')).toBe('/extrato?mes=2026-09')

  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('rascunho fora do painel do Anotar não dispara a confirmação', () => {
  const outsideForm = document.createElement('form')
  outsideForm.setAttribute('data-dirty', 'true')
  document.body.appendChild(outsideForm)

  render(
    <div data-sheet="">
      <SheetClose href="/inicio" />
    </div>,
  )
  fireEvent.click(screen.getByRole('link', { name: 'Fechar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('depois de "Continuar editando", o foco volta para o Fechar', () => {
  const { container } = render(
    <div data-sheet="">
      <SheetClose href="/inicio" />
    </div>,
  )
  const form = document.createElement('form')
  form.setAttribute('data-dirty', 'true')
  container.querySelector('[data-sheet]')!.appendChild(form)

  const fechar = screen.getByRole('link', { name: 'Fechar' })
  fireEvent.click(fechar)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(document.activeElement).toBe(fechar)
})
