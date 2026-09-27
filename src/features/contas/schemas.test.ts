import { expect, test } from 'vitest'
import { billSchema, makeRecurrenceEditSchema } from './schemas'

const CAT = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const ok = { name: '  Luz ', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }

test('Nova conta mensal', () => {
  expect(billSchema.parse(ok)).toEqual({ name: 'Luz', amountCents: 18000, categoryId: CAT, frequency: 'monthly', dueDay: 25, dueMonth: null })
})

test('anual precisa do mês', () => {
  const r = billSchema.safeParse({ ...ok, frequency: 'yearly', dueMonth: '' })
  expect(r.success).toBe(false)
  expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([['dueMonth', 'Escolha o mês.']])
  expect(billSchema.parse({ ...ok, frequency: 'yearly', dueMonth: '1' })).toMatchObject({ frequency: 'yearly', dueMonth: 1 })
})

test('mensagens dos campos', () => {
  const r = billSchema.safeParse({ ...ok, name: ' ', amount: '', categoryId: '', dueDay: '32' })
  expect(Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]))).toEqual({
    name: 'Falta o nome.', amount: 'Falta o valor.', categoryId: 'Escolha uma categoria para esse gasto.', dueDay: 'Escolha o dia.',
  })
  expect(billSchema.safeParse({ ...ok, name: 'x'.repeat(41) }).error?.issues[0].message).toBe('Use até 40 caracteres.')
  for (const bad of ['0', 'dez', '2.5', '']) expect(billSchema.safeParse({ ...ok, dueDay: bad }).success).toBe(false)
})

test('frequência desconhecida vira mensal', () => {
  expect(billSchema.parse({ ...ok, frequency: 'semanal' }).frequency).toBe('monthly')
})

test('edição de entrada: origem vazia vira nula; categoria não entra', () => {
  expect(makeRecurrenceEditSchema('income').parse({ name: 'Freela', amount: '800', source: '', categoryId: CAT, dueDay: '30' })).toEqual({
    name: 'Freela', amountCents: 80000, categoryId: null, source: null, dueDay: 30,
  })
  expect(makeRecurrenceEditSchema('expense').parse({ name: 'Luz', amount: '200', categoryId: CAT, dueDay: '10' })).toEqual({
    name: 'Luz', amountCents: 20000, categoryId: CAT, source: null, dueDay: 10,
  })
})
