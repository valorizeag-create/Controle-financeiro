import Link from 'next/link'
import { Money } from '@/ui/money'
import { PayBillButton } from '@/features/contas/pay-button'
import type { SeuMesView } from './view-model'

export function UpcomingBills({ items }: { items: SeuMesView['upcoming'] }) {
  return (
    <section aria-labelledby="proximas-contas" className="flex flex-col gap-3.5 rounded-card border border-line bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 id="proximas-contas" className="text-[17px] font-semibold text-ink">Próximas contas</h2>
        <Link href="/contas" className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text">Ver todas</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p>
                <strong className="font-medium text-ink">{item.name}</strong> {item.dueText}
              </p>
              <Money cents={item.amountCents} className="text-sm text-muted" />
            </div>
            <PayBillButton id={item.id} name={item.name} back="/inicio" />
          </li>
        ))}
      </ul>
    </section>
  )
}
