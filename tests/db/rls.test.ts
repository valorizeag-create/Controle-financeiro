import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const admin = createClient(url, secret, { auth: { persistSession: false } })

async function newUser(name: string) {
  const email = `rls-${name}-${Date.now()}@teste.iris.dev`
  const password = 'senha-de-teste-123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  })
  if (error) throw error
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id: data.user.id, client }
}

let a: { id: string; client: SupabaseClient }
let b: { id: string; client: SupabaseClient }

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await admin.auth.admin.deleteUser(a.id)
  await admin.auth.admin.deleteUser(b.id)
})

describe('cadastro novo', () => {
  test('cria perfil com o nome e as 10 categorias padrão', async () => {
    const { data: profile } = await a.client.from('profiles').select('display_name, initial_balance_cents').single()
    expect(profile).toEqual({ display_name: 'Ana', initial_balance_cents: 0 })
    const { data: cats } = await a.client.from('categories').select('name, default_key').order('sort_order')
    expect(cats?.map((c) => c.name)).toEqual([
      'Casa', 'Mercado', 'Transporte', 'Comer fora', 'Saúde', 'Lazer', 'Assinaturas', 'Educação', 'Compras', 'Outros',
    ])
  })
})

describe('privacidade', () => {
  test('ninguém lê os registros de outra pessoa', async () => {
    const { data: cat } = await a.client.from('categories').select('id').eq('default_key', 'mercado').single()
    const { error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 14230, category_id: cat!.id, occurred_on: '2026-09-22',
    })
    expect(error).toBeNull()
    const { data: seenByB } = await b.client.from('transactions').select('id')
    expect(seenByB).toEqual([])
    const { data: catsSeenByB } = await b.client.from('categories').select('id').eq('id', cat!.id)
    expect(catsSeenByB).toEqual([])
  })

  test('ninguém grava usando a categoria de outra pessoa', async () => {
    const { data: catA } = await a.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'expense', amount_cents: 1000, category_id: catA!.id, occurred_on: '2026-09-22',
    })
    expect(error).not.toBeNull()
  })

  test('ninguém grava em nome de outra pessoa', async () => {
    const { data: catB } = await b.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { error } = await b.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 1000, category_id: catB!.id, occurred_on: '2026-09-22',
    })
    expect(error).not.toBeNull()
  })

  test('o banco recusa valor zero, gasto sem categoria e entrada com categoria', async () => {
    const { data: cat } = await b.client.from('categories').select('id').eq('default_key', 'casa').single()
    const zero = await b.client.from('transactions').insert({ user_id: b.id, kind: 'expense', amount_cents: 0, category_id: cat!.id, occurred_on: '2026-09-22' })
    const semCat = await b.client.from('transactions').insert({ user_id: b.id, kind: 'expense', amount_cents: 100, occurred_on: '2026-09-22' })
    const entradaComCat = await b.client.from('transactions').insert({ user_id: b.id, kind: 'income', amount_cents: 100, category_id: cat!.id, occurred_on: '2026-09-22' })
    expect(zero.error).not.toBeNull()
    expect(semCat.error).not.toBeNull()
    expect(entradaComCat.error).not.toBeNull()
  })
})
