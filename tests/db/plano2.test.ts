import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newCategory(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.from('categories').insert({ user_id: user.id, name }).select('id').single()
  if (error) throw error
  return data.id
}

async function newExpense(user: TestUser, category: string, cents: number): Promise<string> {
  const { data, error } = await user.client
    .from('transactions')
    .insert({ user_id: user.id, kind: 'expense', amount_cents: cents, category_id: category, occurred_on: '2026-09-22' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

describe('nomes de categoria', () => {
  test('não repete nome da mesma pessoa, sem diferenciar maiúsculas', async () => {
    await newCategory(a, 'Pet')
    const upper = await a.client.from('categories').insert({ user_id: a.id, name: 'PET' })
    expect(upper.error?.code).toBe('23505')
    const defaultLower = await a.client.from('categories').insert({ user_id: a.id, name: 'mercado' })
    expect(defaultLower.error?.code).toBe('23505')
  })

  test('recusa nome com espaços sobrando (o app sempre limpa antes)', async () => {
    const edges = await a.client.from('categories').insert({ user_id: a.id, name: ' Viagem ' })
    expect(edges.error?.code).toBe('23514')
    const doubled = await a.client.from('categories').insert({ user_id: a.id, name: 'Pet  Shop' })
    expect(doubled.error?.code).toBe('23514')
  })

  test('pessoas diferentes podem usar o mesmo nome', async () => {
    const { error } = await b.client.from('categories').insert({ user_id: b.id, name: 'Pet' })
    expect(error).toBeNull()
  })

  test('renomear para um nome já usado também é barrado', async () => {
    const lazer = await categoryId(a, 'lazer')
    const { error } = await a.client.from('categories').update({ name: 'casa' }).eq('id', lazer)
    expect(error?.code).toBe('23505')
  })
})

describe('categorias padrão', () => {
  test('podem ser renomeadas e mantêm a identificação interna', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { error } = await a.client.from('categories').update({ name: 'Feira' }).eq('id', mercado)
    expect(error).toBeNull()
    const { data } = await a.client.from('categories').select('name, default_key').eq('id', mercado).single()
    expect(data).toEqual({ name: 'Feira', default_key: 'mercado' })
    const back = await a.client.from('categories').update({ name: 'Mercado' }).eq('id', mercado)
    expect(back.error).toBeNull()
  })

  test('"Outros" não pode ser renomeada', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.from('categories').update({ name: 'Diversos' }).eq('id', outros)
    expect(error?.message).toContain('A categoria Outros não pode ser renomeada.')
  })
})

describe('excluir categoria (RN-27)', () => {
  test('move os gastos para "Outros", sem mudar valores, e apaga a categoria', async () => {
    const viagem = await newCategory(a, 'Viagem')
    const t1 = await newExpense(a, viagem, 12000)
    const t2 = await newExpense(a, viagem, 3450)

    const { error } = await a.client.rpc('delete_category', { p_category_id: viagem })
    expect(error).toBeNull()

    const outros = await categoryId(a, 'outros')
    const { data: moved } = await a.client
      .from('transactions')
      .select('id, category_id, amount_cents')
      .in('id', [t1, t2])
      .order('amount_cents')
    expect(moved).toEqual([
      { id: t2, category_id: outros, amount_cents: 3450 },
      { id: t1, category_id: outros, amount_cents: 12000 },
    ])
    const { data: gone } = await a.client.from('categories').select('id').eq('id', viagem)
    expect(gone).toEqual([])
  })

  test('categoria padrão (menos Outros) também pode ser excluída', async () => {
    const educacao = await categoryId(a, 'educacao')
    const { error } = await a.client.rpc('delete_category', { p_category_id: educacao })
    expect(error).toBeNull()
  })

  test('apagar direto uma categoria com gastos é barrado — por isso existe a função', async () => {
    const casaNova = await newCategory(a, 'Casa nova')
    await newExpense(a, casaNova, 500)
    const { error } = await a.client.from('categories').delete().eq('id', casaNova)
    expect(error?.code).toBe('23503')
  })

  test('"Outros" não pode ser excluída pela função', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.rpc('delete_category', { p_category_id: outros })
    expect(error?.message).toContain('A categoria Outros não pode ser excluída.')
  })

  test('ninguém exclui a categoria de outra pessoa', async () => {
    const saudeA = await categoryId(a, 'saude')
    const { error } = await b.client.rpc('delete_category', { p_category_id: saudeA })
    expect(error?.message).toContain('Categoria não encontrada.')
    const { data } = await a.client.from('categories').select('id').eq('id', saudeA)
    expect(data).toEqual([{ id: saudeA }])
  })

  test('quem não entrou não chama a função', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const saudeA = await categoryId(a, 'saude')
    const { error } = await anon.rpc('delete_category', { p_category_id: saudeA })
    expect(error).not.toBeNull()
  })
})

describe('perfil e onboarding', () => {
  test('cadastro novo começa sem onboarding concluído e com saldo inicial zero', async () => {
    const { data } = await a.client.from('profiles').select('onboarded_at, initial_balance_cents').single()
    expect(data).toEqual({ onboarded_at: null, initial_balance_cents: 0 })
  })

  test('a pessoa conclui o onboarding e grava o saldo inicial', async () => {
    const { error } = await a.client
      .from('profiles')
      .update({ initial_balance_cents: 600000, onboarded_at: '2026-09-25T12:00:00+00:00' })
      .eq('id', a.id)
    expect(error).toBeNull()
    const { data } = await a.client.from('profiles').select('onboarded_at, initial_balance_cents').single()
    expect(data?.initial_balance_cents).toBe(600000)
    expect(new Date(data!.onboarded_at).toISOString()).toBe('2026-09-25T12:00:00.000Z')
  })

  test('ninguém altera o perfil de outra pessoa', async () => {
    const { data } = await b.client.from('profiles').update({ initial_balance_cents: 1 }).eq('id', a.id).select()
    expect(data).toEqual([])
    const { data: still } = await a.client.from('profiles').select('initial_balance_cents').single()
    expect(still?.initial_balance_cents).toBe(600000)
  })
})
