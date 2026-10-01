'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { dayMonthLabel } from '@/domain/dates'
import { createInvite } from './actions'
import { INVITE_IDLE } from './invite-state'

// O link só existe aqui, na resposta de quem o pediu: não vai para endereço, aviso nem log.
export function InvitePanel() {
  const [state, action, pending] = useActionState(createInvite, INVITE_IDLE)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">Convidar pessoa</Button>
      </form>
      {state.status === 'error' && <FormAlert>{state.message}</FormAlert>}
      {state.status === 'ready' && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">
            {`Envie este link para quem vai participar. Ele vale até ${dayMonthLabel(state.expiresOn)} e serve para uma pessoa.`}
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-link" className="text-sm font-medium text-[#262626]">Link do convite</label>
            <input
              id="invite-link"
              readOnly
              value={state.link}
              onFocus={(e) => e.currentTarget.select()}
              className="h-12 rounded-control border border-control bg-card px-3.5 text-base text-ink"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => copy(state.link)}>Copiar link</Button>
            {canShare && (
              <Button type="button" variant="secondary" onClick={() => navigator.share({ url: state.link }).catch(() => {})}>
                Compartilhar
              </Button>
            )}
          </div>
          {copied && <p role="status" className="text-sm text-muted">Link copiado.</p>}
        </div>
      )}
    </div>
  )
}
