import Link from 'next/link'
import { Button } from '@/ui/button'
import { Money } from '@/ui/money'
import { CardFace } from './card-face'
import type { CartoesItem } from './view-model'

export function CardsList({ items }: { items: CartoesItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-line px-6 py-10 text-center">
        <p className="text-[15px] text-muted">Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.</p>
        <Button href="/cartoes/novo">Adicionar</Button>
      </div>
    )
  }

  return (
    <div data-cards-grid className="grid gap-4 lg:grid-cols-2">
      {items.map(({ card, spentCents, spentLabel, gastosHref }) => (
        <article key={card.id} aria-label={card.nickname} className="flex flex-col gap-0">
          <Link href={`/cartoes/${card.id}`} aria-label={`Editar cartão ${card.nickname}`}>
            <CardFace nickname={card.nickname} kind={card.kind} color={card.color} brand={card.brand} />
          </Link>
          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-muted">{spentLabel}</span>
              <Money cents={spentCents} className="text-xl font-bold text-ink" />
            </div>
            <Link href={gastosHref} className="flex min-h-11 items-center text-[15px] font-medium text-brand-text hover:text-brand-text-hover">
              Ver gastos
            </Link>
          </div>
        </article>
      ))}
    </div>
  )
}
