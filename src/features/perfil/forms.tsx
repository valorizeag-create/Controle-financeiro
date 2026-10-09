'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'
import { updateDisplayName } from './actions'

type Action = (state: FormState, fd: FormData) => Promise<FormState>

export function InitialBalanceForm({ action, submitLabel, defaultValue = '' }: { action: Action; submitLabel: string; defaultValue?: string }) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  const error = err?.fieldErrors?.initialBalance
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-1 flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5 pt-3">
        <label htmlFor="initialBalance" className="text-[15px] font-medium">Somando banco, carteira e dinheiro guardado</label>
        <input
          id="initialBalance"
          name="initialBalance"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          defaultValue={err?.values?.initialBalance ?? defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'initialBalance-error' : 'initialBalance-hint'}
          className={`num h-16 w-full min-w-0 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink placeholder:text-[#a3a3a3] ${error ? 'border-error-ink' : 'border-brand'}`}
        />
        {error && <span id="initialBalance-error" className="text-sm text-error-ink">{error}</span>}
      </div>
      <p id="initialBalance-hint" className="text-sm text-muted">Não precisa ser exato. Um valor aproximado já ajuda a enxergar.</p>
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <div className="flex-1" />
      <Button type="submit" disabled={pending} className="h-[52px]">{submitLabel}</Button>
    </form>
  )
}

export function NameForm({ defaultValue }: { defaultValue: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayName, idle)
  const err = state.status === 'error' ? state : null
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
      <TextField
        name="displayName"
        label="Como podemos te chamar?"
        autoComplete="given-name"
        defaultValue={err?.values?.displayName ?? defaultValue}
        error={err?.fieldErrors?.displayName}
      />
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending}>Salvar alterações</Button>
    </form>
  )
}
