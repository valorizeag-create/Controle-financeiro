'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FLASH_COOKIE_NAME } from './flash-name'
import { readFlash } from './flash-read'

function readAndClear(): string | null {
  const message = readFlash(document.cookie)
  if (document.cookie.split('; ').some((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))) {
    document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
  }
  return message
}

// De quanto em quanto tempo o cookie do aviso é conferido com a aba visível.
const COOKIE_CHECK_MS = 500

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

  // Uma Server Action que redireciona para a MESMA tela (sair da família,
  // marcar a conta como paga em /familia/contas…) não troca a rota, e o efeito
  // acima não roda de novo. Por isso o aviso também acompanha o próprio cookie:
  // na hora em que ele muda, onde o navegador avisa (cookieStore), e por uma
  // conferida curta enquanto a aba está visível, que vale em qualquer navegador.
  // Ler apaga o cookie, então cada aviso aparece uma vez só, venha por onde vier.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const m = readAndClear()
      if (m) setShown({ text: m, id: Date.now() })
    }
    const store = (globalThis as { cookieStore?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> }).cookieStore
    const listens = typeof store?.addEventListener === 'function'
    if (listens) store!.addEventListener('change', check)
    document.addEventListener('visibilitychange', check)
    const timer = setInterval(check, COOKIE_CHECK_MS)
    return () => {
      if (listens) store!.removeEventListener('change', check)
      document.removeEventListener('visibilitychange', check)
      clearInterval(timer)
    }
  }, [])

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
        // `key`: um aviso novo (mesmo com o mesmo texto) é outro elemento, e a animação de entrada roda de novo.
        <p
          key={shown.id}
          role="status"
          className="flex animate-aparece items-center gap-2.5 rounded-card bg-brand-ink px-4 py-3.5 text-[15px] text-white shadow-[0_8px_24px_rgba(18,40,1,.16)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5 text-brand" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={24}
              className="animate-desenha"
            />
          </svg>
          {shown.text}
        </p>
      )}
    </div>
  )
}
