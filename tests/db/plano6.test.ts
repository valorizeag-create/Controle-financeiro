import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function plan(user: TestUser, month: string) {
  const { data, error } = await user.client
    .from('budgets')
    .select('category_id, amount_cents')
    .eq('month', month)
    .order('category_id')
  if (error) throw error
  return data.map((r) => ({ category_id: r.category_id, amount_cents: Number(r.amount_cents) }))
}

async function setMonth(user: TestUser, month: string, ids: string[], amounts: (number | null)[]) {
  return user.client.rpc('set_month_budgets', { p_month: month, p_category_ids: ids, p_amounts: amounts })
}

describe('privacidade do planejado', () => {
  test('ninguém vê, grava, altera ou apaga o planejado de outra pessoa', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { error } = await setMonth(a, '2026-01-01', [mercado], [100000])
    expect(error).toBeNull()
    expect(await plan(b, '2026-01-01')).toEqual([])
    const upd = await b.client.from('budgets').update({ amount_cents: 1 }).eq('category_id', mercado).select()
    expect(upd.data ?? []).toEqual([])
    const del = await b.client.from('budgets').delete().eq('category_id', mercado).select()
    expect(del.data ?? []).toEqual([])
    const ins = await b.client.from('budgets').insert({ user_id: b.id, month: '2026-01-01', category_id: mercado, amount_cents: 100 })
    expect(ins.error).not.toBeNull()
    const other = await setMonth(b, '2026-01-01', [mercado], [100])
    expect(other.error?.message).toContain('Categoria não encontrada.')
    expect(await plan(a, '2026-01-01')).toEqual([{ category_id: mercado, amount_cents: 100000 }])
  })

  test('quem não entrou não planeja', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('set_month_budgets', { p_month: '2026-01-01', p_category_ids: [await categoryId(a, 'lazer')], p_amounts: [100] })
    expect(error).not.toBeNull()
  })
})

describe('limites da tabela (gravação direta também respeita)', () => {
  test('mês no 1º dia entre 2000 e 2099, valor entre 1 e o limite, um valor por categoria e mês', async () => {
    const lazer = await categoryId(a, 'lazer')
    const bad = [
      { month: '2026-02-15' }, { month: '1999-12-01' }, { month: '2100-01-01' },
      { amount_cents: 0 }, { amount_cents: -1 }, { amount_cents: 10_000_000_000 },
    ]
    for (const p of bad) {
      const { error } = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 100, ...p })
      expect(error?.code).toBe('23514')
    }
    const ok = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 9_999_999_999 })
    expect(ok.error).toBeNull()
    const dup = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 100 })
    expect(dup.error?.code).toBe('23505')
  })
})

describe('salvar o planejamento do mês (RF-22)', () => {
  test('grava, troca e tira; categorias fora da lista não mudam', async () => {
    const [mercado, lazer, casa] = await Promise.all(['mercado', 'lazer', 'casa'].map((k) => categoryId(a, k)))
    const first = await setMonth(a, '2026-03-01', [mercado, lazer, casa], [100000, 30000, null])
    expect(first.error).toBeNull()
    expect(first.data).toBe(2)
    const second = await setMonth(a, '2026-03-01', [mercado, lazer], [120000, null])
    expect(second.data).toBe(1)
    const third = await setMonth(a, '2026-03-01', [casa], [90000])
    expect(third.data).toBe(2)
    expect(await plan(a, '2026-03-01')).toEqual(
      [{ category_id: mercado, amount_cents: 120000 }, { category_id: casa, amount_cents: 90000 }].sort((x, y) => x.category_id.localeCompare(y.category_id)),
    )
  })

  test('mês, valores e categorias inválidos são recusados sem mudar nada', async () => {
    const lazer = await categoryId(a, 'lazer')
    await setMonth(a, '2026-04-01', [lazer], [30000])
    const cases: [string | null, (string | null)[], (number | null)[], string][] = [
      ['2026-04-15', [lazer], [1], 'Mês inválido.'],
      ['2100-01-01', [lazer], [1], 'Mês inválido.'],
      [null, [lazer], [1], 'Mês inválido.'],
      ['2026-04-01', [], [], 'Valor inválido.'],
      ['2026-04-01', [lazer], [1, 2], 'Valor inválido.'],
      ['2026-04-01', [lazer], [0], 'Valor inválido.'],
      ['2026-04-01', [lazer], [-5], 'Valor inválido.'],
      ['2026-04-01', [lazer], [10_000_000_000], 'Valor inválido.'],
      ['2026-04-01', Array(201).fill(lazer), Array(201).fill(1), 'Valor inválido.'],
      ['2026-04-01', [lazer, lazer], [1, 2], 'Categoria não encontrada.'],
      ['2026-04-01', [null], [1], 'Categoria não encontrada.'],
      ['2026-04-01', ['3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'], [1], 'Categoria não encontrada.'],
    ]
    for (const [month, ids, amounts, message] of cases) {
      const { error } = await a.client.rpc('set_month_budgets', { p_month: month, p_category_ids: ids, p_amounts: amounts })
      expect(error?.message).toContain(message)
    }
    expect(await plan(a, '2026-04-01')).toEqual([{ category_id: lazer, amount_cents: 30000 }])
  })
})

