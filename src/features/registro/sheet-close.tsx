'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/ui/button'
import { ConfirmPanel } from '@/ui/confirm'

export function SheetClose({ href }: { href: string }) {
  const [asking, setAsking] = useState(false)
  const keepEditing = useCallback(() => setAsking(false), [])

  return (
    <>
      <Link
        href={href}
        aria-label="Fechar"
        onClick={(e) => {
          // O formulário marca data-dirty quando há algo digitado e não salvo.
          if (document.querySelector('form[data-dirty="true"]')) {
            e.preventDefault()
            setAsking(true)
          }
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sunken text-[#262626]"
      >
        <X className="size-5" aria-hidden="true" />
      </Link>
      {asking && (
        <ConfirmPanel title="Descartar este registro?" body="O que você digitou não será salvo." cancelLabel="Continuar editando" onCancel={keepEditing}>
          <Button href={href} className="w-full md:w-auto">Descartar</Button>
        </ConfirmPanel>
      )}
    </>
  )
}
