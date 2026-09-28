import { expect, test } from 'vitest'
import { makeGoalSchema, makeUseSchema } from './schemas'

const today = '2026-09-28'
const msg = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  r.error?.issues.find((i) => i.path[0] === field)?.message

test('nome, valor e prazo (copy: "Para o que você quer guardar?" · "Quanto você precisa?" · "Até quando?")', () => {
  expect(makeGoalSchema(today).parse({ name: '  Viagem para Salvador ', target: '4.000', deadline: '2027-03' })).toEqual({
    name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03',
  })
  expect(makeGoalSchema(today).parse({ name: 'Reserva', target: '10000', deadline: '' }).deadline).toBeNull()
  expect(makeGoalSchema(today).parse({ name: 'Presente', target: '100', deadline: '2026-09' }).deadline).toBe('2026-09')
})

test('mensagens', () => {
  const s = makeGoalSchema(today)
  expect(msg(s.safeParse({ name: ' ', target: '10', deadline: '' }), 'name')).toBe('Falta o nome.')
  expect(msg(s.safeParse({ name: 'x'.repeat(41), target: '10', deadline: '' }), 'name')).toBe('Use até 40 caracteres.')
  expect(msg(s.safeParse({ name: 'Viagem', target: '', deadline: '' }), 'target')).toBe('Falta o valor.')
  expect(msg(s.safeParse({ name: 'Viagem', target: 'abc', deadline: '' }), 'target')).toBe('Esse valor não parece certo. Use apenas números.')
  for (const deadline of ['2026-08', '2100-01', 'março', '2027-13']) {
    expect(msg(s.safeParse({ name: 'Viagem', target: '10', deadline }), 'deadline')).toBe('Escolha um mês a partir de agora.')
  }
})

test('ao editar, um prazo que já passou pode ficar', () => {
  expect(makeGoalSchema(today, 'edit').parse({ name: 'Viagem', target: '10', deadline: '2026-05' }).deadline).toBe('2026-05')
  expect(makeGoalSchema(today, 'edit').safeParse({ name: 'Viagem', target: '10', deadline: '1999-12' }).success).toBe(false)
})

test('usar o dinheiro: valor e categoria', () => {
  expect(makeUseSchema().parse({ amount: '2.300', categoryId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90' })).toEqual({
    amountCents: 230000, categoryId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  })
  expect(msg(makeUseSchema().safeParse({ amount: '10', categoryId: '' }), 'categoryId')).toBe('Escolha uma categoria para esse gasto.')
})
