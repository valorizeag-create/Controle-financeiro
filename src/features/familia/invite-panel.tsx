'use client'

import { useActionState, useId, useState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { dayMonthLabel, type ISODate } from '@/domain/dates'
import { createInvite, inviteByEmail } from './actions'
import { INVITE_IDLE } from './invite-state'
import { INVITE_EMAIL_ERROR } from './schemas'

// O link só existe aqui, na resposta de quem o pediu: não vai para endereço, aviso nem log.
export function InviteLink({ link, expiresOn, notice }: { link: string; expiresOn: ISODate; notice?: string }) {
  const [copied, setCopied] = useState(false)
  const id = useId()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && <FormAlert>{notice}</FormAlert>}
      <p className="text-[15px]">
        {`Envie este link para quem vai participar. Ele vale até ${dayMonthLabel(expiresOn)} e serve para uma pessoa.`}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-[#262626]">Link do convite</label>
        <input
          id={id}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-12 rounded-control border border-control bg-card px-3.5 text-base text-ink"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>Copiar link</Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={() => navigator.share({ url: link }).catch(() => {})}>
            Compartilhar
          </Button>
        )}
      </div>
      {copied && <p role="status" className="text-sm text-muted">Link copiado.</p>}
    </div>
  )
}

export function InvitePanel() {
  const [state, action, pending] = useActionState(createInvite, INVITE_IDLE)
  const [mailState, mailAction, mailPending] = useActionState(inviteByEmail, INVITE_IDLE)
  const emailError = mailState.status === 'error' && mailState.message === INVITE_EMAIL_ERROR ? mailState.message : undefined

  return (
    <div className="flex flex-col gap-3">
      <form action={mailAction} noValidate className="flex flex-col gap-3">
        <TextField name="email" label="E-mail de quem vai participar" type="email" inputMode="email" autoComplete="off" error={emailError} />
        <Button type="submit" disabled={mailPending} className="w-full">Enviar convite</Button>
      </form>
      {mailState.status === 'error' && !emailError && <FormAlert>{mailState.message}</FormAlert>}
      {mailState.status === 'sent' && (
        <p role="status" className="text-[15px] text-ink">
          {`Convite enviado para ${mailState.email}. Vale até ${dayMonthLabel(mailState.expiresOn)}.`}
        </p>
      )}
      {mailState.status === 'ready' && <InviteLink link={mailState.link} expiresOn={mailState.expiresOn} notice={mailState.notice} />}

      <form action={action}>
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">Convidar pessoa</Button>
      </form>
      {state.status === 'error' && <FormAlert>{state.message}</FormAlert>}
      {state.status === 'ready' && <InviteLink link={state.link} expiresOn={state.expiresOn} notice={state.notice} />}
    </div>
  )
}
