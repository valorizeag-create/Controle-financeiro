'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { FLASH_COOKIE_NAME } from './flash-name'
import { readFlash } from './flash-read'

function readAndClear(): string | null {
  const message = readFlash(document.cookie)
  if (document.cookie.split('; ').some((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))) {
    document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
  }
  return message
}

// `id` diferencia duas mensagens iguais seguidas: cada uma ganha seu próprio prazo.
type Shown = { text: string; id: number }

export function Toast() {
  const [shown, setShown] = useState<Shown | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    // O layout autenticado fica montado entre navegações do App Router, então
    // precisamos reler o cookie a cada troca de rota — é assim que o aviso
    // aparece depois que a Server Action de /anotar redireciona para /inicio.
    const m = readAndClear()
    if (!m) return
    // Sincronizando com um sistema externo (cookie do navegador) que só existe
    // após a montagem — não há como saber esse valor durante o render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ text: m, id: Date.now() })
  }, [pathname])

  // O prazo de 4 s fica num efeito próprio, ligado à mensagem e não à rota:
  // trocar de página antes dos 4 s não cancela o prazo, e o aviso não fica preso.
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 4000)
    return () => clearTimeout(t)
  }, [shown])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-30 flex justify-center md:bottom-8">
      {shown && (
        <p role="status" className="flex items-center gap-2.5 rounded-card bg-brand-ink px-4 py-3.5 text-[15px] text-white shadow-[0_8px_24px_rgba(18,40,1,.16)]">
          <Check className="size-5 text-brand" aria-hidden="true" />
          {shown.text}
        </p>
      )}
    </div>
  )
}
