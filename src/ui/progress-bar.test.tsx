// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProgressBar } from './progress-bar'

afterEach(() => cleanup())

test('barra acessível com o percentual', () => {
  render(<ProgressBar percent={62} label="Progresso de Viagem para Salvador" />)
  const bar = screen.getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' })
  expect(bar.getAttribute('aria-valuenow')).toBe('62')
  expect(bar.getAttribute('aria-valuemax')).toBe('100')
  expect((bar.firstElementChild as HTMLElement).style.width).toBe('62%')
})

test('tom "passou" pinta a barra de âmbar (V5); o padrão continua verde', () => {
  render(<ProgressBar percent={100} label="Uso do planejado em Lazer" tone="over" />)
  const bar = screen.getByRole('progressbar', { name: 'Uso do planejado em Lazer' })
  expect((bar.firstElementChild as HTMLElement).className).toContain('bg-amber-bar')
  cleanup()
  render(<ProgressBar percent={10} label="X" />)
  expect((screen.getByRole('progressbar', { name: 'X' }).firstElementChild as HTMLElement).className).toContain('bg-brand')
})

test('tamanho pequeno usa o trilho h-2 bg-sunken', () => {
  render(<ProgressBar percent={10} label="S" size="sm" />)
  expect(screen.getByRole('progressbar', { name: 'S' }).className).toContain('h-2 bg-sunken')
})
