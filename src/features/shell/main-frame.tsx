'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { CONTENT_ID } from '@/ui/skip-link'
import { isSheetRoute } from './nav-items'

// Troca de tela suave (View Transitions): o React que o Next traz tem o ViewTransition; fora dele
// (testes, uma versão sem o recurso) a tela só troca, como antes. Navegador sem suporte também.
const ViewTransition = (React as { ViewTransition?: typeof React.ViewTransition }).ViewTransition

// O layout é Server Component e não sabe a rota atual; este invólucro cliente
// reserva o espaço da barra inferior só onde ela aparece. Nos painéis (Anotar,
// Editar) o espaço sobrava como uma faixa vazia no fim da tela. min-w-0: como item flexível, sem
// isso a área não fica mais estreita que o conteúdo, e uma nota longa (cortada com …) alargava a página.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div id={CONTENT_ID} tabIndex={-1} className={`min-w-0 flex-1 outline-none ${isSheetRoute(pathname) ? '' : 'pb-28 md:pb-10'}`}>
      {ViewTransition ? <ViewTransition default="troca-tela">{children}</ViewTransition> : children}
    </div>
  )
}
