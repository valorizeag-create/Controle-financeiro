import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily } from './family-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const invite = (u: TestUser, email: string) => u.client.rpc('create_family_email_invite', { p_email: email })
const code = (r: { data: unknown }) => (r.data as { invite_code: string }[])[0].invite_code
const pending = async (family: string) =>
  (await admin.from('family_invites').select('id, invited_email, sent_by_email').eq('family_id', family).is('accepted_at', null).is('revoked_at', null)).data!

// Os limites contam convites de qualquer família (por destinatário e no total), e as famílias
// de execuções anteriores ficam no banco. Antes de cada bloco, os convites por e-mail que já
// existem passam a ter mais de 7 dias: nenhum deles conta para limite nenhum.
async function forgetEarlierInvites(): Promise<void> {
  const now = Date.now()
  const { error } = await admin.from('family_invites')
    .update({ created_at: new Date(now - 8 * 86_400_000).toISOString(), expires_at: new Date(now - 2 * 86_400_000).toISOString() })
    .eq('sent_by_email', true)
  if (error) throw error
}

describe('convite por e-mail (RF-42)', () => {
  let ana: TestUser, bia: TestUser, caio: TestUser, eli: TestUser
  let family: string
  beforeAll(async () => {
    await forgetEarlierInvites()
    ana = await newUser('Ana'); bia = await newUser('Bia'); caio = await newUser('Caio'); eli = await newUser('Eli')
    family = await createFamily(ana, 'Família Convite')
    await joinFamily(bia, ana)
  })
  afterAll(async () => { await removeUsers(bia, caio, eli, ana) })

  test('só quem administra convida; e-mail precisa ter forma de e-mail', async () => {
    expect((await invite(bia, 'x@teste.iris.dev')).error?.code).toBe('42501')
    expect((await invite(eli, 'x@teste.iris.dev')).error?.code).toBe('42501')
    expect((await anon.rpc('create_family_email_invite', { p_email: 'x@teste.iris.dev' })).error).not.toBeNull()
    for (const bad of ['', 'sem-arroba', 'a@b', 'a b@teste.dev', `${'a'.repeat(250)}@teste.dev`, 'a@teste.dev\nBcc: x@y.dev']) {
      expect((await invite(ana, bad)).error?.message, bad).toContain('E-mail inválido.')
    }
    expect(await pending(family)).toEqual([])
  })

  test('guarda o e-mail em minúsculas enquanto o convite está pendente; só o administrador lê', async () => {
    const r = await invite(ana, '  Caio@Teste.Iris.Dev ')
    expect(r.error).toBeNull()
    expect(code(r)).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect((await pending(family)).map((i) => [i.invited_email, i.sent_by_email])).toEqual([['caio@teste.iris.dev', true]])
    expect((await ana.client.from('family_invites').select('invited_email').is('accepted_at', null).is('revoked_at', null)).data)
      .toEqual([{ invited_email: 'caio@teste.iris.dev' }])
    // Outro membro da mesma família: a leitura funciona e não devolve linha nenhuma
    // (não é um erro que esconderia uma linha devolvida).
    const asMember = await bia.client.from('family_invites').select('id, invited_email, sent_by_email')
    expect(asMember.error).toBeNull()
    expect(asMember.data).toEqual([])
    // Quem não é da família e quem não entrou também não leem.
    const asOutsider = await eli.client.from('family_invites').select('id, invited_email, sent_by_email')
    expect(asOutsider.error).toBeNull()
    expect(asOutsider.data).toEqual([])
    expect((await anon.from('family_invites').select('invited_email')).error?.code).toBe('42501')
    expect((await ana.client.from('family_invites').select('token_hash')).error).not.toBeNull()
  })

  test('o resumo do endereço nunca sai pela API, nem para quem administra', async () => {
    expect((await ana.client.from('family_invites').select('invited_email_hash')).error?.code).toBe('42501')
    expect((await bia.client.from('family_invites').select('invited_email_hash')).error?.code).toBe('42501')
    const row = await admin.from('family_invites').select('invited_email_hash').eq('family_id', family).is('revoked_at', null).is('accepted_at', null).single()
    expect(row.error).toBeNull()
    expect(row.data?.invited_email_hash).toMatch(/^\\x[0-9a-f]{64}$/)
  })

  test('um convite por vez: o novo cancela o anterior e apaga o e-mail dele', async () => {
    const before = (await pending(family))[0].id
    expect((await invite(ana, 'outra@teste.iris.dev')).error).toBeNull()
    expect((await pending(family)).map((i) => i.invited_email)).toEqual(['outra@teste.iris.dev'])
    expect((await admin.from('family_invites').select('invited_email, revoked_at').eq('id', before).single()).data?.invited_email).toBeNull()
  })

  test('cancelar apaga o e-mail', async () => {
    const id = (await pending(family))[0].id
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error).toBeNull()
    expect((await admin.from('family_invites').select('invited_email').eq('id', id).single()).data?.invited_email).toBeNull()
  })

  test('o link do e-mail é um convite normal: quem aceita entra como membro, e o e-mail some', async () => {
    const r = await invite(ana, 'caio@teste.iris.dev')
    const accepted = await caio.client.rpc('accept_family_invite', { p_code: code(r) })
    expect(accepted.error).toBeNull()
    const row = await admin.from('family_invites').select('invited_email, accepted_by').eq('family_id', family).not('accepted_at', 'is', null).order('accepted_at', { ascending: false }).limit(1).single()
    expect(row.data).toEqual({ invited_email: null, accepted_by: caio.id })
    expect((await admin.from('family_members').select('role').eq('user_id', caio.id).is('left_at', null).single()).data?.role).toBe('member')
    // Uso único (Plano 7): o mesmo código não serve de novo.
    expect((await eli.client.rpc('accept_family_invite', { p_code: code(r) })).error?.message).toContain('Convite inválido.')
  })

  test('a resposta é a mesma para um e-mail que já tem cadastro e para um que não tem', async () => {
    const withAccount = await invite(ana, (await admin.auth.admin.getUserById(eli.id)).data.user!.email!)
    const without = await invite(ana, 'ninguem-ainda@teste.iris.dev')
    expect(withAccount.error).toBeNull()
    expect(without.error).toBeNull()
    expect(Object.keys((withAccount.data as object[])[0]).sort()).toEqual(Object.keys((without.data as object[])[0]).sort())
    // Só o código e a validade: nenhum nome, nenhum e-mail, nada sobre quem foi convidado.
    for (const r of [withAccount, without]) {
      expect((r.data as object[]).length).toBe(1)
      expect(Object.keys((r.data as object[])[0]).sort()).toEqual(['invite_code', 'invite_expires_at'])
      expect(code(r)).toMatch(/^[A-Za-z0-9_-]{32}$/)
    }
    // Ser convidado não coloca ninguém na família: quem já tem cadastro continua fora.
    expect((await admin.from('family_members').select('id').eq('user_id', eli.id)).data).toEqual([])
  })

  test('convite vencido perde o e-mail na limpeza diária; pessoa nenhuma chama a limpeza', async () => {
    // Usa o convite pendente do teste anterior (o limite da família é de 5 por dia).
    const [row] = await pending(family)
    expect(row.invited_email).toBe('ninguem-ainda@teste.iris.dev')
    const id = row.id
    const now = Date.now()
    const old = new Date(now - 8 * 86_400_000).toISOString()
    const exp = new Date(now - 86_400_000).toISOString()
    expect((await admin.from('family_invites').update({ created_at: old, expires_at: exp }).eq('id', id)).error).toBeNull()
    expect((await ana.client.rpc('job_cleanup')).error?.code).toBe('42501')
    expect((await anon.rpc('job_cleanup')).error?.code).toBe('42501')
    expect((await admin.rpc('job_cleanup')).error).toBeNull()
    const after = await admin.from('family_invites').select('invited_email, invited_email_hash, sent_by_email').eq('id', id).single()
    // Com mais de 7 dias, o resumo do endereço também some; sent_by_email fica.
    expect(after.data).toEqual({ invited_email: null, invited_email_hash: null, sent_by_email: true })
  })
})

