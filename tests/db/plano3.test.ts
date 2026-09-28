import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { addDays, addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn } from '../../src/domain/recurrence'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()
const current = monthOf(today)
const period = (m: string) => `${m}-01`
const day = Number(today.slice(8, 10))

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newRecurrence(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const casa = await categoryId(user, 'casa')
  const { data, error } = await user.client
    .from('recurrences')
    .insert({
      user_id: user.id, kind: 'expense', name: 'Luz', amount_cents: 18000, category_id: casa,
      frequency: 'monthly', due_day: day, due_month: null, starts_on: today, ...p,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function occurrences(user: TestUser, recurrenceId: string) {
  const { data, error } = await user.client
    .from('transactions')
    .select('id, status, due_on, occurred_on, paid_on, note, amount_cents, recurrence_period')
    .eq('recurrence_id', recurrenceId)
    .order('recurrence_period')
  if (error) throw error
  return data
}

async function generate(user: TestUser) {
  const { data, error } = await user.client.rpc('generate_occurrences')
  if (error) throw error
  return data as number
}

describe('privacidade das recorrências', () => {
  test('ninguém vê nem altera a recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const { data: seen } = await b.client.from('recurrences').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: changed } = await b.client.from('recurrences').update({ amount_cents: 1 }).eq('id', id).select()
    expect(changed).toEqual([])
  })

  test('ninguém liga um registro à recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'income', amount_cents: 100, occurred_on: today, recurrence_id: id, recurrence_period: period(current),
    })
    expect(error?.code).toBe('23503')
  })

  test('ninguém altera nem encerra pela função a recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const upd = await b.client.rpc('update_recurrence', {
      p_id: id, p_name: 'X', p_amount_cents: 1, p_category_id: null, p_source: null, p_due_day: 1,
    })
    expect(upd.error?.message).toContain('Recorrência não encontrada.')
    const end = await b.client.rpc('end_recurrence', { p_id: id })
    expect(end.error?.message).toContain('Recorrência não encontrada.')
  })

  test('quem não entrou não gera ocorrências', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('generate_occurrences')
    expect(error).not.toBeNull()
  })
})

describe('gerar ocorrências (Review Focus 1 e 2)', () => {
  test('gera a do mês atual como a pagar, com o dia ajustado ao mês', async () => {
    const id = await newRecurrence(a, { due_day: 31, starts_on: period(current) })
    await generate(a)
    const due = dueDateIn(current, 31)
    expect(await occurrences(a, id)).toEqual([
      expect.objectContaining({ status: 'pending', due_on: due, occurred_on: due, paid_on: null, note: 'Luz', amount_cents: 18000, recurrence_period: period(current) }),
    ])
  })

  test('abrir de novo não duplica, nem com várias telas ao mesmo tempo', async () => {
    const id = await newRecurrence(a)
    await generate(a)
    await generate(a)
    await Promise.all([generate(a), generate(a), generate(a)])
    expect(await occurrences(a, id)).toHaveLength(1)
  })

  test('conta paga e depois excluída não volta', async () => {
    const id = await newRecurrence(a)
    await generate(a)
    const [occ] = await occurrences(a, id)
    const paid = await a.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', occ.id).select('id')
    expect(paid.data).toHaveLength(1)
    await a.client.from('transactions').delete().eq('id', occ.id)
    await generate(a)
    expect(await occurrences(a, id)).toEqual([])
  })

  test('anual só gera no mês do vencimento', async () => {
    const otherMonth = Number(addMonths(current, 1).slice(5))
    const later = await newRecurrence(a, { frequency: 'yearly', due_month: otherMonth, due_day: 10, starts_on: period(current) })
    const now = await newRecurrence(a, { frequency: 'yearly', due_month: Number(current.slice(5)), due_day: 10, starts_on: period(current) })
    await generate(a)
    expect(await occurrences(a, later)).toEqual([])
    expect((await occurrences(a, now)).map((o) => o.due_on)).toEqual([dueDateIn(current, 10)])
  })

  test('quem ficou meses sem abrir recebe no máximo 3 meses de contas', async () => {
    const id = await newRecurrence(a, { due_day: 5, starts_on: period(addMonths(current, -8)) })
    await a.client.from('recurrences').update({ generated_through: period(addMonths(current, -6)) }).eq('id', id)
    await generate(a)
    expect((await occurrences(a, id)).map((o) => o.recurrence_period)).toEqual([
      period(addMonths(current, -2)), period(addMonths(current, -1)), period(current),
    ])
  })

  test('recorrência que começa no mês que vem ainda não gera', async () => {
    const id = await newRecurrence(a, { starts_on: period(addMonths(current, 1)) })
    await generate(a)
    expect(await occurrences(a, id)).toEqual([])
  })

  test('o banco ajusta o dia igual ao app', async () => {
    for (const [m, d] of [['2027-02', 31], ['2028-02', 30], ['2026-04', 31], ['2026-01', 15]] as const) {
      const { data, error } = await a.client.rpc('occurrence_due_on', { p_period: `${m}-01`, p_day: d })
      expect(error).toBeNull()
      expect(data).toBe(dueDateIn(m, d))
    }
  })
})

