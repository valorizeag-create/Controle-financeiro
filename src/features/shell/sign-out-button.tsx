'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/features/auth/actions'
import { disablePush } from '@/features/notificacoes/push-client'
import { ConfirmAction } from '@/ui/confirm'

// A limpeza do push nunca segura a saída: passou de 4 s, sai do mesmo jeito.
export const PUSH_CLEANUP_MS = 4000
async function cleanupPush(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      disablePush(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, PUSH_CLEANUP_MS) }),
    ])
  } catch {
    // segue para a saída
  } finally {
    clearTimeout(timer)
  }
}

export function SignOutButton({ variant }: { variant: 'icon' | 'row' }) {
  const isIcon = variant === 'icon'
  return (
    <ConfirmAction
      trigger={
        isIcon ? (
          <LogOut className="size-[18px]" aria-hidden="true" />
        ) : (
          <>
            <LogOut className="size-5" strokeWidth={1.8} aria-hidden="true" />
            <span className="flex-1 text-left">Sair da Íris</span>
          </>
        )
      }
      triggerAriaLabel={isIcon ? 'Sair da Íris' : undefined}
      triggerClassName={
        isIcon
          ? 'flex size-11 items-center justify-center rounded-full text-inactive hover:bg-canvas'
          : 'flex min-h-[52px] w-full items-center gap-3.5 text-base text-ink'
      }
      title="Sair da Íris?"
      body="Seus dados continuam salvos."
      confirmLabel="Sair"
      cancelLabel="Ficar"
      action={async () => {
        // Quem sai deixa de receber lembretes neste aparelho (apaga no banco e cancela no navegador).
        await cleanupPush()
        await signOut()
      }}
    />
  )
}
