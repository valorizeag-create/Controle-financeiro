import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { todayInSaoPaulo } from '../../src/domain/dates'
import { splitGoalUse } from '../../src/domain/goals'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newGoal(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('goals')
    .insert({ user_id: user.id, name: 'Viagem para Salvador', target_cents: 400000, ...p })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function deposit(user: TestUser, goalId: string, cents: number): Promise<number> {
  const { data, error } = await user.client.rpc('deposit_to_goal', { p_goal_id: goalId, p_amount_cents: cents })
  if (error) throw error
  return Number(data)
}

async function balance(user: TestUser, goalId: string): Promise<number> {
  const { data, error } = await user.client.rpc('goal_balance', { p_goal_id: goalId })
  if (error) throw error
  return Number(data)
}

async function goal(user: TestUser, id: string) {
  const { data, error } = await user.client.from('goals').select('status, used_on, deleted_on').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function movements(user: TestUser, goalId: string) {
  const { data, error } = await user.client
    .from('goal_movements')
    .select('id, kind, amount_cents, occurred_on, transaction_id')
    .eq('goal_id', goalId)
    .order('created_at')
  if (error) throw error
  return data.map((m) => ({ ...m, amount_cents: Number(m.amount_cents) }))
}

type UseResult = { tx_id: string; funded_cents: number; leftover_cents: number }

async function useGoal(user: TestUser, goalId: string, cents: number): Promise<UseResult> {
  const { data, error } = await user.client.rpc('use_goal', {
    p_goal_id: goalId, p_amount_cents: cents, p_category_id: await categoryId(user, 'lazer'),
  })
  if (error) throw error
  const row = (data as UseResult[])[0]
  return { tx_id: row.tx_id, funded_cents: Number(row.funded_cents), leftover_cents: Number(row.leftover_cents) }
}

describe('privacidade das metas', () => {
  test('ninguém vê nem altera a meta ou os movimentos de outra pessoa', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { data: seen } = await b.client.from('goals').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: moves } = await b.client.from('goal_movements').select('id').eq('goal_id', id)
    expect(moves).toEqual([])
    const { data: changed } = await b.client.from('goals').update({ name: 'X' }).eq('id', id).select()
    expect(changed).toEqual([])
    expect(await balance(b, id)).toBe(0)
  })

  test('ninguém guarda, tira, usa ou exclui na meta de outra pessoa (Review Focus 5)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 5000)
    for (const [fn, args] of [
      ['deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(b, 'lazer') }],
      ['delete_goal', { p_goal_id: id }],
    ] as const) {
      const { error } = await b.client.rpc(fn, args)
      expect(error?.message).toContain('Meta não encontrada.')
    }
    expect(await balance(a, id)).toBe(5000)
  })

  test('ninguém grava movimento direto na meta de outra pessoa', async () => {
    const id = await newGoal(a)
    const asSelf = await b.client.from('goal_movements').insert({ user_id: b.id, goal_id: id, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(asSelf.error).not.toBeNull()
    const asOther = await b.client.from('goal_movements').insert({ user_id: a.id, goal_id: id, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(asOther.error).not.toBeNull()
  })

  test('quem não entrou não guarda', async () => {
    const id = await newGoal(a)
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 })
    expect(error).not.toBeNull()
  })
})

describe('regras da meta', () => {
  test('nome, valor e prazo válidos', async () => {
    const bad = [
      { name: '' }, { name: ' Viagem' }, { name: 'x'.repeat(41) },
      { target_cents: 0 }, { target_cents: 10_000_000_000 },
      { deadline: '2027-03-15' }, { deadline: '2100-01-01' },
    ]
    for (const p of bad) {
      const { error } = await a.client.from('goals').insert({ user_id: a.id, name: 'Viagem', target_cents: 100, ...p })
      expect(error?.code).toBe('23514')
    }
    expect(await newGoal(a, { deadline: '2027-03-01' })).toBeTruthy()
  })

  test('a meta nunca é apagada de verdade', async () => {
    const id = await newGoal(a)
    const { data } = await a.client.from('goals').delete().eq('id', id).select()
    expect(data ?? []).toEqual([])
    expect(await goal(a, id)).toMatchObject({ status: 'active', deleted_on: null })
  })
})

describe('guardar e tirar (RN-13, RN-14)', () => {
  test('guardar soma no guardado da meta, com a data de hoje', async () => {
    const id = await newGoal(a)
    expect(await deposit(a, id, 230000)).toBe(230000)
    expect(await deposit(a, id, 30000)).toBe(260000)
    expect((await movements(a, id)).map((m) => [m.kind, m.amount_cents, m.occurred_on])).toEqual([
      ['deposit', 230000, today], ['deposit', 30000, today],
    ])
  })

  test('tirar vai até o que a meta tem; mais que isso é recusado sem mudar nada (Review Focus 4)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 18000)
    const tooMuch = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18001 })
    expect(tooMuch.error?.message).toContain('Valor maior que o guardado.')
    expect(await balance(a, id)).toBe(18000)
    const { data, error } = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
    expect(Number(data)).toBe(0)
    expect((await movements(a, id)).at(-1)).toMatchObject({ kind: 'withdraw', amount_cents: 18000, occurred_on: today })
  })

  test('tirar direto na tabela também respeita o guardado (Review Focus 1)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { error } = await a.client.from('goal_movements').insert({ user_id: a.id, goal_id: id, kind: 'withdraw', amount_cents: 1001, occurred_on: today })
    expect(error?.message).toContain('Valor maior que o guardado.')
  })

  test('dois pedidos ao mesmo tempo não tiram duas vezes (Review Focus 1)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 5000)
    const results = await Promise.all([
      a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 5000 }),
      a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 5000 }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await balance(a, id)).toBe(0)
  })

  test('valores fora do limite são recusados', async () => {
    const id = await newGoal(a)
    for (const cents of [0, -1, 10_000_000_000, null]) {
      const { error } = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: cents })
      expect(error?.message).toContain('Valor inválido.')
    }
    await deposit(a, id, 9_999_999_999)
    const over = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 1 })
    expect(over.error?.message).toContain('Valor inválido.')
  })

  test('movimentos não são alterados; só o uso pode ser apagado', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const [m] = await movements(a, id)
    const { data: upd } = await a.client.from('goal_movements').update({ amount_cents: 1 }).eq('id', m.id).select()
    expect(upd ?? []).toEqual([])
    const { data: del } = await a.client.from('goal_movements').delete().eq('id', m.id).select()
    expect(del ?? []).toEqual([])
    expect(await balance(a, id)).toBe(1000)
  })
})

