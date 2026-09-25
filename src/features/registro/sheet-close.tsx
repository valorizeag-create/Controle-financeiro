'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/ui/button'
import { ConfirmPanel } from '@/ui/confirm'

export function SheetClose({ href }: { href: string }) {
  const [asking, setAsking] = useState(false)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const keepEditing = useCallback(() => {
    setAsking(false)
    linkRef.current?.focus()
  }, [])

  return (
    <>
      <Link
        ref={linkRef}
        href={href}
        aria-label="Fechar"
        onClick={(e) => {
          // O formulário marca data-dirty quando há algo digitado e não salvo; restringe a busca ao
          // painel do Anotar (data-sheet) para não reagir a um rascunho de outra parte da página.
          if (e.currentTarget.closest('[data-sheet]')?.querySelector('form[data-dirty="true"]')) {
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
