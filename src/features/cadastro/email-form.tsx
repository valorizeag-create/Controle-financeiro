'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { RowStatic } from '@/ui/list'
import { TextField } from '@/ui/text-field'
import { idle } from '@/lib/forms'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { requestEmailChange } from './actions'

const SENT =
  'Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois.'

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(requestEmailChange, idle)
  const err = state.status === 'error' ? state : null
  return (
    <div className="flex flex-col gap-4">
      <RowStatic caption="E-mail atual" title={currentEmail} />
      {state.status === 'sent' ? (
        // A mesma frase para qualquer endereço; o endereço digitado não é repetido.
        <p role="status" className="rounded-panel bg-brand-wash px-4 py-3 text-[15px] text-brand-ink">{SENT}</p>
      ) : (
        <>
          <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
            <TextField name="email" type="email" label="Novo e-mail" autoComplete="email" defaultValue={err?.values?.email} error={err?.fieldErrors?.email} />
            {err?.message && <FormAlert>{err.message}</FormAlert>}
            {err?.code === 'reauth' && <SignOutButton variant="row" />}
            <Button type="submit" disabled={pending}>Enviar link</Button>
          </form>
        </>
      )}
    </div>
  )
}
