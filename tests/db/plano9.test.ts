import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, expense, joinFamily, todaySP } from './family-helpers'
import { pendingBill, subscribe } from './notify-helpers'

// Quem é excluído dentro de um teste nasce com newUser() e fica fora desta lista.
const created: TestUser[] = []
const today = todaySP()
const month = `${today.slice(0, 7)}-01`
const REAUTH = 'Entrada recente necessária.'
const ENDED = 'Família encerrada'
const NOT_CALLABLE = ['PGRST202', '42501']
const anon = createClient(url, publishable, { auth: { persistSession: false } })

async function user(name: string): Promise<TestUser> {
  const u = await newUser(name)
  created.push(u)
  return u
}
async function session(u: TestUser) {
  const { data } = await u.client.auth.getSession()
  if (!data.session) throw new Error('sem sessão')
  return data.session
}
const sessionId = (token: string): string =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).session_id as string
// Um token que ainda não venceu, usado depois de a sessão ter sido encerrada.
const withToken = (token: string) =>
  createClient(url, publishable, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

async function leftovers(id: string, email: string | null = null): Promise<string[]> {
  const { data, error } = await admin.rpc('account_leftovers', { p_user: id, p_email: email })
  if (error) throw error
  return (data as { place: string; n: number }[]).map((r) => r.place).sort()
}
const exists = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user !== null
async function familyGoal(u: TestUser, name: string): Promise<string> {
  const { data, error } = await u.client.rpc('create_family_goal', { p_name: name, p_target_cents: 1_000_000, p_deadline: null })
  if (error) throw error
  return data as string
}
async function deposit(u: TestUser, goal: string, cents: number) {
  const { error } = await u.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: cents })
  if (error) throw error
}
async function totals(u: TestUser): Promise<Record<string, number>> {
  const { data, error } = await u.client.rpc('family_goal_totals')
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { goal_id: string; saved_cents: number }[]).map((r) => [r.goal_id, Number(r.saved_cents)]))
}
async function familyRows(u: TestUser) {
  const { data, error } = await u.client.rpc('family_expenses', { p_from: month, p_to: today })
  if (error) throw error
  return data as { id: string; author_id: string | null; author_name: string | null; amount_cents: number; note: string | null }[]
}
// O relógio escolhido pelo teste (só o papel de serviço chama).
async function recentAt(userId: string, sessionUuid: string, now: string): Promise<boolean> {
  const { data, error } = await admin.rpc('session_recent_at', { p_user: userId, p_session: sessionUuid, p_now: now })
  if (error) throw error
  return data as boolean
}
// Quem administra usa o dinheiro da meta da família numa compra de hoje.
async function useGoal(u: TestUser, goal: string, cents: number): Promise<string> {
  const { data, error } = await u.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: cents, p_category_id: await categoryId(u, 'casa') })
  if (error) throw error
  return (data as { tx_id: string }[])[0].tx_id
}
async function useParts(tx: string, names: Record<string, string>): Promise<[string, number][]> {
  const { data, error } = await admin.from('goal_movements').select('user_id, kind, amount_cents').eq('transaction_id', tx)
  if (error) throw error
  expect(data.every((m) => m.kind === 'use')).toBe(true)
  return data
    .map((m): [string, number] => [m.user_id === null ? 'ex' : (names[m.user_id as string] ?? 'outra pessoa'), Number(m.amount_cents)])
    .sort((a, b) => a[0].localeCompare(b[0]))
}

afterAll(async () => {
  await removeUsers(...created)
})

