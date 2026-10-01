import { expect, test } from 'vitest'
import { familyBillSchema, familyNameSchema, familyPatch, familyReturnPath, makeFamilyExpenseSchema, inviteCodeSchema, inviteLink, memberIdSchema } from './schemas'

test('nome da família: limpo, obrigatório, até 40', () => {
  expect(familyNameSchema.safeParse({ name: '  Família   Souza ' }).data).toEqual({ name: 'Família Souza' })
  expect(familyNameSchema.safeParse({ name: '   ' }).error?.issues[0].message).toBe('Falta o nome.')
  expect(familyNameSchema.safeParse({ name: 'x'.repeat(41) }).error?.issues[0].message).toBe('Use até 40 caracteres.')
  expect(familyNameSchema.safeParse({ name: 'x'.repeat(40) }).success).toBe(true)
})

test('código do convite: 32 caracteres seguros; link no domínio do app', () => {
  expect(inviteCodeSchema.safeParse('a'.repeat(32)).success).toBe(true)
  for (const bad of ['a'.repeat(31), 'a'.repeat(33), `${'a'.repeat(31)}/`, '../../inicio', '']) expect(inviteCodeSchema.safeParse(bad).success).toBe(false)
  expect(inviteLink('https://iris.app', 'abc')).toBe('https://iris.app/convite/abc')
})

test('pessoa: só identificador uuid', () => {
  expect(memberIdSchema.safeParse('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90').success).toBe(true)
  expect(memberIdSchema.safeParse('nao-e-uuid').success).toBe(false)
})

test('"Gasto da família" na edição: nunca leva um gasto antigo para outra família (decisão 97)', () => {
  expect(familyPatch({ existingFamilyId: null, wantsFamily: true, myFamilyId: 'f1' })).toEqual({ family_id: 'f1' })
  expect(familyPatch({ existingFamilyId: null, wantsFamily: true, myFamilyId: null })).toEqual({})
  expect(familyPatch({ existingFamilyId: 'f0', wantsFamily: true, myFamilyId: 'f1' })).toEqual({})
  expect(familyPatch({ existingFamilyId: 'f0', wantsFamily: false, myFamilyId: null })).toEqual({ family_id: null })
  expect(familyPatch({ existingFamilyId: null, wantsFamily: false, myFamilyId: 'f1' })).toEqual({})
})

test('volta da conta da família: só as duas telas da família, com ou sem mês', () => {
  for (const ok of ['/inicio/familia', '/inicio/familia?mes=2026-08', '/familia/contas', '/familia/contas?mes=2026-08']) expect(familyReturnPath(ok)).toBe(ok)
  for (const bad of ['https://evil.com', '//evil.com', '/extrato', '/inicio/familia?mes=abc', '/inicio/familia?mes=2026-13', '']) expect(familyReturnPath(bad)).toBe('/familia/contas')
})

test('gasto da família (administrador): mesmas regras de valor e data do Anotar, sem categoria', () => {
  const schema = makeFamilyExpenseSchema('2026-09-30')
  expect(schema.safeParse({ amount: '99,90', when: 'other', date: '2026-08-10', note: ' lâmpadas ' }).data).toEqual({
    amountCents: 9990,
    occurredOn: '2026-08-10',
    note: 'lâmpadas',
  })
  expect(schema.safeParse({ amount: '10', when: 'today', date: '', note: '' }).data).toMatchObject({ occurredOn: '2026-09-30', note: null })
  for (const date of ['1999-12-31', '2027-10-01']) {
    expect(schema.safeParse({ amount: '10', when: 'other', date, note: '' }).error?.issues[0]).toMatchObject({ path: ['date'], message: 'Escolha o dia.' })
  }
  expect(schema.safeParse({ amount: 'abc', when: 'today', date: '', note: '' }).error?.issues[0].message).toBe('Esse valor não parece certo. Use apenas números.')
  expect(schema.safeParse({ amount: '10', when: 'today', date: '', note: 'x'.repeat(141) }).error?.issues[0].message).toBe('Use até 140 caracteres.')
})

test('conta da família: nome, valor e dia', () => {
  expect(familyBillSchema.safeParse({ name: ' Aluguel ', amount: '1.800,00', dueDay: '5' }).data).toEqual({ name: 'Aluguel', amountCents: 180000, dueDay: 5 })
  expect(familyBillSchema.safeParse({ name: '', amount: '1', dueDay: '5' }).error?.issues[0].message).toBe('Falta o nome.')
  expect(familyBillSchema.safeParse({ name: 'a', amount: '1', dueDay: '32' }).error?.issues[0].message).toBe('Escolha o dia.')
})