describe('criar pelo Anotar', () => {
  test('o gasto de hoje é a primeira ocorrência, já paga; as próximas vêm depois', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9900, p_category_id: mercado, p_source: null, p_note: null,
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('status, due_on, paid_on, recurrence_id, recurrence_period').eq('id', txId).single()
    expect(tx).toMatchObject({ status: 'confirmed', due_on: today, paid_on: today, recurrence_period: period(current) })
    const { data: rec } = await a.client.from('recurrences').select('name, due_day, due_month, generated_through').eq('id', tx!.recurrence_id).single()
    expect(rec).toEqual({ name: 'Mercado', due_day: day, due_month: null, generated_through: period(current) })
    await generate(a)
    expect(await occurrences(a, tx!.recurrence_id)).toHaveLength(1)
  })

  test('não aceita categoria de outra pessoa', async () => {
    const casaA = await categoryId(a, 'casa')
    const { error } = await b.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 100, p_category_id: casaA, p_source: null, p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error?.message).toContain('Categoria não encontrada.')
  })

  test('entrada usa a origem como nome', async () => {
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 500000, p_category_id: null, p_source: 'Salário', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('recurrence_id').eq('id', txId).single()
    const { data: rec } = await a.client.from('recurrences').select('name, kind').eq('id', tx!.recurrence_id).single()
    expect(rec).toEqual({ name: 'Salário', kind: 'income' })
  })

  test('nota do Anotar vira recurrences.note; sem nota, ocorrências geradas não repetem a categoria (revisão final do Plano 3)', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { data: txSemNota, error: e1 } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 5000, p_category_id: mercado, p_source: null, p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(e1).toBeNull()
    const { data: txA } = await a.client.from('transactions').select('recurrence_id').eq('id', txSemNota).single()
    const { data: recSemNota } = await a.client.from('recurrences').select('note').eq('id', txA!.recurrence_id).single()
    expect(recSemNota).toEqual({ note: null })
    await generate(a)
    const [occSemNota] = await occurrences(a, txA!.recurrence_id)
    expect(occSemNota.note).toBeNull()

    const { data: txComNota, error: e2 } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 8000, p_category_id: mercado, p_source: null, p_note: 'Academia',
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(e2).toBeNull()
    const { data: txB } = await a.client.from('transactions').select('recurrence_id').eq('id', txComNota).single()
    const { data: recComNota } = await a.client.from('recurrences').select('note').eq('id', txB!.recurrence_id).single()
    expect(recComNota).toEqual({ note: 'Academia' })
    await generate(a)
    const occsComNota = await occurrences(a, txB!.recurrence_id)
    for (const occ of occsComNota) expect(occ.note).toBe('Academia')
  })
})

