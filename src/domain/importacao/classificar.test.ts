import { describe, expect, it } from 'vitest'
import type { Category } from '@/features/registro/queries'
import { classify, specialOf, type Rule } from './classificar'
import type { RawLine } from './tipos'

const categories: Category[] = [
  { id: 'c-mercado', name: 'Supermercado', defaultKey: 'mercado' },
  { id: 'c-transp', name: 'Transporte', defaultKey: 'transporte' },
  { id: 'c-custom', name: 'Pet', defaultKey: null },
]

const out = (description: string): RawLine => ({ date: '2026-10-09', description, amountCents: 1000, direction: 'out' })
const inn = (description: string): RawLine => ({ date: '2026-10-09', description, amountCents: 1000, direction: 'in' })

describe('specialOf', () => {
  it.each([
    ['PAGAMENTO FATURA NUBANK', 'conta', 'fatura'],
    ['APLICACAO CDB', 'conta', 'transferencia'],
    ['TRANSF MESMA TITULARIDADE', 'conta', 'transferencia'],
    ['PAGAMENTO RECEBIDO', 'cartao', 'pagamento-fatura-no-cartao'],
    ['ESTORNO UBER', 'cartao', 'estorno'],
    ['PAGTO SALARIO EMPRESA X', 'conta', 'salario'],
    ['Pagamento Fatura Cartao', 'conta', 'fatura'],
    ['PAGAMENTO DE FATURA CARTAO', 'conta', 'fatura'],
    ['PAGAMENTO DA FATURA NUBANK', 'conta', 'fatura'],
    ['PAGTO. FATURA CARTAO', 'conta', 'fatura'],
    ['PAG FAT CARTAO', 'conta', 'fatura'],
    ['PGTO CARTAO CREDITO', 'conta', 'fatura'],
    ['PAGAMENTO FATURA CLARO', 'conta', null],
    ['PAGTO FATURA ENEL', 'conta', null],
    ['PAG FATURA VIVO', 'conta', null],
    ['TRANSFERENCIA PIX JOAO', 'conta', null],
    ['PAGAMENTO BOLETO', 'conta', null],
    ['RESG CDB', 'conta', 'transferencia'],
    ['APLIC AUTOMATICA', 'conta', 'transferencia'],
    ['PAGTO SALÁRIO', 'conta', 'salario'],
    ['PADARIA', 'conta', null],
  ] as const)('%s (%s)', (desc, origin, esperado) => {
    expect(specialOf(desc, origin)).toBe(esperado)
  })
})

describe('classify', () => {
  it('memória vence o dicionário', () => {
    const rules: Rule[] = [{ merchantKey: 'uber trip', kind: 'expense', categoryId: 'c-custom', source: null }]
    expect(classify(out('UBER TRIP'), { rules, categories })).toEqual({ kind: 'expense', categoryId: 'c-custom', source: null, via: 'memoria' })
  })

  it('regra com categoria que não existe mais é ignorada', () => {
    const rules: Rule[] = [{ merchantKey: 'uber trip', kind: 'expense', categoryId: 'sumiu', source: null }]
    expect(classify(out('UBER TRIP'), { rules, categories })).toMatchObject({ categoryId: 'c-transp', via: 'dicionario' })
  })

  it('dicionário resolve pela defaultKey mesmo com a categoria renomeada', () => {
    expect(classify(out('SUPERMERCADO DIA'), { rules: [], categories })).toMatchObject({ categoryId: 'c-mercado', via: 'dicionario' })
  })

  it('chave sem categoria correspondente fica sem categoria', () => {
    expect(classify(out('NETFLIX.COM'), { rules: [], categories })).toMatchObject({ categoryId: null, via: null })
  })

  it('entrada: kind income e salário vira origem Salário', () => {
    expect(classify(inn('PAGTO SALARIO EMPRESA X'), { rules: [], categories })).toMatchObject({ kind: 'income', categoryId: null, source: 'Salário' })
  })

  it('entrada: regra da memória fornece a origem', () => {
    const rules: Rule[] = [{ merchantKey: 'cliente joao', kind: 'income', categoryId: null, source: 'Freela' }]
    expect(classify(inn('PIX RECEBIDO 12345678900 CLIENTE JOAO'), { rules, categories })).toEqual({ kind: 'income', categoryId: null, source: 'Freela', via: 'memoria' })
  })

  it('entrada comum fica sem origem', () => {
    expect(classify(inn('PIX RECEBIDO MARIA'), { rules: [], categories })).toEqual({ kind: 'income', categoryId: null, source: null, via: null })
  })

  it('nada encontrado', () => {
    expect(classify(out('LOJA QUALQUER'), { rules: [], categories })).toEqual({ kind: 'expense', categoryId: null, source: null, via: null })
  })
})
