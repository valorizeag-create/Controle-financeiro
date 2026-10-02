import { dayLabel, dayMonthLabel, monthLabel, monthOf, todayInSaoPaulo, type ISODate, type MonthKey } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { monthName, recurrenceLabel, dueText } from '@/domain/recurrence'
import { goalBalance, goalProgress } from '@/domain/goals'
import type { GoalMovementRow } from '@/features/metas/types'
import { inviteReturn, withNext } from '@/features/auth/routes'
import { FAMILY_LIMITS, authorLabel, familyCategoryGroup, familyMonth, type FamilyExpense } from '@/domain/family'
import { INVITE_CODE } from './schemas'
import type { FamilyBillRow, FamilyEventRow, FamilyExpenseRow, FamilyGoalRow, FamilyRecurrenceRow, MemberRow, MyFamily } from './types'

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
  // Aviso de saída sem nome (não deveria existir): as frases anônimas da RN-22e,
  // em vez de "voltaram para Um membro".
  const name = e.memberName?.trim()
  if (!name) {
    return e.goalName ? `Um membro saiu da família, e a meta ${e.goalName} foi atualizada.` : 'Um membro saiu da família.'
  }
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

// ---- Seu mês da família e contas da família ----

export interface FamilyMonthView {
  label: string
  isCurrentMonth: boolean
  totalCents: number
  byMember: { label: string; initial: string; cents: number }[]
  categories: { label: string; cents: number; percent: number }[]
  bills: { id: string; name: string; amountCents: number; due: string }[]
  goals: { id: string; name: string; percent: number; remainingCents: number; savedCents: number; targetCents: number; myPartCents: number }[]
  recent: { id: string; title: string; caption: string; amountCents: number; href: string | null }[]
  empty: boolean
}

// "por você" em minúsculas dentro de uma frase; os demais nomes ficam como estão.
const inSentence = (label: string) => (label === 'Você' ? 'você' : label)

export function buildFamilyMonth(input: {
  month: MonthKey
  today: ISODate
  meId: string
  isAdmin: boolean
  expenses: FamilyExpenseRow[]
  bills: FamilyBillRow[]
  goals: FamilyGoalRow[]
  myMovements: GoalMovementRow[]
}): FamilyMonthView {
  const { month, today, meId, isAdmin } = input
  const fm = familyMonth({ month, expenses: input.expenses, meId })
  const isCurrentMonth = month === monthOf(today)
  const myName = input.expenses.find((e) => e.authorId === meId && e.authorName)?.authorName ?? null

  const byMember = fm.byMember.map((m) => ({
    label: m.label,
    initial: (m.authorId === meId ? (myName ?? m.label) : m.label).trim().charAt(0).toUpperCase(),
    cents: m.cents,
  }))
  const categories = fm.byCategory.map((c) => ({
    label: c.label,
    cents: c.cents,
    percent: fm.totalCents > 0 ? Math.floor((c.cents * 100) / fm.totalCents) : 0,
  }))

  const bills = isCurrentMonth
    ? input.bills
        .filter((b) => monthOf(b.dueOn) <= month)
        .sort((a, b) => (a.dueOn !== b.dueOn ? (a.dueOn < b.dueOn ? -1 : 1) : a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : 1)))
        .slice(0, 3)
        .map((b) => ({ id: b.id, name: b.name, amountCents: b.amountCents, due: dueText(b.dueOn, today) }))
    : []

  const goals = input.goals
    .filter((g) => g.deletedOn === null && g.status === 'active')
    .map((g) => {
      const { percent, remainingCents } = goalProgress(g.savedCents, g.targetCents)
      const myPartCents = goalBalance(input.myMovements.filter((m) => m.goalId === g.id))
      return { id: g.id, name: g.name, percent, remainingCents, savedCents: g.savedCents, targetCents: g.targetCents, myPartCents }
    })
    .sort((a, b) => b.percent - a.percent || (a.id < b.id ? -1 : 1))
    .slice(0, 2)

  // O ajuste do administrador só é oferecido onde o banco aceita (can_adjust).
  const adjustable = new Set(input.expenses.filter((e) => e.canAdjust).map((e) => e.id))
  const recent = fm.recent.map((e) => {
    const mine = e.authorId !== null && e.authorId === meId
    return {
      id: e.id,
      title: familyCategoryLabel(e),
      caption: `${dayLabel(e.effectiveOn, today)} · por ${inSentence(authorLabel(e.authorId, e.authorName, meId))}`,
      amountCents: e.amountCents,
      href: mine ? `/extrato/${e.id}` : isAdmin && adjustable.has(e.id) ? `/familia/gastos/${e.id}` : null,
    }
  })

  return {
    label: monthLabel(month),
    isCurrentMonth,
    totalCents: fm.totalCents,
    byMember,
    categories,
    bills,
    goals,
    recent,
    empty: fm.totalCents === 0 && fm.recent.length === 0,
  }
}

function familyCategoryLabel(e: FamilyExpense): string {
  return familyCategoryGroup(e.categoryKey, e.categoryName).label
}

export interface FamilyBillItem {
  id: string
  name: string
  amountCents: number
  due: string
  author: string
}

export interface FamilyBillsView {
  overdue: FamilyBillItem[]
  due: FamilyBillItem[]
  recurring: { id: string; name: string; amountCents: number; caption: string; canManage: boolean }[]
}

export function buildFamilyBills(input: {
  today: ISODate
  meId: string
  isAdmin: boolean
  members: MemberRow[]
  bills: FamilyBillRow[]
  recurrences: FamilyRecurrenceRow[]
}): FamilyBillsView {
  const { today, meId, isAdmin } = input
  const nameOf = new Map(input.members.filter((m) => m.userId !== null).map((m) => [m.userId as string, m.displayName]))
  const who = (authorId: string | null): string =>
    inSentence(authorLabel(authorId, authorId === null ? null : (nameOf.get(authorId) ?? null), meId))

  const sorted = [...input.bills].sort((a, b) =>
    a.dueOn !== b.dueOn ? (a.dueOn < b.dueOn ? -1 : 1) : a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : 1),
  )
  const item = (b: FamilyBillRow): FamilyBillItem => ({
    id: b.id,
    name: b.name,
    amountCents: b.amountCents,
    due: dueText(b.dueOn, today),
    author: who(b.authorId),
  })

  return {
    overdue: sorted.filter((b) => b.dueOn < today).map(item),
    due: sorted.filter((b) => b.dueOn >= today).map(item),
    recurring: input.recurrences.map((r) => ({
      id: r.id,
      name: r.name,
      amountCents: r.amountCents,
      caption: `${recurrenceLabel(r)} · criada por ${who(r.authorId)}`,
      canManage: isAdmin || r.authorId === meId,
    })),
  }
}
