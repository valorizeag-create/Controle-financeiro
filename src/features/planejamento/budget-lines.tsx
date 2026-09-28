import Link from 'next/link'
import { ProgressBar } from '@/ui/progress-bar'
import type { BudgetLineView } from './view-model'

export function BudgetLines({ lines, showAdjust }: { lines: BudgetLineView[]; showAdjust: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {lines.map((line) => {
        const over = line.state === 'over'
        const nameId = `budget-line-${line.categoryId}`
        return (
          <li key={line.categoryId} className="flex flex-col gap-2 border-b border-line py-3.5 first:pt-0 last:border-b-0 last:pb-0">
            <div className="flex justify-between gap-3 text-[15px]">
              <span id={nameId} className="font-semibold text-ink">{line.name}</span>
              <span className="num text-[#3a3a3a]">{line.amountsText}</span>
            </div>
            <ProgressBar percent={line.percent} label={`Uso do planejado em ${line.name}`} tone={over ? 'over' : 'brand'} size="sm" />
            {over ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-amber-wash px-2.5 py-1 text-sm font-medium text-amber-ink">{line.statusText}</span>
                {showAdjust && line.adjustLabel && (
                  <Link href={line.adjustHref} aria-describedby={nameId} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-text">
                    {line.adjustLabel}
                  </Link>
                )}
              </div>
            ) : (
              <p className="m-0 text-sm text-muted">{line.statusText}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
