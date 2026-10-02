// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { OfflineBanner } from './offline-banner'

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
  act(() => { window.dispatchEvent(new Event(value ? 'online' : 'offline')) })
}

afterEach(() => { cleanup(); setOnline(true) })

describe('OfflineBanner', () => {
  test('com conexão, nada aparece', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
  })
  test('sem conexão, o aviso da copy; quando volta, some', () => {
    render(<OfflineBanner />)
    setOnline(false)
    expect(screen.getByRole('status').textContent).toBe('Sem conexão no momento. Assim que voltar, a gente tenta de novo.')
    setOnline(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
