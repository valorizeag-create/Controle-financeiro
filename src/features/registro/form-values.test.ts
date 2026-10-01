import { describe, expect, test } from 'vitest'
import { parseBRL } from '@/domain/money'
import { centsToInput, recordToFormValues, type EditableRecord } from './form-values'

describe('centsToInput', () => {
  test('mostra o valor como a pessoa digitaria, e ele volta igual', () => {
    for (const [cents, text] of [[14230, '142,30'], [500000, '5000,00'], [5, '0,05'], [9_999_999_999, '99999999,99']] as const) {
      expect(centsToInput(cents)).toBe(text)
      expect(parseBRL(centsToInput(cents))).toBe(cents)
    }
  })
})

describe('recordToFormValues', () => {
  const base: EditableRecord = {
    id: 'r1', kind: 'expense', amountCents: 14230, categoryId: 'c1', source: null, note: 'feira', paymentMethod: 'pix', occurredOn: '2026-09-30',
  }
  test('registro de hoje e de ontem usam os atalhos', () => {
    expect(recordToFormValues(base, '2026-09-30')).toEqual({
      amount: '142,30', categoryId: 'c1', source: '', note: 'feira', paymentMethod: 'pix', cardId: '', family: '', when: 'today', date: '',
    })
    expect(recordToFormValues(base, '2026-10-01')).toMatchObject({ when: 'yesterday', date: '' })
  })
  test('gasto da família vem marcado', () => {
    expect(recordToFormValues({ ...base, familyId: 'f1' }, '2026-09-30').family).toBe('on')
  })
  test('outro dia leva a data', () => {
    expect(recordToFormValues({ ...base, occurredOn: '2026-08-15' }, '2026-09-30')).toMatchObject({ when: 'other', date: '2026-08-15' })
  })
  test('registro com cartão leva o cartão para o formulário', () => {
    expect(recordToFormValues({ ...base, cardId: 'k1' }, '2026-09-30').cardId).toBe('k1')
  })
  test('entrada leva a origem e deixa categoria vazia', () => {
    const r = recordToFormValues({ ...base, kind: 'income', categoryId: null, source: 'Salário', note: null, paymentMethod: null }, '2026-09-30')
    expect(r).toMatchObject({ categoryId: '', source: 'Salário', note: '', paymentMethod: '' })
  })
})
