import { describe, expect, it } from 'vitest'
import { parseCsv, periodOf } from './csv'
import type { RawLine } from './tipos'

describe('parseCsv', () => {
  it('lê ponto e vírgula com Data;Histórico;Valor', () => {
    const r = parseCsv('Data;Histórico;Valor\n01/10/2026;Padaria Teste;-12,30\n02/10/2026;Pix recebido;100,00\n03/10/2026;Mercado Exemplo;-1.234,56')
    expect(r).toEqual({
      ok: true,
      skipped: 0,
      lines: [
        { date: '2026-10-01', description: 'Padaria Teste', amountCents: 1230, direction: 'out' },
        { date: '2026-10-02', description: 'Pix recebido', amountCents: 10000, direction: 'in' },
        { date: '2026-10-03', description: 'Mercado Exemplo', amountCents: 123456, direction: 'out' },
      ],
    })
  })

  it('lê vírgula com Date,Description,Amount', () => {
    const r = parseCsv('Date,Description,Amount\n2026-10-01,Loja Fictícia,-12.30\n2026-10-02,Estorno,5.00')
    expect(r).toMatchObject({ ok: true, skipped: 0 })
    if (r.ok) {
      expect(r.lines[0]).toEqual({ date: '2026-10-01', description: 'Loja Fictícia', amountCents: 1230, direction: 'out' })
      expect(r.lines[1]).toMatchObject({ amountCents: 500, direction: 'in' })
    }
  })

  it('lê colunas separadas de débito e crédito', () => {
    const r = parseCsv('Data;Lançamento;Débito;Crédito\n01/10/2026;Conta de luz;150,00;\n02/10/2026;Salário;;3.000,00')
    expect(r).toMatchObject({ ok: true, skipped: 0 })
    if (r.ok) {
      expect(r.lines[0]).toMatchObject({ amountCents: 15000, direction: 'out' })
      expect(r.lines[1]).toMatchObject({ amountCents: 300000, direction: 'in' })
    }
  })

  it('acha o cabeçalho depois de linhas de título', () => {
    const r = parseCsv('Extrato da conta\nAgência 0000\n\nData;Histórico;Valor\n01/10/2026;Café;-5,00')
    expect(r).toMatchObject({ ok: true, skipped: 0 })
    if (r.ok) expect(r.lines).toHaveLength(1)
  })

  it('ignora saldo e conta como ignorada', () => {
    const r = parseCsv('Data;Histórico;Valor\n01/10/2026;Café;-5,00\n01/10/2026;SALDO DO DIA;95,00')
    expect(r).toMatchObject({ ok: true, skipped: 1 })
    if (r.ok) expect(r.lines).toHaveLength(1)
  })

  it('conta linha com data inválida como ignorada', () => {
    const r = parseCsv('Data;Histórico;Valor\n31/02/2026;Café;-5,00\n01/10/2026;Pão;-3,00')
    expect(r).toMatchObject({ ok: true, skipped: 1 })
    if (r.ok) expect(r.lines).toHaveLength(1)
  })

  it('respeita campos entre aspas com separador dentro', () => {
    const r = parseCsv('Data;Histórico;Valor\n01/10/2026;"Loja; filial 2";-8,00')
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.lines[0].description).toBe('Loja; filial 2')
  })

  it('devolve cabeçalho e prévia quando não reconhece, e aceita mapping', () => {
    const text = 'A;B;C\n01/10/2026;Café;-5,00\n02/10/2026;Pão;-3,00\n03/10/2026;x;1,00\n04/10/2026;y;1,00\n05/10/2026;z;1,00\n06/10/2026;w;1,00'
    const r = parseCsv(text)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.headers).toEqual(['A', 'B', 'C'])
      expect(r.preview).toHaveLength(5)
    }
    const mapped = parseCsv(text, { date: 0, description: 1, amount: 2 })
    expect(mapped).toMatchObject({ ok: true, skipped: 0 })
    if (mapped.ok) expect(mapped.lines).toHaveLength(6)
  })

  it('com mapping, não perde a primeira linha de um CSV sem cabeçalho', () => {
    const r = parseCsv('01/10/2026;Café;-5,00\n02/10/2026;Pão;-3,00', { date: 0, description: 1, amount: 2 })
    expect(r).toMatchObject({ ok: true, skipped: 0 })
    if (r.ok) expect(r.lines).toHaveLength(2)
  })

  it('sem cabeçalho e sem reconhecer: usa Coluna N e inclui todas as linhas na prévia', () => {
    const r = parseCsv('01/10/2026;Café;-5,00\n02/10/2026;Pão;-3,00')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.headers).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3'])
      expect(r.preview).toHaveLength(2)
      expect(r.preview[0][1]).toBe('Café')
    }
  })

  it('aceita CRLF, linha em branco e quebra final', () => {
    const r = parseCsv('Data;Histórico;Valor\r\n01/10/2026;Café;-5,00\r\n\r\n02/10/2026;Pão;-3,00\r\n')
    expect(r).toMatchObject({ ok: true, skipped: 0 })
    if (r.ok) expect(r.lines).toHaveLength(2)
  })

  it('conta uma vez a linha com data e valor ilegível', () => {
    const r = parseCsv('Data;Histórico;Valor\n01/10/2026;Café;abc\n02/10/2026;Pão;-3,00')
    expect(r).toMatchObject({ ok: true, skipped: 1 })
    if (r.ok) expect(r.lines).toHaveLength(1)
  })
})

describe('periodOf', () => {
  const line = (date: string): RawLine => ({ date, description: 'x', amountCents: 100, direction: 'out' })
  it('devolve menor e maior data', () => {
    expect(periodOf([line('2026-10-05'), line('2026-10-01'), line('2026-10-09')])).toEqual({ from: '2026-10-01', to: '2026-10-09' })
  })
  it('devolve null sem linhas', () => {
    expect(periodOf([])).toBeNull()
  })
})
