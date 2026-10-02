// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { ForgetDevice } from './forget-device'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

test('sem service worker, ou com erro, não mostra nada e não lança', async () => {
  const { container } = render(<ForgetDevice />)
  expect(container.innerHTML).toBe('')
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => { throw new Error('x') } } })
  expect(() => render(<ForgetDevice />)).not.toThrow()
})
