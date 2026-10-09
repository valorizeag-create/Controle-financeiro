import { describe, expect, it } from 'vitest'
import { normalizeMerchant, prettyNote } from './normalizar'

describe('normalizeMerchant', () => {
  it.each([
    ['COMPRA CARTAO 07/10 PADARIA DO ZE SAO PAULO BR', 'padaria do ze'],
    ['IFD*IFOOD.COM AGENCIA DE RESTA', 'ifood.com agencia de resta'],
    ['PIX ENVIADO 12345678900 JOAO SILVA', 'joao silva'],
    ['MP *MERCADOLIVRE', 'mercadolivre'],
    ['Pão de Açúcar - Loja 123', 'pao de acucar - loja'],
  ])('%s', (entrada, esperado) => {
    expect(normalizeMerchant(entrada)).toBe(esperado)
  })

  it('tira cidade e UF no fim', () => {
    expect(normalizeMerchant('PADARIA DO ZE CAMPINAS SP')).toBe('padaria do ze')
  })

  it('limita a 60 caracteres', () => {
    expect(normalizeMerchant('A'.repeat(100)).length).toBe(60)
  })
})

describe('prettyNote', () => {
  it('tira prefixos e põe a primeira letra de cada palavra em maiúscula', () => {
    expect(prettyNote('COMPRA CARTAO PADARIA DO ZE')).toBe('Padaria Do Ze')
  })

  it('limita a 140 caracteres', () => {
    expect(prettyNote('a'.repeat(300)).length).toBe(140)
  })
})
