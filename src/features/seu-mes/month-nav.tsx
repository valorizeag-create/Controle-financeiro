import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, type MonthKey } from '@/domain/dates'

export function MonthNav({ month, label }: { month: MonthKey; label: string }) {
  const link = 'flex size-11 items-center justify-center rounded-control text-[#262626] hover:bg-canvas'
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <nav aria-label="Mês" className="flex h-[46px] items-center rounded-panel border border-line bg-card">
      <Link href={`/inicio?mes=${addMonths(month, -1)}`} aria-label="Mês anterior" className={link}><ChevronLeft className="size-[18px]" aria-hidden="true" /></Link>
      <span className="px-1.5 text-sm font-semibold text-ink">{capitalized}</span>
      <Link href={`/inicio?mes=${addMonths(month, 1)}`} aria-label="Próximo mês" className={link}><ChevronRight className="size-[18px]" aria-hidden="true" /></Link>
    </nav>
  )
}
