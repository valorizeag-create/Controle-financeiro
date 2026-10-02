'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle } from '@/lib/forms'
import { formatBRL } from '@/domain/money'
import type { DeletionNotice } from '@/domain/account'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { deleteAccount } from './actions'

const EVERYTHING = 'Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito.'
const FAMILY_HISTORY = 'Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome.'

export function DeleteForm({ notice, shareCents, passesAdmin }: { notice: DeletionNotice; shareCents: number; passesAdmin: boolean }) {
  const [state, formAction, pending] = useActionState(deleteAccount, idle)
  const err = state.status === 'error' ? state : null
  return (
    <div className="flex flex-col gap-4">
      {notice === 'everything' ? (
        <p className="text-base text-ink">{EVERYTHING}</p>
      ) : (
        <>
          <p className="text-base text-ink">{FAMILY_HISTORY}</p>
          <p className="text-base text-ink">Isso não pode ser desfeito.</p>
        </>
      )}
      {shareCents > 0 && (
        <p className="text-base text-ink">Sua parte nas metas da família ({formatBRL(shareCents)}) também sairá delas.</p>
      )}
      {passesAdmin && <p className="text-base text-ink">A administração da família passa para quem participa há mais tempo.</p>}
      <Link href="/configuracoes/dados" className="flex min-h-11 items-center font-medium text-brand-text">
        Baixar meus dados antes
      </Link>
      <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
        <TextField name="confirm" label="Digite EXCLUIR para confirmar." autoComplete="off" error={err?.fieldErrors?.confirm} />
        {err?.message && <FormAlert>{err.message}</FormAlert>}
        {err?.code === 'reauth' && <SignOutButton variant="row" />}
        <Button type="submit" variant="secondary" disabled={pending}>Excluir meu cadastro</Button>
      </form>
      <Button href="/configuracoes">Manter meu cadastro</Button>
    </div>
  )
}
