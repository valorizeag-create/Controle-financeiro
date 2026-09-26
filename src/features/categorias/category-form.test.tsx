// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CategoryForm } from './category-form'

afterEach(() => cleanup())

test('criar: campo Nome com a dica da copy', () => {
  render(<CategoryForm action={vi.fn()} submitLabel="Criar categoria" />)
  const input = screen.getByLabelText('Nome')
  expect((input as HTMLInputElement).value).toBe('')
  expect(screen.getByText('Dê um nome que faça sentido para você.').id).toBe(input.getAttribute('aria-describedby'))
  expect(screen.getByRole('button', { name: 'Criar categoria' })).toBeTruthy()
  expect(document.querySelector('input[name="id"]')).toBeNull()
})

test('renomear: vem com o nome atual e o id escondido', () => {
  render(<CategoryForm action={vi.fn()} submitLabel="Salvar alterações" category={{ id: 'c1', name: 'Pet' }} />)
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Pet')
  expect((document.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('c1')
})
