import { describe, expect, test } from 'vitest'
import {
  DEFAULT_CATEGORY_NAMES, EX_MEMBER, FAMILY_LIMITS, authorLabel, familyCategoryGroup, familyMonth,
  personalLedger, splitFamilyUse, type FamilyExpense,
} from './family'

const exp = (p: Partial<FamilyExpense>): FamilyExpense => ({
  id: 'x', effectiveOn: '2026-09-10', amountCents: 0, categoryKey: 'mercado', categoryName: 'Mercado',
  note: null, authorId: 'me', authorName: 'Camila', ...p,
})

test('limites e nomes padrão', () => {
  expect(FAMILY_LIMITS).toEqual({ maxMembers: 10, inviteDays: 7, nameMax: 40 })
  expect(Object.keys(DEFAULT_CATEGORY_NAMES)).toHaveLength(10)
  expect(DEFAULT_CATEGORY_NAMES.comer_fora).toBe('Comer fora')
  expect(EX_MEMBER).toBe('Ex-membro')
})

describe('personalLedger (conta da família a pagar não é de ninguém — Review Focus 4)', () => {
  test('tira só a conta da família ainda não paga', () => {
    const rows = [
      { id: 'a', status: 'pending' as const, familyId: 'f' },
      { id: 'b', status: 'confirmed' as const, familyId: 'f' },
      { id: 'c', status: 'pending' as const, familyId: null },
      { id: 'd', status: 'confirmed' as const, familyId: null },
    ]
    expect(personalLedger(rows).map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })
})

describe('categorias na família (A3)', () => {
  test('padrão pela chave, com o nome da copy, mesmo renomeada; própria pelo nome, sem maiúsculas', () => {
    expect(familyCategoryGroup('mercado', 'Supermercado')).toEqual({ groupKey: 'd:mercado', label: 'Mercado' })
    expect(familyCategoryGroup(null, ' Pet ')).toEqual({ groupKey: 'n:pet', label: 'Pet' })
    expect(familyCategoryGroup(null, 'PET').groupKey).toBe(familyCategoryGroup(null, 'pet').groupKey)
    expect(familyCategoryGroup('desconhecida', 'Casa nova')).toEqual({ groupKey: 'n:casa nova', label: 'Casa nova' })
  })
})

test('quem registrou: Você, o nome, ou Ex-membro (RN-23, RN-24)', () => {
  expect(authorLabel('me', 'Camila', 'me')).toBe('Você')
  expect(authorLabel('u2', 'Alex', 'me')).toBe('Alex')
  expect(authorLabel(null, null, 'me')).toBe('Ex-membro')
  expect(authorLabel('u3', null, 'me')).toBe('Ex-membro')
})

describe('mês da família', () => {
  test('protótipo Mobile-Familia: total, por pessoa (Você primeiro), por categoria e últimos', () => {
    const expenses = [
      exp({ id: '1', effectiveOn: '2026-09-28', amountCents: 31240, authorId: 'u2', authorName: 'Alex' }),
      exp({ id: '2', effectiveOn: '2026-09-27', amountCents: 8990, categoryKey: 'casa', categoryName: 'Casa' }),
      exp({ id: '3', effectiveOn: '2026-09-05', amountCents: 121010, authorId: 'me', categoryKey: 'casa', categoryName: 'Aluguel e casa' }),
      exp({ id: '4', effectiveOn: '2026-09-03', amountCents: 52760, authorId: 'u2', authorName: 'Alex', categoryKey: 'mercado', categoryName: 'Supermercado' }),
      exp({ id: '5', effectiveOn: '2026-08-31', amountCents: 99999 }),
      exp({ id: '6', effectiveOn: '2026-09-02', amountCents: 40000, authorId: null, authorName: null, categoryKey: null, categoryName: 'Comer fora' }),
    ]
    const m = familyMonth({ month: '2026-09', expenses, meId: 'me', recentLimit: 2 })
    expect(m.totalCents).toBe(31240 + 8990 + 121010 + 52760 + 40000)
    expect(m.byMember).toEqual([
      { authorId: 'me', label: 'Você', cents: 130000 },
      { authorId: 'u2', label: 'Alex', cents: 84000 },
      { authorId: null, label: 'Ex-membro', cents: 40000 },
    ])
    expect(m.byCategory).toEqual([
      { groupKey: 'd:casa', label: 'Casa', cents: 130000 },
      { groupKey: 'd:mercado', label: 'Mercado', cents: 84000 },
      { groupKey: 'n:comer fora', label: 'Comer fora', cents: 40000 },
    ])
    expect(m.recent.map((e) => e.id)).toEqual(['1', '2'])
  })

  test('mês sem gastos da família: tudo zerado e listas vazias', () => {
    expect(familyMonth({ month: '2026-10', expenses: [exp({ amountCents: 100 })], meId: 'me' })).toEqual({
      totalCents: 0, byMember: [], byCategory: [], recent: [],
    })
  })
})

describe('divisão do uso da meta da família (RN-22c, Review Focus 4)', () => {
  const sum = (xs: { cents: number }[]) => xs.reduce((a, b) => a + b.cents, 0)

  test('proporcional ao guardado; exato quando dá', () => {
    expect(splitFamilyUse(300000, [{ userId: 'a', cents: 100000 }, { userId: 'b', cents: 200000 }])).toEqual([
      { userId: 'a', cents: 100000 }, { userId: 'b', cents: 200000 },
    ])
    expect(splitFamilyUse(150000, [{ userId: 'b', cents: 200000 }, { userId: 'a', cents: 100000 }])).toEqual([
      { userId: 'a', cents: 50000 }, { userId: 'b', cents: 100000 },
    ])
  })

  test('centavos que sobram vão para os maiores restos; nunca mais do que a parte', () => {
    expect(splitFamilyUse(2, [{ userId: 'a', cents: 1 }, { userId: 'b', cents: 2 }])).toEqual([
      { userId: 'a', cents: 1 }, { userId: 'b', cents: 1 },
    ])
    const three = splitFamilyUse(100, [{ userId: 'a', cents: 3333 }, { userId: 'b', cents: 3333 }, { userId: 'c', cents: 3334 }])
    expect(three).toEqual([{ userId: 'a', cents: 33 }, { userId: 'b', cents: 33 }, { userId: 'c', cents: 34 }])
    expect(sum(three)).toBe(100)
  })

  test('valores no limite do app não perdem centavos; empate total pelo id', () => {
    const big = splitFamilyUse(9_999_999_999, [{ userId: 'b', cents: 9_999_999_999 }, { userId: 'a', cents: 9_999_999_999 }])
    expect(big).toEqual([{ userId: 'a', cents: 5_000_000_000 }, { userId: 'b', cents: 4_999_999_999 }])
  })

  test('partes zeradas ficam de fora; nada a dividir; mais do que o guardado é erro', () => {
    expect(splitFamilyUse(100, [{ userId: 'a', cents: 0 }, { userId: 'b', cents: 500 }])).toEqual([{ userId: 'b', cents: 100 }])
    expect(splitFamilyUse(0, [{ userId: 'a', cents: 500 }])).toEqual([])
    expect(splitFamilyUse(100, [])).toEqual([])
    expect(() => splitFamilyUse(501, [{ userId: 'a', cents: 500 }])).toThrow(RangeError)
  })
})
