import { Ellipsis, House, ReceiptText, SlidersHorizontal, Tag, type LucideIcon } from 'lucide-react'

// `match`: caminhos que marcam o item como atual (a página e as subpáginas).
export type NavItem = { href: string; label: string; icon: LucideIcon; match: string[] }

const SEU_MES: NavItem = { href: '/inicio', label: 'Seu mês', icon: House, match: ['/inicio'] }
const EXTRATO: NavItem = { href: '/extrato', label: 'Extrato', icon: ReceiptText, match: ['/extrato'] }

// Barra inferior (celular). O botão Anotar entra na 3ª posição (bottom-nav.tsx).
// Metas entra antes de Mais no Plano 5 (A5: Seu mês · Extrato · Anotar · Metas · Mais).
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  SEU_MES,
  EXTRATO,
  { href: '/mais', label: 'Mais', icon: Ellipsis, match: ['/mais', '/categorias', '/configuracoes'] },
]

// Menu lateral (desktop): todas as áreas que já existem, sem a página "Mais".
export const SIDEBAR_ITEMS: NavItem[] = [
  SEU_MES,
  EXTRATO,
  { href: '/categorias', label: 'Categorias', icon: Tag, match: ['/categorias'] },
  { href: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal, match: ['/configuracoes'] },
]

export function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Painéis que cobrem a tela inteira (Anotar e Editar registro) têm navegação
// própria: sem barra inferior e sem o espaço reservado para ela.
export function isSheetRoute(pathname: string): boolean {
  if (pathname === '/anotar' || pathname.startsWith('/anotar/')) return true
  return /^\/extrato\/[^/]+$/.test(pathname)
}