describe('usar o dinheiro da meta (RN-15)', () => {
  test('o banco divide o uso igual ao app; gasto maior zera a meta (RN-15a, Review Focus 2)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 300000)
    const r = await useGoal(a, id, 340000)
    const split = splitGoalUse(340000, 300000)
    expect({ funded: r.funded_cents, leftover: r.leftover_cents }).toEqual({ funded: split.fundedCents, leftover: split.leftoverCents })
    const { data: tx } = await a.client
      .from('transactions')
      .select('kind, amount_cents, status, occurred_on, category_id, goal_id, goal_funded_cents')
      .eq('id', r.tx_id)
      .single()
    expect(tx).toMatchObject({ kind: 'expense', status: 'confirmed', occurred_on: today, goal_id: id, category_id: await categoryId(a, 'lazer') })
    expect(Number(tx!.amount_cents)).toBe(340000)
    expect(Number(tx!.goal_funded_cents)).toBe(300000)
    expect((await movements(a, id)).at(-1)).toMatchObject({ kind: 'use', amount_cents: 300000, transaction_id: r.tx_id })
    expect(await balance(a, id)).toBe(0)
    expect(await goal(a, id)).toMatchObject({ status: 'used', used_on: today })
  })

  test('gasto menor: a sobra fica na meta; meta usada não recebe nem é usada de novo (RN-15b)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 248000)
    const r = await useGoal(a, id, 230000)
    expect(r.leftover_cents).toBe(18000)
    expect(await balance(a, id)).toBe(18000)
    const more = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 })
    expect(more.error?.message).toContain('Meta não encontrada.')
    const again = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(a, 'lazer') })
    expect(again.error?.message).toContain('Meta não encontrada.')
    const { error } = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
  })

  test('meta sem dinheiro guardado, categoria de outra pessoa e valor inválido são recusados', async () => {
    const empty = await newGoal(a)
    const noMoney = await a.client.rpc('use_goal', { p_goal_id: empty, p_amount_cents: 100, p_category_id: await categoryId(a, 'lazer') })
    expect(noMoney.error?.message).toContain('Meta sem dinheiro guardado.')
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const otherCategory = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(b, 'lazer') })
    expect(otherCategory.error?.message).toContain('Categoria não encontrada.')
    const zero = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 0, p_category_id: await categoryId(a, 'lazer') })
    expect(zero.error?.message).toContain('Valor inválido.')
    expect(await goal(a, id)).toMatchObject({ status: 'active' })
  })

  test('o gasto pago com meta não perde o vínculo', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 1000)
    const tooMuch = await a.client.from('transactions').update({ amount_cents: 500 }).eq('id', r.tx_id)
    expect(tooMuch.error?.code).toBe('23514')
    const removed = await a.client.from('transactions').delete().eq('id', r.tx_id)
    expect(removed.error?.code).toBe('23503')
  })

  test('excluir o uso: gasto e uso saem, o dinheiro volta e a meta volta a ativa (decisão 66)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 248000)
    const r = await useGoal(a, id, 230000)
    const { data, error } = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error).toBeNull()
    expect(data).toBe(id)
    const { data: tx } = await a.client.from('transactions').select('id').eq('id', r.tx_id)
    expect(tx).toEqual([])
    expect(await balance(a, id)).toBe(248000)
    expect(await goal(a, id)).toMatchObject({ status: 'active', used_on: null })
    const again = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(again.error?.message).toContain('Gasto não encontrado.')
  })

  test('ninguém exclui o uso de outra pessoa', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 500)
    const { error } = await b.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error?.message).toContain('Gasto não encontrado.')
  })
})

