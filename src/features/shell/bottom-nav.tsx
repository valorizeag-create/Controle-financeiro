'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { BOTTOM_NAV_ITEMS, isActive, isSheetRoute } from './nav-items'

export function BottomNav() {
  const pathname = usePathname()
  // Painéis (Anotar, Editar) têm navegação própria — a barra inferior
  // competiria por espaço e esconderia a rota atual.
  if (isSheetRoute(pathname)) return null
  const items = [...BOTTOM_NAV_ITEMS.slice(0, 2), 'anotar' as const, ...BOTTOM_NAV_ITEMS.slice(2)]
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid h-[72px] max-w-[480px] auto-cols-fr grid-flow-col items-start px-1 pt-2">
        {items.map((item) => {
          if (item === 'anotar') {
            return (
              <li key="anotar" className="flex justify-center">
                <Link href="/anotar" className="group -mt-7 flex flex-col items-center gap-1 text-xs font-semibold text-brand-ink">
                  <span className="flex size-14 items-center justify-center rounded-full bg-brand shadow-[0_4px_12px_rgba(18,40,1,.1)] transition-transform duration-150 ease-(--ease-suave) group-active:scale-90">
                    <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  Anotar
                </Link>
              </li>
            )
          }
          const active = isActive(pathname, item)
          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center gap-1 text-xs ${active ? 'font-semibold text-brand-ink' : 'font-medium text-inactive'}`}
              >
                <span className={`flex h-[30px] w-14 items-center justify-center rounded-full ${active ? 'bg-brand' : ''}`}>
                  <item.icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
