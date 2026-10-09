import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { formatBRL } from '@/domain/money'
import { PayBillButton } from '@/features/contas/pay-button'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'
import { ProgressBar } from '@/ui/progress-bar'
import { payFamilyBill } from './money-actions'
import type { FamilyMonthView } from './view-model'

const H2 = 'text-[17px] font-semibold text-ink'
const SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink transition-[background-color,transform] duration-150 ease-(--ease-suave) hover:bg-canvas active:scale-[0.97]'
const SEE_ALL = '-my-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text'

function TotalCard({ view }: { view: FamilyMonthView }) {
  const month = view.label.split(' de ')[0]
  return (
    <Card labelledBy="gastos-familia" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="gastos-familia" className="text-sm font-medium text-muted">Gastos da família em {month}</h2>
        <Money cents={view.totalCents} className="text-[34px] font-bold leading-tight text-ink" />
        <p className="text-sm text-muted">Aqui aparecem só os gastos marcados como da família.</p>
      </div>
      <ul className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        {view.byMember.map((m) => (
          <li key={m.label} className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-wash text-sm font-semibold text-brand-text-hover">{m.initial}</span>
            <span className="flex-1 text-[15px] text-ink">{m.label}</span>
            <Money cents={m.cents} className="text-[15px] font-medium text-ink" />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function EmptyCard() {
  return (
    <Card className="flex flex-col items-start gap-3.5 border-dashed">
      <p className="text-[17px] font-medium text-ink">
        Nenhum gasto da família neste mês. Quando alguém marcar um gasto como da família, ele aparece aqui.
      </p>
      <Button href="/anotar">Anotar gasto</Button>
    </Card>
  )
}

function Bills({ bills }: { bills: FamilyMonthView['bills'] }) {
  return (
    <section aria-labelledby="contas-familia" className="flex flex-col gap-3.5 rounded-card border border-line bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 id="contas-familia" className={H2}>Contas da família</h2>
        <Link href="/familia/contas" className={SEE_ALL}>Ver todas</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {bills.map((b) => (
          <li key={b.id} className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p><strong className="font-medium text-ink">{b.name}</strong> {b.due}</p>
              <Money cents={b.amountCents} className="text-sm text-muted" />
            </div>
            <PayBillButton id={b.id} name={b.name} back="/inicio/familia" action={payFamilyBill} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Categories({ categories }: { categories: FamilyMonthView['categories'] }) {
  return (
    <Card labelledBy="casa-categorias" className="flex flex-col gap-4 lg:col-span-2">
      <h2 id="casa-categorias" className={H2}>Para onde vai o dinheiro da casa</h2>
      <ul className="flex flex-col gap-3.5">
        {categories.map((c) => (
          <li key={c.label} className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2.5 text-[15px]">
            <span className="min-w-0 truncate text-ink">{c.label}</span>
            <span className="h-2 rounded-full bg-spend" style={{ width: `${Math.max(c.percent, 4)}%` }} aria-hidden="true" />
            <Money cents={c.cents} className="text-right text-ink" />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Goals({ goals }: { goals: FamilyMonthView['goals'] }) {
  return (
    <section aria-labelledby="metas-familia" className="flex flex-col gap-4 rounded-card border border-line bg-card p-5 shadow-card lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 id="metas-familia" className={H2}>Metas da família</h2>
        <Link href="/metas" className={SEE_ALL}>Ver metas</Link>
      </div>
      <ul className="flex flex-col gap-5">
        {goals.map((g) => (
          <li key={g.id} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-ink">{g.name}</span>
              <span className="text-sm font-semibold text-brand-text">{g.percent}%</span>
            </div>
            <ProgressBar percent={g.percent} label={`Progresso de ${g.name}`} />
            <p className="text-[15px] text-ink">{g.remainingCents > 0 ? `Faltam ${formatBRL(g.remainingCents)} para ${g.name}.` : 'Meta completa'}</p>
            <p className="text-sm text-muted">{formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}</p>
            <p className="text-sm text-muted">Sua parte: {formatBRL(g.myPartCents)}</p>
            <Link href={`/metas/${g.id}/guardar`} aria-label={`Guardar dinheiro em ${g.name}`} className={SECONDARY}>Guardar dinheiro</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Recent({ recent }: { recent: FamilyMonthView['recent'] }) {
  return (
    <Card labelledBy="ultimos-familia" className="flex flex-col gap-3.5">
      <h2 id="ultimos-familia" className={H2}>Últimos gastos da família</h2>
      <ul className="flex flex-col gap-1">
        {recent.map((r) => {
          const body = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-panel bg-sunken text-[#262626]"><Receipt className="size-5" aria-hidden="true" /></span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] text-ink">{r.title}</span><span className="text-[13px] text-muted">{r.caption}</span></span>
              <span className="num text-[15px] font-medium text-ink">− <Money cents={r.amountCents} /></span>
            </>
          )
          return (
            <li key={r.id}>
              {r.href ? (
                <Link href={r.href} className="flex min-h-11 items-center gap-3 py-1.5">{body}</Link>
              ) : (
                <div className="flex min-h-11 items-center gap-3 py-1.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function FamilyMonth({ view }: { view: FamilyMonthView }) {
  return (
    <>
      <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
        {view.empty ? <EmptyCard /> : <TotalCard view={view} />}
        {view.bills.length > 0 && <Bills bills={view.bills} />}
        {!view.empty && view.categories.length > 0 && <Categories categories={view.categories} />}
        {view.goals.length > 0 && <Goals goals={view.goals} />}
        {!view.empty && view.recent.length > 0 && <Recent recent={view.recent} />}
      </div>
      <p className="px-1 pb-2 text-sm text-muted">O Disponível e as entradas de cada pessoa nunca aparecem aqui.</p>
    </>
  )
}
