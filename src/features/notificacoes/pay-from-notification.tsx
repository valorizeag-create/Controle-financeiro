'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Button } from '@/ui/button'
import { ConfirmPanel } from '@/ui/confirm'

function Submit({ children }: { children: ReactNode }) {
  // Desativa enquanto a ação roda: dois toques não pagam duas vezes.
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending} className="w-full md:w-auto">{children}</Button>
}

// Aberto pelo toque na notificação: abrir a página nunca paga nada; só o botão de confirmar envia.
export function PayFromNotification({ id, name, back, action }: { id: string; name: string; back: string; action: (fd: FormData) => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <ConfirmPanel
      title={`Marcar ${name} como paga?`}
      cancelLabel="Agora não"
      onCancel={() => {
        setOpen(false)
        router.replace(back)
      }}
    >
      <form action={action} className="contents">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="volta" value={back} />
        <Submit>Marcar como paga</Submit>
      </form>
    </ConfirmPanel>
  )
}