describe('integridade do vínculo gasto-uso (fix round 1)', () => {
  test('apagar um "use" direto na tabela não cria dinheiro', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 400)
    const [use] = (await movements(a, id)).filter((m) => m.kind === 'use')
    const del = await a.client.from('goal_movements').delete().eq('id', use.id)
    expect(del.error).not.toBeNull()
    expect(del.error?.message).toContain('Movimento inválido.')
    const { data: tx } = await a.client.from('transactions').select('id').eq('id', r.tx_id)
    expect(tx).toHaveLength(1)
    expect(await balance(a, id)).toBe(600)
    expect(await goal(a, id)).toMatchObject({ status: 'used' })
  })

  test('gravar goal_id direto numa transação nova, sem o movimento "use" correspondente, é recusado', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 500, category_id: await categoryId(a, 'lazer'),
      occurred_on: today, goal_id: id, goal_funded_cents: 500,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Movimento inválido.')
    expect(await balance(a, id)).toBe(1000)
  })

  test('apontar uma transação comum já existente para uma meta, direto, é recusado', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { data: tx, error: insErr } = await a.client
      .from('transactions')
      .insert({ user_id: a.id, kind: 'expense', amount_cents: 300, category_id: await categoryId(a, 'lazer'), occurred_on: today })
      .select('id')
      .single()
    if (insErr) throw insErr
    const { error } = await a.client.from('transactions').update({ goal_id: id, goal_funded_cents: 300 }).eq('id', tx.id)
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Movimento inválido.')
    expect(await balance(a, id)).toBe(1000)
  })

  test('gravar um "use" direto sem a transação combinando (mesma meta e valor) é recusado', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { data: tx, error: insErr } = await a.client
      .from('transactions')
      .insert({ user_id: a.id, kind: 'expense', amount_cents: 300, category_id: await categoryId(a, 'lazer'), occurred_on: today })
      .select('id')
      .single()
    if (insErr) throw insErr
    const { error } = await a.client.from('goal_movements').insert({
      user_id: a.id, goal_id: id, kind: 'use', amount_cents: 300, occurred_on: today, transaction_id: tx.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Movimento inválido.')
    expect(await balance(a, id)).toBe(1000)
  })

  test('movimento gravado direto com data diferente de hoje é recusado', async () => {
    const id = await newGoal(a)
    const { error } = await a.client.from('goal_movements').insert({
      user_id: a.id, goal_id: id, kind: 'deposit', amount_cents: 100, occurred_on: '2020-01-01',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Movimento inválido.')
    expect(await balance(a, id)).toBe(0)
  })
})

describe('excluir meta (RN-16, A6 A, Review Focus 3)', () => {
  test('excluir: o guardado volta hoje, o histórico fica e a meta não aceita mais nada', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 50000)
    const { error } = await a.client.rpc('delete_goal', { p_goal_id: id })
    expect(error).toBeNull()
    expect(await goal(a, id)).toMatchObject({ deleted_on: today })
    expect((await movements(a, id)).map((m) => [m.kind, m.amount_cents])).toEqual([['deposit', 50000], ['withdraw', 50000]])
    expect(await balance(a, id)).toBe(0)
    for (const [fn, args] of [
      ['deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['delete_goal', { p_goal_id: id }],
    ] as const) {
      const r = await a.client.rpc(fn, args)
      expect(r.error?.message).toContain('Meta não encontrada.')
    }
  })

  test('meta vazia é excluída sem movimento novo; uso de meta excluída não é desfeito', async () => {
    const empty = await newGoal(a)
    await a.client.rpc('delete_goal', { p_goal_id: empty })
    expect(await movements(a, empty)).toEqual([])

    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 400)
    await a.client.rpc('delete_goal', { p_goal_id: id })
    const { error } = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error?.message).toContain('Meta não encontrada.')
  })
})
