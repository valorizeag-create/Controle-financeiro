import { afterEach, expect, test, vi } from 'vitest'
import { ensureOccurrences } from './occurrences'

afterEach(() => vi.restoreAllMocks())

test('pede ao banco para gerar as ocorrências do mês', async () => {
  const rpc = vi.fn(async () => ({ error: null }))
  await ensureOccurrences({ rpc })
  expect(rpc).toHaveBeenCalledWith('generate_occurrences')
})

test('falha na geração não derruba a tela', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(ensureOccurrences({ rpc: async () => ({ error: { message: 'x' } }) })).resolves.toBeUndefined()
  await expect(ensureOccurrences({ rpc: async () => { throw new Error('rede') } })).resolves.toBeUndefined()
  expect(log).toHaveBeenCalledTimes(2)
})
