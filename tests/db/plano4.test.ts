import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn } from '../../src/domain/recurrence'
import { splitInstallments } from '../../src/domain/installments'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()
const current = monthOf(today)
const day = Number(today.slice(8, 10))

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newCard(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('cards')
    .insert({ user_id: user.id, nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', ...p })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

type PurchaseInput = { amount?: number; count?: number; purchasedOn?: string; cardId?: string | null; note?: string | null; paymentMethod?: string | null }

async function purchase(user: TestUser, p: PurchaseInput = {}): Promise<string> {
  const compras = await categoryId(user, 'compras')
  const { data, error } = await user.client.rpc('create_installment_purchase', {
    p_amount_cents: p.amount ?? 30000, p_count: p.count ?? 3, p_category_id: compras, p_note: p.note === undefined ? 'Tênis' : p.note,
    p_card_id: p.cardId ?? null, p_payment_method: p.paymentMethod ?? null, p_purchased_on: p.purchasedOn ?? today,
  })
  if (error) throw error
  return data as string
}

async function planRows(user: TestUser, planId: string) {
  const { data, error } = await user.client
    .from('transactions')
    .select('id, amount_cents, occurred_on, status, note, category_id, payment_method, card_id, card_deleted, installment_number, installment_count')
    .eq('installment_plan_id', planId)
    .order('installment_number', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

async function plan(user: TestUser, planId: string) {
  const { data, error } = await user.client
    .from('installment_plans').select('total_cents, installment_count, purchased_on, status, closed_on').eq('id', planId).maybeSingle()
  if (error) throw error
  return data
}

// Compra de 2 meses atrás em 5x: parcelas em -2, -1, este mês (até hoje) e duas futuras.
const twoMonthsAgo = () => dueDateIn(addMonths(current, -2), day)

describe('privacidade dos cartões e das compras', () => {
  test('ninguém vê nem altera o cartão de outra pessoa', async () => {
    const id = await newCard(a)
    const { data: seen } = await b.client.from('cards').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: changed } = await b.client.from('cards').update({ nickname: 'X' }).eq('id', id).select()
    expect(changed).toEqual([])
  })

  test('ninguém anota gasto com o cartão de outra pessoa', async () => {
    const card = await newCard(a)
    const outros = await categoryId(b, 'outros')
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, card_id: card,
    })
    expect(error?.code).toBe('23503')
  })

  test('ninguém cria compra parcelada com cartão ou categoria de outra pessoa', async () => {
    const card = await newCard(a)
    const withCard = await b.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(b, 'compras'), p_note: null,
      p_card_id: card, p_payment_method: null, p_purchased_on: today,
    })
    expect(withCard.error?.message).toContain('Cartão não encontrado.')
    const withCategory = await b.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(a, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today,
    })
    expect(withCategory.error?.message).toContain('Categoria não encontrada.')
  })

  test('ninguém vê, quita, devolve ou exclui a compra de outra pessoa (Review Focus 5)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    const { data: seen } = await b.client.from('installment_plans').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: rows } = await b.client.from('transactions').select('id').eq('installment_plan_id', id)
    expect(rows).toEqual([])
    for (const [fn, args] of [
      ['settle_installments', { p_plan_id: id, p_amount_cents: 100 }],
      ['refund_installments', { p_plan_id: id }],
      ['delete_installment_purchase', { p_plan_id: id }],
    ] as const) {
      const { error } = await b.client.rpc(fn, args)
      expect(error?.message).toContain('Compra não encontrada.')
    }
    expect(await planRows(a, id)).toHaveLength(5)
  })

  test('ninguém exclui o cartão de outra pessoa', async () => {
    const card = await newCard(a)
    const { error } = await b.client.rpc('delete_card', { p_card_id: card })
    expect(error?.message).toContain('Cartão não encontrado.')
    const { data } = await a.client.from('cards').select('id').eq('id', card)
    expect(data).toHaveLength(1)
  })

  test('quem não entrou não cria compras', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: null, p_note: null, p_card_id: null, p_payment_method: null, p_purchased_on: today,
    })
    expect(error).not.toBeNull()
  })
})

describe('regras nos registros', () => {
  test('cartão só em gasto e sem outra forma de pagamento (decisão 47)', async () => {
    const card = await newCard(a)
    const outros = await categoryId(a, 'outros')
    const income = await a.client.from('transactions').insert({ user_id: a.id, kind: 'income', amount_cents: 100, occurred_on: today, card_id: card })
    expect(income.error?.code).toBe('23514')
    const both = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, card_id: card, payment_method: 'pix',
    })
    expect(both.error?.code).toBe('23514')
  })

  test('número de parcela sem compra é recusado', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, installment_number: 1, installment_count: 2,
    })
    expect(error?.code).toBe('23514')
  })
})

