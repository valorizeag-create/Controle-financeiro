'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { CHIP } from '@/ui/chip'
import { FrequencyField } from '@/ui/frequency-field'
import { monthName } from '@/domain/recurrence'
import type { Frequency } from '@/domain/recurrence'
import { centsToInput } from '@/features/registro/form-values'
import { INCOME_SOURCES } from '@/features/registro/labels'
import type { Category } from '@/features/registro/queries'
import { idle, type FormState } from '@/lib/forms'
import type { RecurrenceRow } from './types'

type Props = {
  kind: 'expense' | 'income'
  categories: Category[]
  action: (s: FormState, fd: FormData) => Promise<FormState>
  recurrence?: RecurrenceRow
  inFamily?: boolean
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function RecurrenceForm({ kind, categories, action, recurrence, inFamily = false }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  const isExpense = kind === 'expense'
  const v =
    err?.values ??
    (recurrence
      ? {
          name: recurrence.name,
          amount: centsToInput(recurrence.amountCents),
          categoryId: recurrence.categoryId ?? '',
          source: recurrence.source ?? '',
          dueDay: String(recurrence.dueDay),
        }
      : {})
  const e = err?.fieldErrors ?? {}
  const [frequency, setFrequency] = useState<Frequency>(v.frequency === 'yearly' ? 'yearly' : 'monthly')

  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-5">
      {recurrence && <input type="hidden" name="id" value={recurrence.id} />}

      <TextField name="name" label="Nome" defaultValue={v.name} error={e.name} />
      <TextField name="amount" label="Valor" inputMode="decimal" defaultValue={v.amount} error={e.amount} />

      {isExpense ? (
        <fieldset className="flex flex-col gap-2.5" aria-describedby={e.categoryId ? 'categoryId-error' : undefined}>
          <legend className="mb-2.5 text-[15px] font-medium">Com o quê?</legend>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((c) => (
              <label key={c.id} className={CHIP}>
                <input type="radio" name="categoryId" value={c.id} defaultChecked={v.categoryId === c.id} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
          {e.categoryId && <span id="categoryId-error" className="text-sm text-error-ink">{e.categoryId}</span>}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-medium">De onde veio?</legend>
          <div className="flex flex-wrap gap-2">
            {INCOME_SOURCES.map((s) => (
              <label key={s} className={CHIP}>
                <input type="radio" name="source" value={s} defaultChecked={v.source === s} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {recurrence ? (
        <p className="text-[15px] text-ink">
          {recurrence.frequency === 'monthly' ? 'Todo mês' : `Todo ano · ${monthName(recurrence.dueMonth!)}`}
        </p>
      ) : (
        <FrequencyField value={frequency} onChange={setFrequency} legend="Com que frequência?" />
      )}

      {!recurrence && frequency === 'yearly' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="dueMonth" className="text-sm font-medium text-[#262626]">Mês</label>
          <select
            id="dueMonth"
            name="dueMonth"
            defaultValue={v.dueMonth ?? ''}
            aria-invalid={e.dueMonth ? true : undefined}
            aria-describedby={e.dueMonth ? 'dueMonth-error' : undefined}
            className={`h-12 rounded-control border bg-card px-3.5 text-base ${e.dueMonth ? 'border-error-ink' : 'border-control'}`}
          >
            <option value=""></option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>{monthName(m)}</option>
            ))}
          </select>
          {e.dueMonth && <span id="dueMonth-error" className="text-sm text-error-ink">{e.dueMonth}</span>}
        </div>
      )}

      <TextField name="dueDay" label={isExpense ? 'Vence dia' : 'Chega dia'} inputMode="numeric" defaultValue={v.dueDay} error={e.dueDay} />

      {inFamily && isExpense && !recurrence && (
        <label className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink">
          Conta da família
          <input type="checkbox" name="family" defaultChecked={v.family === 'on'} className="size-[22px] accent-[#6cbf38]" />
        </label>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {recurrence ? 'Salvar alterações' : 'Salvar conta'}
      </Button>
    </form>
  )
}
