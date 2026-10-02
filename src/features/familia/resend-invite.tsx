'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/ui/form-alert'
import { resendInvite } from './actions'
import { INVITE_IDLE } from './invite-state'
import { InviteLink } from './invite-panel'

// O endereço não passa por aqui: o servidor lê o do convite pendente, só o id vem do formulário.
export function ResendInvite({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resendInvite, INVITE_IDLE)
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className="min-h-11 text-sm font-medium text-brand-text disabled:text-[#737373]">Reenviar</button>
      </form>
      {state.status === 'sent' && <p role="status" className="text-sm text-muted">Convite reenviado.</p>}
      {state.status === 'error' && <FormAlert>{state.message}</FormAlert>}
      {state.status === 'ready' && <InviteLink link={state.link} expiresOn={state.expiresOn} notice={state.notice} />}
    </div>
  )
}