describe('repetir o planejamento do mês anterior (RF-24)', () => {
  test('copia para as categorias ainda sem planejado; não sobrescreve nem duplica (Review Focus 3)', async () => {
    const [mercado, lazer] = await Promise.all(['mercado', 'lazer'].map((k) => categoryId(a, k)))
    await setMonth(a, '2026-05-01', [mercado, lazer], [100000, 30000])
    // dois toques ao mesmo tempo, num mês ainda vazio: a cópia acontece uma vez só
    const race = await Promise.all([
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
    ])
    expect(race.map((r) => r.error)).toEqual([null, null])
    expect(race.reduce((sum, r) => sum + Number(r.data), 0)).toBe(2)
    const { data, error } = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' })
    expect(error).toBeNull()
    expect(data).toBe(0)
    await setMonth(a, '2026-07-01', [lazer], [50000])
    const partial = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-07-01' })
    expect(partial.data).toBe(1)
    const lazerJul = (await plan(a, '2026-07-01')).find((r) => r.category_id === lazer)
    expect(lazerJul?.amount_cents).toBe(50000)
    const again = await Promise.all([
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
    ])
    expect(again.map((r) => r.data)).toEqual([0, 0])
    expect(await plan(a, '2026-06-01')).toEqual(
      [{ category_id: mercado, amount_cents: 100000 }, { category_id: lazer, amount_cents: 30000 }].sort((x, y) => x.category_id.localeCompare(y.category_id)),
    )
  })

  test('mês inválido é recusado; mês anterior vazio não copia nada; nada vem de outra pessoa', async () => {
    const bad = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-10' })
    expect(bad.error?.message).toContain('Mês inválido.')
    const empty = await a.client.rpc('repeat_previous_budgets', { p_month: '2030-01-01' })
    expect(empty.data).toBe(0)
    const other = await b.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' })
    expect(other.data).toBe(0)
    expect(await plan(b, '2026-06-01')).toEqual([])
  })
})

describe('categoria excluída (RN-27, Review Focus 2)', () => {
  test('excluir a categoria leva o planejado para "Outros", somado no mesmo mês', async () => {
    const [outros, educacao] = await Promise.all([categoryId(a, 'outros'), categoryId(a, 'educacao')])
    await setMonth(a, '2026-08-01', [educacao, outros], [30000, 10000])
    await setMonth(a, '2026-09-01', [educacao], [5000])
    const { error } = await a.client.rpc('delete_category', { p_category_id: educacao })
    expect(error).toBeNull()
    expect(await plan(a, '2026-08-01')).toEqual([{ category_id: outros, amount_cents: 40000 }])
    expect(await plan(a, '2026-09-01')).toEqual([{ category_id: outros, amount_cents: 5000 }])
  })

  test('a soma em "Outros" nunca passa do limite do app', async () => {
    const [outros, compras] = await Promise.all([categoryId(a, 'outros'), categoryId(a, 'compras')])
    await setMonth(a, '2026-10-01', [compras, outros], [1, 9_999_999_999])
    const { error } = await a.client.rpc('delete_category', { p_category_id: compras })
    expect(error).toBeNull()
    expect(await plan(a, '2026-10-01')).toEqual([{ category_id: outros, amount_cents: 9_999_999_999 }])
  })

  test('gasto pago com meta segue para "Outros" sem barrar: vínculo, valor e movimento intactos', async () => {
    const [outros, transporte] = await Promise.all([categoryId(a, 'outros'), categoryId(a, 'transporte')])
    const goal = await a.client.from('goals').insert({ user_id: a.id, name: 'Viagem', target_cents: 400000 }).select('id').single()
    expect(goal.error).toBeNull()
    const goalId = goal.data!.id as string
    const dep = await a.client.rpc('deposit_to_goal', { p_goal_id: goalId, p_amount_cents: 20000 })
    expect(dep.error).toBeNull()
    const use = await a.client.rpc('use_goal', { p_goal_id: goalId, p_amount_cents: 12000, p_category_id: transporte })
    expect(use.error).toBeNull()
    const txId = (use.data as { tx_id: string }[])[0].tx_id
    await setMonth(a, '2026-12-01', [transporte], [5000])

    const { error } = await a.client.rpc('delete_category', { p_category_id: transporte })
    expect(error).toBeNull()

    const tx = await a.client.from('transactions').select('category_id, goal_id, goal_funded_cents, amount_cents').eq('id', txId).single()
    expect(tx.error).toBeNull()
    expect(tx.data).toMatchObject({ category_id: outros, goal_id: goalId })
    expect(Number(tx.data!.goal_funded_cents)).toBe(12000)
    expect(Number(tx.data!.amount_cents)).toBe(12000)
    const moves = await a.client.from('goal_movements').select('kind, amount_cents').eq('transaction_id', txId)
    expect(moves.data?.map((m) => [m.kind, Number(m.amount_cents)])).toEqual([['use', 12000]])
    expect(await plan(a, '2026-12-01')).toEqual([{ category_id: outros, amount_cents: 5000 }])
  })

  test('apagar direto uma categoria com planejado é barrado — por isso existe a função', async () => {
    const saude = await categoryId(a, 'saude')
    await setMonth(a, '2026-11-01', [saude], [1000])
    const { error } = await a.client.from('categories').delete().eq('id', saude)
    expect(error?.code).toBe('23503')
  })

  test('excluir o cadastro apaga o planejado junto', async () => {
    const c = await newUser('Caio')
    await setMonth(c, '2026-01-01', [await categoryId(c, 'mercado')], [1000])
    const { error } = await admin.auth.admin.deleteUser(c.id)
    expect(error).toBeNull()
    const { data } = await admin.from('budgets').select('id').eq('user_id', c.id)
    expect(data).toEqual([])
  })
})