describe('entrada recente', () => {
  test('quem acabou de entrar tem entrada recente; sem sessão a função nem é chamável', async () => {
    const a = await user('Ana')
    const r = await a.client.rpc('session_is_recent')
    expect(r.error).toBeNull()
    expect(r.data).toBe(true)
    expect((await anon.rpc('session_is_recent')).error?.code).toBe('42501')
  })

  test('vale 15 minutos, só para a própria sessão e só enquanto ela existe', async () => {
    const a = await user('Ana')
    const b = await user('Bia')
    const s = await session(a)
    const sid = sessionId(s.access_token)
    const recent = async (userId: string, sessionUuid: string, now: string) => {
      const { data, error } = await admin.rpc('session_recent_at', { p_user: userId, p_session: sessionUuid, p_now: now })
      if (error) throw error
      return data
    }
    expect(await recent(a.id, sid, inMinutes(0))).toBe(true)
    expect(await recent(a.id, sid, inMinutes(14))).toBe(true)
    expect(await recent(a.id, sid, inMinutes(16))).toBe(false)
    // sessão de outra pessoa, sessão que não existe, relógio muito atrás
    expect(await recent(b.id, sid, inMinutes(0))).toBe(false)
    expect(await recent(a.id, '00000000-0000-4000-8000-000000000000', inMinutes(0))).toBe(false)
    expect(await recent(a.id, sid, inMinutes(-10))).toBe(false)

    // Saiu da Íris: o token ainda passa pela API até vencer, mas a sessão não existe mais.
    const stale = withToken(s.access_token)
    expect((await a.client.auth.signOut()).error).toBeNull()
    const after = await stale.rpc('session_is_recent')
    expect(after.error).toBeNull()
    expect(after.data).toBe(false)
    expect(await recent(a.id, sid, inMinutes(0))).toBe(false)
  })

  test('renovar o token não renova a entrada: a sessão é a mesma e a hora em que ela nasceu não muda', async () => {
    const a = await user('Ana')
    const first = await session(a)
    const sid = sessionId(first.access_token)
    // A sessão nasceu antes deste instante (com folga para a diferença de relógio entre o teste e o banco):
    // daqui a 15 minutos ela já não é recente; daqui a 14, ainda é.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const mark = Date.now()
    const at15 = new Date(mark + 15 * 60_000).toISOString()
    const at14 = new Date(mark + 14 * 60_000).toISOString()
    expect(await recentAt(a.id, sid, at14)).toBe(true)
    expect(await recentAt(a.id, sid, at15)).toBe(false)

    const refreshed = await a.client.auth.refreshSession()
    expect(refreshed.error).toBeNull()
    const token = refreshed.data.session!.access_token
    expect(token).not.toBe(first.access_token)
    expect(sessionId(token)).toBe(sid)
    // Se renovar empurrasse a hora da sessão para agora, ela voltaria a ser recente aos 15 minutos.
    expect(await recentAt(a.id, sid, at14)).toBe(true)
    expect(await recentAt(a.id, sid, at15)).toBe(false)
    expect((await a.client.rpc('session_is_recent')).data).toBe(true)
  })
})

