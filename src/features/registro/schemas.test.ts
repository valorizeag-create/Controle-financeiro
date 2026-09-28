import { describe, expect, test } from 'vitest'
import { firstFieldErrors } from '@/lib/forms'
import { addDays } from '@/domain/dates'
import { makeExpenseSchema, makeIncomeSchema, parseRepeat, readInstallments, resolveWhen } from './schemas'

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

  test('rejeita datas fora do intervalo permitido', () => {
    expect(resolveWhen('other', '1999-12-31', today)).toBeNull()
    expect(resolveWhen('other', addDays(today, 366), today)).toBeNull()
    expect(resolveWhen('other', addDays(today, 365), today)).toBe(addDays(today, 365))
    expect(resolveWhen('other', '2000-01-01', today)).toBe('2000-01-01')
  })
})

describe('gasto', () => {
  const schema = makeExpenseSchema(today)
  test('válido vira centavos e data', () => {
    const r = schema.parse({ amount: '142,30', categoryId: cat, when: 'today', date: '', note: ' café ', paymentMethod: '' })
    expect(r).toEqual({ amountCents: 14230, categoryId: cat, occurredOn: today, note: 'café', paymentMethod: null, cardId: null })
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
  test('data de outro dia fora do intervalo permitido', () => {
    const r1 = schema.safeParse({ amount: '10', categoryId: cat, when: 'other', date: '1999-12-31', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r1.error!)).toEqual({ date: 'Escolha o dia.' })
    const r2 = schema.safeParse({
      amount: '10',
      categoryId: cat,
      when: 'other',
      date: addDays(today, 366),
      note: '',
      paymentMethod: '',
    })
    expect(firstFieldErrors(r2.error!)).toEqual({ date: 'Escolha o dia.' })
  })
  test('método de pagamento fora do enum vira nulo', () => {
    const r = schema.parse({ amount: '10', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: 'bitcoin' })
    expect(r.paymentMethod).toBeNull()
  })
  test('valor grande demais não parece certo', () => {
    const r = schema.safeParse({ amount: '100.000.000,00', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r.error!)).toEqual({ amount: 'Esse valor não parece certo. Use apenas números.' })
  })
  test('nota com mais de 140 caracteres', () => {
    const r = schema.safeParse({
      amount: '10',
      categoryId: cat,
      when: 'today',
      date: '',
      note: 'a'.repeat(141),
      paymentMethod: '',
    })
    expect(firstFieldErrors(r.error!)).toEqual({ note: 'Use até 140 caracteres.' })
  })
  test('when yesterday usa o dia anterior', () => {
    const r = schema.parse({ amount: '10', categoryId: cat, when: 'yesterday', date: '', note: '', paymentMethod: '' })
    expect(r.occurredOn).toBe(addDays(today, -1))
  })
  test('gasto com cartão: a forma de pagamento fica vazia; id que não é de cartão é ignorado (decisão 47)', () => {
    const CARD = '9c1e3f2a-5b7d-4e8a-9c21-7d4e5f6a8b91'
    const s = makeExpenseSchema(today)
    const base = { amount: '10', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: 'pix' }
    expect(s.parse({ ...base, cardId: CARD })).toMatchObject({ cardId: CARD, paymentMethod: null })
    expect(s.parse({ ...base, cardId: '' })).toMatchObject({ cardId: null, paymentMethod: 'pix' })
    expect(s.parse({ ...base, cardId: 'nao-e-id' })).toMatchObject({ cardId: null, paymentMethod: 'pix' })
  })
})

describe('entrada', () => {
  test('origem opcional', () => {
    const r = makeIncomeSchema(today).parse({ amount: '5.000', source: '', when: 'today', date: '' })
    expect(r).toEqual({ amountCents: 500000, source: null, occurredOn: today })
  })
  test('origem com mais de 40 caracteres', () => {
    const r = makeIncomeSchema(today).safeParse({ amount: '5.000', source: 'a'.repeat(41), when: 'today', date: '' })
    expect(firstFieldErrors(r.error!)).toEqual({ source: 'Use até 40 caracteres.' })
  })
  test('entrada não pode ser datada de amanhã: dinheiro que ainda não chegou não conta', () => {
    const r = makeIncomeSchema(today).safeParse({
      amount: '10',
      source: '',
      when: 'other',
      date: addDays(today, 1),
    })
    expect(firstFieldErrors(r.error!)).toEqual({ date: 'Escolha o dia.' })
  })
  test('entrada datada de hoje é permitida', () => {
    const r = makeIncomeSchema(today).parse({ amount: '10', source: '', when: 'other', date: today })
    expect(r.occurredOn).toBe(today)
  })
  test('gasto datado de amanhã continua permitido (dentro do limite de 365 dias à frente)', () => {
    const r = makeExpenseSchema(today).parse({
      amount: '10',
      categoryId: cat,
      when: 'other',
      date: addDays(today, 1),
      note: '',
      paymentMethod: '',
    })
    expect(r.occurredOn).toBe(addDays(today, 1))
  })
})

test('parseRepeat: só "on" repete; padrão todo mês', () => {
  expect(parseRepeat('on', 'yearly')).toBe('yearly')
  expect(parseRepeat('on', 'monthly')).toBe('monthly')
  expect(parseRepeat('on', '')).toBe('monthly')
  expect(parseRepeat('', 'yearly')).toBeNull()
})

test('readInstallments: só vale com "Foi parcelado" marcado, de 2 a 48', () => {
  expect(readInstallments({ parcelado: '', installments: '3' })).toEqual({ count: null, error: null })
  expect(readInstallments({ parcelado: 'on', installments: '3' })).toEqual({ count: 3, error: null })
  expect(readInstallments({ parcelado: 'on', installments: '48' })).toEqual({ count: 48, error: null })
  for (const bad of ['', '1', '49', 'dez', '2.5', '-3', '003']) {
    expect(readInstallments({ parcelado: 'on', installments: bad })).toEqual({ count: null, error: 'Escolha de 2 a 48 parcelas.' })
  }
})