describe('alterar e encerrar (RF-18)', () => {
  async function seeded() {
    const id = await newRecurrence(a, { due_day: day, starts_on: period(addMonths(current, -2)) })
    const casa = await categoryId(a, 'casa')
    const base = { user_id: a.id, kind: 'expense', amount_cents: 18000, category_id: casa, note: 'Luz', recurrence_id: id }
    const prev = addMonths(current, -1)
    const old = addMonths(current, -2)
    const next = addMonths(current, 1)
    const { error } = await a.client.from('transactions').insert([
      { ...base, occurred_on: dueDateIn(old, day), status: 'confirmed', due_on: dueDateIn(old, day), paid_on: dueDateIn(old, day), recurrence_period: period(old) },
      { ...base, occurred_on: dueDateIn(prev, day), status: 'pending', due_on: dueDateIn(prev, day), recurrence_period: period(prev) },
      { ...base, occurred_on: today, status: 'pending', due_on: today, recurrence_period: period(current) },
      { ...base, occurred_on: dueDateIn(next, day), status: 'pending', due_on: dueDateIn(next, day), recurrence_period: period(next) },
    ])
    if (error) throw error
    await a.client.from('recurrences').update({ generated_through: period(next) }).eq('id', id)
    return { id, old, prev, next }
  }

  test('alterar muda só as ainda não vencidas; pagas e vencidas ficam como estavam', async () => {
    const { id } = await seeded()
    const casa = await categoryId(a, 'casa')
    const { error } = await a.client.rpc('update_recurrence', {
      p_id: id, p_name: 'Energia', p_amount_cents: 20000, p_category_id: casa, p_source: null, p_due_day: day,
    })
    expect(error).toBeNull()
    const rows = await occurrences(a, id)
    expect(rows.map((r) => [r.status, r.amount_cents, r.note])).toEqual([
      ['confirmed', 18000, 'Luz'],
      ['pending', 18000, 'Luz'],
      ['pending', 20000, 'Energia'],
      ['pending', 20000, 'Energia'],
    ])
  })

  test('novo dia que cairia antes de hoje não mexe na data da ocorrência deste mês', async () => {
    if (day === 1) return // não existe dia anterior a hoje neste mês
    const { id } = await seeded()
    const casa = await categoryId(a, 'casa')
    await a.client.rpc('update_recurrence', { p_id: id, p_name: 'Luz', p_amount_cents: 18000, p_category_id: casa, p_source: null, p_due_day: 1 })
    const rows = await occurrences(a, id)
    expect(rows[2].due_on).toBe(today)
    expect(rows[3].due_on).toBe(dueDateIn(addMonths(current, 1), 1))
  })

  test('encerrar tira as futuras, guarda o histórico e para de gerar', async () => {
    const { id, next } = await seeded()
    const { error } = await a.client.rpc('end_recurrence', { p_id: id })
    expect(error).toBeNull()
    const rows = await occurrences(a, id)
    expect(rows.map((r) => r.recurrence_period)).not.toContain(period(next))
    expect(rows).toHaveLength(3)
    const { data: rec } = await a.client.from('recurrences').select('ended_on').eq('id', id).single()
    expect(rec?.ended_on).toBe(today)
    await generate(a)
    expect(await occurrences(a, id)).toHaveLength(3)
    const again = await a.client.rpc('end_recurrence', { p_id: id })
    expect(again.error?.message).toContain('Recorrência não encontrada.')
  })
})

describe('excluir categoria usada por conta que se repete (Review Focus 3)', () => {
  test('a conta vai para "Outros" junto com os gastos', async () => {
    const { data: cat, error: e1 } = await a.client.from('categories').insert({ user_id: a.id, name: 'Academia' }).select('id').single()
    if (e1) throw e1
    const id = await newRecurrence(a, { category_id: cat.id, name: 'Academia' })
    await generate(a)
    const { error } = await a.client.rpc('delete_category', { p_category_id: cat.id })
    expect(error).toBeNull()
    const outros = await categoryId(a, 'outros')
    const { data: rec } = await a.client.from('recurrences').select('category_id').eq('id', id).single()
    expect(rec?.category_id).toBe(outros)
  })
})

test('ocorrência pendente sem vencimento é recusada (regra já existente)', async () => {
  const { error } = await a.client.from('transactions').insert({ user_id: a.id, kind: 'income', amount_cents: 100, occurred_on: addDays(today, 1), status: 'pending' })
  expect(error?.code).toBe('23514')
})
