import Link from 'next/link'
import { BudgetLines } from '@/features/planejamento/budget-lines'
import type { PlannedCardView } from '@/features/planejamento/view-model'

export function PlannedCard({ card }: { card: PlannedCardView }) {
  return (
    <section
      aria-labelledby="planejado"
      className="flex flex-col gap-4 rounded-card border border-line bg-card p-5 shadow-card md:col-span-2"
    >
      <div className="flex items-center justify-between">
        <h2 id="planejado" className="text-[17px] font-semibold text-ink">Planejado</h2>
        <Link href="/planejamento" className="-my-2 inline-flex min-h-11 items-center text-[15px] font-medium text-brand-text">Ver planejamento</Link>
      </div>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[15px] text-ink">{card.leadText}</p>
        <p className="m-0 text-[15px] text-[#3a3a3a]">{card.withinText}</p>
      </div>
      <BudgetLines lines={card.lines} showAdjust={false} />
    </section>
  )
}
