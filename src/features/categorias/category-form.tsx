'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>
  submitLabel: string
  category?: { id: string; name: string }
}

export function CategoryForm({ action, submitLabel, category }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <TextField
        name="name"
        label="Nome"
        hint="Dê um nome que faça sentido para você."
        autoComplete="off"
        defaultValue={err?.values?.name ?? category?.name ?? ''}
        error={err?.fieldErrors?.name}
      />
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending}>{submitLabel}</Button>
    </form>
  )
}
