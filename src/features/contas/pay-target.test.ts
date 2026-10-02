import { describe, expect, test } from 'vitest'
import { payTarget } from './pay-target'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const bills = [{ id: ID, name: 'Luz' }, { id: '11111111-1111-4111-8111-111111111111', name: 'Água' }]

describe('payTarget: só uma conta a pagar que a própria tela já mostra', () => {
  test('acha a conta', () => expect(payTarget(ID, bills)).toEqual({ id: ID, name: 'Luz' }))
  test.each([undefined, '', 'abc', [ID, ID], '22222222-2222-4222-8222-222222222222', `${ID}\n`, ID.toUpperCase() + 'x'])('sem alvo para %j', (raw) => {
    expect(payTarget(raw as string | string[] | undefined, bills)).toBeNull()
  })
  test('conta já paga (não está na lista): nada', () => expect(payTarget(ID, [])).toBeNull())
})
