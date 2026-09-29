import type { Cents } from './money'
import { isInMonth, type ISODate, type MonthKey } from './dates'
import type { TxStatus } from './summary'

export const FAMILY_LIMITS = { maxMembers: 10, inviteDays: 7, nameMax: 40 } as const

export const DEFAULT_CATEGORY_NAMES: Readonly<Record<string, string>> = {
  casa: 'Casa',
  mercado: 'Mercado',
  transporte: 'Transporte',
  comer_fora: 'Comer fora',
  saude: 'Saúde',
  lazer: 'Lazer',
  assinaturas: 'Assinaturas',
  educacao: 'Educação',
  compras: 'Compras',
  outros: 'Outros',
}

export const EX_MEMBER = 'Ex-membro'

// Conta da família ainda não paga não é de ninguém: fica fora do livro pessoal.
export function personalLedger<T extends { status: TxStatus; familyId: string | null }>(txs: T[]): T[] {
  return txs.filter((t) => !(t.status === 'pending' && t.familyId !== null))
}

// A3: categoria padrão agrupa pela chave (nome da copy); própria, pelo nome sem caixa.
export function familyCategoryGroup(key: string | null, name: string): { groupKey: string; label: string } {
  if (key !== null && Object.hasOwn(DEFAULT_CATEGORY_NAMES, key)) {
    return { groupKey: 'd:' + key, label: DEFAULT_CATEGORY_NAMES[key] }
  }
  return { groupKey: 'n:' + name.trim().toLocaleLowerCase('pt-BR'), label: name.trim() }
}

export interface FamilyExpense {
  id: string
  effectiveOn: ISODate
  amountCents: Cents
  categoryKey: string | null
  categoryName: string
  note: string | null
  authorId: string | null
  authorName: string | null
}

export function authorLabel(authorId: string | null, authorName: string | null, meId: string): string {
  if (authorId !== null && authorId === meId) return 'Você'
  if (authorId === null || authorName === null) return EX_MEMBER
  return authorName
}

export interface FamilyMonth {
  totalCents: Cents
  byMember: { authorId: string | null; label: string; cents: Cents }[]
  byCategory: { groupKey: string; label: string; cents: Cents }[]
  recent: FamilyExpense[]
}

const byCentsThenLabel = (a: { cents: Cents; label: string }, b: { cents: Cents; label: string }) =>
  b.cents - a.cents || a.label.localeCompare(b.label, 'pt-BR')

export function familyMonth(input: {
  month: MonthKey
  expenses: FamilyExpense[]
  meId: string
  recentLimit?: number
}): FamilyMonth {
  const inMonth = input.expenses.filter((e) => isInMonth(e.effectiveOn, input.month))
  let totalCents = 0
  const members = new Map<string | null, { authorId: string | null; label: string; cents: Cents }>()
  const categories = new Map<string, { groupKey: string; label: string; cents: Cents }>()

  for (const e of inMonth) {
    totalCents += e.amountCents
    const label = authorLabel(e.authorId, e.authorName, input.meId)
    const authorId = label === EX_MEMBER ? null : e.authorId
    const m = members.get(authorId) ?? { authorId, label, cents: 0 }
    m.cents += e.amountCents
    members.set(authorId, m)

    const g = familyCategoryGroup(e.categoryKey, e.categoryName)
    const c = categories.get(g.groupKey) ?? { ...g, cents: 0 }
    c.cents += e.amountCents
    categories.set(g.groupKey, c)
  }

  const byMember = [...members.values()].sort((a, b) => {
    const aMe = a.authorId === input.meId ? 0 : 1
    const bMe = b.authorId === input.meId ? 0 : 1
    return aMe - bMe || byCentsThenLabel(a, b)
  })
  const byCategory = [...categories.values()].sort(byCentsThenLabel)
  const recent = [...inMonth]
    .sort((a, b) => (a.effectiveOn < b.effectiveOn ? 1 : a.effectiveOn > b.effectiveOn ? -1 : 0))
    .slice(0, input.recentLimit ?? 5)

  return { totalCents, byMember, byCategory, recent }
}

// RN-22c. Mesmo algoritmo de public.use_family_goal (migração 20261001000001_familia.sql):
// mantenha os dois em sincronia. BigInt porque valor × parte chega a 10^20.
export function splitFamilyUse(
  fundedCents: Cents,
  parts: { userId: string; cents: Cents }[],
): { userId: string; cents: Cents }[] {
  const active = parts.filter((p) => p.cents > 0)
  const total = active.reduce((a, p) => a + BigInt(p.cents), 0n)
  if (fundedCents <= 0 || total === 0n) return []
  const funded = BigInt(fundedCents)
  if (funded > total) throw new RangeError('funded exceeds the sum of parts')

  const rows = active.map((p) => {
    const num = funded * BigInt(p.cents)
    return { userId: p.userId, part: p.cents, share: num / total, rest: num % total }
  })
  let left = funded - rows.reduce((a, r) => a + r.share, 0n)
  const order = [...rows].sort((a, b) =>
    a.rest === b.rest
      ? b.part - a.part || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
      : a.rest < b.rest ? 1 : -1,
  )
  for (const r of order) {
    if (left <= 0n) break
    r.share += 1n
    left -= 1n
  }
  return rows
    .filter((r) => r.share > 0n)
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .map((r) => ({ userId: r.userId, cents: Number(r.share) }))
}
