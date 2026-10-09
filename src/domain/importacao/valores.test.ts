import { describe, expect, it } from 'vitest'
import { decodeBytes, parseAmount, parseDate } from './valores'

describe('parseAmount', () => {
  it('lê formatos brasileiros e sentido', () => {
    expect(parseAmount('-1.234,56')).toEqual({ cents: 123456, direction: 'out' })
    expect(parseAmount('1.234,56 D')).toEqual({ cents: 123456, direction: 'out' })
    expect(parseAmount('50,00 C')).toEqual({ cents: 5000, direction: 'in' })
    expect(parseAmount('1234.56')).toEqual({ cents: 123456, direction: 'in' })
    expect(parseAmount('R$ -12,30')).toEqual({ cents: 1230, direction: 'out' })
    expect(parseAmount('(12,30)')).toEqual({ cents: 1230, direction: 'out' })
  })
  it('rejeita vazio, texto e zero', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('0,00')).toBeNull()
  })
})

describe('parseDate', () => {
  it('lê os formatos aceitos', () => {
    expect(parseDate('09/10/2026')).toBe('2026-10-09')
    expect(parseDate('09/10/26')).toBe('2026-10-09')
    expect(parseDate('2026-10-09')).toBe('2026-10-09')
    expect(parseDate('2026-10-09T10:00:00')).toBe('2026-10-09')
  })
  it('rejeita datas impossíveis e texto', () => {
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('Data')).toBeNull()
  })
})

describe('decodeBytes', () => {
  it('decodifica Windows-1252 sem caractere de substituição', () => {
    // 'Saúde;Pão de Açúcar' em Windows-1252: ú=0xFA, ã=0xE3, ç=0xE7
    const bytes = new Uint8Array([
      0x53, 0x61, 0xfa, 0x64, 0x65, 0x3b, 0x50, 0xe3, 0x6f, 0x20, 0x64, 0x65, 0x20, 0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72,
    ])
    const text = decodeBytes(bytes)
    expect(text).toBe('Saúde;Pão de Açúcar')
    expect(text).not.toContain('�')
  })
  it('mantém UTF-8 e remove o BOM', () => {
    const bytes = new TextEncoder().encode('﻿Saúde;Pão de Açúcar')
    expect(decodeBytes(bytes)).toBe('Saúde;Pão de Açúcar')
  })
})
