import { expect, test } from 'vitest'
import { MAX_PLAN_FIELDS, PLAN_INVALID, parsePlanFields } from './schemas'

const A = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const B = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

test('lê um valor por categoria; zero e em branco tiram a categoria do planejado (Review Focus 4)', () => {
  const r = parsePlanFields(form({ month: '2026-09', [`plan.${A}`]: '1.000', [`plan.${B}`]: '', 'plan.nao-e-id': '5', outro: 'x' }))
  expect(r?.entries).toEqual([{ categoryId: A, amountCents: 100000 }, { categoryId: B, amountCents: null }])
  expect(r?.fieldErrors).toEqual({})
  for (const zero of ['0', '0,00', ' ']) expect(parsePlanFields(form({ [`plan.${A}`]: zero }))?.entries).toEqual([{ categoryId: A, amountCents: null }])
})

test('valor inválido: mensagem da copy no campo e tudo o que foi digitado fica', () => {
  for (const bad of ['abc', '1 2', '99999999999']) {
    const r = parsePlanFields(form({ [`plan.${A}`]: bad, [`plan.${B}`]: '300' }))
    expect(r?.fieldErrors).toEqual({ [`plan.${A}`]: PLAN_INVALID })
    expect(r?.values).toEqual({ [`plan.${A}`]: bad, [`plan.${B}`]: '300' })
  }
  expect(PLAN_INVALID).toBe('Esse valor não parece certo. Use apenas números.')
})

test('mais campos do que o limite: recusado', () => {
  const fields: Record<string, string> = {}
  for (let i = 0; i <= MAX_PLAN_FIELDS; i++) fields[`plan.00000000-0000-4000-8000-${String(i).padStart(12, '0')}`] = '1'
  expect(parsePlanFields(form(fields))).toBeNull()
})
