'use client'

import { usePathname } from 'next/navigation'
import { isSheetRoute } from './nav-items'

// O layout é Server Component e não sabe a rota atual; este invólucro cliente
// reserva o espaço da barra inferior só onde ela aparece. Nos painéis (Anotar,
// Editar) o espaço sobrava como uma faixa vazia no fim da tela.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className={`flex-1 ${isSheetRoute(pathname) ? '' : 'pb-28 md:pb-10'}`}>{children}</div>
}
