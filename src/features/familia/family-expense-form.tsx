'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/button'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { CHIP } from '@/ui/chip'
import { idle } from '@/lib/forms'
import { addDays, type ISODate } from '@/domain/dates'
import { centsToInput } from '@/features/registro/form-values'
import { deleteFamilyExpense, updateFamilyExpense } from './money-actions'

type Props = {
  expense: { id: string; amountCents: number; effectiveOn: ISODate; note: string | null }
  // Já como se lê na frase: nome, "você" ou "Ex-membro".
  author: string
  today: ISODate
}

// Ajuste do administrador: valor, data e nota. A categoria continua a de quem registrou.
export function FamilyExpenseForm({ expense, author, today }: Props) {
  const [state, action, pending] = useActionState(updateFamilyExpense, idle)
  const err = state.status === 'error' ? state : null
  const initialWhen = expense.effectiveOn === today ? 'today' : expense.effectiveOn === addDays(today, -1) ? 'yesterday' : 'other'
  const v = err?.values ?? {
    amount: centsToInput(expense.amountCents),
    when: initialWhen,
    date: initialWhen === 'other' ? expense.effectiveOn : '',
    note: expense.note ?? '',
  }
  const e = err?.fieldErrors ?? {}
  const [when, setWhen] = useState(v.when || 'today')

  return (
    <>
      <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="id" value={expense.id} />
        <p className="text-[15px] text-muted">Registrado por {author}</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-[15px] font-medium">Quanto foi?</label>
          <input
            id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" defaultValue={v.amount}
            aria-invalid={e.amount ? true : undefined} aria-describedby={e.amount ? 'amount-error' : undefined}
            className={`num h-16 w-full min-w-0 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink placeholder:text-[#a3a3a3] ${e.amount ? 'border-error-ink' : 'border-brand'}`}
          />
          {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
        </div>

        <fieldset className="flex flex-col gap-2.5" aria-describedby={e.date ? 'date-error' : undefined}>
          <legend className="mb-2.5 text-[15px] font-medium">Quando?</legend>
          <div className="flex flex-wrap gap-2">
            {[['today', 'Hoje'], ['yesterday', 'Ontem'], ['other', 'Outro dia']].map(([value, label]) => (
              <label key={value} className={`${CHIP} rounded-full px-[18px]`}>
                <input type="radio" name="when" value={value} checked={when === value} onChange={() => setWhen(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {when === 'other' && (
            <input
              type="date" name="date" defaultValue={v.date} aria-label="Dia"
              min="2000-01-01" max={addDays(today, 365)}
              aria-invalid={e.date ? true : undefined} aria-describedby={e.date ? 'date-error' : undefined}
              className="h-12 rounded-control border border-control px-3.5 text-base"
            />
          )}
          {e.date && <span id="date-error" className="text-sm text-error-ink">{e.date}</span>}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="note" className="text-[15px] font-medium">Uma nota, se quiser</label>
          <input
            id="note" name="note" maxLength={140} defaultValue={v.note}
            aria-invalid={e.note ? true : undefined} aria-describedby={e.note ? 'note-error' : undefined}
            className="h-12 rounded-control border border-control px-3.5 text-base"
          />
          {e.note && <span id="note-error" className="text-sm text-error-ink">{e.note}</span>}
        </div>

        {err?.message && <FormAlert>{err.message}</FormAlert>}

        <Button type="submit" disabled={pending} className="h-[52px]">Salvar gasto</Button>
      </form>

      <ConfirmAction
        trigger="Excluir"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title="Excluir este gasto?"
        body="O mês de quem registrou será recalculado."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        action={deleteFamilyExpense}
        fields={{ id: expense.id }}
      />
    </>
  )
}
