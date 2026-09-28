// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { CardForm } = await import('./card-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Novo cartão: apelido, tipo, cor, aviso de privacidade e prévia ao vivo', () => {
  render(<CardForm action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  const nickname = screen.getByLabelText('Como você chama esse cartão?') as HTMLInputElement
  expect(nickname.maxLength).toBe(30)
  expect(screen.getByRole('radio', { name: 'Crédito' })).toHaveProperty('checked', true)
  const cores = screen.getByRole('group', { name: 'Cor' })
  expect(within(cores).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['green', 'purple', 'blue', 'orange', 'graphite', 'pink'])
  expect(within(cores).getByRole('radio', { name: 'Verde' })).toHaveProperty('checked', true)
  expect(screen.getByText('A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão.')).toBeTruthy()

  fireEvent.change(nickname, { target: { value: 'C6 viagens' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Débito' }))
  fireEvent.click(within(cores).getByRole('radio', { name: 'Azul' }))
  const face = screen.getByTestId('card-face')
  expect(face.textContent).toContain('C6 viagens')
  expect(face.textContent).toContain('Débito')
  // jsdom normaliza cores hex para rgb() ao ler style.backgroundImage; #2563eb == rgb(37, 99, 235).
  expect(face.style.backgroundImage).toContain('rgb(37, 99, 235)')
  expect(screen.getByRole('button', { name: 'Salvar cartão' })).toBeTruthy()
})

test('editar: vem preenchido, com o id escondido e "Salvar alterações"', () => {
  render(<CardForm action={action} card={{ id: 'k2', nickname: 'Inter', kind: 'debit', color: 'orange' }} />)
  expect((screen.getByLabelText('Como você chama esse cartão?') as HTMLInputElement).value).toBe('Inter')
  expect(screen.getByRole('radio', { name: 'Débito' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Laranja' })).toHaveProperty('checked', true)
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('k2')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erro no apelido aparece no campo e o resto continua escolhido', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { nickname: 'Falta o nome.' }, values: { nickname: '', kind: 'debit', color: 'pink' } },
    vi.fn(),
    false,
  ])
  render(<CardForm action={action} />)
  expect(screen.getByText('Falta o nome.')).toBeTruthy()
  expect(screen.getByRole('radio', { name: 'Débito' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Rosa' })).toHaveProperty('checked', true)
})
