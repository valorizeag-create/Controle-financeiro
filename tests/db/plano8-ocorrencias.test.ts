import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { addMonths } from '@/domain/dates'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { monthStart } from './notify-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const month = today.slice(0, 7)
const first = monthStart(today)

async function rec(u: TestUser, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await u.client.from('recurrences').insert({
    user_id: u.id, kind: 'expense', name: 'Luz', amount_cents: 12000, category_id: await categoryId(u, 'casa'),
    frequency: 'monthly', due_day: 10, starts_on: first, ...extra,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function occ(recId: string) {
  const { data, error } = await admin.from('transactions')
    .select('user_id, status, due_on, family_id, recurrence_period').eq('recurrence_id', recId).order('recurrence_period')
  if (error) throw error
  return data
}

describe('tarefa diária das 00h05 (etapa-3 §5)', () => {
  let a: TestUser, b: TestUser, c: TestUser
  let family: string
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio')
    family = await createFamily(a, 'Família Tarefa')
    await joinFamily(b, a)
  })
  afterAll(async () => { await removeUsers(b, c, a) })

  test('cria as contas de quem não abriu o app, e rodar de novo não duplica', async () => {
    const id = await rec(c)
    expect(await occ(id)).toEqual([])
    const run = await admin.rpc('job_generate_occurrences')
    expect(run.error).toBeNull()
    expect(await occ(id)).toEqual([{ user_id: c.id, status: 'pending', due_on: `${month}-10`, family_id: null, recurrence_period: first }])
    expect((await admin.rpc('job_generate_occurrences')).error).toBeNull()
    expect((await occ(id)).length).toBe(1)
    expect((await c.client.rpc('generate_occurrences')).data).toBe(0)
  })

  test('conta da família: nasce em nome de quem criou, com a família', async () => {
    const id = await rec(b, { family_id: family, name: 'Internet' })
    await admin.rpc('job_generate_occurrences')
    expect(await occ(id)).toEqual([{ user_id: b.id, status: 'pending', due_on: `${month}-10`, family_id: family, recurrence_period: first }])
    // quem abre o app depois não cria de novo
    expect((await a.client.rpc('generate_family_occurrences')).data).toBe(0)
    expect((await occ(id)).length).toBe(1)
  })

  test('quem ficou meses sem abrir recebe no máximo 3 meses (decisão 29)', async () => {
    const id = await rec(c, { name: 'Antiga', starts_on: `${addMonths(month, -8)}-01` })
    const set = await admin.from('recurrences').update({ generated_through: `${addMonths(month, -6)}-01` }).eq('id', id)
    expect(set.error).toBeNull()
    await admin.rpc('job_generate_occurrences')
    expect((await occ(id)).map((o) => o.recurrence_period)).toEqual([`${addMonths(month, -2)}-01`, `${addMonths(month, -1)}-01`, first])
  })

  test('conta paga e depois excluída não volta (decisão 30)', async () => {
    const id = await rec(c, { name: 'Paga' })
    await admin.rpc('job_generate_occurrences')
    const paid = await c.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('recurrence_id', id).select('id')
    expect(paid.data?.length).toBe(1)
    await c.client.from('transactions').delete().eq('recurrence_id', id)
    await admin.rpc('job_generate_occurrences')
    expect(await occ(id)).toEqual([])
  })

  test('abrir o app continua gerando só as contas de quem abriu', async () => {
    const mine = await rec(a, { name: 'Da Ana' })
    const hers = await rec(b, { name: 'Da Bia' })
    expect((await a.client.rpc('generate_occurrences')).error).toBeNull()
    expect((await occ(mine)).length).toBe(1)
    expect(await occ(hers)).toEqual([])
  })

  test('abrir o app continua gerando as contas da família de quem abriu, em nome de quem criou', async () => {
    const id = await rec(b, { family_id: family, name: 'Condomínio' })
    expect((await c.client.rpc('generate_family_occurrences')).data).toBe(0) // Caio não é da família
    expect(await occ(id)).toEqual([])
    expect((await a.client.rpc('generate_family_occurrences')).data).toBe(1)
    expect(await occ(id)).toEqual([{ user_id: b.id, status: 'pending', due_on: `${month}-10`, family_id: family, recurrence_period: first }])
    expect((await anon.rpc('generate_family_occurrences')).error).not.toBeNull()
    expect((await anon.rpc('generate_occurrences')).error).not.toBeNull()
  })

  test('as funções da tarefa não são chamadas por pessoa nem sem sessão', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['job_generate_occurrences', {}],
      ['generate_occurrences_for', { p_user: b.id }],
      ['generate_family_occurrences_for', { p_family: family }],
    ]
    for (const [fn, args] of calls) {
      expect((await a.client.rpc(fn, args)).error?.code, fn).toBe('42501')
      expect((await anon.rpc(fn, args)).error?.code, fn).toBe('42501')
    }
  })
})

