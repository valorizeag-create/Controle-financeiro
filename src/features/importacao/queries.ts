import 'server-only'
import { addDays, isValidISODate, type ISODate } from '@/domain/dates'
import type { Rule } from '@/domain/importacao/classificar'
import type { ExistingTx } from '@/domain/importacao/revisar'
import { loadCards } from '@/features/cartoes/queries'
import type { CardRow } from '@/features/cartoes/types'
import { fetchAllPages } from '@/features/registro/paging'
import { loadCategories, type Category } from '@/features/registro/queries'
import { TX_COLUMNS, toTxRow, type TxRawRow } from '@/features/registro/tx-row'
import { createClient, requireUser } from '@/lib/supabase/server'

const WINDOW_DAYS = 5
const MAX_SPAN_DAYS = 400

export type ImportContext = {
  categories: Category[]
  cards: CardRow[]
  existing: ExistingTx[]
  usedKeys: string[]
  rules: Rule[]
}

type ImportTxRawRow = TxRawRow & { import_key: string | null }
type RuleRawRow = { merchant_key: string; kind: string; category_id: string | null; source: string | null }

function spanDays(from: ISODate, to: ISODate): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

export async function loadImportContext(from: ISODate, to: ISODate): Promise<ImportContext> {
  if (!isValidISODate(from) || !isValidISODate(to) || spanDays(from, to) < 0 || spanDays(from, to) > MAX_SPAN_DAYS) {
    throw new Error('Período inválido.')
  }
  const user = await requireUser()
  const supabase = await createClient()
  const lo = addDays(from, -WINDOW_DAYS)
  const hi = addDays(to, WINDOW_DAYS)

  const [categories, cards, rawTxs, rules] = await Promise.all([
    loadCategories(),
    loadCards(),
    // Registros pela data ou, nas contas a pagar, pelo vencimento.
    fetchAllPages<ImportTxRawRow>(async (a, b) => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`${TX_COLUMNS}, import_key`)
        .eq('user_id', user.id)
        .or(`and(occurred_on.gte.${lo},occurred_on.lte.${hi}),and(due_on.gte.${lo},due_on.lte.${hi})`)
        .order('occurred_on')
        .order('id')
        .range(a, b)
      return { data: data as ImportTxRawRow[] | null, error }
    }),
    supabase.from('import_rules').select('merchant_key, kind, category_id, source').eq('user_id', user.id),
  ])
  if (rules.error) throw rules.error

  const existing: ExistingTx[] = rawTxs.map((t) => ({ ...toTxRow(t), importKey: t.import_key }))
  return {
    categories,
    cards,
    existing,
    usedKeys: existing.flatMap((t) => (t.importKey === null ? [] : [t.importKey])),
    rules: (rules.data as RuleRawRow[]).map((r) => ({
      merchantKey: r.merchant_key,
      kind: r.kind as 'income' | 'expense',
      categoryId: r.category_id,
      source: r.source,
    })),
  }
}
