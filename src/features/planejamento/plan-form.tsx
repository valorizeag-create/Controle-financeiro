'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle, type FormState } from '@/lib/forms'
import { PLAN_FIELD_PREFIX } from './schemas'
import type { PlanFormView } from './view-model'

type Props = {
  view: PlanFormView
  action: (s: FormState, fd: FormData) => Promise<FormState>
}

export function PlanForm({ view, action }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null

  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="month" value={view.month} />

      {view.fields.map((field) => {
        const name = `${PLAN_FIELD_PREFIX}${field.categoryId}`
        const id = `plan-${field.categoryId}`
        const message = err?.fieldErrors?.[name]
        return (
          <div key={field.categoryId} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[15px] font-medium">{field.name}</label>
            <input
              id={id}
              name={name}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={field.autoFocus}
              defaultValue={err?.values?.[name] ?? field.value}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : undefined}
              className={`num h-12 rounded-control border bg-card px-3.5 text-base text-ink ${message ? 'border-error-ink' : 'border-control'}`}
            />
            {message && <span id={`${id}-error`} className="text-sm text-error-ink">{message}</span>}
          </div>
        )
      })}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">Salvar planejamento</Button>
    </form>
  )
}
