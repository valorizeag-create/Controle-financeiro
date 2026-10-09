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

describe('normalizeMerchant: estabilidade', () => {
  it('variações do mesmo comércio dão a mesma chave', () => {
    const a = normalizeMerchant('UBER *TRIP 07/10 SAO PAULO BR')
    expect(a).toBe('uber trip')
    expect(normalizeMerchant('UBER TRIP')).toBe(a)
    expect(normalizeMerchant('UBER* TRIP SAO PAULO')).toBe(a)
  })

  it('parcelas não mudam a chave', () => {
    expect(normalizeMerchant('LOJA X PARC 02/06')).toBe(normalizeMerchant('LOJA X PARC 03/06'))
    expect(normalizeMerchant('LOJA X PARCELA 2 DE 6')).toBe('loja x')
  })

  it('tira apóstrofo', () => {
    expect(normalizeMerchant("MCDONALD'S")).toBe('mcdonalds')
  })

  it('só prefixo e número dá chave vazia', () => {
    expect(normalizeMerchant('PIX RECEBIDO 12345678900')).toBe('')
    expect(normalizeMerchant('TED 123')).toBe('')
  })
})

describe('prettyNote', () => {
  it('tira prefixos e põe a primeira letra de cada palavra em maiúscula', () => {
    expect(prettyNote('COMPRA CARTAO PADARIA DO ZE')).toBe('Padaria Do Ze')
  })

  it('mantém acento, número curto e cidade', () => {
    expect(prettyNote('PÃO DE AÇÚCAR LOJA 123')).toBe('Pão De Açúcar Loja 123')
    expect(prettyNote('PADARIA DO ZE SAO PAULO')).toBe('Padaria Do Ze Sao Paulo')
  })

  it('tira números longos e datas', () => {
    expect(prettyNote('PIX ENVIADO 07/10 12345678900 JOAO SILVA')).toBe('Joao Silva')
  })

  it('siglas sem vogal ficam como estão', () => {
    expect(prettyNote('CPFL ENERGIA')).toBe('CPFL Energia')
  })

  it('limita a 140 caracteres', () => {
    expect(prettyNote('a'.repeat(300)).length).toBe(140)
  })
})
