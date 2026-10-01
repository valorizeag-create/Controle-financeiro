import { dayMonthLabel, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { monthName } from '@/domain/recurrence'
import { inviteReturn, withNext } from '@/features/auth/routes'
import { FAMILY_LIMITS } from '@/domain/family'
import { INVITE_CODE } from './schemas'
import type { FamilyEventRow, MyFamily } from './types'

// Mês de entrada em Brasília: "agosto" no ano de hoje, "agosto de 2025" em outro (decisão 92).
export function sinceLabel(joinedAt: string, today: ISODate): string {
  const joined = todayInSaoPaulo(new Date(joinedAt))
  const month = monthName(Number(joined.slice(5, 7)))
  return joined.slice(0, 4) === today.slice(0, 4) ? month : `${month} de ${joined.slice(0, 4)}`
}

// Só nome da pessoa, da meta e valor: nunca o identificador de quem saiu.
export function eventText(e: FamilyEventRow): string {
  if (e.kind === 'member_deleted') {
    return e.goalName ? `Um membro saiu da família, e a meta ${e.goalName} foi atualizada.` : 'Um membro saiu da família.'
  }
  const name = e.memberName ?? 'Um membro'
  if (e.goalName && e.amountCents !== null) {
    return `${name} saiu da família, e ${formatBRL(e.amountCents)} da meta ${e.goalName} voltaram para ${name}.`
  }
  return `${name} saiu da família.`
}

export type FamiliaPageView =
  | { kind: 'none' }
  | {
      kind: 'member'
      name: string
      isAdmin: boolean
      members: { userId: string; label: string; initial: string; caption: string; isMe: boolean; isAdmin: boolean }[]
      invite: { id: string; caption: string } | null
      canInvite: boolean
      events: string[]
      leave: 'member' | 'admin-with-others' | 'alone'
    }

export function buildFamiliaPage(input: { family: MyFamily | null; today: ISODate }): FamiliaPageView {
  const { family, today } = input
  if (!family) return { kind: 'none' }
  const isAdmin = family.role === 'admin'
  const active = family.members.filter((m) => m.leftAt === null && m.userId !== null)
  const ordered = [...active].sort((a, b) => {
    if (a.userId === family.meId) return -1
    if (b.userId === family.meId) return 1
    return a.joinedAt.localeCompare(b.joinedAt)
  })
  const members = ordered.map((m) => {
    const isMe = m.userId === family.meId
    const label = isMe ? 'Você' : (m.displayName ?? 'Membro')
    return {
      userId: m.userId as string,
      label,
      initial: (isMe ? (m.displayName ?? label) : label).trim().charAt(0).toUpperCase(),
      caption: m.role === 'admin' ? 'Administra a família' : `Membro desde ${sinceLabel(m.joinedAt, today)}`,
      isMe,
      isAdmin: m.role === 'admin',
    }
  })
  // O convite mais recente (o que vence por último).
  const latest = isAdmin ? [...family.invites].sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0] : undefined
  const invite = latest
    ? { id: latest.id, caption: `Convite pendente · vale até ${dayMonthLabel(todayInSaoPaulo(new Date(latest.expiresAt)))}` }
    : null
  const leave = !isAdmin ? 'member' : active.length > 1 ? 'admin-with-others' : 'alone'
  return {
    kind: 'member',
    name: family.name,
    isAdmin,
    members,
    invite,
    canInvite: isAdmin && active.length < FAMILY_LIMITS.maxMembers,
    events: family.events.map(eventText),
    leave,
  }
}

export type InviteView =
  | { kind: 'invalid' }
  | { kind: 'signed-out'; signUpHref: string; signInHref: string }
  | { kind: 'has-family' }
  | { kind: 'ready'; code: string; familyName: string; invitedBy: string | null }

export function inviteView(input: {
  code: string
  signedIn: boolean
  erro: string | undefined
  preview: { familyName: string; invitedBy: string | null } | null
}): InviteView {
  const { code, signedIn, erro, preview } = input
  if (!INVITE_CODE.test(code)) return { kind: 'invalid' }
  if (!signedIn) {
    const back = inviteReturn(`/convite/${code}`)
    return { kind: 'signed-out', signUpHref: withNext('/criar-cadastro', back), signInHref: withNext('/entrar', back) }
  }
  if (erro === 'familia') return { kind: 'has-family' }
  if (erro === 'convite' || !preview) return { kind: 'invalid' }
  return { kind: 'ready', code, familyName: preview.familyName, invitedBy: preview.invitedBy }
}
