import type { ISODate } from '@/domain/dates'
import type { FamilyExpense } from '@/domain/family'
import type { Frequency } from '@/domain/recurrence'
import { GOAL_COLUMNS, toGoalRow, type GoalRawRow, type GoalRow } from '@/features/metas/types'

export type FamilyRole = 'admin' | 'member'

// Participação. `userId` e `displayName` ficam nulos depois que a pessoa exclui o cadastro (RN-24).
export interface MemberRow {
  userId: string | null
  role: FamilyRole
  displayName: string | null
  joinedAt: string
  leftAt: string | null
}

export type MemberRawRow = {
  user_id: string | null
  role: string
  display_name: string | null
  joined_at: string
  left_at: string | null
}

export const MEMBER_COLUMNS = 'user_id, role, display_name, joined_at, left_at'

export function toMemberRow(r: MemberRawRow): MemberRow {
  return { userId: r.user_id, role: r.role as FamilyRole, displayName: r.display_name, joinedAt: r.joined_at, leftAt: r.left_at }
}

// O código do convite nunca é lido: o banco só guarda o resumo e não o entrega.
export interface InviteRow {
  id: string
  expiresAt: string
  // Só o administrador lê (regra do banco); null no convite por link.
  invitedEmail: string | null
}

export type InviteRawRow = { id: string; expires_at: string; invited_email: string | null }

export const INVITE_COLUMNS = 'id, expires_at, invited_email'

export function toInviteRow(r: InviteRawRow): InviteRow {
  return { id: r.id, expiresAt: r.expires_at, invitedEmail: r.invited_email ?? null }
}

// Sem member_id de propósito: a coluna só existe para apagar nomes quando alguém
// exclui o cadastro. Um aviso de saída pode virar de cadastro excluído (sem nome nem valor).
export interface FamilyEventRow {
  id: string
  kind: 'member_left' | 'member_deleted'
  memberName: string | null
  goalName: string | null
  amountCents: number | null
  createdAt: string
}

export type FamilyEventRawRow = {
  id: string
  kind: string
  member_name: string | null
  goal_name: string | null
  amount_cents: number | string | null
  created_at: string
}

export const EVENT_COLUMNS = 'id, kind, member_name, goal_name, amount_cents, created_at'

export function toEventRow(r: FamilyEventRawRow): FamilyEventRow {
  return {
    id: r.id,
    kind: r.kind as FamilyEventRow['kind'],
    memberName: r.member_name,
    goalName: r.goal_name,
    amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
    createdAt: r.created_at,
  }
}

export interface MyFamily {
  id: string
  name: string
  meId: string
  role: FamilyRole
  // Inclui quem já saiu, para o nome no histórico.
  members: MemberRow[]
  // Só o administrador vê os convites; para membro é sempre vazio.
  invites: InviteRow[]
  events: FamilyEventRow[]
}

export interface FamilyExpenseRow extends FamilyExpense {
  createdAt: string
  // O banco diz se quem pede pode ajustar este gasto como administrador (mesmas
  // condições de admin_update/delete_family_expense): nada de parcela, de gasto
  // pago com meta nem de quem saiu da família.
  canAdjust: boolean
}

export type FamilyExpenseRawRow = {
  id: string
  effective_on: string
  amount_cents: number | string
  category_key: string | null
  category_name: string
  note: string | null
  author_id: string | null
  author_name: string | null
  created_at: string
  can_adjust: boolean | null
}

export function toFamilyExpenseRow(r: FamilyExpenseRawRow): FamilyExpenseRow {
  return {
    id: r.id,
    effectiveOn: r.effective_on,
    amountCents: Number(r.amount_cents),
    categoryKey: r.category_key,
    categoryName: r.category_name,
    note: r.note,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    // Só um "sim" explícito vale; qualquer outra resposta fica sem ajuste.
    canAdjust: r.can_adjust === true,
  }
}

export interface FamilyBillRow {
  id: string
  name: string
  amountCents: number
  dueOn: ISODate
  authorId: string | null
}

export type FamilyBillRawRow = {
  id: string
  name: string
  amount_cents: number | string
  due_on: string
  author_id: string | null
}

export function toFamilyBillRow(r: FamilyBillRawRow): FamilyBillRow {
  return { id: r.id, name: r.name, amountCents: Number(r.amount_cents), dueOn: r.due_on, authorId: r.author_id }
}

export interface FamilyRecurrenceRow {
  id: string
  name: string
  amountCents: number
  frequency: Frequency
  dueDay: number
  dueMonth: number | null
  authorId: string
}

export type FamilyRecurrenceRawRow = {
  id: string
  name: string
  amount_cents: number | string
  frequency: string
  due_day: number
  due_month: number | null
  author_id: string
}

export function toFamilyRecurrenceRow(r: FamilyRecurrenceRawRow): FamilyRecurrenceRow {
  return {
    id: r.id,
    name: r.name,
    amountCents: Number(r.amount_cents),
    frequency: r.frequency as Frequency,
    dueDay: Number(r.due_day),
    dueMonth: r.due_month === null ? null : Number(r.due_month),
    authorId: r.author_id,
  }
}

// Meta da família: sem dono. `savedCents` é o total de todos (family_goal_totals);
// a parte de cada um continua só dele (movimentos próprios).
export interface FamilyGoalRow extends GoalRow {
  familyId: string
  createdBy: string | null
  savedCents: number
}

export type FamilyGoalRawRow = GoalRawRow & { family_id: string; created_by: string | null }

export const FAMILY_GOAL_COLUMNS = GOAL_COLUMNS + ', family_id, created_by'

export function toFamilyGoalRow(r: FamilyGoalRawRow, savedCents: number): FamilyGoalRow {
  return { ...toGoalRow(r), familyId: r.family_id, createdBy: r.created_by, savedCents }
}