describe('calendário das parcelas', () => {
  test('o banco divide igual ao app (Review Focus 1 e 2)', async () => {
    const cases: [number, number, string][] = [[10000, 3, '2026-01-31'], [99999, 7, '2027-12-31'], [40000, 4, '2026-11-30'], [48, 48, '2026-05-15']]
    for (const [total, count, on] of cases) {
      const { data, error } = await a.client.rpc('installment_schedule', { p_total_cents: total, p_count: count, p_purchased_on: on })
      expect(error).toBeNull()
      const got = (data as { installment_no: number; cents: number; on_date: string }[])
        .sort((x, y) => x.installment_no - y.installment_no)
        .map((r) => ({ number: r.installment_no, amountCents: Number(r.cents), occurredOn: r.on_date }))
      expect(got).toEqual(splitInstallments(total, count, on))
    }
  })

  test('p_count fora de 2..48 não gera linhas (Important 1)', async () => {
    const zero = await a.client.rpc('installment_schedule', { p_total_cents: 100, p_count: 0, p_purchased_on: today })
    expect(zero.error).toBeNull()
    expect(zero.data).toEqual([])
    const tooMany = await a.client.rpc('installment_schedule', { p_total_cents: 100, p_count: 49, p_purchased_on: today })
    expect(tooMany.error).toBeNull()
    expect(tooMany.data).toEqual([])
  })
})

describe('criar compra parcelada (RN-07)', () => {
  test('uma parcela confirmada por mês, a 1ª no mês da compra, somando o total', async () => {
    const id = await purchase(a, { amount: 10000, count: 3 })
    const rows = await planRows(a, id)
    expect(rows.map((r) => [r.installment_number, Number(r.amount_cents), r.occurred_on])).toEqual(
      splitInstallments(10000, 3, today).map((p) => [p.number, p.amountCents, p.occurredOn]),
    )
    expect(rows.every((r) => r.status === 'confirmed' && r.installment_count === 3 && r.note === 'Tênis')).toBe(true)
    expect(await plan(a, id)).toMatchObject({ installment_count: 3, purchased_on: today, status: 'active', closed_on: null })
    expect(Number((await plan(a, id))!.total_cents)).toBe(10000)
  })

  test('com cartão, a forma de pagamento fica vazia', async () => {
    const card = await newCard(a)
    const id = await purchase(a, { cardId: card, paymentMethod: 'pix' })
    const rows = await planRows(a, id)
    expect(rows.every((r) => r.card_id === card && r.payment_method === null)).toBe(true)
  })

  test('recusa data futura, 1 ou 49 parcelas e valor menor que o número de parcelas', async () => {
    const compras = await categoryId(a, 'compras')
    const call = (p: Record<string, unknown>) =>
      a.client.rpc('create_installment_purchase', {
        p_amount_cents: 30000, p_count: 3, p_category_id: compras, p_note: null, p_card_id: null, p_payment_method: null, p_purchased_on: today, ...p,
      })
    expect((await call({ p_purchased_on: dueDateIn(addMonths(current, 1), 1) })).error?.message).toContain('Data inválida.')
    expect((await call({ p_count: 1 })).error?.message).toContain('Parcelas inválidas.')
    expect((await call({ p_count: 49 })).error?.message).toContain('Parcelas inválidas.')
    expect((await call({ p_amount_cents: 5, p_count: 10 })).error?.message).toContain('Parcelas inválidas.')
  })
})

describe('quitar antecipadamente (RN-08)', () => {
  test('quitar: as futuras saem e o valor pago entra hoje, com a mesma categoria, nota e cartão (Review Focus 3)', async () => {
    const card = await newCard(a)
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000, cardId: card })
    const { data: txId, error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
    const rows = await planRows(a, id)
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3, null])
    expect(rows[3]).toMatchObject({ id: txId, occurred_on: today, status: 'confirmed', note: 'Tênis', card_id: card, category_id: await categoryId(a, 'compras'), installment_count: null })
    expect(Number(rows[3].amount_cents)).toBe(18000)
    expect(await plan(a, id)).toMatchObject({ status: 'settled', closed_on: today })
  })

  test('quitar duas vezes, ou devolver depois de quitar, não faz nada (Review Focus 5)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    const again = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    expect(again.error?.message).toContain('Compra não encontrada.')
    const refund = await a.client.rpc('refund_installments', { p_plan_id: id })
    expect(refund.error?.message).toContain('Compra não encontrada.')
    expect(await planRows(a, id)).toHaveLength(4)
  })

  test('sem parcela futura não há o que quitar; nada muda', async () => {
    const id = await purchase(a, { purchasedOn: dueDateIn(addMonths(current, -1), day), count: 2, amount: 20000 })
    const { error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 100 })
    expect(error?.message).toContain('Nenhuma parcela futura.')
    expect(await planRows(a, id)).toHaveLength(2)
    expect(await plan(a, id)).toMatchObject({ status: 'active' })
  })

  test('valor quitado precisa ser maior que zero', async () => {
    const id = await purchase(a)
    const { error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 0 })
    expect(error?.message).toContain('Valor inválido.')
  })
})

