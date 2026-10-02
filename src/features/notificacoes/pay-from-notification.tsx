'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmPanel, ConfirmSubmit } from '@/ui/confirm'

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
        <ConfirmSubmit>Marcar como paga</ConfirmSubmit>
      </form>
    </ConfirmPanel>
  )
}