describe('convite por e-mail: quem deixa de administrar não lê mais', () => {
  let old: TestUser, next: TestUser
  let family: string
  beforeAll(async () => {
    await forgetEarlierInvites()
    old = await newUser('Olga'); next = await newUser('Nei')
    family = await createFamily(old, 'Família Troca')
    await joinFamily(next, old)
  })
  afterAll(async () => { await removeUsers(old, next) })

  test('passar a administração cancela o convite e apaga o e-mail; quem administrava lê uma lista vazia', async () => {
    expect((await invite(old, 'troca@teste.iris.dev')).error).toBeNull()
    expect((await old.client.from('family_invites').select('invited_email').is('revoked_at', null).is('accepted_at', null)).data)
      .toEqual([{ invited_email: 'troca@teste.iris.dev' }])
    expect((await old.client.rpc('transfer_family_admin', { p_user: next.id })).error).toBeNull()

    const asExAdmin = await old.client.from('family_invites').select('id, invited_email, sent_by_email')
    expect(asExAdmin.error).toBeNull()
    expect(asExAdmin.data).toEqual([])
    expect((await invite(old, 'depois@teste.iris.dev')).error?.code).toBe('42501')

    // Quem administra agora vê os convites da família, e nenhum guarda mais o endereço.
    const asAdmin = await next.client.from('family_invites').select('invited_email, sent_by_email').eq('family_id', family)
    expect(asAdmin.error).toBeNull()
    expect(asAdmin.data!.length).toBeGreaterThan(0)
    expect(asAdmin.data!.every((i) => i.invited_email === null)).toBe(true)
    expect((await admin.from('family_invites').select('invited_email').eq('family_id', family).not('invited_email', 'is', null)).data).toEqual([])
  })
})

