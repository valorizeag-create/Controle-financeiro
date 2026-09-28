import { expect, test } from 'vitest'
import { spentByCard, type CardTx } from './cards'

const tx = (p: Partial<CardTx>): CardTx => ({
  kind: 'expense', amountCents: 1000, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, cardId: 'k1', ...p,
})

test('gasto no mês por cartão, com parcelas e pelo mês em que contou (RN-30, A1)', () => {
  const txs: CardTx[] = [
    tx({}),
    tx({ amountCents: 2500, occurredOn: '2026-09-30' }), // parcela do mês
    tx({ amountCents: 700, cardId: 'k2' }),
    tx({ amountCents: 9000, occurredOn: '2026-10-10' }), // parcela de outubro
    tx({ amountCents: 4000, occurredOn: '2026-08-20', dueOn: '2026-08-20', paidOn: '2026-09-02' }), // conta paga em setembro
    tx({ amountCents: 3000, occurredOn: '2026-09-25', dueOn: '2026-09-25', status: 'pending' }), // a pagar: não conta
    tx({ amountCents: 5000, cardId: null }),
    tx({ amountCents: 6000, goalFundedCents: 6000 }), // valor inteiro, mesmo pago com meta
  ]
  expect(Object.fromEntries(spentByCard(txs, '2026-09'))).toEqual({ k1: 1000 + 2500 + 4000 + 6000, k2: 700 })
  expect(Object.fromEntries(spentByCard(txs, '2026-11'))).toEqual({})
})
