import Link from 'next/link'
import { Button } from '@/ui/button'
import { ProgressBar } from '@/ui/progress-bar'
import type { SeuMesView } from './view-model'

export function FeaturedGoal({ goal }: { goal: NonNullable<SeuMesView['featured']> }) {
  return (
    <section
      aria-labelledby="meta-destaque"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-card p-5 shadow-card lg:col-span-2"
    >
      <div className="flex items-center justify-between">
        <h2 id="meta-destaque" className="text-[17px] font-semibold text-ink">Meta em destaque</h2>
        <Link href="/metas" className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text">Ver metas</Link>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-ink">{goal.name}</span>
        <span className="text-sm font-semibold text-brand-text">{goal.percent}%</span>
      </div>
      <ProgressBar percent={goal.percent} label={`Progresso de ${goal.name}`} />
      <p className="text-[15px] text-ink">{goal.remainingText}</p>
      <p className="text-sm text-muted">{goal.caption}</p>
      <Button variant="secondary" href={goal.guardarHref}>Guardar dinheiro</Button>
    </section>
  )
}
