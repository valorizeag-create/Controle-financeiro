'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { centsToInput } from '@/features/registro/form-values'
import { settlePurchase } from './actions'

export function SettleForm({ id, amountCents }: { id: string; amountCents: number }) {
  const [state, action, pending] = useActionState(settlePurchase, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? { amount: centsToInput(amountCents) }
  const e = err?.fieldErrors ?? {}

  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">Quanto foi?</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          defaultValue={v.amount}
          aria-invalid={e.amount ? true : undefined}
          aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink placeholder:text-[#a3a3a3] ${
            e.amount ? 'border-error-ink' : 'border-brand'
          }`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
      </div>

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        Quitar parcelas
      </Button>
    </form>
  )
}
