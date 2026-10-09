import type { ISODate } from '../dates'
import type { Category } from '@/features/registro/queries'
import type { TxRow } from '@/features/registro/tx-row'
import { classify, specialOf, type Rule } from './classificar'
import { normalizeMerchant, prettyNote } from './normalizar'
import type { RawLine } from './tipos'

export type Reason = 'ja-importada' | 'ja-anotada' | 'fatura' | 'transferencia' | 'pagamento-fatura-no-cartao'
export type ReviewLine = {
  importKey: string
  date: ISODate
  description: string
  note: string
  merchantKey: string
  amountCents: number
  kind: 'income' | 'expense'
  categoryId: string | null
  source: string | null
  checked: boolean
  reason: Reason | null
  similarTxId: string | null
  billId: string | null
}
export type ExistingTx = TxRow & { importKey: string | null }

const MANUAL_DAYS = 2
const BILL_DAYS = 5
const BILL_TOLERANCE = 0.05

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function importKeys(lines: RawLine[]): Promise<string[]> {
  const seen = new Map<string, number>()
  return Promise.all(
    lines.map((l) => {
      const base = `${l.date}|${l.amountCents}|${l.direction}|${normalizeMerchant(l.description)}`
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      return sha256Hex(`${base}|${n}`)
    }),
  )
}

function dayDiff(a: ISODate, b: ISODate): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

export async function buildReview(input: {
  lines: RawLine[]
  from: ISODate
  to: ISODate
  origin: 'conta' | 'cartao'
  rules: Rule[]
  categories: Category[]
  existing: ExistingTx[]
  usedKeys: Set<string>
}): Promise<{ lines: ReviewLine[]; alreadyImported: number }> {
  // As chaves são calculadas sobre todas as linhas do arquivo, para a posição entre iguais não depender do período.
  const keys = await importKeys(input.lines)
  const inPeriod = input.lines
    .map((line, i) => ({ line, key: keys[i] }))
    .filter(({ line }) => line.date >= input.from && line.date <= input.to)

  let alreadyImported = 0
  const fresh = inPeriod.filter(({ key }) => {
    if (input.usedKeys.has(key)) {
      alreadyImported++
      return false
    }
    return true
  })
  fresh.sort((a, b) => (a.line.date < b.line.date ? -1 : a.line.date > b.line.date ? 1 : 0))

  const manuals = input.existing.filter((t) => t.status === 'confirmed' && t.importKey === null)
  const usedManual = new Set<string>()
  const bills = input.existing.filter((t) => t.status === 'pending' && t.kind === 'expense' && t.dueOn !== null)
  const usedBills = new Set<string>()

  const result: ReviewLine[] = fresh.map(({ line, key }) => {
    const c = classify(line, { rules: input.rules, categories: input.categories })
    const special = specialOf(line.description, input.origin)
    let kind = c.kind
    if (input.origin === 'cartao' && special === 'estorno') kind = 'income'

    const review: ReviewLine = {
      importKey: key,
      date: line.date,
      description: line.description,
      note: prettyNote(line.description),
      merchantKey: normalizeMerchant(line.description),
      amountCents: line.amountCents,
      kind,
      categoryId: kind === 'income' ? null : c.categoryId,
      source: kind === 'income' ? c.source : null,
      checked: true,
      reason: null,
      similarTxId: null,
      billId: null,
    }

    const reason: Reason | null =
      input.origin === 'conta' && (special === 'fatura' || special === 'transferencia')
        ? special
        : input.origin === 'cartao' && special === 'pagamento-fatura-no-cartao'
          ? special
          : null
    if (reason) return { ...review, checked: false, reason }

    let manual: ExistingTx | null = null
    let manualDiff = Infinity
    for (const t of manuals) {
      if (usedManual.has(t.id) || t.kind !== kind || t.amountCents !== line.amountCents) continue
      const diff = dayDiff(t.occurredOn, line.date)
      if (diff <= MANUAL_DAYS && diff < manualDiff) {
        manual = t
        manualDiff = diff
      }
    }
    if (manual) {
      usedManual.add(manual.id)
      return { ...review, checked: false, reason: 'ja-anotada', similarTxId: manual.id }
    }

    if (line.direction === 'out' && kind === 'expense') {
      let best: ExistingTx | null = null
      let bestScore: [number, number] = [Infinity, Infinity]
      for (const b of bills) {
        if (usedBills.has(b.id)) continue
        const amountDiff = Math.abs(line.amountCents - b.amountCents)
        const dateDiff = dayDiff(line.date, b.dueOn as ISODate)
        if (amountDiff > b.amountCents * BILL_TOLERANCE || dateDiff > BILL_DAYS) continue
        if (amountDiff < bestScore[0] || (amountDiff === bestScore[0] && dateDiff < bestScore[1])) {
          best = b
          bestScore = [amountDiff, dateDiff]
        }
      }
      if (best) {
        usedBills.add(best.id)
        return { ...review, billId: best.id, categoryId: best.categoryId }
      }
    }
    return review
  })

  const needsCategory = (l: ReviewLine) => l.checked && l.kind === 'expense' && l.categoryId === null && l.billId === null
  const byDateDesc = (a: ReviewLine, b: ReviewLine) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  const first = result.filter(needsCategory).sort(byDateDesc)
  const rest = result.filter((l) => !needsCategory(l)).sort(byDateDesc)
  return { lines: [...first, ...rest], alreadyImported }
}
