'use client'

import { useEffect, useState } from 'react'

const ANGLES = Array.from({ length: 10 }, (_, i) => (i / 10) * 2 * Math.PI)
const RADIUS = 56

function firstTime(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
  } catch {
    // Armazenamento bloqueado (janela anônima, site sem permissão): comemora, só não lembra.
  }
  return true
}

// Comemoração contida da meta concluída (princípio 12: celebrar na medida): dez pontinhos saem do
// centro e somem, uma vez só por meta neste aparelho. Puramente visual; o texto "Você chegou lá."
// é o que comunica. Fica dentro de um elemento com `relative`.
export function Celebrate({ id }: { id: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // O armazenamento do navegador só existe depois de montar; não dá para saber no render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (firstTime(`iris-meta-comemorada-${id}`)) setShow(true)
  }, [id])

  if (!show) return null
  return (
    <span data-celebrate aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {ANGLES.map((angle, i) => (
        <span
          key={i}
          className={`absolute size-1.5 animate-estoura rounded-full ${i % 2 ? 'bg-white' : 'bg-brand-ink'}`}
          style={{ '--x': `${Math.cos(angle) * RADIUS}px`, '--y': `${Math.sin(angle) * RADIUS}px` } as React.CSSProperties}
        />
      ))}
    </span>
  )
}
