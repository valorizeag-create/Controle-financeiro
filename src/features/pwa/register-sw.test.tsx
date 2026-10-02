// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { RegisterServiceWorker } from './register-sw'
import { takeInstallPrompt } from './install-prompt'

const flags = vi.hoisted(() => ({ registerServiceWorker: true }))
vi.mock('@/lib/env', () => ({ env: flags }))

const register = vi.fn(async (_url: string, _options: object) => { throw new Error('bloqueado') })

beforeEach(() => {
  flags.registerServiceWorker = true
  register.mockClear()
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { register } })
})
afterEach(() => cleanup())

test('registra o service worker na raiz, sem cache do arquivo, e não quebra se o registro falhar', async () => {
  render(<RegisterServiceWorker />)
  await Promise.resolve()
  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
})

test('em desenvolvimento (sem a chave ligada) não registra, para não atrapalhar o HMR', () => {
  flags.registerServiceWorker = false
  render(<RegisterServiceWorker />)
  expect(register).not.toHaveBeenCalled()
})

test('guarda o convite de instalação do navegador para a tela "Instalar a Íris"', () => {
  render(<RegisterServiceWorker />)
  expect(takeInstallPrompt()).toBeNull()
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(takeInstallPrompt()).toBe(event)
  expect(takeInstallPrompt()).toBeNull() // o navegador só deixa usar uma vez
})