describe('generated_through só muda pela geração', () => {
  let a: TestUser
  beforeAll(async () => { a = await newUser('Ana') })
  afterAll(async () => { await removeUsers(a) })

  test('a pessoa não altera pela API; o resto do molde continua alterável', async () => {
    const id = await rec(a)
    await a.client.rpc('generate_occurrences')
    const tamper = await a.client.from('recurrences').update({ generated_through: null }).eq('id', id).select('id')
    expect(tamper.error?.code).toBe('42501')
    const back = await a.client.from('recurrences').update({ generated_through: `${addMonths(month, -6)}-01` }).eq('id', id).select('id')
    expect(back.error?.code).toBe('42501')
    // nem escondido no meio de uma alteração permitida
    const mixed = await a.client.from('recurrences').update({ amount_cents: 1, generated_through: null }).eq('id', id).select('id')
    expect(mixed.error?.code).toBe('42501')
    const row = await admin.from('recurrences').select('generated_through, amount_cents').eq('id', id).single()
    expect(row.data).toEqual({ generated_through: first, amount_cents: 12000 })
    const ok = await a.client.from('recurrences').update({ amount_cents: 15000 }).eq('id', id).select('amount_cents')
    expect(ok.data).toEqual([{ amount_cents: 15000 }])
  })

  test('alterar e encerrar pelo app continuam funcionando sem a permissão na coluna', async () => {
    const id = await rec(a, { name: 'Telefone' })
    await a.client.rpc('generate_occurrences')
    const before = await admin.from('recurrences').select('updated_at').eq('id', id).single()
    const upd = await a.client.rpc('update_recurrence', {
      p_id: id, p_name: 'Celular', p_amount_cents: 9900, p_category_id: await categoryId(a, 'casa'), p_source: null, p_due_day: 12,
    })
    expect(upd.error).toBeNull()
    const after = await admin.from('recurrences').select('name, amount_cents, due_day, generated_through, updated_at').eq('id', id).single()
    expect(after.data).toMatchObject({ name: 'Celular', amount_cents: 9900, due_day: 12, generated_through: first })
    expect(after.data!.updated_at).not.toBe(before.data!.updated_at) // o gatilho de updated_at não depende da permissão
    expect((await a.client.rpc('end_recurrence', { p_id: id })).error).toBeNull()
    expect((await admin.from('recurrences').select('ended_on').eq('id', id).single()).data).toEqual({ ended_on: today })
  })

  test('ao criar: vazio ou o mês em que começa; qualquer outro mês é recusado', async () => {
    const base = {
      user_id: a.id, kind: 'expense', name: 'Água', amount_cents: 5000, category_id: await categoryId(a, 'casa'),
      frequency: 'monthly', due_day: 5, starts_on: first,
    }
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: '2099-12-01' })).error?.message).toContain('Recorrência inválida.')
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: `${addMonths(month, -1)}-01` })).error?.message).toContain('Recorrência inválida.')
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: first })).error).toBeNull()
    expect((await a.client.from('recurrences').insert(base)).error).toBeNull()
  })

  test('anotar "conta que se repete" continua funcionando (a primeira já existe)', async () => {
    const { data, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9000, p_category_id: await categoryId(a, 'casa'), p_source: null, p_note: 'Gás',
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const tx = await a.client.from('transactions').select('recurrence_id').eq('id', data as string).single()
    expect((await admin.from('recurrences').select('generated_through').eq('id', tx.data!.recurrence_id).single()).data?.generated_through).toBe(first)
  })
})
