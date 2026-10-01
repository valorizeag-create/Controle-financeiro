import { expect, test } from 'vitest'
import { buildFamiliaPage, eventText, inviteView, sinceLabel } from './view-model'
import type { FamilyEventRow, FamilyRole, MyFamily } from './types'

const NBSP = String.fromCharCode(0xa0)
const fam = (p: Partial<MyFamily> = {}): MyFamily => ({
  id: 'f1', name: 'Família Souza', meId: 'u1', role: 'admin', invites: [], events: [],
  members: [
    { userId: 'u2', role: 'member', displayName: 'Alex', joinedAt: '2026-08-10T12:00:00Z', leftAt: null },
    { userId: 'u1', role: 'admin', displayName: 'Camila', joinedAt: '2026-07-01T12:00:00Z', leftAt: null },
    { userId: 'u3', role: 'member', displayName: 'Jordan', joinedAt: '2026-08-01T12:00:00Z', leftAt: '2026-09-01T12:00:00Z' },
  ], ...p,
})

test('sem família: tela de criar', () => {
  expect(buildFamiliaPage({ family: null, today: '2026-09-28' })).toEqual({ kind: 'none' })
})

test('protótipo Familia: Você primeiro, quem saiu fica de fora, legendas', () => {
  const v = buildFamiliaPage({ family: fam(), today: '2026-09-28' })
  expect(v.kind === 'member' && v.members.map((m) => [m.label, m.caption])).toEqual([
    ['Você', 'Administra a família'],
    ['Alex', 'Membro desde agosto'],
  ])
  expect(v.kind === 'member' && [v.canInvite, v.leave]).toEqual([true, 'admin-with-others'])
})

test('convite pendente só para o administrador; sair conforme o papel (RN-25)', () => {
  const admin = buildFamiliaPage({ family: fam({ invites: [{ id: 'i1', expiresAt: '2026-10-05T02:00:00Z' }] }), today: '2026-09-28' })
  expect(admin.kind === 'member' && admin.invite).toEqual({ id: 'i1', caption: 'Convite pendente · vale até 4 de outubro' })
  const member = buildFamiliaPage({ family: fam({ role: 'member', meId: 'u2', invites: [{ id: 'i1', expiresAt: '2026-10-05T02:00:00Z' }] }), today: '2026-09-28' })
  expect(member.kind === 'member' && [member.isAdmin, member.invite, member.canInvite, member.leave]).toEqual([false, null, false, 'member'])
  const alone = buildFamiliaPage({ family: fam({ members: [fam().members[1]] }), today: '2026-09-28' })
  expect(alone.kind === 'member' && alone.leave).toBe('alone')
})

test('família completa não convida', () => {
  const members = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i + 1}`, role: (i === 0 ? 'admin' : 'member') as FamilyRole, displayName: `P${i}`, joinedAt: '2026-08-01T12:00:00Z', leftAt: null }))
  const v = buildFamiliaPage({ family: fam({ members }), today: '2026-09-28' })
  expect(v.kind === 'member' && v.canInvite).toBe(false)
})

test('avisos da família (RN-22d, RN-22e)', () => {
  const e = (p: Partial<FamilyEventRow>): FamilyEventRow => ({ id: 'e', kind: 'member_left', memberName: 'Alex', goalName: null, amountCents: null, createdAt: '', ...p })
  expect(eventText(e({ goalName: 'Reforma da cozinha', amountCents: 180000 }))).toBe(`Alex saiu da família, e R$${NBSP}1.800,00 da meta Reforma da cozinha voltaram para Alex.`)
  expect(eventText(e({}))).toBe('Alex saiu da família.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null, goalName: 'Viagem' }))).toBe('Um membro saiu da família, e a meta Viagem foi atualizada.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null }))).toBe('Um membro saiu da família.')
})

test('membro desde: com o ano quando não é o ano de hoje', () => {
  expect(sinceLabel('2025-12-31T23:30:00Z', '2026-09-28')).toBe('dezembro de 2025')
  expect(sinceLabel('2026-01-01T02:00:00Z', '2026-09-28')).toBe('dezembro de 2025')
})

test('tela do convite (Review Focus 2)', () => {
  const code = 'a'.repeat(32)
  expect(inviteView({ code: '../x', signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: false, erro: undefined, preview: null })).toEqual({
    kind: 'signed-out', signUpHref: `/criar-cadastro?next=%2Fconvite%2F${code}`, signInHref: `/entrar?next=%2Fconvite%2F${code}`,
  })
  expect(inviteView({ code, signedIn: true, erro: 'familia', preview: null })).toEqual({ kind: 'has-family' })
  expect(inviteView({ code, signedIn: true, erro: 'convite', preview: { familyName: 'X', invitedBy: null } })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: { familyName: 'Família Souza', invitedBy: 'Camila' } }))
    .toEqual({ kind: 'ready', code, familyName: 'Família Souza', invitedBy: 'Camila' })
  // erro passageiro e valor desconhecido: o convite continua disponível
  const ready = { kind: 'ready', code, familyName: 'F', invitedBy: null }
  expect(inviteView({ code, signedIn: true, erro: '1', preview: { familyName: 'F', invitedBy: null } })).toEqual(ready)
  expect(inviteView({ code, signedIn: true, erro: 'xyz', preview: { familyName: 'F', invitedBy: null } })).toEqual(ready)
})