describe('devolução e exclusão da compra', () => {
  test('devolução: as futuras saem; as que já contaram ficam (RN-09)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    const { error } = await a.client.rpc('refund_installments', { p_plan_id: id })
    expect(error).toBeNull()
    expect((await planRows(a, id)).map((r) => r.installment_number)).toEqual([1, 2, 3])
    expect(await plan(a, id)).toMatchObject({ status: 'refunded', closed_on: today })
  })

  test('excluir a compra apaga as parcelas e o restante quitado', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    const { error } = await a.client.rpc('delete_installment_purchase', { p_plan_id: id })
    expect(error).toBeNull()
    expect(await planRows(a, id)).toEqual([])
    expect(await plan(a, id)).toBeNull()
  })
})

describe('excluir cartão (RN-32, Review Focus 4)', () => {
  test('gastos ficam como "Cartão excluído", valores iguais; a conta que se repete segue sem cartão', async () => {
    const card = await newCard(a)
    const mercado = await categoryId(a, 'mercado')
    const { data: tx, error: e1 } = await a.client
      .from('transactions').insert({ user_id: a.id, kind: 'expense', amount_cents: 12000, category_id: mercado, occurred_on: today, card_id: card })
      .select('id').single()
    if (e1) throw e1
    const planId = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000, cardId: card })
    const { data: rec, error: e2 } = await a.client
      .from('recurrences').insert({
        user_id: a.id, kind: 'expense', name: 'Streaming', amount_cents: 3990, category_id: mercado, card_id: card,
        frequency: 'monthly', due_day: day, starts_on: `${addMonths(current, 1)}-01`,
      })
      .select('id').single()
    if (e2) throw e2

    const { error } = await a.client.rpc('delete_card', { p_card_id: card })
    expect(error).toBeNull()

    const { data: after } = await a.client.from('transactions').select('amount_cents, card_id, card_deleted').eq('id', tx.id).single()
    expect(after).toMatchObject({ card_id: null, card_deleted: true })
    expect(Number(after!.amount_cents)).toBe(12000)
    const rows = await planRows(a, planId)
    expect(rows.every((r) => r.card_id === null && r.card_deleted)).toBe(true)
    expect(rows.reduce((s, r) => s + Number(r.amount_cents), 0)).toBe(50000)
    const { data: recAfter } = await a.client.from('recurrences').select('card_id').eq('id', rec.id).single()
    expect(recAfter?.card_id).toBeNull()
    const { data: cards } = await a.client.from('cards').select('id').eq('id', card)
    expect(cards).toEqual([])

    // Quitar depois de excluir o cartão: o restante também fica como "Cartão excluído".
    await a.client.rpc('settle_installments', { p_plan_id: planId, p_amount_cents: 20000 })
    const settled = (await planRows(a, planId)).at(-1)
    expect(settled).toMatchObject({ installment_number: null, card_id: null, card_deleted: true })
  })
})

describe('conta que se repete com cartão (decisão 58)', () => {
  test('a primeira e as próximas levam o cartão; a forma de pagamento fica vazia', async () => {
    const card = await newCard(a)
    const mercado = await categoryId(a, 'mercado')
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 3990, p_category_id: mercado, p_source: null, p_note: 'Streaming',
      p_payment_method: 'credit', p_occurred_on: today, p_frequency: 'monthly', p_card_id: card,
    })
    expect(error).toBeNull()
    const { data: first } = await a.client.from('transactions').select('card_id, payment_method, recurrence_id').eq('id', txId).single()
    expect(first).toMatchObject({ card_id: card, payment_method: null })
    const { data: rec } = await a.client.from('recurrences').select('card_id, payment_method').eq('id', first!.recurrence_id).single()
    expect(rec).toEqual({ card_id: card, payment_method: null })

    const { data: other, error: e2 } = await a.client
      .from('recurrences').insert({
        user_id: a.id, kind: 'expense', name: 'Academia', amount_cents: 9000, category_id: mercado, card_id: card,
        frequency: 'monthly', due_day: day, starts_on: `${current}-01`,
      })
      .select('id').single()
    if (e2) throw e2
    await a.client.rpc('generate_occurrences')
    const { data: occ } = await a.client.from('transactions').select('card_id, status').eq('recurrence_id', other.id)
    expect(occ).toEqual([{ card_id: card, status: 'pending' }])
  })

  test('chamada sem p_card_id (Plano 3) continua funcionando', async () => {
    const { error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 100, p_category_id: null, p_source: 'Freela', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
  })
})