describe('limite de convites por e-mail', () => {
  let dan: TestUser
  let family: string
  beforeAll(async () => { await forgetEarlierInvites(); dan = await newUser('Dan'); family = await createFamily(dan, 'Família Limite') })
  afterAll(async () => { await removeUsers(dan) })

  test('5 por família a cada 24 horas; o convite por link continua valendo', async () => {
    for (let i = 0; i < 5; i++) expect((await invite(dan, `p${i}@teste.iris.dev`)).error, String(i)).toBeNull()
    const sixth = await invite(dan, 'p6@teste.iris.dev')
    expect(sixth.error?.message).toContain('Limite de convites.')
    expect((await pending(family)).map((i) => i.invited_email)).toEqual(['p4@teste.iris.dev']) // o 6º não cancelou o 5º
    expect((await dan.client.rpc('create_family_invite')).error).toBeNull()
    // Passadas 24 horas, volta a valer.
    const now = Date.now()
    const old = new Date(now - 25 * 3_600_000).toISOString()
    const exp = new Date(now - 24 * 3_600_000).toISOString()
    await admin.from('family_invites').update({ created_at: old, expires_at: exp }).eq('family_id', family).eq('sent_by_email', true)
    expect((await invite(dan, 'p7@teste.iris.dev')).error).toBeNull()
  })
})

describe('limite por pessoa: encerrar a família e criar outra não zera a conta', () => {
  let rui: TestUser
  beforeAll(async () => { await forgetEarlierInvites(); rui = await newUser('Rui') })
  afterAll(async () => { await removeUsers(rui) })

  test('o sexto convite da mesma pessoa em 24 horas é recusado, mesmo em outra família', async () => {
    await createFamily(rui, 'Família Um')
    for (let i = 0; i < 5; i++) expect((await invite(rui, `r${i}@teste.iris.dev`)).error, String(i)).toBeNull()
    // Sozinha na família: sair encerra a família.
    expect((await rui.client.rpc('leave_family')).error).toBeNull()
    const second = await createFamily(rui, 'Família Dois')
    const sixth = await invite(rui, 'r6@teste.iris.dev')
    expect(sixth.error?.message).toContain('Limite de convites.')
    expect(await pending(second)).toEqual([])
    // O convite por link da família nova não tem limite por período.
    expect((await rui.client.rpc('create_family_invite')).error).toBeNull()
  })
})

describe('limite por destinatário: o mesmo endereço, somando todas as famílias', () => {
  let um: TestUser, dois: TestUser
  let familyTwo: string
  const target = `alvo-${Date.now()}@teste.iris.dev`
  beforeAll(async () => {
    await forgetEarlierInvites()
    um = await newUser('Ugo'); dois = await newUser('Dora')
    await createFamily(um, 'Família Primeira')
    familyTwo = await createFamily(dois, 'Família Segunda')
  })
  afterAll(async () => { await removeUsers(um, dois) })

  test('3 em 7 dias; o quarto é recusado em qualquer família, e cancelar não zera', async () => {
    for (let i = 0; i < 3; i++) expect((await invite(um, i === 1 ? `  ${target.toUpperCase()} ` : target)).error, String(i)).toBeNull()
    const fromOther = await invite(dois, target)
    expect(fromOther.error?.message).toContain('Limite de convites.')
    expect(await pending(familyTwo)).toEqual([])
    // Só aquele endereço está no limite: a outra família convida outra pessoa.
    expect((await invite(dois, `outro-${Date.now()}@teste.iris.dev`)).error).toBeNull()
    // A recusa tem a mesma forma das outras recusas por limite (não diz qual limite foi).
    expect((await invite(um, target)).error?.message).toBe(fromOther.error?.message)
  })

  test('passados 7 dias, o endereço pode ser convidado de novo', async () => {
    await forgetEarlierInvites()
    expect((await invite(dois, target)).error).toBeNull()
  })
})

