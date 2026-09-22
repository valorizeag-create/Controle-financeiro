import { House, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

// Cada plano acrescenta seu item aqui (Extrato no Plano 2, Metas no Plano 5, Mais no Plano 2).
export const NAV_ITEMS: NavItem[] = [{ href: '/inicio', label: 'Seu mês', icon: House }]
