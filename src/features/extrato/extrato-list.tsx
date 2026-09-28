import Link from 'next/link'
import { ArrowDownLeft, Receipt, Target } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'
import { extratoHref, type ExtratoView } from './view-model'

export function ExtratoList({ view }: { view: ExtratoView }) {
  if (view.empty === 'no-records') {
    return (
      <Card className="flex flex-col items-start gap-3.5 border-dashed">
        <p className="text-[17px] font-medium text-ink">Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.</p>
        <Button href="/anotar">Anotar gasto</Button>
      </Card>
    )
  }
  if (view.empty === 'no-results') {
    return <p className="px-1 py-6 text-center text-[15px]">{`Nada encontrado para "${view.filters.q}". Tente outra palavra ou um valor.`}</p>
  }
  if (view.empty === 'no-matches') {
    // Entradas sem nenhum registro no mês tem um convite específico (Plano 2, fix round 1).
    if (view.filters.kind === 'income' && !view.filters.categoryId) {
      return (
        <Card className="flex flex-col items-start gap-3.5 border-dashed">
          <p className="text-[17px] font-medium text-ink">Nenhuma entrada este mês ainda. Registrar o que entrou ajuda a ver quanto está disponível.</p>
          <Button href="/anotar?tipo=entrada">Registrar entrada</Button>
        </Card>
      )
    }
    return (
      <div className="flex flex-col items-center gap-3 px-1 py-6 text-center">
        <p className="text-[15px]">Nenhum registro com esses filtros.</p>
        <Button href={extratoHref({ month: view.filters.month, kind: null, categoryId: null, cardId: null, q: '' })} variant="secondary">Limpar filtros</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {view.groups.map((g) => (
        <section key={g.date} aria-labelledby={`dia-${g.date}`} className="flex flex-col gap-2">
          <h2 id={`dia-${g.date}`} className="px-1 text-sm font-semibold text-inactive">{g.label}</h2>
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {g.rows.map((r) => (
              <li key={r.id} className="border-b border-line last:border-b-0">
                <Link href={r.href} className="flex min-h-[68px] items-center gap-3 px-4 py-3.5 hover:bg-canvas">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-panel ${
                      r.kind === 'income' || r.kind === 'goal' ? 'bg-brand-wash text-brand-text-hover' : 'bg-sunken text-[#262626]'
                    }`}
                  >
                    {r.kind === 'income' ? (
                      <ArrowDownLeft className="size-5" aria-hidden="true" />
                    ) : r.kind === 'goal' ? (
                      <Target className="size-5" aria-hidden="true" />
                    ) : (
                      <Receipt className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] text-ink">{r.title}</span>
                    {(r.subtitle || r.badge) && (
                      <span className="flex items-center gap-1.5">
                        {r.subtitle && <span className="text-[13px] text-muted">{r.subtitle}</span>}
                        {r.badge && <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-inactive">{r.badge}</span>}
                      </span>
                    )}
                  </span>
                  <span
                    className={`num shrink-0 text-[15px] ${
                      r.kind === 'income' ? 'font-semibold text-brand-text-hover' : r.kind === 'goal' ? 'font-semibold text-brand-text' : 'font-medium text-ink'
                    }`}
                  >
                    {r.kind === 'income' ? '+ ' : r.kind === 'expense' ? '− ' : ''}
                    <Money cents={r.cents} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
