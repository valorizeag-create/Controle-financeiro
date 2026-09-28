// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const acts = vi.hoisted(() => ({ returnLeftover: vi.fn() }))
vi.mock('./movement-actions', () => acts)
const { LeftoverPrompt } = await import('./leftover-prompt')

afterEach(() => cleanup())

test('sobra: pergunta da RN-15b; "Deixar guardado" é o padrão, "Devolver" envia', () => {
  render(<LeftoverPrompt goalId="g1" leftoverCents={18000} />)
  const NBSP = String.fromCharCode(0xa0)
  const dialog = screen.getByRole('dialog', { name: `Sobraram R$${NBSP}180,00 na meta. Quer devolver para o seu mês?` })
  expect(dialog.textContent).toContain('Anotado. Seu mês já está atualizado.')
  expect(within(dialog).getByRole('link', { name: 'Deixar guardado' }).getAttribute('href')).toBe('/metas')
  const devolver = within(dialog).getByRole('button', { name: 'Devolver' })
  expect(devolver.getAttribute('type')).toBe('submit')
  expect((devolver.closest('form')!.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('g1')
})
