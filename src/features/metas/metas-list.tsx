import Link from 'next/link'
import { Button } from '@/ui/button'
import { Money } from '@/ui/money'
import { formatCompactBRL } from '@/domain/money'
import { ProgressBar } from '@/ui/progress-bar'
import type { MetasView } from './view-model'

export function MetasList({ view }: { view: MetasView }) {
  if (view.empty) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-card border border-dashed border-[#d4d4d4] bg-card px-5 py-6 text-center">
        <p className="text-[15px] leading-relaxed text-ink">
          Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?
        </p>
        <Button href="/metas/nova">Criar meta</Button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center justify-between rounded-card bg-sunken px-4 py-3.5 text-[15px]">
        <span>Guardado em metas</span>
        <Money cents={view.totalCents} className="font-semibold text-ink" />
      </section>

      {view.active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-inactive">Só suas</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {view.active.map((s) => (
              <Link
                key={s.goal.id}
                href={`/metas/${s.goal.id}`}
                className="flex flex-col gap-3 rounded-card border border-line bg-card p-[18px] text-ink shadow-card"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold text-ink">{s.goal.name}</span>
                  <span className="text-sm font-semibold text-brand-text">{s.percent}%</span>
                </div>
                <ProgressBar percent={s.percent} label={`Progresso de ${s.goal.name}`} />
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>{s.shortRemaining}</span>
                  <span>{s.deadlineShort}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {view.family.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-inactive">Da família</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {view.family.map((f) => (
              <Link
                key={f.id}
                href={`/metas/${f.id}`}
                className="flex flex-col gap-3 rounded-card border border-line bg-card p-[18px] text-ink shadow-card"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold text-ink">{f.name}</span>
                  <span className="text-sm font-semibold text-brand-text">{f.percent}%</span>
                </div>
                <ProgressBar percent={f.percent} label={`Progresso de ${f.name}`} />
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>{f.remainingCents === 0 ? 'Meta completa' : `Faltam ${formatCompactBRL(f.remainingCents)}`}</span>
                  <span>{`Sua parte: ${formatCompactBRL(f.myPartCents)}`}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {view.concluded.length > 0 && (
        <section aria-labelledby="metas-concluidas" className="flex flex-col gap-1 rounded-card border border-dashed border-[#d4d4d4] p-4">
          <h2 id="metas-concluidas" className="text-sm font-semibold text-ink">Concluídas</h2>
          <div className="flex flex-col">
            {view.concluded.map((c) => (
              <Link key={c.id} href={`/metas/${c.id}`} className="flex min-h-11 items-center text-sm text-muted">
                {c.caption}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
