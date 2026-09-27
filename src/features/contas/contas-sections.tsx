import Link from 'next/link'
import type { MonthKey } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { ListCard, ListRow, ListSection, RowLink } from '@/ui/list'
import type { ContasItem, ContasTab, RecurringItem } from './view-model'
import { PayBillButton } from './pay-button'

const TAB_LABELS: Record<ContasTab, string> = { 'a-pagar': 'A pagar', pagas: 'Pagas', vencidas: 'Vencidas' }
const TABS: ContasTab[] = ['a-pagar', 'pagas', 'vencidas']

const EMPTY_BILLS: Record<ContasTab, string> = {
  'a-pagar': 'Nenhuma conta a pagar neste mês.',
  pagas: 'Nenhuma conta paga neste mês.',
  vencidas: 'Nenhuma conta vencida.',
}

export function contasHref(month: MonthKey, tab: ContasTab): string {
  return tab === 'a-pagar' ? `/contas?mes=${month}` : `/contas?mes=${month}&aba=${tab}`
}

export function ContasTabs({ month, tab, counts }: { month: MonthKey; tab: ContasTab; counts: Record<ContasTab, number> }) {
  return (
    <nav aria-label="Situação das contas" className="grid grid-cols-3 gap-1 rounded-panel bg-sunken p-1">
      {TABS.map((t) => {
        const current = t === tab
        return (
          <Link
            key={t}
            href={contasHref(month, t)}
            aria-current={current ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-control px-3 text-[15px] font-medium text-ink ${
              current ? 'bg-card font-semibold shadow-[0_1px_2px_rgba(18,40,1,.08)]' : ''
            }`}
          >
            {TAB_LABELS[t]} · {counts[t]}
          </Link>
        )
      })}
    </nav>
  )
}

function BillRow({ bill, showButton, back }: { bill: ContasItem; showButton: boolean; back: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] text-ink">{bill.name}</span>
        <span className="text-[13px] text-muted">{bill.caption}</span>
      </span>
      {showButton && <PayBillButton id={bill.id} name={bill.name} back={back} short />}
    </div>
  )
}

export function BillsList({ tab, bills, back }: { tab: ContasTab; bills: ContasItem[]; back: string }) {
  if (bills.length === 0) {
    return <p className="rounded-card border border-dashed border-line bg-card p-5 text-[15px]">{EMPTY_BILLS[tab]}</p>
  }
  const showButton = tab !== 'pagas'
  return (
    <ListCard>
      {bills.map((bill) => (
        <ListRow key={bill.id}>
          <BillRow bill={bill} showButton={showButton} back={back} />
        </ListRow>
      ))}
    </ListCard>
  )
}

export function IncomeList({ items }: { items: ContasItem[] }) {
  return (
    <ListSection title="Entradas a receber">
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card p-5 text-[15px]">Nenhuma entrada prevista neste mês.</p>
      ) : (
        <ListCard>
          {items.map((item) => (
            <ListRow key={item.id}>
              <div className="flex min-h-16 items-center gap-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] text-ink">{item.name}</span>
                  <span className="text-[13px] text-muted">{item.caption}</span>
                </span>
                <Link
                  href={`/contas/receber/${item.id}`}
                  aria-label={`Recebi ${item.name}`}
                  className="shrink-0 rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas flex min-h-11 items-center"
                >
                  Recebi
                </Link>
              </div>
            </ListRow>
          ))}
        </ListCard>
      )}
    </ListSection>
  )
}

export function RecurringList({ title, items, empty }: { title: string; items: RecurringItem[]; empty: string }) {
  return (
    <ListSection title={title}>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card p-5 text-[15px]">{empty}</p>
      ) : (
        <ListCard>
          {items.map((item) => (
            <ListRow key={item.id}>
              <RowLink href={`/contas/recorrencia/${item.id}`} title={item.name} detail={item.caption} value={formatBRL(item.amountCents)} />
            </ListRow>
          ))}
        </ListCard>
      )}
    </ListSection>
  )
}
