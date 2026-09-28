import { PAYMENT_LABELS } from '@/features/registro/labels'
import type { TxRow } from '@/features/registro/tx-row'

export type CardKind = 'credit' | 'debit'
export type CardColor = 'green' | 'purple' | 'blue' | 'orange' | 'graphite' | 'pink'

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
}

export type CardRawRow = {
  id: string
  nickname: string
  kind: string
  color: string
}

export const CARD_COLUMNS = 'id, nickname, kind, color'

export function toCardRow(r: CardRawRow): CardRow {
  return {
    id: r.id,
    nickname: r.nickname,
    kind: r.kind as CardKind,
    color: r.color as CardColor,
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
