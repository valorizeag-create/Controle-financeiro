// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { ForgetDevice } from './forget-device'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

test('apaga a inscrição de push deste navegador e o que a Íris guardou nele', async () => {
  const unsubscribe = vi.fn(async () => true)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }) },
  })
  window.localStorage.setItem('iris:lembretes:depois', '1')
  render(<ForgetDevice />)
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1))
  expect(window.localStorage.getItem('iris:lembretes:depois')).toBeNull()
})

test('sem service worker: não mostra nada, não lança e ainda apaga o que foi guardado', async () => {
  window.localStorage.setItem('iris:lembretes:depois', '1')
  const { container } = render(<ForgetDevice />)
  expect(container.innerHTML).toBe('')
  expect(window.localStorage.getItem('iris:lembretes:depois')).toBeNull()
})

test('erro no navegador (service worker ou armazenamento) não vira erro na página', async () => {
  const unhandled = vi.fn()
  process.on('unhandledRejection', unhandled)
  const getRegistration = vi.fn(async () => { throw new Error('x') })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } })
  vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => { throw new Error('bloqueado') })
  expect(() => render(<ForgetDevice />)).not.toThrow()
  await waitFor(() => expect(getRegistration).toHaveBeenCalledTimes(1))
  await new Promise((r) => setTimeout(r, 10))
  process.off('unhandledRejection', unhandled)
  expect(unhandled).not.toHaveBeenCalled()
})
