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
