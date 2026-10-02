import { expect, test } from 'vitest'
import { DELETE_WORD, deletionNotice, familyShareCents, isDeleteConfirmed } from './account'

test('a confirmação é a palavra EXCLUIR, em maiúsculas; espaços nas pontas não contam', () => {
  expect(DELETE_WORD).toBe('EXCLUIR')
  for (const ok of ['EXCLUIR', ' EXCLUIR ', 'EXCLUIR\n']) expect(isDeleteConfirmed(ok), ok).toBe(true)
  for (const no of ['', 'excluir', 'Excluir', 'EXCLUIR!', 'EXCLU IR', 'EXCLUIR MEU CADASTRO']) expect(isDeleteConfirmed(no), no).toBe(false)
})

test('parte nas metas da família: soma do saldo próprio em cada meta da família, só o que é positivo', () => {
  const moves = [
    { goalId: 'g1', kind: 'deposit' as const, amountCents: 3000 },
    { goalId: 'g1', kind: 'withdraw' as const, amountCents: 500 },
    { goalId: 'g2', kind: 'deposit' as const, amountCents: 1000 },
    { goalId: 'g2', kind: 'use' as const, amountCents: 750 },
    { goalId: 'g3', kind: 'deposit' as const, amountCents: 400 },
    { goalId: 'g3', kind: 'return_on_exit' as const, amountCents: 400 },
    { goalId: 'pessoal', kind: 'deposit' as const, amountCents: 99999 },
  ]
  expect(familyShareCents(['g1', 'g2', 'g3'], moves)).toBe(2750)
  expect(familyShareCents(['g3'], moves)).toBe(0)
  expect(familyShareCents([], moves)).toBe(0)
  // um saldo negativo numa meta (banco antigo) não desconta das outras
  expect(familyShareCents(['g1', 'g9'], [...moves, { goalId: 'g9', kind: 'withdraw' as const, amountCents: 100 }])).toBe(2500)
})

test('qual aviso: tudo é apagado, ou os gastos da família ficam sem o nome', () => {
  const none = { hasCurrentFamilyTx: false, hasOtherFamilyTx: false, activeMembers: 0 }
  expect(deletionNotice(none)).toBe('everything')
  // sozinha na família: a família termina com ela e nada fica
  expect(deletionNotice({ ...none, hasCurrentFamilyTx: true, activeMembers: 1 })).toBe('everything')
  expect(deletionNotice({ ...none, hasCurrentFamilyTx: true, activeMembers: 2 })).toBe('family-history')
  // gastos numa família de que já saiu ficam lá
  expect(deletionNotice({ ...none, hasOtherFamilyTx: true })).toBe('family-history')
  expect(deletionNotice({ hasCurrentFamilyTx: false, hasOtherFamilyTx: false, activeMembers: 3 })).toBe('everything')
})
