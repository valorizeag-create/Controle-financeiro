import { House, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

// Cada plano acrescenta seu item aqui (Extrato e Mais na Task 8 deste plano, Metas no Plano 5).
export const NAV_ITEMS: NavItem[] = [{ href: '/inicio', label: 'Seu mês', icon: House }]

// Painéis que cobrem a tela inteira (Anotar e Editar registro) têm navegação
// própria: sem barra inferior e sem o espaço reservado para ela.
export function isSheetRoute(pathname: string): boolean {
  if (pathname === '/anotar' || pathname.startsWith('/anotar/')) return true
  return /^\/extrato\/[^/]+$/.test(pathname)
}
