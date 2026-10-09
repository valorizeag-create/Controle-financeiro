import { expect, test } from 'vitest'
import { CARD_BRAND_LABELS, CARD_KIND_LABELS, DELETED_CARD, paymentText, toCardRow } from './types'

const cards = [toCardRow({ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', brand: 'mastercard' })]

test('converte a linha do banco', () => {
  expect(cards[0]).toEqual({ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', brand: 'mastercard' })
  expect(CARD_KIND_LABELS).toEqual({ credit: 'Crédito', debit: 'Débito' })
})

test('como pagou: apelido do cartão, "Cartão excluído" ou a forma de pagamento (decisão 47)', () => {
  expect(paymentText({ cardId: 'k1', cardDeleted: false, paymentMethod: null }, cards)).toBe('Nubank pessoal')
  expect(paymentText({ cardId: null, cardDeleted: true, paymentMethod: null }, cards)).toBe(DELETED_CARD)
  expect(DELETED_CARD).toBe('Cartão excluído')
  expect(paymentText({ cardId: null, cardDeleted: false, paymentMethod: 'pix' }, cards)).toBe('Pix')
  expect(paymentText({ cardId: null, cardDeleted: false, paymentMethod: null }, cards)).toBeNull()
})

test('bandeira: nomes, e valor desconhecido vindo do banco vira "sem bandeira"', () => {
  expect(CARD_BRAND_LABELS).toEqual({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' })
  expect(toCardRow({ id: 'k2', nickname: 'X', kind: 'debit', color: 'blue', brand: null }).brand).toBeNull()
  expect(toCardRow({ id: 'k3', nickname: 'X', kind: 'debit', color: 'blue', brand: 'elo' }).brand).toBeNull()
})
