'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Logo } from '@/ui/logo'
import { SIDEBAR_ITEMS, isActive } from './nav-items'
import { SignOutButton } from './sign-out-button'

export function Sidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-line bg-card px-3.5 py-6 md:flex">
      <div className="px-2"><Logo /></div>
      <Link href="/anotar" className="flex h-[46px] items-center justify-center gap-2 rounded-panel bg-brand font-semibold text-brand-ink">
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />Anotar
      </Link>
      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {SIDEBAR_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-control px-3 text-sm ${active ? 'bg-brand-wash font-semibold text-brand-ink' : 'font-medium text-inactive hover:bg-canvas'}`}
            >
              <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-3.5">
        <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
        <SignOutButton variant="icon" />
      </div>
    </aside>
  )
}
