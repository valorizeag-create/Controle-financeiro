import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { categoryId, newUser, removeUsers, type TestUser } from './helpers'
import { todayInSaoPaulo } from '../../src/domain/dates'

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

type Line = {
  import_key: string
  kind: 'income' | 'expense'
  amount_cents: number
  occurred_on: string
  category_id: string | null
  source: string | null
  note: string | null
  bill_id: string | null
  merchant_key: string | null
}

async function expenseLine(user: TestUser, key: string, p: Partial<Line> = {}): Promise<Line> {
  return {
    import_key: key, kind: 'expense', amount_cents: 1500, occurred_on: today,
    category_id: await categoryId(user, 'outros'), source: null, note: 'Padaria', bill_id: null, merchant_key: null, ...p,
  }
}

const incomeLine = (key: string, p: Partial<Line> = {}): Line => ({
  import_key: key, kind: 'income', amount_cents: 5000, occurred_on: today,
  category_id: null, source: 'Salário', note: null, bill_id: null, merchant_key: null, ...p,
})

async function importLines(user: TestUser, lines: Line[], cardId: string | null = null) {
  return user.client.rpc('import_statement', { p_lines: lines, p_card_id: cardId })
}

async function countByPrefix(user: TestUser, prefix: string): Promise<number> {
  const { data, error } = await user.client.from('transactions').select('id').like('import_key', `${prefix}%`)
  if (error) throw error
  return data.length
}

describe('importar extrato', () => {
  test('import_statement anota as linhas, ignora import_key repetida e devolve quantas entraram', async () => {
    const l1 = await expenseLine(a, 'dup-1')
    const l2 = incomeLine('dup-2')
    const first = await importLines(a, [l1, l2])
    expect(first.error).toBeNull()
    expect(first.data).toBe(2)
    const l3 = await expenseLine(a, 'dup-3')
    const second = await importLines(a, [l1, l2, l3])
    expect(second.error).toBeNull()
    expect(second.data).toBe(1)
    expect(await countByPrefix(a, 'dup-')).toBe(3)
  })

  test('marca a conta pendente como paga em vez de criar gasto', async () => {
    const outros = await categoryId(a, 'outros')
    const { data: bill, error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 9000, category_id: outros, occurred_on: today,
      status: 'pending', due_on: today, note: 'Luz',
    }).select('id').single()
    if (error) throw error
    const { data: before } = await a.client.from('transactions').select('id')
    const res = await importLines(a, [await expenseLine(a, 'bill-1', { amount_cents: 9000, bill_id: bill.id })])
    expect(res.error).toBeNull()
    expect(res.data).toBe(1)
    const { data: row } = await a.client.from('transactions').select('status, paid_on, occurred_on, import_key').eq('id', bill.id).single()
    expect(row).toMatchObject({ status: 'confirmed', paid_on: today, import_key: 'bill-1' })
    const { data: after } = await a.client.from('transactions').select('id')
    expect(after!.length).toBe(before!.length)
  })

  test('grava a memória e a categoria excluída apaga a memória junto', async () => {
    const { data: cat, error } = await a.client.from('categories').insert({ user_id: a.id, name: 'Padarias' }).select('id').single()
    if (error) throw error
    const res = await importLines(a, [await expenseLine(a, 'mem-1', { category_id: cat.id, merchant_key: 'padaria do ze' })])
    expect(res.error).toBeNull()
    const { data: rules } = await a.client.from('import_rules').select('merchant_key, kind, category_id, source').eq('merchant_key', 'padaria do ze')
    expect(rules).toEqual([{ merchant_key: 'padaria do ze', kind: 'expense', category_id: cat.id, source: null }])
    const { error: e2 } = await a.client.rpc('delete_category', { p_category_id: cat.id })
    expect(e2).toBeNull()
    const { data: gone } = await a.client.from('import_rules').select('merchant_key').eq('merchant_key', 'padaria do ze')
    expect(gone).toEqual([])
  })

  test('entrada grava a origem na memória, sem categoria', async () => {
    const res = await importLines(a, [incomeLine('mem-2', { source: 'Freela', merchant_key: 'cliente x' })])
    expect(res.error).toBeNull()
    const { data } = await a.client.from('import_rules').select('kind, category_id, source').eq('merchant_key', 'cliente x')
    expect(data).toEqual([{ kind: 'income', category_id: null, source: 'Freela' }])
  })

  test('tudo ou nada: uma linha inválida desfaz as outras', async () => {
    const res = await importLines(a, [await expenseLine(a, 'atomic-1'), await expenseLine(a, 'atomic-2', { amount_cents: 0 })])
    expect(res.error).not.toBeNull()
    expect(await countByPrefix(a, 'atomic-')).toBe(0)
  })

  test('RLS: Bia não lê nem grava a memória de Ana, e não usa a conta pendente de Ana', async () => {
    await importLines(a, [await expenseLine(a, 'rls-1', { merchant_key: 'mercado da ana' })])
    const { data: seen } = await b.client.from('import_rules').select('merchant_key')
    expect(seen).toEqual([])
    const outrosA = await categoryId(a, 'outros')
    const { error: insErr } = await b.client.from('import_rules').insert({
      user_id: a.id, merchant_key: 'invasao', kind: 'expense', category_id: outrosA,
    })
    expect(insErr).not.toBeNull()

    const { data: bill, error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 7000, category_id: outrosA, occurred_on: today,
      status: 'pending', due_on: today,
    }).select('id').single()
    if (error) throw error
    const res = await importLines(b, [await expenseLine(b, 'rls-2', { bill_id: bill.id })])
    expect(res.error).toBeNull()
    expect(res.data).toBe(0)
    const { data: still } = await a.client.from('transactions').select('status').eq('id', bill.id).single()
    expect(still!.status).toBe('pending')
  })

  test('gasto de cartão leva card_id; entrada não', async () => {
    const { data: card, error } = await a.client.from('cards').insert({
      user_id: a.id, nickname: 'Nubank', kind: 'credit', color: 'purple',
    }).select('id').single()
    if (error) throw error
    const res = await importLines(a, [await expenseLine(a, 'card-1'), incomeLine('card-2')], card.id)
    expect(res.error).toBeNull()
    expect(res.data).toBe(2)
    const { data: rows } = await a.client.from('transactions').select('import_key, card_id').like('import_key', 'card-%').order('import_key')
    expect(rows).toEqual([
      { import_key: 'card-1', card_id: card.id },
      { import_key: 'card-2', card_id: null },
    ])
  })
})
