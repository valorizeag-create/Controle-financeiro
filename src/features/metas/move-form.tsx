'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { depositToGoal, withdrawFromGoal } from './movement-actions'
import { depositToFamilyGoal, withdrawFromFamilyGoal } from './family-goal-actions'

// `family`: a meta é da família (guardar e tirar mexem só na parte da própria pessoa).
type Props = { goalId: string; mode: 'deposit' | 'withdraw'; family?: boolean }

const COPY = {
  deposit: { label: 'Quanto você quer guardar?', hint: 'Esse valor sai do seu Disponível deste mês.', button: 'Guardar dinheiro' },
  withdraw: { label: 'Quanto você quer tirar?', hint: 'Esse valor volta para o seu Disponível deste mês.', button: 'Tirar dinheiro' },
} as const

export function MoveForm({ goalId, mode, family = false }: Props) {
  const move = family
    ? mode === 'deposit' ? depositToFamilyGoal : withdrawFromFamilyGoal
    : mode === 'deposit' ? depositToGoal : withdrawFromGoal
  const [state, action, pending] = useActionState(move, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? {}
  const e = err?.fieldErrors ?? {}
  const copy = COPY[mode]

  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="id" value={goalId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">{copy.label}</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          defaultValue={v.amount}
          aria-invalid={e.amount ? true : undefined}
          aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink outline-none placeholder:text-[#a3a3a3] ${
            e.amount ? 'border-error-ink' : 'border-brand'
          }`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
      </div>

      <p className="text-sm text-muted">{copy.hint}</p>

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">{copy.button}</Button>
    </form>
  )
}
