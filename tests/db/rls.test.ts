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
  const errors: unknown[] = []
  if (a?.id) {
    const { error } = await admin.auth.admin.deleteUser(a.id)
    if (error) errors.push(error)
  }
  if (b?.id) {
    const { error } = await admin.auth.admin.deleteUser(b.id)
    if (error) errors.push(error)
  }
  if (errors.length > 0) throw errors[0]
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

describe('integridade e mais privacidade', () => {
  test('ninguém altera ou apaga registro de outra pessoa', async () => {
    const { data: catA } = await a.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { data: inserted, error: insertError } = await a.client
      .from('transactions')
      .insert({ user_id: a.id, kind: 'expense', amount_cents: 5000, category_id: catA!.id, occurred_on: '2026-09-22' })
      .select('id, amount_cents')
      .single()
    expect(insertError).toBeNull()

    const { data: updatedByB } = await b.client
      .from('transactions')
      .update({ amount_cents: 9999 })
      .eq('id', inserted!.id)
      .select()
    expect(updatedByB).toEqual([])

    const { data: deletedByB } = await b.client
      .from('transactions')
      .delete()
      .eq('id', inserted!.id)
      .select()
    expect(deletedByB).toEqual([])

    const { data: stillThere } = await a.client
      .from('transactions')
      .select('id, amount_cents')
      .eq('id', inserted!.id)
      .single()
    expect(stillThere).toEqual({ id: inserted!.id, amount_cents: 5000 })
  })

  test('ninguém muda o dono ou a categoria de um registro para os de outra pessoa', async () => {
    const { data: catA } = await a.client.from('categories').select('id').eq('default_key', 'mercado').single()
    const { data: catB } = await b.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { data: ownTx } = await a.client
      .from('transactions')
      .insert({ user_id: a.id, kind: 'expense', amount_cents: 700, category_id: catA!.id, occurred_on: '2026-09-22' })
      .select('id')
      .single()

    const toOtherUser = await a.client.from('transactions').update({ user_id: b.id }).eq('id', ownTx!.id)
    expect(toOtherUser.error).not.toBeNull()

    const toOtherCategory = await a.client.from('transactions').update({ category_id: catB!.id }).eq('id', ownTx!.id)
    expect(toOtherCategory.error).not.toBeNull()
  })

  test('ninguém lê o perfil de outra pessoa', async () => {
    const { data } = await b.client.from('profiles').select('id').eq('id', a.id)
    expect(data).toEqual([])
  })

  test('ninguém cria categoria em nome de outra pessoa', async () => {
    const { error } = await a.client.from('categories').insert({ user_id: b.id, name: 'Categoria falsa' })
    expect(error).not.toBeNull()
  })

  test('categoria própria sem default_key pode ser criada e apagada normalmente', async () => {
    const { data: pet, error: insertError } = await a.client
      .from('categories')
      .insert({ user_id: a.id, name: 'Pet' })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const del = await a.client.from('categories').delete().eq('id', pet!.id)
    expect(del.error).toBeNull()

    const { data: stillThere } = await a.client.from('categories').select('id').eq('id', pet!.id)
    expect(stillThere).toEqual([])
  })

  test('categorias padrão são protegidas: "Outros" não pode ser apagada nem ter a chave trocada', async () => {
    const { data: outros } = await a.client.from('categories').select('id').eq('default_key', 'outros').single()
    const del = await a.client.from('categories').delete().eq('id', outros!.id)
    expect(del.error).not.toBeNull()
    expect(del.error?.message).toContain('A categoria Outros não pode ser excluída.')

    const { data: mercado } = await a.client.from('categories').select('id').eq('default_key', 'mercado').single()
    const upd = await a.client.from('categories').update({ default_key: 'mudou' }).eq('id', mercado!.id)
    expect(upd.error).not.toBeNull()
    expect(upd.error?.message).toContain('A chave da categoria padrão não pode mudar.')
  })

  test('ninguém apaga o próprio perfil', async () => {
    const del = await a.client.from('profiles').delete().eq('id', a.id)
    expect(del.error).not.toBeNull()
    const { data: stillThere } = await a.client.from('profiles').select('id').eq('id', a.id).single()
    expect(stillThere).toEqual({ id: a.id })
  })
})