describe('excluir o cadastro: só o próprio, com entrada recente', () => {
  test('sem sessão, com sessão encerrada ou tentando passar o id de outra pessoa: nada é apagado', async () => {
    const a = await user('Ana')
    const b = await user('Bia')
    expect((await anon.rpc('delete_my_account')).error?.code).toBe('42501')

    // A função não tem parâmetro: não existe forma de apontar para outra pessoa.
    const aimed = await a.client.rpc('delete_my_account', { p_user: b.id })
    expect(aimed.error?.code).toBe('PGRST202')
    expect(await exists(b.id)).toBe(true)
    expect(await exists(a.id)).toBe(true)

    const s = await session(a)
    const stale = withToken(s.access_token)
    expect((await a.client.auth.signOut()).error).toBeNull()
    const refused = await stale.rpc('delete_my_account')
    expect(refused.error?.message).toBe(REAUTH)
    expect(refused.error?.code).toBe('42501')
    expect(await exists(a.id)).toBe(true)
    expect((await admin.from('profiles').select('id').eq('id', a.id)).data).toHaveLength(1)
    expect((await admin.from('categories').select('id').eq('user_id', a.id)).data).toHaveLength(10)
  })

  test('token adulterado e chave de serviço não excluem ninguém', async () => {
    const a = await user('Ana')
    const b = await user('Bia')
    // O token da Ana com o id da Bia no lugar e a assinatura original: a API recusa antes de chegar ao banco.
    const [header, payload, signature] = (await session(a)).access_token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    const forged = [header, Buffer.from(JSON.stringify({ ...claims, sub: b.id })).toString('base64url'), signature].join('.')
    const r = await withToken(forged).rpc('delete_my_account')
    expect(r.error).not.toBeNull()
    expect(r.data).toBeNull()
    const probe = await withToken(forged).rpc('session_is_recent')
    expect(probe.error).not.toBeNull()
    expect(probe.data).toBeNull()

    // A chave de serviço não tem sessão: não chama nenhuma das duas.
    expect((await admin.rpc('delete_my_account')).error?.code).toBe('42501')
    expect((await admin.rpc('session_is_recent')).error?.code).toBe('42501')

    expect(await exists(a.id)).toBe(true)
    expect(await exists(b.id)).toBe(true)
    expect((await admin.from('categories').select('id').eq('user_id', a.id)).data).toHaveLength(10)
    expect((await admin.from('categories').select('id').eq('user_id', b.id)).data).toHaveLength(10)
  })

  test('cada tabela tem algo da pessoa antes e nada depois; outra pessoa não perde nada', async () => {
    const z = await newUser('Zeca') // excluído no teste
    const olga = await user('Olga')
    const email = (await session(z)).user.email!
    const mercado = await categoryId(z, 'mercado')

    // Uma linha em cada tabela pessoal.
    expect((await z.client.from('categories').insert({ user_id: z.id, name: 'Pet' })).error).toBeNull()
    await expense(z, 'mercado', 1234, { note: 'feira' })
    expect((await z.client.from('transactions').insert({
      user_id: z.id, kind: 'income', amount_cents: 500_000, source: 'Salário', occurred_on: today,
    })).error).toBeNull()
    await pendingBill(z, { name: 'Luz', dueOn: today })
    const card = await z.client.from('cards').insert({ user_id: z.id, nickname: 'Roxinho', kind: 'credit', color: 'purple' }).select('id').single()
    expect(card.error).toBeNull()
    expect((await z.client.rpc('create_installment_purchase', {
      p_amount_cents: 60_000, p_count: 3, p_category_id: mercado, p_note: null, p_card_id: card.data!.id, p_payment_method: null, p_purchased_on: today,
    })).error).toBeNull()
    const goal = await z.client.from('goals').insert({ user_id: z.id, name: 'Viagem', target_cents: 400_000 }).select('id').single()
    expect(goal.error).toBeNull()
    expect((await z.client.rpc('deposit_to_goal', { p_goal_id: goal.data!.id, p_amount_cents: 5000 })).error).toBeNull()
    expect((await z.client.rpc('set_month_budgets', { p_month: month, p_category_ids: [mercado], p_amounts: [80_000] })).error).toBeNull()
    expect((await z.client.from('notification_prefs').upsert({ user_id: z.id, kind: 'daily', enabled: true })).error).toBeNull()
    await subscribe(z)
    expect((await admin.from('notification_log').insert({ user_id: z.id, kind: 'comeback', ref: today })).error).toBeNull()
    const fam = await createFamily(z, 'Família do Zeca')
    expect((await z.client.rpc('create_family_email_invite', { p_email: 'convidado@teste.iris.dev' })).error).toBeNull()
    await expense(z, 'casa', 9900, { family_id: fam, note: 'aluguel' })
    const famGoal = await familyGoal(z, 'Sofá')
    await deposit(z, famGoal, 2000)

    await expense(olga, 'lazer', 777, { note: 'da Olga' })

    // A conferência enxerga cada tabela (se um lugar novo guardar o id da pessoa, ele aparece aqui).
    const before = await leftovers(z.id, email)
    for (const place of [
      'auth.users.id', 'auth.users.email', 'auth.sessions.user_id', 'auth.refresh_tokens.user_id',
      'public.profiles.id', 'public.categories.user_id', 'public.transactions.user_id', 'public.recurrences.user_id',
      'public.cards.user_id', 'public.installment_plans.user_id', 'public.goals.user_id', 'public.goals.created_by',
      'public.goal_movements.user_id', 'public.budgets.user_id', 'public.notification_prefs.user_id',
      'public.push_subscriptions.user_id', 'public.notification_log.user_id',
      'public.families.created_by', 'public.family_members.user_id', 'public.family_invites.created_by',
    ]) {
      expect(before, place).toContain(place)
    }

    const done = await z.client.rpc('delete_my_account')
    expect(done.error).toBeNull()
    expect(done.data).toBe(true)

    expect(await exists(z.id)).toBe(false)
    expect(await leftovers(z.id, email)).toEqual([])
    for (const table of [
      'categories', 'transactions', 'recurrences', 'cards', 'installment_plans', 'goals', 'goal_movements',
      'budgets', 'notification_prefs', 'push_subscriptions', 'notification_log',
    ]) {
      expect((await admin.from(table).select('user_id').eq('user_id', z.id)).data, table).toEqual([])
    }
    // A família era só dela: some inteira, com o nome, o convite (e o resumo do endereço convidado), a meta e os gastos.
    expect((await admin.from('families').select('id').eq('id', fam)).data).toEqual([])
    expect((await admin.from('family_members').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_invites').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_events').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('transactions').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goals').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goal_movements').select('id').eq('goal_id', famGoal)).data).toEqual([])

    // Quem não tem nada com isso continua igual.
    expect((await olga.client.from('transactions').select('note')).data).toEqual([{ note: 'da Olga' }])
    expect((await olga.client.from('categories').select('id')).data).toHaveLength(10)
    expect((await olga.client.rpc('session_is_recent')).data).toBe(true)

    // A sessão de quem excluiu não serve para mais nada (o token ainda não venceu).
    expect((await z.client.from('profiles').select('id')).data ?? []).toEqual([])
    expect((await z.client.from('transactions').insert({
      user_id: z.id, kind: 'income', amount_cents: 100, source: 'x', occurred_on: today,
    })).error).not.toBeNull()
    const again = await z.client.rpc('delete_my_account')
    expect(again.error).toBeNull()
    expect(again.data).toBe(false)
  })

  test('duas chamadas ao mesmo tempo: uma exclui, a outra encontra o cadastro já excluído; nenhuma dá erro', async () => {
    const d = await newUser('Duda') // excluída no teste
    await createFamily(d, 'Família da Duda')
    const [r1, r2] = await Promise.all([d.client.rpc('delete_my_account'), d.client.rpc('delete_my_account')])
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect([r1.data, r2.data].sort()).toEqual([false, true])
    expect(await exists(d.id)).toBe(false)
    expect(await leftovers(d.id)).toEqual([])
  })
})

