import Link from 'next/link'
import type { MonthKey } from '@/domain/dates'

export function ViewSwitch({ month, current }: { month: MonthKey; current: 'eu' | 'familia' }) {
  const items = [
    { key: 'eu', label: 'Eu', href: `/inicio?mes=${month}` },
    { key: 'familia', label: 'Família', href: `/inicio/familia?mes=${month}` },
  ] as const
  return (
    <nav aria-label="Ver o mês de" className="grid h-[52px] w-fit grid-cols-2 gap-1 self-start rounded-panel bg-sunken p-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === current ? 'page' : undefined}
          className={`flex min-h-11 min-w-20 items-center justify-center rounded-control px-4 text-[15px] font-medium text-ink ${
            i.key === current ? 'bg-card font-semibold shadow-[0_1px_2px_rgba(18,40,1,.08)]' : ''
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
