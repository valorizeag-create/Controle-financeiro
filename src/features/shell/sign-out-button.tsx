'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/features/auth/actions'
import { ConfirmAction } from '@/ui/confirm'

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
      action={signOut}
    />
  )
}
