'use client'

import type { ReviewLine } from '@/domain/importacao/revisar'
import { formatBRL } from '@/domain/money'
import type { Category } from '@/features/registro/queries'
import { INCOME_SOURCES } from '@/features/registro/labels'
import { CHIP } from '@/ui/chip'
import { SELECT } from './estilos'

export function needsCategory(l: ReviewLine): boolean {
  return l.checked && l.kind === 'expense' && l.categoryId === null && l.billId === null
}

type Props = {
  line: ReviewLine
  // Texto do motivo, nas linhas que vêm desmarcadas.
  reasonText: string | null
  // Conta a pagar que a linha pode baixar ("Marcar … como paga"), mesmo depois de desligada.
  bill: { id: string; text: string } | null
  categories: Category[]
  onChange: (line: ReviewLine) => void
}

export function LinhaRevisao({ line, reasonText, bill, categories, onChange }: Props) {
  const id = `linha-${line.importKey}`
  const name = `${id}-nome ${id}-valor`
  const income = line.kind === 'income'
  const highlight = needsCategory(line)

  function setKind(kind: 'income' | 'expense') {
    onChange({ ...line, kind, categoryId: null, source: null, billId: null })
  }

  return (
    <li data-sem-categoria={highlight ? 'true' : undefined} className={`flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0 ${highlight ? 'bg-amber-wash' : ''}`}>
      <input
        type="checkbox"
        checked={line.checked}
        onChange={(e) => onChange({ ...line, checked: e.target.checked })}
        aria-labelledby={name}
        className="mt-0.5 size-[22px] shrink-0 accent-[#6cbf38]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start gap-3">
          <span id={`${id}-nome`} className="min-w-0 flex-1 break-words text-[15px] text-ink">{line.note || line.description}</span>
          <span id={`${id}-valor`} className={`num shrink-0 text-[15px] ${income ? 'font-semibold text-brand-text-hover' : 'font-medium text-ink'}`}>
            {income ? '+ ' : '− '}
            {formatBRL(line.amountCents)}
          </span>
        </div>
        {reasonText && <p className="text-[13px] text-muted">{reasonText}</p>}
        <div role="radiogroup" aria-labelledby={name} className="flex flex-wrap items-center gap-2">
          {(['expense', 'income'] as const).map((kind) => (
            <label key={kind} className={`${CHIP} min-h-9 rounded-full px-3.5 text-sm`}>
              <input type="radio" name={`${id}-tipo`} checked={line.kind === kind} onChange={() => setKind(kind)} className="sr-only" />
              {kind === 'expense' ? 'Gasto' : 'Entrada'}
            </label>
          ))}
        </div>
        {bill && !income && (
          <label className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink">
            <span id={`${id}-conta`}>{bill.text}</span>
            <input
              type="checkbox"
              checked={line.billId !== null}
              onChange={(e) => onChange({ ...line, billId: e.target.checked ? bill.id : null })}
              aria-labelledby={`${id}-conta ${name}`}
              className="size-[22px] shrink-0 accent-[#6cbf38]"
            />
          </label>
        )}
        {line.billId !== null ? null : income ? (
          <select
            value={line.source ?? ''}
            onChange={(e) => onChange({ ...line, source: e.target.value || null })}
            aria-labelledby={name}
            className={SELECT}
          >
            <option value="">Não informar</option>
            {INCOME_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <select
            value={line.categoryId ?? ''}
            onChange={(e) => onChange({ ...line, categoryId: e.target.value || null })}
            aria-labelledby={name}
            className={SELECT}
          >
            <option value="">Escolha a categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
    </li>
  )
}
