'use client'

import { useActionState, useEffect } from 'react'
import { Button } from '@/ui/button'
import { confirmEmailChange } from './actions'
import { TOKEN_HASH } from './schemas'
import { confirmIdle } from './state'

const INVALID = 'Este link não vale mais. Peça a troca de novo em Configurações.'
const STATUS_CLASS = 'rounded-panel bg-brand-wash px-4 py-3 text-[15px] text-brand-ink'

// Abrir o link só mostra o botão: quem confirma é o clique (programas de e-mail abrem links sozinhos).
export function ConfirmEmailForm({ tokenHash }: { tokenHash: string | null }) {
  const [state, formAction, pending] = useActionState(confirmEmailChange, confirmIdle)

  // O código do link é de uso único: depois do clique ele sai da barra de endereço.
  useEffect(() => {
    if (state.status !== 'idle') window.history.replaceState(null, '', '/confirmar-email')
  }, [state.status])

  if (state.status === 'half') return <p role="status" className={STATUS_CLASS}>Falta um passo. Confirme também pelo link enviado ao outro endereço.</p>
  if (state.status === 'done') return <p role="status" className={STATUS_CLASS}>E-mail alterado. Use o novo endereço para entrar.</p>
  if (state.status === 'invalid' || tokenHash === null || !TOKEN_HASH.test(tokenHash)) return <p className="text-base text-ink">{INVALID}</p>
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <Button type="submit" disabled={pending}>Confirmar troca de e-mail</Button>
    </form>
  )
}
