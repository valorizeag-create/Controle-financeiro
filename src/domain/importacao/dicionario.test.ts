import { describe, expect, it } from 'vitest'
import { dictionaryKey } from './dicionario'

describe('dictionaryKey', () => {
  it.each([
    ['uber trip', 'transporte'],
    ['ifood.com', 'comer_fora'],
    ['supermercado dia', 'mercado'],
    ['droga raia', 'saude'],
    ['netflix.com', 'assinaturas'],
    ['enel sp', 'casa'],
    ['amazon marketplace', 'compras'],
    ['amazon prime', 'assinaturas'],
    ['udemy', 'educacao'],
    ['cinemark', 'lazer'],
    ['99app', 'transporte'],
    ['99 pop', 'transporte'],
    ['99 taxi', 'transporte'],
    ['mercado livre', 'compras'],
    ['mercado pago', 'compras'],
    ['mercadopago', 'compras'],
    ['mercadolivre', 'compras'],
    ['uber eats', 'comer_fora'],
    ['mcdonalds', 'comer_fora'],
  ])('%s -> %s', (merchant, key) => {
    expect(dictionaryKey(merchant)).toBe(key)
  })

  it('sem correspondência devolve null', () => {
    expect(dictionaryKey('loja qualquer')).toBeNull()
  })

  it('palavra curta não casa dentro de outra palavra', () => {
    expect(dictionaryKey('99 farmacia')).not.toBe('transporte')
    expect(dictionaryKey('otimo servico')).toBeNull() // tim
    expect(dictionaryKey('barbearia do ze')).toBeNull() // bar
    expect(dictionaryKey('bar do ze')).toBe('comer_fora')
    expect(dictionaryKey('tim celular')).toBe('casa')
  })
})
