import Link from 'next/link'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { acceptInvite } from './actions'
import { AcceptInviteButton } from './accept-invite-button'
import type { InviteView } from './view-model'

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

export function InviteScreen({ view, transientError = false }: { view: InviteView; transientError?: boolean }) {
  switch (view.kind) {
    case 'invalid':
      return (
        <>
          <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-ink">Este convite não vale mais. Peça um novo link a quem convidou você.</h1>
          <Button href="/inicio">Ver meu mês</Button>
        </>
      )
    case 'signed-out':
      return (
        <>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">Você recebeu um convite</h1>
          <p className="text-base text-ink">Crie seu cadastro ou entre para participar da família na Íris.</p>
          <Button href={view.signUpHref}>Criar meu cadastro</Button>
          <Button href={view.signInHref} variant="secondary">Entrar</Button>
        </>
      )
    case 'has-family':
      return (
        <>
          <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-ink">Você já participa de uma família. Para entrar em outra, saia da atual primeiro.</h1>
          <Button href="/familia">Ver a família</Button>
        </>
      )
    case 'ready':
      return (
        <>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">{`Entrar na família ${view.familyName}?`}</h1>
          {transientError && <FormAlert>{UNEXPECTED}</FormAlert>}
          {view.invitedBy && <p className="text-base text-ink">{`${view.invitedBy} convidou você.`}</p>}
          <p className="text-base text-muted">
            A família vê só os gastos que você marcar como da família, as contas da casa e as metas da família. Seu Disponível, suas entradas e seus cartões continuam só seus.
          </p>
          <form action={acceptInvite} className="flex flex-col gap-3">
            <input type="hidden" name="code" value={view.code} />
            <AcceptInviteButton />
          </form>
          <Link href="/inicio" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Agora não</Link>
        </>
      )
  }
}
