import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, type MonthKey } from '@/domain/dates'

type Props = { month: MonthKey; label: string; basePath?: string; query?: Record<string, string> }

export function MonthNav({ month, label, basePath = '/inicio', query = {} }: Props) {
  const link = 'flex size-11 items-center justify-center rounded-control text-[#262626] hover:bg-canvas'
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
  // `mes` primeiro no endereço; `query` (tipo, categoria, busca) nunca traz `mes`.
  const href = (m: MonthKey) => `${basePath}?${new URLSearchParams({ mes: m, ...query }).toString()}`
  return (
    <nav aria-label="Mês" className="flex h-[46px] items-center self-start rounded-panel border border-line bg-card">
      <Link href={href(addMonths(month, -1))} aria-label="Mês anterior" className={link}><ChevronLeft className="size-[18px]" aria-hidden="true" /></Link>
      <span className="px-1.5 text-sm font-semibold text-ink">{capitalized}</span>
      <Link href={href(addMonths(month, 1))} aria-label="Próximo mês" className={link}><ChevronRight className="size-[18px]" aria-hidden="true" /></Link>
    </nav>
  )
}
