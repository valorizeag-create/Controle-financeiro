// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: 'off' as string,
  device: vi.fn(async () => 'off' as string),
  recheck: vi.fn(async () => 'off' as string),
}))
vi.mock('./push-client', () => ({ deviceState: h.device, recheckWhenReady: h.recheck }))

const { PushSync } = await import('./push-sync')

beforeEach(() => { h.device.mockReset().mockImplementation(async () => h.state); h.recheck.mockClear(); h.state = 'off' })
afterEach(() => cleanup())

test('ao abrir o app confere de quem é a inscrição deste aparelho; não desenha nada', async () => {
  const { container } = render(<PushSync />)
  await vi.waitFor(() => expect(h.device).toHaveBeenCalledTimes(1))
  expect(container.innerHTML).toBe('')
  expect(h.recheck).not.toHaveBeenCalled()
})

test('service worker ainda registrando: a conferência é refeita quando ele fica pronto', async () => {
  h.state = 'checking'
  render(<PushSync />)
  await vi.waitFor(() => expect(h.recheck).toHaveBeenCalledTimes(1))
  expect(h.device).toHaveBeenCalledTimes(1)
})
