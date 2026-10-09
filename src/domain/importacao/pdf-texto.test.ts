import { describe, expect, it } from 'vitest'
import { linesFromItems, parseStatementLines } from './pdf-texto'

describe('linesFromItems', () => {
  it('agrupa itens embaralhados em linhas ordenadas por y e x', () => {
    const items = [
      { str: '-12,30', x: 300, y: 500, page: 1 },
      { str: '07/10', x: 10, y: 700, page: 1 },
      { str: 'PADARIA', x: 60, y: 500, page: 1 },
      { str: '150,00', x: 300, y: 700, page: 1 },
      { str: '08/10', x: 10, y: 500, page: 1 },
      { str: 'PIX', x: 60, y: 700, page: 1 },
    ]
    expect(linesFromItems(items)).toEqual(['07/10 PIX 150,00', '08/10 PADARIA -12,30'])
  })

  it('junta itens com y levemente diferente (tolerância de 2)', () => {
    const items = [
      { str: 'A', x: 10, y: 100, page: 1 },
      { str: 'B', x: 50, y: 101.5, page: 1 },
    ]
    expect(linesFromItems(items)).toEqual(['A B'])
  })

  it('não mistura páginas', () => {
    const items = [
      { str: 'P2', x: 10, y: 100, page: 2 },
      { str: 'P1', x: 10, y: 100, page: 1 },
    ]
    expect(linesFromItems(items)).toEqual(['P1', 'P2'])
  })
})

describe('parseStatementLines', () => {
  it('lê data sem ano, valor negativo e usa o year', () => {
    const r = parseStatementLines(['07/10 COMPRA CARTAO PADARIA DO ZE -12,30'], 2026)
    expect(r).toEqual({
      lines: [{ date: '2026-10-07', description: 'COMPRA CARTAO PADARIA DO ZE', amountCents: 1230, direction: 'out' }],
      skipped: 0,
    })
  })

  it('lê crédito com sufixo C', () => {
    const r = parseStatementLines(['07/10/2026 PIX RECEBIDO MARIA 150,00 C'], 2026)
    expect(r.lines).toEqual([{ date: '2026-10-07', description: 'PIX RECEBIDO MARIA', amountCents: 15000, direction: 'in' }])
  })

  it('usa o primeiro valor e ignora o saldo', () => {
    const r = parseStatementLines(['08/10/2026 UBER *TRIP 23,90 D 1.204,50'], 2026)
    expect(r.lines).toEqual([{ date: '2026-10-08', description: 'UBER *TRIP', amountCents: 2390, direction: 'out' }])
  })

  it('ignora linhas sem data e linhas com data sem valor, sem contar skipped', () => {
    const r = parseStatementLines(['SALDO ANTERIOR 1.000,00', 'Extrato conta', '07/10 Saldo do dia'], 2026)
    expect(r).toEqual({ lines: [], skipped: 0 })
  })

  it('aceita R$ e sinal explícito', () => {
    const r = parseStatementLines(['09/10/2026 MERCADO R$ -45,90'], 2026)
    expect(r.lines).toEqual([{ date: '2026-10-09', description: 'MERCADO', amountCents: 4590, direction: 'out' }])
  })

  it('conta skipped quando há data e valor mas a data é inválida', () => {
    const r = parseStatementLines(['31/02 COMPRA X -10,00', '07/10 OK -1,00'], 2026)
    expect(r.skipped).toBe(1)
    expect(r.lines).toHaveLength(1)
  })

  it('conta skipped quando a descrição fica vazia', () => {
    const r = parseStatementLines(['07/10 -10,00'], 2026)
    expect(r).toEqual({ lines: [], skipped: 1 })
  })
})
