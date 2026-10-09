'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle, type FormState } from '@/lib/forms'
import { centsToInput } from '@/features/registro/form-values'
import type { MonthKey } from '@/domain/dates'
import type { GoalRow } from './types'

type Props = {
  action: (s: FormState, fd: FormData) => Promise<FormState>
  goal?: GoalRow
  minMonth: MonthKey
  inFamily?: boolean
}

// Metas costumam ter valores maiores; separador de milhar ajuda a ler ao editar.
// parseBRL aceita "4.000,00" de volta, então o valor continua editável.
function targetToInput(cents: number): string {
  const [intPart, decPart] = centsToInput(cents).split(',')
  const sign = intPart.startsWith('-') ? '-' : ''
  const digits = sign ? intPart.slice(1) : intPart
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`
}

export function GoalForm({ action, goal, minMonth, inFamily = false }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? (goal ? { name: goal.name, target: targetToInput(goal.targetCents), deadline: goal.deadline ?? '' } : {})
  const e = err?.fieldErrors ?? {}

  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-5">
      {goal && <input type="hidden" name="id" value={goal.id} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-[15px] font-medium">Para o que você quer guardar?</label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={40}
          autoComplete="off"
          defaultValue={v.name}
          aria-invalid={e.name ? true : undefined}
          aria-describedby={e.name ? 'name-error' : undefined}
          className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${e.name ? 'border-error-ink' : 'border-control'}`}
        />
        {e.name && <span id="name-error" className="text-sm text-error-ink">{e.name}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="target" className="text-[15px] font-medium">Quanto você precisa?</label>
        <input
          id="target"
          name="target"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          defaultValue={v.target}
          aria-invalid={e.target ? true : undefined}
          aria-describedby={e.target ? 'target-error' : undefined}
          className={`num h-16 w-full min-w-0 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink placeholder:text-[#a3a3a3] ${
            e.target ? 'border-error-ink' : 'border-brand'
          }`}
        />
        {e.target && <span id="target-error" className="text-sm text-error-ink">{e.target}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deadline" className="text-[15px] font-medium">Até quando? (opcional)</label>
        <input
          id="deadline"
          name="deadline"
          type="month"
          min={minMonth}
          max="2099-12"
          defaultValue={v.deadline}
          aria-invalid={e.deadline ? true : undefined}
          aria-describedby={e.deadline ? 'deadline-error' : undefined}
          className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${e.deadline ? 'border-error-ink' : 'border-control'}`}
        />
        {e.deadline && <span id="deadline-error" className="text-sm text-error-ink">{e.deadline}</span>}
      </div>

      {inFamily && !goal && (
        <div className="flex flex-col gap-1.5">
          <label className="flex min-h-11 items-center justify-between gap-3 text-[15px] font-medium text-ink">
            Meta da família
            <input type="checkbox" name="family" aria-describedby="family-help" defaultChecked={v.family === 'on'} className="size-[22px] accent-[#6cbf38]" />
          </label>
          <span id="family-help" className="text-sm text-muted">Todos da família veem o total; cada pessoa vê só a própria parte.</span>
        </div>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {goal ? 'Salvar alterações' : 'Criar meta'}
      </Button>
    </form>
  )
}
