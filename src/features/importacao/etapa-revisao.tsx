'use client'

import { useMemo, useState, useTransition } from 'react'
import { dayLabel, type ISODate } from '@/domain/dates'
import type { ReviewLine } from '@/domain/importacao/revisar'
import { formatBRL } from '@/domain/money'
import { txName } from '@/features/contas/view-model'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { saveImport } from './actions'
import { LinhaRevisao, needsCategory } from './linha-revisao'
import type { ImportContext } from './queries'

type Props = {
  lines: ReviewLine[]
  alreadyImported: number
  skipped: number
  context: ImportContext
  cardId: string | null
  today: ISODate
}
type Day = { date: ISODate; rows: ReviewLine[] }

const REASONS = {
  fatura: 'Pagamento de fatura: as compras do cartão já contam uma a uma.',
  transferencia: 'Parece dinheiro entre suas contas.',
  'pagamento-fatura-no-cartao': 'Pagamento da própria fatura: não é gasto.',
} as const
// O servidor aceita até 1.000 linhas por vez (schemas.ts).
const MAX_LINES = 1000
const TOO_MANY = 'São mais de 1.000 registros. Escolha um período menor.'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const ddmmyyyy = (d: ISODate) => d.split('-').reverse().join('/')

// Agrupa por dia (cada dia uma vez), do mais recente para o mais antigo.
function byDay(rows: ReviewLine[]): Day[] {
  const groups = new Map<ISODate, ReviewLine[]>()
  for (const row of rows) groups.set(row.date, [...(groups.get(row.date) ?? []), row])
  return [...groups].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([date, dayRows]) => ({ date, rows: dayRows }))
}

export function EtapaRevisao({ lines, alreadyImported, skipped, context, cardId, today }: Props) {
  const [rows, setRows] = useState(lines)
  const [error, setError] = useState<string | null>(null)
  // Liga na hora do toque (um segundo toque não salva de novo) e só desliga se der erro; no sucesso a tela muda.
  const [saving, setSaving] = useState(false)
  const [, startSaving] = useTransition()
  // As que chegaram sem categoria ficam na seção delas: a lista não se reorganiza enquanto a pessoa edita.
  const [firstKeys] = useState(() => new Set(lines.filter(needsCategory).map((l) => l.importKey)))
  const { categories, existing } = context

  // Textos fixos de cada linha, a partir do que a revisão encontrou (não mudam com as edições).
  const notes = useMemo(() => {
    const byId = new Map(existing.map((t) => [t.id, t]))
    return new Map(
      lines.map((l) => {
        const similar = l.similarTxId ? byId.get(l.similarTxId) : undefined
        const reason =
          l.reason === 'ja-anotada'
            ? similar
              ? `Parece que você já anotou isto: ${txName(similar, categories)}, ${formatBRL(similar.amountCents)}, ${ddmmyyyy(similar.occurredOn)}`
              : null
            : l.reason && l.reason !== 'ja-importada'
              ? REASONS[l.reason]
              : null
        const billTx = l.billId ? byId.get(l.billId) : undefined
        const bill = l.billId && billTx ? { id: l.billId, text: `Marcar ${txName(billTx, categories)} como paga` } : null
        return [l.importKey, { reason, bill }] as const
      }),
    )
  }, [lines, existing, categories])

  const first = byDay(rows.filter((l) => firstKeys.has(l.importKey)))
  const rest = byDay(rows.filter((l) => !firstKeys.has(l.importKey)))
  const checked = rows.filter((l) => l.checked)
  const missing = rows.filter(needsCategory)
  const expenses = checked.filter((l) => l.kind === 'expense').length
  const incomes = checked.length - expenses
  const outros = categories.find((c) => c.defaultKey === 'outros')
  const tooMany = checked.length > MAX_LINES

  function update(line: ReviewLine) {
    setRows((all) => all.map((l) => (l.importKey === line.importKey ? line : l)))
  }

  function putInOutros() {
    if (!outros) return
    setRows((all) => all.map((l) => (needsCategory(l) ? { ...l, categoryId: outros.id } : l)))
  }

  function save() {
    setError(null)
    setSaving(true)
    const payload = {
      cardId,
      lines: checked.map((l) => ({
        importKey: l.importKey,
        kind: l.kind,
        amountCents: l.amountCents,
        occurredOn: l.date,
        categoryId: l.kind === 'expense' ? l.categoryId : null,
        source: l.kind === 'income' ? l.source : null,
        note: l.note,
        billId: l.kind === 'expense' ? l.billId : null,
        merchantKey: l.merchantKey || null,
      })),
    }
    startSaving(async () => {
      const result = await saveImport(payload)
      if (result?.status === 'error') {
        setError(result.message)
        setSaving(false)
      }
    })
  }

  function days(groups: Day[], Heading: 'h2' | 'h3', prefix: string) {
    return groups.map((g) => (
      <section key={g.date} aria-labelledby={`revisao-${prefix}-${g.date}`} className="flex flex-col gap-2">
        <Heading id={`revisao-${prefix}-${g.date}`} className="px-1 text-sm font-semibold text-inactive">{dayLabel(g.date, today)}</Heading>
        <ul className="overflow-hidden rounded-card border border-line bg-card">
          {g.rows.map((l) => {
            const n = notes.get(l.importKey)
            return <LinhaRevisao key={l.importKey} line={l} reasonText={n?.reason ?? null} bill={n?.bill ?? null} categories={categories} onChange={update} />
          })}
        </ul>
      </section>
    ))
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {(alreadyImported > 0 || skipped > 0) && (
        <div className="flex flex-col gap-1 text-sm text-muted">
          {alreadyImported > 0 && <p>{plural(alreadyImported, '1 linha já importada antes.', `${alreadyImported} linhas já importadas antes.`)}</p>}
          {skipped > 0 && <p>{plural(skipped, '1 linha que a Íris não entendeu.', `${skipped} linhas que a Íris não entendeu.`)}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-[15px]">Nenhum registro neste período.</p>
      ) : (
        <>
          {first.length > 0 && (
            <section aria-labelledby="revisao-sem-categoria" className="flex flex-col gap-3">
              <h2 id="revisao-sem-categoria" className="px-1 text-[17px] font-semibold text-ink">Escolha a categoria</h2>
              {outros && missing.length > 0 && (
                <Button type="button" variant="secondary" onClick={putInOutros} className="self-start">
                  {plural(missing.length, 'Pôr em Outros a 1 sem categoria', `Pôr em Outros as ${missing.length} sem categoria`)}
                </Button>
              )}
              {days(first, 'h3', 'sem-categoria')}
            </section>
          )}
          {days(rest, 'h2', 'dia')}

          <footer className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-card px-4 pb-[env(safe-area-inset-bottom)] md:-mx-9 md:px-9">
            {(error || tooMany) && (
              <div className="pt-3">
                <FormAlert>{error ?? TOO_MANY}</FormAlert>
              </div>
            )}
            <div className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] text-inactive">
                {`${expenses} ${plural(expenses, 'gasto', 'gastos')} · ${incomes} ${plural(incomes, 'entrada', 'entradas')}`}
              </p>
              <Button type="button" onClick={save} disabled={saving || checked.length === 0 || missing.length > 0 || tooMany} className="h-[52px]">
                {plural(checked.length, 'Anotar 1 registro', `Anotar ${checked.length} registros`)}
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