describe('excluir o cadastro e a família (RN-22e, RN-24, RN-25)', () => {
  test('administradora com outras pessoas: quem participa há mais tempo assume; os gastos ficam como Ex-membro; o nome da família fica', async () => {
    const ana = await newUser('Ana') // excluída no teste
    const bia = await user('Bia')
    const caio = await user('Caio')
    const fam = await createFamily(ana, 'Família Souza')
    await joinFamily(bia, ana)
    await joinFamily(caio, ana)
    const daFamilia = await expense(ana, 'mercado', 4000, { family_id: fam, note: 'feira' })
    const pessoal = await expense(ana, 'lazer', 999)

    expect((await ana.client.rpc('delete_my_account')).data).toBe(true)

    expect(await leftovers(ana.id)).toEqual([])
    const members = (await bia.client.from('family_members').select('user_id, role, display_name, left_at')).data!
    expect(members.find((m) => m.user_id === bia.id)?.role).toBe('admin')
    expect(members.find((m) => m.user_id === caio.id)?.role).toBe('member')
    const ex = members.filter((m) => m.user_id === null)
    expect(ex).toHaveLength(1)
    expect(ex[0]).toMatchObject({ role: 'member', display_name: null })
    expect(ex[0].left_at).not.toBeNull()
    expect((await bia.client.from('families').select('name, ended_at').single()).data).toEqual({ name: 'Família Souza', ended_at: null })
    expect((await familyRows(bia)).find((r) => r.id === daFamilia)).toMatchObject({ author_id: null, author_name: null, amount_cents: 4000, note: 'feira' })
    expect((await admin.from('transactions').select('id').eq('id', pessoal)).data).toEqual([])
    expect((await bia.client.from('family_events').select('kind, member_name, goal_name, amount_cents')).data).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null },
    ])
  })

  test('membro com parte nas metas: a parte sai, a meta diminui e a família recebe o aviso sem nome', async () => {
    const ana = await user('Ana')
    const dani = await newUser('Dani') // excluída no teste
    await createFamily(ana, 'Família Lima')
    await joinFamily(dani, ana)
    const reforma = await familyGoal(ana, 'Reforma')
    await deposit(ana, reforma, 1000)
    await deposit(dani, reforma, 3000)
    expect((await totals(ana))[reforma]).toBe(4000)

    expect((await dani.client.rpc('delete_my_account')).data).toBe(true)

    expect((await totals(ana))[reforma]).toBe(1000)
    expect(await leftovers(dani.id)).toEqual([])
    const owners = (await admin.from('goal_movements').select('user_id').eq('goal_id', reforma)).data!
    expect(owners.every((m) => m.user_id === ana.id)).toBe(true)
    expect((await ana.client.from('family_events').select('kind, member_name, goal_name, amount_cents')).data).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: 'Reforma', amount_cents: null },
    ])
    expect((await ana.client.from('families').select('name').single()).data).toEqual({ name: 'Família Lima' })
  })

  test('membro com parte já usada numa compra da família: a parte usada fica na compra, sem dono; o resto sai; nada aponta para ela', async () => {
    const ana = await user('Ana')
    const dani = await newUser('Dani') // excluída no teste
    const fam = await createFamily(ana, 'Família Rocha')
    await joinFamily(dani, ana)
    const geladeira = await familyGoal(ana, 'Geladeira')
    const viagem = await familyGoal(ana, 'Viagem')
    await deposit(ana, geladeira, 1000)
    await deposit(dani, geladeira, 3000)
    await deposit(dani, viagem, 700)
    // A meta paga 2.000 de 4.000 guardados: 500 da Ana, 1.500 da Dani. Sobram 500 e 1.500.
    const tx = await useGoal(ana, geladeira, 2000)
    const names = { [ana.id]: 'ana', [dani.id]: 'dani' }
    expect(await useParts(tx, names)).toEqual([['ana', 500], ['dani', 1500]])
    const daDani = await expense(dani, 'mercado', 4321, { family_id: fam, note: 'feira da semana' })

    expect((await dani.client.rpc('delete_my_account')).data).toBe(true)

    expect(await exists(dani.id)).toBe(false)
    expect(await leftovers(dani.id)).toEqual([])
    // A compra continua inteira e da Ana; a parte da Dani fica nela, sem dono.
    expect(await useParts(tx, names)).toEqual([['ana', 500], ['ex', 1500]])
    expect((await ana.client.from('transactions').select('user_id, amount_cents, goal_funded_cents').eq('id', tx).single()).data)
      .toEqual({ user_id: ana.id, amount_cents: 2000, goal_funded_cents: 2000 })
    // Nenhum movimento sem dono que não seja parte de uso; o que ela ainda guardava saiu das metas.
    const moves = (await admin.from('goal_movements').select('user_id, kind').in('goal_id', [geladeira, viagem])).data!
    expect(moves.filter((m) => m.user_id === null).every((m) => m.kind === 'use')).toBe(true)
    expect(moves.every((m) => m.user_id === null || m.user_id === ana.id)).toBe(true)
    const after = await totals(ana)
    expect(after[geladeira]).toBe(500)
    expect(after[viagem]).toBe(0)
    // O gasto dela fica como Ex-membro, sem nome; os avisos não dizem quem nem quanto.
    expect((await familyRows(ana)).find((r) => r.id === daDani)).toMatchObject({ author_id: null, author_name: null, amount_cents: 4321, note: 'feira da semana' })
    const events = (await ana.client.from('family_events').select('kind, member_name, goal_name, amount_cents').order('goal_name')).data!
    expect(events).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: 'Geladeira', amount_cents: null },
      { kind: 'member_deleted', member_name: null, goal_name: 'Viagem', amount_cents: null },
    ])
    const members = (await admin.from('family_members').select('user_id, display_name').eq('family_id', fam)).data!
    expect(members.find((m) => m.user_id === null)).toEqual({ user_id: null, display_name: null })
    expect(JSON.stringify([events, members, await familyRows(ana)])).not.toContain('Dani')
    // A Ana não perdeu nada: a parte dela, a compra e a família continuam.
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
    expect(Number((await ana.client.rpc('goal_balance', { p_goal_id: geladeira })).data)).toBe(500)
  })

  test('sair sozinho encerra a família e apaga o nome dela', async () => {
    const c = await user('Caio')
    const fam = await createFamily(c, 'Família Teixeira')
    expect((await c.client.rpc('leave_family')).error).toBeNull()
    const row = (await admin.from('families').select('name, ended_at').eq('id', fam).single()).data!
    expect(row.name).toBe(ENDED)
    expect(row.ended_at).not.toBeNull()
    // ninguém muda o nome por gravação direta
    const direct = await c.client.from('families').update({ name: 'Volta' }).eq('id', fam).select()
    expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true)
  })

  test('família encerrada com algo de quem já saiu: fica sem nome até essa pessoa também excluir; aí some', async () => {
    const ana = await newUser('Ana') // excluída no teste
    const bia = await newUser('Bia') // excluída no teste
    const fam = await createFamily(ana, 'Família Prado')
    await joinFamily(bia, ana)
    const daBia = await expense(bia, 'mercado', 2500, { family_id: fam })
    expect((await bia.client.rpc('leave_family')).error).toBeNull()

    expect((await ana.client.rpc('delete_my_account')).data).toBe(true)

    const row = (await admin.from('families').select('name, ended_at').eq('id', fam).single()).data!
    expect(row.name).toBe(ENDED)
    expect(row.ended_at).not.toBeNull()
    // O que é da Bia não foi tocado: o gasto continua dela, com a marca da família.
    expect((await bia.client.from('transactions').select('family_id, amount_cents').eq('id', daBia).single()).data).toEqual({ family_id: fam, amount_cents: 2500 })
    const members = (await admin.from('family_members').select('user_id, display_name').eq('family_id', fam)).data!
    expect(members).toHaveLength(2)
    expect(members.find((m) => m.user_id === bia.id)?.display_name).toBe('Bia')
    expect(members.find((m) => m.user_id === null)?.display_name).toBeNull()
    expect(await leftovers(ana.id)).toEqual([])

    expect((await bia.client.rpc('delete_my_account')).data).toBe(true)
    expect((await admin.from('families').select('id').eq('id', fam)).data).toEqual([])
    expect((await admin.from('family_members').select('id').eq('family_id', fam)).data).toEqual([])
    expect(await leftovers(bia.id)).toEqual([])
  })

  test('família encerrada com uma compra paga pela meta: o guardado de quem já saiu não é tocado; quando ela também exclui, não sobra nada', async () => {
    const noa = await newUser('Noa') // excluída no teste
    const lia = await newUser('Lia') // excluída no teste
    const fam = await createFamily(noa, 'Família Noa')
    await joinFamily(lia, noa)
    const mesa = await familyGoal(noa, 'Mesa')
    await deposit(noa, mesa, 1000)
    await deposit(lia, mesa, 1000)
    const tx = await useGoal(noa, mesa, 2000)
    const names = { [noa.id]: 'noa', [lia.id]: 'lia' }
    expect((await lia.client.rpc('leave_family')).error).toBeNull()

    expect((await noa.client.rpc('delete_my_account')).data).toBe(true)

    // A família encerrou, mas a Lia ainda tem cadastro e uma parte usada nessa compra: fica tudo o que é dela.
    expect((await admin.from('families').select('name').eq('id', fam).single()).data).toEqual({ name: ENDED })
    expect(await leftovers(noa.id)).toEqual([])
    expect(await useParts(tx, names)).toEqual([['ex', 1000], ['lia', 1000]])
    expect((await lia.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', mesa).order('created_at')).data)
      .toEqual([{ kind: 'deposit', amount_cents: 1000 }, { kind: 'use', amount_cents: 1000 }])
    expect((await admin.from('transactions').select('user_id, amount_cents, goal_funded_cents, note').eq('id', tx).single()).data)
      .toEqual({ user_id: null, amount_cents: 2000, goal_funded_cents: 2000, note: null })
    expect((await lia.client.rpc('session_is_recent')).data).toBe(true)

    expect((await lia.client.rpc('delete_my_account')).data).toBe(true)

    // Ninguém com cadastro tem mais nada ali: a compra, as partes, a meta, as participações e a família saem.
    expect(await leftovers(lia.id)).toEqual([])
    expect((await admin.from('goal_movements').select('id').eq('goal_id', mesa)).data).toEqual([])
    expect((await admin.from('transactions').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goals').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_events').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_invites').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_members').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('families').select('id').eq('id', fam)).data).toEqual([])
  })

  test('convite pendente que outra família mandou para o e-mail dela: é de quem convidou e fica até ser cancelado ou vencer; o resto some', async () => {
    const ana = await user('Ana')
    const eva = await newUser('Eva') // excluída no teste
    const email = (await session(eva)).user.email!
    await createFamily(ana, 'Família Dias')
    expect((await ana.client.rpc('create_family_email_invite', { p_email: email })).error).toBeNull()
    const invite = (await ana.client.from('family_invites').select('id, invited_email').single()).data!
    expect(invite.invited_email).toBe(email)

    expect((await eva.client.rpc('delete_my_account')).data).toBe(true)

    // Com o id dela, nada. Com o e-mail, só o convite da Ana (o endereço e o resumo dele).
    expect(await leftovers(eva.id)).toEqual([])
    expect(await leftovers(eva.id, email)).toEqual(['public.family_invites.invited_email', 'public.family_invites.invited_email_hash'])
    // Quem convidou cancela: o endereço some na hora; o resumo fica para o limite de convites e sai na limpeza diária.
    expect((await ana.client.rpc('revoke_family_invite', { p_id: invite.id })).error).toBeNull()
    expect(await leftovers(eva.id, email)).toEqual(['public.family_invites.invited_email_hash'])
  })
})

describe('funções internas não são chamáveis por pessoas', () => {
  test('conferência, relógio de teste e gatilho: só o papel de serviço (ou ninguém)', async () => {
    const a = await user('Ana')
    const sid = sessionId((await session(a)).access_token)
    for (const client of [a.client, anon]) {
      expect(NOT_CALLABLE).toContain((await client.rpc('account_leftovers', { p_user: a.id, p_email: null })).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('session_recent_at', { p_user: a.id, p_session: sid, p_now: inMinutes(0) })).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('families_forget_name')).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('sweep_ended_family', { p_family: a.id })).error?.code)
    }
    // account_leftovers não devolve nada sobre quem não tem nada (nem erro para um id qualquer)
    expect(await leftovers('00000000-0000-4000-8000-000000000000')).toEqual([])
  })
})
