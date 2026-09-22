import { describe, expect, test, vi } from 'vitest'
import { fetchAllPages } from './paging'

describe('fetchAllPages', () => {
  test('sem linhas', async () => {
    const fetchPage = vi.fn(async () => ({ data: [], error: null }))
    const result = await fetchAllPages(fetchPage)
    expect(result).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(0, 999)
  })

  test('exatamente 1000 e depois 0', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => i)
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const result = await fetchAllPages(fetchPage)
    expect(result).toHaveLength(1000)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  test('2500 linhas em 3 páginas', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => i), error: null })
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => 1000 + i), error: null })
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => 2000 + i), error: null })
    const result = await fetchAllPages(fetchPage)
    expect(result).toHaveLength(2500)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage).toHaveBeenNthCalledWith(3, 2000, 2999)
  })

  test('propaga erro', async () => {
    const boom = new Error('boom')
    const fetchPage = vi.fn(async () => ({ data: null, error: boom }))
    await expect(fetchAllPages(fetchPage)).rejects.toBe(boom)
  })
})
