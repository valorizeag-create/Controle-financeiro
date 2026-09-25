'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Plus } from 'lucide-react'
import { Logo } from '@/ui/logo'
import { signOut } from '@/features/auth/actions'
import { NAV_ITEMS } from './nav-items'

export function Sidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-line bg-card px-3.5 py-6 md:flex">
      <div className="px-2"><Logo /></div>
      <Link href="/anotar" className="flex h-[46px] items-center justify-center gap-2 rounded-panel bg-brand font-semibold text-brand-ink">
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />Anotar
      </Link>
      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={`flex h-11 items-center gap-3 rounded-control px-3 text-sm ${pathname === item.href ? 'bg-brand-wash font-semibold text-brand-ink' : 'font-medium text-inactive hover:bg-canvas'}`}
          >
            <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-3.5">
        <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
        <form action={signOut}>
          <button type="submit" aria-label="Sair da Íris" className="flex size-11 items-center justify-center rounded-full text-inactive hover:bg-canvas">
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  )
}
