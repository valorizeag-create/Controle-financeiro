'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { formatBRL, type Cents } from '@/domain/money'

const DURATION_MS = 700
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function prefersMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// O valor "conta" até o número certo: na primeira vez a partir de zero, depois a partir do valor
// anterior. O valor final fica sempre no texto (só fica transparente durante a contagem), então o
// leitor de tela e quem copia o texto recebem o número certo; os números contando são aria-hidden.
export function AnimatedMoney({ cents, className = '' }: { cents: Cents; className?: string }) {
  const [counting, setCounting] = useState<Cents | null>(null)
  // O último valor que de fato apareceu na tela. Não é o alvo: se o efeito for desfeito e refeito
  // (StrictMode, remontagem) antes do primeiro quadro, a contagem recomeça do mesmo ponto.
  const onScreen = useRef<Cents>(0)

  useLayoutEffect(() => {
    const origin = onScreen.current
    if (origin === cents || !prefersMotion()) {
      onScreen.current = cents
      return
    }
    let start: number | null = null
    let frame = requestAnimationFrame(function tick(now) {
      start ??= now
      const t = Math.min(1, (now - start) / DURATION_MS)
      const value = t < 1 ? Math.round(origin + (cents - origin) * easeOut(t)) : cents
      onScreen.current = value
      setCounting(t < 1 ? value : null)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      setCounting(null)
    }
  }, [cents])

  return (
    <span className={`num relative inline-block ${className}`} data-counting={counting === null ? undefined : ''}>
      <span className={counting === null ? undefined : 'text-transparent'}>{formatBRL(cents)}</span>
      {counting !== null && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 whitespace-nowrap">
          {formatBRL(counting)}
        </span>
      )}
    </span>
  )
}
