import { describe, expect, test } from 'vitest'
import { firstFieldErrors } from '@/lib/forms'
import { categoryNameSchema, isDuplicateNameError, normalizeCategoryName, orderCategories } from './names'

// Espaço não separável (o que alguns teclados e o "copiar e colar" inserem).
const NBSP = String.fromCharCode(0xa0)

describe('normalizeCategoryName', () => {
  test('tira espaços das pontas e junta os repetidos, sem mudar maiúsculas', () => {
    expect(normalizeCategoryName('  Pet   Shop ')).toBe('Pet Shop')
    expect(normalizeCategoryName(`\tCasa${NBSP}nova\n`)).toBe('Casa nova')
    expect(normalizeCategoryName('Saúde')).toBe('Saúde')
  })
})

describe('categoryNameSchema', () => {
  test('limpa o nome antes de validar', () => {
    expect(categoryNameSchema.parse({ name: '  pet ' })).toEqual({ name: 'pet' })
  })
  test('mensagens de nome vazio e longo', () => {
    const empty = categoryNameSchema.safeParse({ name: '   ' })
    expect(firstFieldErrors(empty.error!)).toEqual({ name: 'Falta o nome.' })
    const long = categoryNameSchema.safeParse({ name: 'a'.repeat(41) })
    expect(firstFieldErrors(long.error!)).toEqual({ name: 'Use até 40 caracteres.' })
    expect(categoryNameSchema.parse({ name: ` ${'a'.repeat(40)} ` }).name).toHaveLength(40)
  })
})

describe('isDuplicateNameError', () => {
  test('reconhece o erro de nome repetido do banco', () => {
    expect(isDuplicateNameError({ code: '23505' })).toBe(true)
    expect(isDuplicateNameError({ code: '23514' })).toBe(false)
    expect(isDuplicateNameError(null)).toBe(false)
    expect(isDuplicateNameError(undefined)).toBe(false)
  })
})

describe('orderCategories', () => {
  test('ordem de criação, com "Outros" sempre por último', () => {
    const cats = [
      { name: 'Casa', defaultKey: 'casa', sortOrder: 1 },
      { name: 'Outros', defaultKey: 'outros', sortOrder: 10 },
      { name: 'Pet', defaultKey: null, sortOrder: 11 },
      { name: 'Mercado', defaultKey: 'mercado', sortOrder: 2 },
    ]
    expect(orderCategories(cats).map((c) => c.name)).toEqual(['Casa', 'Mercado', 'Pet', 'Outros'])
  })
  test('empate de ordem cai para o nome', () => {
    const cats = [
      { name: 'Viagem', defaultKey: null, sortOrder: 0 },
      { name: 'Academia', defaultKey: null, sortOrder: 0 },
    ]
    expect(orderCategories(cats).map((c) => c.name)).toEqual(['Academia', 'Viagem'])
  })
})
