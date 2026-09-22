import { describe, expect, test } from 'vitest'
import { firstFieldErrors } from '@/lib/forms'
import { makeExpenseSchema, makeIncomeSchema, resolveWhen } from './schemas'

const today = '2026-09-30'
const cat = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

describe('resolveWhen', () => {
  test('Hoje e Ontem usam o dia de Brasília informado pelo servidor', () => {
    expect(resolveWhen('today', '', today)).toBe('2026-09-30')
    expect(resolveWhen('yesterday', '', today)).toBe('2026-09-29')
    expect(resolveWhen('other', '2026-08-15', today)).toBe('2026-08-15')
    expect(resolveWhen('other', '2026-02-30', today)).toBeNull()
    expect(resolveWhen('qualquer', '', today)).toBeNull()
  })
})

describe('gasto', () => {
  const schema = makeExpenseSchema(today)
  test('válido vira centavos e data', () => {
    const r = schema.parse({ amount: '142,30', categoryId: cat, when: 'today', date: '', note: ' café ', paymentMethod: '' })
    expect(r).toEqual({ amountCents: 14230, categoryId: cat, occurredOn: today, note: 'café', paymentMethod: null })
  })
  test('mensagens da copy', () => {
    const r = schema.safeParse({ amount: '', categoryId: '', when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r.error!)).toEqual({
      amount: 'Falta o valor.',
      categoryId: 'Escolha uma categoria para esse gasto.',
    })
    const r2 = schema.safeParse({ amount: '12a', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r2.error!)).toEqual({ amount: 'Esse valor não parece certo. Use apenas números.' })
    const r3 = schema.safeParse({ amount: '0', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r3.error!)).toEqual({ amount: 'Falta o valor.' })
  })
  test('data de outro dia inválida', () => {
    const r = schema.safeParse({ amount: '10', categoryId: cat, when: 'other', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r.error!)).toEqual({ date: 'Escolha o dia.' })
  })
})

describe('entrada', () => {
  test('origem opcional', () => {
    const r = makeIncomeSchema(today).parse({ amount: '5.000', source: '', when: 'today', date: '' })
    expect(r).toEqual({ amountCents: 500000, source: null, occurredOn: today })
  })
})
