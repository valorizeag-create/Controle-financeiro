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
  expect(log).toHaveBeenCalledTimes(4)
})

test('gera também as contas da família; o erro de uma não impede a outra', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const rpc = vi.fn(async (fn: string) => ({ error: fn === 'generate_occurrences' ? { message: 'x' } : null }))
  await expect(ensureOccurrences({ rpc })).resolves.toBeUndefined()
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(['generate_occurrences', 'generate_family_occurrences'])
  expect(log).toHaveBeenCalledTimes(1)
})
