import { expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { isSessionRecent } = await import('./reauth')

const client = (rpc: () => Promise<unknown>) => ({ rpc }) as never

test('só é recente quando a função responde sem erro e com true', async () => {
  expect(await isSessionRecent(client(async () => ({ data: true, error: null })))).toBe(true)
  expect(await isSessionRecent(client(async () => ({ data: false, error: null })))).toBe(false)
  expect(await isSessionRecent(client(async () => ({ data: true, error: { message: 'x' } })))).toBe(false)
  expect(await isSessionRecent(client(async () => ({ data: null, error: null })))).toBe(false)
  expect(await isSessionRecent(client(async () => { throw new Error('rede') }))).toBe(false)
})
