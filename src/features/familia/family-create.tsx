'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { createFamily } from './actions'

export function FamilyCreate() {
  const [state, action, pending] = useActionState(createFamily, idle)
  const err = state.status === 'error' ? state : null
  const error = err?.fieldErrors?.name
  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-[#262626]">Nome da família</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          placeholder="Ex.: Família Souza"
          defaultValue={err?.values?.name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'name-error' : undefined}
          className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${error ? 'border-error-ink' : 'border-control'}`}
        />
        {error && <span id="name-error" className="text-sm text-error-ink">{error}</span>}
      </div>
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending}>Criar família</Button>
    </form>
  )
}
