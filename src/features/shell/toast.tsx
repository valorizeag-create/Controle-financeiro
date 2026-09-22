'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { FLASH_COOKIE_NAME } from './flash-name'

function readAndClear(): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))
  if (!match) return null
  document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
  return decodeURIComponent(match.split('=')[1])
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    const m = readAndClear()
    if (!m) return
    // Sincronizando com um sistema externo (cookie do navegador) que só existe
    // após a montagem — não há como saber esse valor durante o render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(m)
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-30 flex justify-center md:bottom-8">
      {message && (
        <p role="status" className="flex items-center gap-2.5 rounded-card bg-brand-ink px-4 py-3.5 text-[15px] text-white shadow-[0_8px_24px_rgba(18,40,1,.16)]">
          <Check className="size-5 text-brand" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  )
}
