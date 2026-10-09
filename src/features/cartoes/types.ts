import { PAYMENT_LABELS } from '@/features/registro/labels'
import type { TxRow } from '@/features/registro/tx-row'

export type CardKind = 'credit' | 'debit'
export type CardColor = 'green' | 'purple' | 'blue' | 'orange' | 'graphite' | 'pink'
export type CardBrand = 'visa' | 'mastercard' | 'amex'

// Bandeira é opcional: sem ela (null) o cartão mostra "Íris" no lugar do logo. A ordem é a do formulário.
export const CARD_BRANDS: readonly CardBrand[] = ['visa', 'mastercard', 'amex']

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
}

export const CARD_KINDS: readonly CardKind[] = ['credit', 'debit']

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  credit: 'Crédito',
  debit: 'Débito',
}

export interface CardRow {
  id: string
  nickname: string
  kind: CardKind
  color: CardColor
  brand: CardBrand | null
}

export type CardRawRow = {
  id: string
  nickname: string
  kind: string
  color: string
  brand: string | null
}

export const CARD_COLUMNS = 'id, nickname, kind, color, brand'

export function toCardRow(r: CardRawRow): CardRow {
  return {
    id: r.id,
    nickname: r.nickname,
    kind: r.kind as CardKind,
    color: r.color as CardColor,
    brand: (CARD_BRANDS as readonly string[]).includes(r.brand ?? '') ? (r.brand as CardBrand) : null,
  }
}

export const DELETED_CARD = 'Cartão excluído'

export function paymentText(tx: Pick<TxRow, 'cardId' | 'cardDeleted' | 'paymentMethod'>, cards: CardRow[]): string | null {
  if (tx.cardId !== null) {
    const card = cards.find((c) => c.id === tx.cardId)
    if (card) return card.nickname
  }
  if (tx.cardDeleted) return DELETED_CARD
  if (tx.paymentMethod !== null) return PAYMENT_LABELS[tx.paymentMethod] ?? null
  return null
}
