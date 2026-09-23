import { ArrowDownLeft, ArrowUpRight, CircleHelp, Target } from 'lucide-react'
import { Money } from '@/ui/money'
import type { MonthSummary } from '@/domain/summary'

export function Hero({ summary }: { summary: MonthSummary }) {
  const s = summary
  return (
    <section className="flex flex-col gap-3.5 rounded-hero border border-brand-wash-border bg-brand-wash p-5 md:col-span-2 md:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-brand-text">Disponível</h2>
        <details className="relative">
          <summary aria-label="O que é Disponível?" className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-card text-brand-text [&::-webkit-details-marker]:hidden">
            <CircleHelp className="size-[18px]" aria-hidden="true" />
          </summary>
          <p className="absolute right-0 top-11 z-10 w-64 rounded-card border border-line bg-card p-3 text-sm shadow-card">
            O que entrou, menos o que saiu e o que você guardou neste mês.
          </p>
        </details>
      </div>
      <p data-testid="disponivel" className="num text-[clamp(32px,11vw,44px)] font-bold leading-none text-brand-ink md:text-[56px]">
        <Money cents={s.disponivelCents} />
      </p>
      <div className="flex items-center justify-between rounded-panel bg-card px-3.5 py-3">
        <span className="text-sm">Disponível depois das contas</span>
        <Money cents={s.disponivelDepoisContasCents} className="break-words font-semibold text-brand-ink" />
      </div>
      <dl className="grid grid-cols-3 gap-2 pt-1">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="flex items-center gap-1 text-[13px]"><ArrowDownLeft className="size-3.5 text-brand-text-hover" aria-hidden="true" />Entrou</dt>
          <dd><Money cents={s.entrouCents} className="break-words text-base font-semibold text-ink" /></dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="flex items-center gap-1 text-[13px]"><ArrowUpRight className="size-3.5" aria-hidden="true" />Saiu</dt>
          <dd><Money cents={s.saiuCents} className="break-words text-base font-semibold text-ink" /></dd>
        </div>
        {s.goalLine && (
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="flex items-center gap-1 text-[13px]"><Target className="size-3.5" aria-hidden="true" />{s.goalLine.label}</dt>
            <dd><Money cents={s.goalLine.amountCents} className="break-words text-base font-semibold text-ink" /></dd>
          </div>
        )}
      </dl>
    </section>
  )
}
