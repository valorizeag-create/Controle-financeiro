import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, inviteCode, joinFamily } from './family-helpers'

let ana: TestUser // administra
let bia: TestUser // membro
let caio: TestUser // de fora
let dani: TestUser // tem outra família
let famAna: string
const extra: TestUser[] = []

beforeAll(async () => {
  ;[ana, bia, caio, dani] = await Promise.all(['Ana', 'Bia', 'Caio', 'Dani'].map((n) => newUser(n)))
  famAna = await createFamily(ana, '  Família   Souza ')
  await joinFamily(bia, ana)
  await createFamily(dani, 'Família Dani')
})

afterAll(async () => {
  await removeUsers(ana, bia, caio, dani, ...extra)
})

async function members(user: TestUser) {
  const { data, error } = await user.client.from('family_members').select('user_id, role, display_name, left_at').order('joined_at')
  if (error) throw error
  return data
}

const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0

describe('criar a família (RF-41)', () => {
  test('quem cria vira administrador; o nome fica limpo', async () => {
    const { data } = await ana.client.from('families').select('id, name, ended_at').single()
    expect(data).toEqual({ id: famAna, name: 'Família Souza', ended_at: null })
    expect(await members(ana)).toEqual([
      { user_id: ana.id, role: 'admin', display_name: 'Ana', left_at: null },
      { user_id: bia.id, role: 'member', display_name: 'Bia', left_at: null },
    ])
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
    expect((await bia.client.rpc('my_family_role')).data).toBe('member')
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('nome vazio, só espaços ou longo demais é recusado', async () => {
    for (const p_name of ['', '   ', 'x'.repeat(41), null]) {
      const { error } = await caio.client.rpc('create_family', { p_name })
      expect(error?.message).toContain('Nome inválido.')
    }
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('uma família por pessoa (RN-26)', async () => {
    const { error } = await bia.client.rpc('create_family', { p_name: 'Outra' })
    expect(error?.message).toContain('Você já participa de uma família.')
  })
})

describe('privacidade das tabelas da família (Review Focus 1)', () => {
  test('quem é de fora não vê família, participantes, convites nem avisos', async () => {
    await inviteCode(ana)
    for (const table of ['families', 'family_members', 'family_invites', 'family_events']) {
      const { data } = await caio.client.from(table).select('id')
      expect(data ?? []).toEqual([])
    }
    const { data } = await dani.client.from('family_members').select('user_id')
    expect(data?.map((r) => r.user_id)).toEqual([dani.id])
  })

  test('membro não vê convites; administrador vê, mas nunca o resumo do código', async () => {
    expect((await bia.client.from('family_invites').select('id')).data).toEqual([])
    const listed = await ana.client.from('family_invites').select('id, expires_at, accepted_at, revoked_at')
    expect(listed.error).toBeNull()
    expect(listed.data!.length).toBeGreaterThan(0)
    expect((await ana.client.from('family_invites').select('token_hash')).error).not.toBeNull()
  })

  test('ninguém grava direto nas tabelas da família — nem o administrador (Review Focus 2)', async () => {
    const tries = await Promise.all([
      caio.client.from('family_members').insert({ family_id: famAna, user_id: caio.id, role: 'admin' }),
      caio.client.from('families').insert({ name: 'Invasão' }),
      bia.client.from('family_invites').insert({ family_id: famAna, token_hash: '\\x00', expires_at: new Date().toISOString() }),
      bia.client.from('family_events').insert({ family_id: famAna, kind: 'member_left' }),
    ])
    for (const r of tries) expect(r.error).not.toBeNull()
    expect(refused(await bia.client.from('family_members').update({ role: 'admin' }).eq('user_id', bia.id).select())).toBe(true)
    expect(refused(await ana.client.from('families').update({ name: 'Outro nome' }).eq('id', famAna).select())).toBe(true)
    expect(refused(await ana.client.from('family_members').delete().eq('user_id', bia.id).select())).toBe(true)
    expect((await members(ana)).map((m) => [m.user_id, m.role])).toEqual([[ana.id, 'admin'], [bia.id, 'member']])
  })

  test('quem não entrou não usa nenhuma função da família', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    expect((await anon.rpc('create_family', { p_name: 'X' })).error).not.toBeNull()
    expect((await anon.rpc('create_family_invite')).error).not.toBeNull()
    expect((await anon.rpc('accept_family_invite', { p_code: 'a'.repeat(32) })).error).not.toBeNull()
    expect(refused(await anon.rpc('invite_preview', { p_code: 'a'.repeat(32) }))).toBe(true)
    expect((await anon.rpc('my_family_id')).error).not.toBeNull()
    expect((await anon.rpc('my_family_role')).error).not.toBeNull()
    expect((await anon.rpc('revoke_family_invite', { p_id: famAna })).error).not.toBeNull()
    expect((await anon.rpc('transfer_family_admin', { p_user: ana.id })).error).not.toBeNull()
  })

  test('as funções internas (gatilhos) não podem ser chamadas pela API', async () => {
    expect((await caio.client.rpc('sync_family_display_name')).error).not.toBeNull()
    expect((await caio.client.rpc('family_one_admin_check')).error).not.toBeNull()
    expect((await ana.client.rpc('family_one_admin_check')).error).not.toBeNull()
  })
})

describe('convites (RF-42, Review Focus 2)', () => {
  test('só o administrador convida; cada código é novo e o anterior é cancelado', async () => {
    const byMember = await bia.client.rpc('create_family_invite')
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    const first = await inviteCode(ana)
    const second = await inviteCode(ana)
    expect(second).not.toBe(first)
    const { data } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null)
    expect(data).toHaveLength(1)
    expect((await caio.client.rpc('accept_family_invite', { p_code: first })).error?.message).toContain('Convite inválido.')
  })

  test('prévia: nome da família e de quem convidou, só com convite válido', async () => {
    const code = await inviteCode(ana)
    expect((await caio.client.rpc('invite_preview', { p_code: code })).data).toEqual([{ family_name: 'Família Souza', invited_by: 'Ana' }])
    expect((await caio.client.rpc('invite_preview', { p_code: 'b'.repeat(32) })).data).toEqual([])
    expect((await caio.client.rpc('invite_preview', { p_code: "' or 1=1 --" })).data).toEqual([])
  })

  test('aceitar: entra como membro, nunca administrador; o convite serve uma vez', async () => {
    const [eva, fabio] = await Promise.all([newUser('Eva'), newUser('Fábio')])
    extra.push(eva, fabio)
    const code = await inviteCode(ana)
    const { data, error } = await eva.client.rpc('accept_family_invite', { p_code: code })
    expect(error).toBeNull()
    expect(data).toBe(famAna)
    expect((await eva.client.rpc('my_family_role')).data).toBe('member')
    expect((await fabio.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await fabio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('convite vencido, cancelado, errado ou de formato estranho: mesma mensagem, nada muda', async () => {
    const expired = await inviteCode(ana)
    await admin.from('family_invites').update({
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }).eq('family_id', famAna).is('accepted_at', null).is('revoked_at', null)
    const revoked = await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    expect((await ana.client.rpc('revoke_family_invite', { p_id: pending![0].id })).error).toBeNull()
    for (const p_code of [expired, revoked, 'c'.repeat(32), 'abc', '', 'a'.repeat(33), "' or 1=1 --", `${'a'.repeat(31)}!`, null]) {
      const { error } = await caio.client.rpc('accept_family_invite', { p_code })
      expect(error?.message).toContain('Convite inválido.')
    }
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('cancelar: só o administrador, só convite da própria família e ainda pendente', async () => {
    await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    const id = pending![0].id
    expect((await bia.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    expect((await dani.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Convite não encontrado.')
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error).toBeNull()
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Convite não encontrado.')
  })

  test('prévia de convite vencido, cancelado ou já usado: nada', async () => {
    const ivo = await newUser('Ivo')
    extra.push(ivo)
    const used = await inviteCode(ana)
    expect((await ivo.client.rpc('accept_family_invite', { p_code: used })).error).toBeNull()
    expect((await caio.client.rpc('invite_preview', { p_code: used })).data).toEqual([])
    const expired = await inviteCode(ana)
    await admin.from('family_invites').update({
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }).eq('family_id', famAna).is('accepted_at', null).is('revoked_at', null)
    expect((await caio.client.rpc('invite_preview', { p_code: expired })).data).toEqual([])
    const revoked = await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    expect((await ana.client.rpc('revoke_family_invite', { p_id: pending![0].id })).error).toBeNull()
    expect((await caio.client.rpc('invite_preview', { p_code: revoked })).data).toEqual([])
  })

  test('ninguém reativa um convite por gravação direta — nem o administrador', async () => {
    const code = await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    const id = pending![0].id
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error).toBeNull()
    const later = new Date(Date.now() + 86400000).toISOString()
    expect(refused(await ana.client.from('family_invites').update({ revoked_at: null }).eq('id', id).select('id'))).toBe(true)
    expect(refused(await ana.client.from('family_invites').update({ revoked_at: null, accepted_at: null, expires_at: later }).eq('family_id', famAna).select('id'))).toBe(true)
    expect(refused(await ana.client.from('family_invites').delete().eq('id', id).select('id'))).toBe(true)
    const { data } = await admin.from('family_invites').select('revoked_at').eq('id', id).single()
    expect(data?.revoked_at).not.toBeNull()
    expect((await caio.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('duas pessoas com o mesmo convite ao mesmo tempo: só uma entra', async () => {
    const [jo, lia] = await Promise.all([newUser('Jo'), newUser('Lia')])
    extra.push(jo, lia)
    const code = await inviteCode(ana)
    const results = await Promise.all([jo, lia].map((u) => u.client.rpc('accept_family_invite', { p_code: code })))
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.find((r) => r.error !== null)?.error?.message).toContain('Convite inválido.')
    const ids = await Promise.all([jo, lia].map(async (u) => (await u.client.rpc('my_family_id')).data))
    expect(ids.filter((id) => id === famAna)).toHaveLength(1)
    expect(ids.filter((id) => id === null)).toHaveLength(1)
  })

  test('família encerrada: o convite não vale nem na prévia', async () => {
    const [lu, mel] = await Promise.all([newUser('Lu'), newUser('Mel')])
    extra.push(lu, mel)
    const fam = await createFamily(lu, 'Família Encerrada')
    const code = await inviteCode(lu)
    // Como a saída do único participante (leave_family, Task 5): participação e família encerradas.
    expect((await admin.from('family_members').update({ left_at: new Date().toISOString() }).eq('family_id', fam)).error).toBeNull()
    expect((await admin.from('families').update({ ended_at: new Date().toISOString() }).eq('id', fam)).error).toBeNull()
    expect((await mel.client.rpc('invite_preview', { p_code: code })).data).toEqual([])
    expect((await mel.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await mel.client.rpc('my_family_id')).data).toBeNull()
  })

  test('quem já participa de uma família não entra em outra, e o convite não se gasta (RN-26)', async () => {
    const code = await inviteCode(ana)
    expect((await dani.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Você já participa de uma família.')
    expect((await dani.client.rpc('my_family_role')).data).toBe('admin')
    const gil = await newUser('Gil')
    extra.push(gil)
    expect((await gil.client.rpc('accept_family_invite', { p_code: code })).error).toBeNull()
  })

  test('família completa: no máximo 10 participantes', async () => {
    const hugo = await newUser('Hugo')
    extra.push(hugo)
    const famHugo = await createFamily(hugo, 'Família Cheia')
    const guests = await Promise.all(Array.from({ length: 9 }, (_, i) => newUser(`Convidado ${i}`)))
    extra.push(...guests)
    for (const g of guests) await joinFamily(g, hugo)
    expect((await hugo.client.rpc('create_family_invite')).error?.message).toContain('A família já está completa.')
    const { count } = await admin.from('family_members').select('id', { count: 'exact', head: true }).eq('family_id', famHugo).is('left_at', null)
    expect(count).toBe(10)
  })
})

describe('administração (RF-45, Review Focus 5)', () => {
  test('transferir: só o administrador, só para quem participa; sempre um administrador', async () => {
    expect((await bia.client.rpc('transfer_family_admin', { p_user: bia.id })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    for (const p_user of [ana.id, caio.id, dani.id, null]) {
      expect((await ana.client.rpc('transfer_family_admin', { p_user })).error?.message).toContain('Pessoa não encontrada.')
    }
    expect((await ana.client.rpc('transfer_family_admin', { p_user: bia.id })).error).toBeNull()
    expect((await bia.client.rpc('my_family_role')).data).toBe('admin')
    expect((await ana.client.rpc('my_family_role')).data).toBe('member')
    expect((await members(bia)).filter((m) => m.role === 'admin' && m.left_at === null).map((m) => m.user_id)).toEqual([bia.id])
    expect((await bia.client.rpc('transfer_family_admin', { p_user: ana.id })).error).toBeNull()
  })

  test('administrador de outra família não mexe nesta', async () => {
    for (const p_user of [bia.id, ana.id]) {
      expect((await dani.client.rpc('transfer_family_admin', { p_user })).error?.message).toContain('Pessoa não encontrada.')
    }
    expect((await members(ana)).filter((m) => m.role === 'admin').map((m) => m.user_id)).toEqual([ana.id])
    expect((await dani.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('duas transferências ao mesmo tempo: uma vale, a outra é recusada; o convite pendente cai', async () => {
    const [nina, otto, pia] = await Promise.all([newUser('Nina'), newUser('Otto'), newUser('Pia')])
    extra.push(nina, otto, pia)
    const fam = await createFamily(nina, 'Família Nina')
    await joinFamily(otto, nina)
    await joinFamily(pia, nina)
    const pendingCode = await inviteCode(nina)
    const results = await Promise.all([otto, pia].map((u) => nina.client.rpc('transfer_family_admin', { p_user: u.id })))
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.find((r) => r.error !== null)?.error?.message).toContain('Só quem administra a família pode fazer isso.')
    const { data } = await admin.from('family_members').select('user_id').eq('family_id', fam).eq('role', 'admin').is('left_at', null)
    expect(data).toHaveLength(1)
    expect([otto.id, pia.id]).toContain(data![0].user_id)
    expect((await nina.client.rpc('my_family_role')).data).toBe('member')
    expect((await caio.client.rpc('accept_family_invite', { p_code: pendingCode })).error?.message).toContain('Convite inválido.')
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('o banco nunca aceita família ativa sem administrador ou com dois', async () => {
    const row = async (userId: string) => {
      const { data, error } = await admin.from('family_members').select('id').eq('family_id', famAna).eq('user_id', userId).is('left_at', null).single()
      if (error) throw error
      return data.id as string
    }
    const anaRow = await row(ana.id)
    const biaRow = await row(bia.id)
    expect((await admin.from('family_members').update({ role: 'member' }).eq('id', anaRow)).error?.message).toContain('Família sem administrador.')
    expect((await admin.from('family_members').update({ left_at: new Date().toISOString() }).eq('id', anaRow)).error?.message).toContain('Família sem administrador.')
    expect((await admin.from('family_members').delete().eq('id', anaRow)).error?.message).toContain('Família sem administrador.')
    expect((await admin.from('family_members').update({ role: 'admin' }).eq('id', biaRow)).error).not.toBeNull()
    expect((await members(ana)).filter((m) => m.role === 'admin').map((m) => m.user_id)).toEqual([ana.id])
  })

  test('o nome que a família vê acompanha o perfil', async () => {
    await bia.client.from('profiles').update({ display_name: 'Beatriz' }).eq('id', bia.id)
    expect((await members(ana)).find((m) => m.user_id === bia.id)?.display_name).toBe('Beatriz')
  })
})
