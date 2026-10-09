'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ISODate } from '@/domain/dates'
import { loadCards } from '@/features/cartoes/queries'
import { loadCategories } from '@/features/registro/queries'
import { setFlash } from '@/lib/flash'
import { createClient, requireUser } from '@/lib/supabase/server'
import { loadImportContext, type ImportContext } from './queries'
import { importSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const ALREADY_IMPORTED = 'Esses registros já tinham sido anotados.'

type SaveError = { status: 'error'; message: string }

export async function loadContextAction(from: ISODate, to: ISODate): Promise<ImportContext> {
  return loadImportContext(from, to)
}

export async function saveImport(payload: unknown): Promise<SaveError> {
  await requireUser()
  const parsed = importSchema.safeParse(payload)
  if (!parsed.success) return { status: 'error', message: SAVE_FAILED }
  const { cardId, lines } = parsed.data

  try {
    const [categories, cards] = await Promise.all([loadCategories(), loadCards()])
    const categoryIds = new Set(categories.map((c) => c.id))
    const cardIds = new Set(cards.map((c) => c.id))
    if (cardId !== null && !cardIds.has(cardId)) return { status: 'error', message: SAVE_FAILED }
    if (lines.some((l) => l.categoryId !== null && !categoryIds.has(l.categoryId))) {
      return { status: 'error', message: SAVE_FAILED }
    }

    const pLines = lines.map((l) => {
      const learnsExpense = l.kind === 'expense' && l.categoryId !== null && l.billId === null
      const learnsIncome = l.kind === 'income' && l.source !== null
      const learns = (learnsExpense || learnsIncome) && l.merchantKey !== null && l.merchantKey !== ''
      return {
        import_key: l.importKey,
        kind: l.kind,
        amount_cents: l.amountCents,
        occurred_on: l.occurredOn,
        category_id: l.categoryId,
        source: l.source,
        note: l.note,
        bill_id: l.billId,
        merchant_key: learns ? l.merchantKey : null,
      }
    })

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('import_statement', { p_lines: pLines, p_card_id: cardId })
    if (error) return { status: 'error', message: SAVE_FAILED }
    const n = Number(data)
    if (!Number.isFinite(n)) return { status: 'error', message: SAVE_FAILED }
    if (n === 0) return { status: 'error', message: ALREADY_IMPORTED }
    await setFlash(n === 1 ? '1 registro anotado.' : `${n} registros anotados.`)
  } catch {
    return { status: 'error', message: SAVE_FAILED }
  }
  revalidatePath('/', 'layout')
  redirect('/inicio')
}
