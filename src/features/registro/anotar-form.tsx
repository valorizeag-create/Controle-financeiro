'use client'

import { useActionState, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { addDays, type ISODate } from '@/domain/dates'
import { createTransaction, updateTransaction } from './actions'
import type { Category } from './queries'
import { PAYMENT_LABELS } from './labels'
import { recordToFormValues, type EditableRecord } from './form-values'

const chip =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-control bg-card px-3 text-[15px] font-medium text-[#262626] has-[:checked]:border-[1.5px] has-[:checked]:border-selected has-[:checked]:bg-brand-wash has-[:checked]:font-semibold has-[:checked]:text-brand-ink has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]'

const SOURCES = ['Salário', 'Freela', 'Presente', 'Outros']

type Props = { kind: 'expense' | 'income'; categories: Category[]; today: ISODate; record?: EditableRecord }

export function AnotarForm({ kind, categories, today, record }: Props) {
  const [state, action, pending] = useActionState(record ? updateTransaction : createTransaction, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? (record ? recordToFormValues(record, today) : {})
  const e = err?.fieldErrors ?? {}
  const [when, setWhen] = useState(v.when || 'today')
  // "Sujo" = há algo digitado que ainda não foi salvo; o botão Fechar pergunta antes de descartar.
  const [touched, setTouched] = useState(false)
  const isExpense = kind === 'expense'
  const hasDetails = Boolean(v.note || v.paymentMethod)

  return (
    <form
      key={err ? err.submission : 'idle'}
      action={action}
      noValidate
      onInput={() => setTouched(true)}
      onChange={() => setTouched(true)}
      data-dirty={touched || err ? 'true' : undefined}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      {record && <input type="hidden" name="id" value={record.id} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">{isExpense ? 'Quanto foi?' : 'Quanto entrou?'}</label>
        <input
          id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" defaultValue={v.amount}
          aria-invalid={e.amount ? true : undefined} aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink outline-none placeholder:text-[#a3a3a3] ${e.amount ? 'border-error-ink' : 'border-brand'}`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
      </div>

      {isExpense ? (
        <fieldset className="flex flex-col gap-2.5" aria-describedby={e.categoryId ? 'cat-error' : undefined}>
          <legend className="mb-2.5 text-[15px] font-medium">Com o quê?</legend>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((c) => (
              <label key={c.id} className={chip}>
                <input type="radio" name="categoryId" value={c.id} defaultChecked={v.categoryId === c.id} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
          {e.categoryId && <span id="cat-error" className="text-sm text-error-ink">{e.categoryId}</span>}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-medium">De onde veio?</legend>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <label key={s} className={chip}>
                <input type="radio" name="source" value={s} defaultChecked={v.source === s} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2.5" aria-describedby={e.date ? 'date-error' : undefined}>
        <legend className="mb-2.5 text-[15px] font-medium">Quando?</legend>
        <div className="flex flex-wrap gap-2">
          {[['today', 'Hoje'], ['yesterday', 'Ontem'], ['other', 'Outro dia']].map(([value, label]) => (
            <label key={value} className={`${chip} rounded-full px-[18px]`}>
              <input type="radio" name="when" value={value} checked={when === value} onChange={() => setWhen(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {when === 'other' && (
          <input
            type="date" name="date" defaultValue={v.date} aria-label="Dia"
            min="2000-01-01" max={isExpense ? addDays(today, 365) : today}
            aria-invalid={e.date ? true : undefined} aria-describedby={e.date ? 'date-error' : undefined}
            className="h-12 rounded-control border border-control px-3.5 text-base"
          />
        )}
        {e.date && <span id="date-error" className="text-sm text-error-ink">{e.date}</span>}
      </fieldset>

      {isExpense && (
        <details open={hasDetails} className="group border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] font-medium text-ink">
            Mais detalhes
            <ChevronDown className="size-[18px] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm text-inactive">Uma nota, se quiser</label>
              <input id="note" name="note" maxLength={140} defaultValue={v.note} className="h-11 rounded-control border border-control px-3 text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paymentMethod" className="text-sm text-inactive">Forma de pagamento</label>
              <select id="paymentMethod" name="paymentMethod" defaultValue={v.paymentMethod ?? ''} className="h-11 rounded-control border border-control bg-card px-3 text-base">
                <option value="">Não informar</option>
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </details>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {record ? 'Salvar alterações' : isExpense ? 'Salvar gasto' : 'Salvar entrada'}
      </Button>
    </form>
  )
}