describe('limite total de convites por e-mail em 24 horas', () => {
  let tia: TestUser, teo: TestUser, tom: TestUser
  let family: string, full: string
  beforeAll(async () => {
    tia = await newUser('Tia'); teo = await newUser('Teo'); tom = await newUser('Tom')
    family = await createFamily(tia, 'Família Total')
    full = await createFamily(teo, 'Família Cheia')
    await createFamily(tom, 'Família Terceira')
  })
  afterAll(async () => { await forgetEarlierInvites(); await removeUsers(tia, teo, tom) })

  test('com 100 convites nas últimas 24 horas, o próximo é recusado para qualquer pessoa', async () => {
    await forgetEarlierInvites()
    // 99 convites por e-mail de outra família nas últimas 24 horas (linhas já canceladas,
    // gravadas pelo cliente administrativo: não são da Tia nem da família dela).
    const now = new Date().toISOString()
    const rows = Array.from({ length: 99 }, () => ({
      family_id: full, token_hash: `\\x${randomBytes(32).toString('hex')}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: now, sent_by_email: true,
    }))
    expect((await admin.from('family_invites').insert(rows)).error).toBeNull()
    expect((await invite(tia, 'cem@teste.iris.dev')).error).toBeNull() // o centésimo
    const over = await invite(tia, 'cento-e-um@teste.iris.dev')
    expect(over.error?.message).toContain('Limite de convites.')
    expect((await pending(family)).map((i) => i.invited_email)).toEqual(['cem@teste.iris.dev'])
    // Quem ainda não convidou ninguém também espera.
    expect((await invite(tom, 'tambem-nao@teste.iris.dev')).error?.message).toContain('Limite de convites.')
    // O convite por link não entra nessa conta.
    expect((await tom.client.rpc('create_family_invite')).error).toBeNull()
  })
})

// As duas corridas abaixo só aparecem com chamadas ao mesmo tempo: sem as travas de
// create_family_email_invite, cada chamada conta os convites antes de as outras gravarem,
// e todas passam.
describe('limites em chamadas simultâneas', () => {
  const admins: TestUser[] = []
  let holder: TestUser
  let full: string
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
  const sentTo = async (email: string) => {
    const r = await admin.from('family_invites').select('id', { count: 'exact', head: true }).eq('invited_email_hash', `\\x${sha256(email)}`)
    if (r.error) throw r.error
    return r.count
  }
  beforeAll(async () => {
    for (const name of ['Um', 'Dois', 'Três', 'Quatro']) {
      const u = await newUser(name)
      admins.push(u)
      await createFamily(u, `Família ${name}`)
    }
    holder = await newUser('Cheia')
    full = await createFamily(holder, 'Família Simultânea')
  })
  afterAll(async () => { await forgetEarlierInvites(); await removeUsers(...admins, holder) })

  test('famílias diferentes convidando o mesmo endereço ao mesmo tempo: o limite de 3 em 7 dias vale', async () => {
    await forgetEarlierInvites()
    const target = `simultaneo-${Date.now()}@teste.iris.dev`
    // Duas famílias, cada uma com uma chamada, ao mesmo tempo: as duas cabem (2 de 3).
    const firstTwo = await Promise.all([invite(admins[0], target), invite(admins[1], target)])
    expect(firstTwo.map((r) => r.error)).toEqual([null, null])
    expect(await sentTo(target)).toBe(2)
    // Agora as quatro famílias ao mesmo tempo: só cabe mais um.
    const burst = await Promise.all(admins.map((u) => invite(u, target)))
    const ok = burst.filter((r) => r.error === null)
    const refused = burst.filter((r) => r.error !== null)
    expect(ok.length).toBe(1)
    expect(refused.length).toBe(3)
    for (const r of refused) expect(r.error?.message).toContain('Limite de convites.')
    expect(await sentTo(target)).toBe(3)
    // E continua valendo depois da rajada.
    const again = await Promise.all([invite(admins[2], target), invite(admins[3], target)])
    expect(again.every((r) => r.error?.message.includes('Limite de convites.'))).toBe(true)
    expect(await sentTo(target)).toBe(3)
  })

  test('várias famílias ao mesmo tempo, endereços diferentes: o limite total de 100 em 24 horas vale', async () => {
    await forgetEarlierInvites()
    const now = new Date().toISOString()
    const rows = Array.from({ length: 99 }, () => ({
      family_id: full, token_hash: `\\x${randomBytes(32).toString('hex')}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: now, sent_by_email: true,
    }))
    expect((await admin.from('family_invites').insert(rows)).error).toBeNull()
    const stamp = Date.now()
    const burst = await Promise.all(admins.map((u, i) => invite(u, `total-${stamp}-${i}@teste.iris.dev`)))
    expect(burst.filter((r) => r.error === null).length).toBe(1)
    for (const r of burst.filter((x) => x.error !== null)) expect(r.error?.message).toContain('Limite de convites.')
    const total = await admin.from('family_invites').select('id', { count: 'exact', head: true })
      .eq('sent_by_email', true).gt('created_at', new Date(Date.now() - 86_400_000).toISOString())
    expect(total.error).toBeNull()
    expect(total.count).toBe(100)
  })
})
