// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmAction, ConfirmPanel } from './confirm'

afterEach(() => cleanup())

test('abre a confirmação com título, texto e foco em Cancelar; Cancelar fecha e devolve o foco', () => {
  render(
    <ConfirmAction
      trigger="Excluir"
      title="Excluir este gasto?"
      body="Seu mês será recalculado."
      confirmLabel="Excluir"
      cancelLabel="Cancelar"
      action={vi.fn()}
      fields={{ id: 'abc' }}
    />,
  )
  expect(screen.queryByRole('alertdialog')).toBeNull()
  const trigger = screen.getByRole('button', { name: 'Excluir' })
  fireEvent.click(trigger)

  const dialog = screen.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Seu mês será recalculado.').id)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
  const hidden = dialog.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement
  expect(hidden.value).toBe('abc')
  const confirm = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
  expect(confirm.textContent).toBe('Excluir')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Esc fecha a confirmação', () => {
  render(<ConfirmAction trigger="Sair" title="Sair da Íris?" confirmLabel="Sair" cancelLabel="Ficar" action={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
  expect(screen.getByRole('alertdialog', { name: 'Sair da Íris?' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('botão só com ícone usa o rótulo acessível', () => {
  render(
    <ConfirmAction
      trigger={<svg aria-hidden="true" />}
      triggerAriaLabel="Sair da Íris"
      title="Sair da Íris?"
      confirmLabel="Sair"
      cancelLabel="Ficar"
      action={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})

test('ConfirmPanel chama onCancel no botão de cancelar e mostra o controle de confirmar', () => {
  const onCancel = vi.fn()
  render(
    <ConfirmPanel title="Descartar este registro?" body="O que você digitou não será salvo." cancelLabel="Continuar editando" onCancel={onCancel}>
      <a href="/inicio">Descartar</a>
    </ConfirmPanel>,
  )
  expect(screen.getByRole('link', { name: 'Descartar' }).getAttribute('href')).toBe('/inicio')
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
})
