import { expect, test } from 'vitest'
import { cardSchema } from './schemas'

test('apelido, tipo e cor', () => {
  expect(cardSchema.parse({ nickname: '  Nubank pessoal ', kind: 'debit', color: 'purple' })).toEqual({ nickname: 'Nubank pessoal', kind: 'debit', color: 'purple', brand: null })
})

test('mensagens do apelido', () => {
  expect(cardSchema.safeParse({ nickname: ' ', kind: 'credit', color: 'green' }).error?.issues[0].message).toBe('Falta o nome.')
  expect(cardSchema.safeParse({ nickname: 'x'.repeat(31), kind: 'credit', color: 'green' }).error?.issues[0].message).toBe('Use até 30 caracteres.')
})

test('tipo e cor desconhecidos viram o padrão', () => {
  expect(cardSchema.parse({ nickname: 'Inter', kind: 'pix', color: 'red' })).toEqual({ nickname: 'Inter', kind: 'credit', color: 'green', brand: null })
})

test('bandeira: visa, mastercard ou amex; vazia ou desconhecida fica sem bandeira', () => {
  const base = { nickname: 'Inter', kind: 'credit', color: 'green' }
  expect(cardSchema.parse({ ...base, brand: 'visa' }).brand).toBe('visa')
  expect(cardSchema.parse({ ...base, brand: 'mastercard' }).brand).toBe('mastercard')
  expect(cardSchema.parse({ ...base, brand: 'amex' }).brand).toBe('amex')
  expect(cardSchema.parse({ ...base, brand: '' }).brand).toBeNull()
  expect(cardSchema.parse({ ...base, brand: 'elo' }).brand).toBeNull()
  expect(cardSchema.parse(base).brand).toBeNull()
})
