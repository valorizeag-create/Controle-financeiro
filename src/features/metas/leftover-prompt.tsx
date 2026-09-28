'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/ui/button'
import { formatBRL } from '@/domain/money'
import { returnLeftover } from './movement-actions'

function ReturnButton() {
  // Desativa enquanto envia: um só toque devolve o valor.
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      Devolver
    </Button>
  )
}

export function LeftoverPrompt({ goalId, leftoverCents }: { goalId: string; leftoverCents: number }) {
  const title = `Sobraram ${formatBRL(leftoverCents)} na meta. Quer devolver para o seu mês?`

  return (
    <section role="dialog" aria-labelledby="sobra-titulo" className="flex flex-col gap-3.5 rounded-card bg-card p-6 shadow-sheet">
      <span className="text-sm font-medium text-brand-text">Anotado. Seu mês já está atualizado.</span>
      <h2 id="sobra-titulo" className="text-xl font-semibold leading-snug text-ink">{title}</h2>
      <div className="flex flex-col gap-2 pt-1.5">
        <Button href="/metas">Deixar guardado</Button>
        <form action={returnLeftover}>
          <input type="hidden" name="id" value={goalId} />
          <ReturnButton />
        </form>
      </div>
    </section>
  )
}
