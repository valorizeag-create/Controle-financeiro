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

const REASONS = {
  fatura: 'Pagamento de fatura: as compras do cartão já contam uma a uma.',
  transferencia: 'Parece dinheiro entre suas contas.',
  'pagamento-fatura-no-cartao': 'Pagamento da própria fatura: não é gasto.',
} as const

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const ddmmyyyy = (d: ISODate) => d.split('-').reverse().join('/')

export function EtapaRevisao({ lines, alreadyImported, skipped, context, cardId, today }: Props) {
  const [rows, setRows] = useState(lines)
  const [error, setError] = useState<string | null>(null)
  // Liga na hora do toque (um segundo toque não salva de novo) e só desliga se der erro; no sucesso a tela muda.
  const [saving, setSaving] = useState(false)
  const [, startSaving] = useTransition()
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

  // Lista por dia, na ordem da revisão (sem categoria primeiro); a ordem não muda enquanto a pessoa edita.
  const groups: { date: ISODate; rows: ReviewLine[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === row.date) last.rows.push(row)
    else groups.push({ date: row.date, rows: [row] })
  }

  const checked = rows.filter((l) => l.checked)
  const missing = rows.filter(needsCategory)
  const expenses = checked.filter((l) => l.kind === 'expense').length
  const incomes = checked.length - expenses
  const outros = categories.find((c) => c.defaultKey === 'outros')

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

  return (
    <div className="flex flex-col gap-4">
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
          {outros && missing.length > 0 && (
            <Button type="button" variant="secondary" onClick={putInOutros} className="self-start">
              {`Pôr em Outros as ${missing.length} sem categoria`}
            </Button>
          )}
          <div className="flex flex-col gap-[18px]">
            {groups.map((g, i) => (
              <section key={`${g.date}-${i}`} aria-labelledby={`revisao-dia-${i}`} className="flex flex-col gap-2">
                <h2 id={`revisao-dia-${i}`} className="px-1 text-sm font-semibold text-inactive">{dayLabel(g.date, today)}</h2>
                <ul className="overflow-hidden rounded-card border border-line bg-card">
                  {g.rows.map((l) => {
                    const n = notes.get(l.importKey)
                    return <LinhaRevisao key={l.importKey} line={l} reasonText={n?.reason ?? null} bill={n?.bill ?? null} categories={categories} onChange={update} />
                  })}
                </ul>
              </section>
            ))}
          </div>

          <footer className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-card px-4 pb-[env(safe-area-inset-bottom)] md:-mx-9 md:px-9">
            {error && <div className="pt-3"><FormAlert>{error}</FormAlert></div>}
            <div className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] text-inactive">
                {`${expenses} ${plural(expenses, 'gasto', 'gastos')} · ${incomes} ${plural(incomes, 'entrada', 'entradas')}`}
              </p>
              <Button type="button" onClick={save} disabled={saving || checked.length === 0 || missing.length > 0} className="h-[52px]">
                {plural(checked.length, 'Anotar 1 registro', `Anotar ${checked.length} registros`)}
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
