import { ArrowDownLeft, Receipt } from 'lucide-react'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'
import type { SeuMesView } from './view-model'

export function RecentCard({ recent }: { recent: SeuMesView['recent'] }) {
  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="text-[17px] font-semibold text-ink">Últimos registros</h2>
      <ul className="flex flex-col gap-3.5">
        {recent.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-panel ${r.kind === 'income' ? 'bg-brand-wash text-brand-text-hover' : 'bg-sunken text-[#262626]'}`}>
              {r.kind === 'income' ? <ArrowDownLeft className="size-5" aria-hidden="true" /> : <Receipt className="size-5" aria-hidden="true" />}
            </span>
            <span className="flex flex-1 flex-col"><span className="text-[15px] text-ink">{r.title}</span><span className="text-[13px] text-muted">{r.subtitle}</span></span>
            <span className={`num text-[15px] ${r.kind === 'income' ? 'font-semibold text-brand-text-hover' : 'font-medium text-ink'}`}>
              {r.kind === 'income' ? '+ ' : '− '}<Money cents={r.cents} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
