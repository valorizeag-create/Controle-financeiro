'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/ui/button'

export function AcceptInviteButton() {
  // Desativa enquanto envia: dois toques não aceitam o convite duas vezes (o
  // segundo responderia "já participa" a quem acabou de entrar).
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>Entrar na família</Button>
}
