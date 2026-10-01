import { expect, test } from 'vitest'
import { familyNameSchema, familyPatch, inviteCodeSchema, inviteLink, memberIdSchema } from './schemas'

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
