import { Card } from '@/ui/card'
import { Money } from '@/ui/money'

export function CategoriesCard({ categories }: { categories: { name: string; cents: number; share: number }[] }) {
  const top = categories.slice(0, 4)
  const rest = categories.slice(4)
  const Row = ({ c }: { c: { name: string; cents: number; share: number } }) => (
    <li className="grid grid-cols-[92px_1fr_84px] items-center gap-2.5 text-[15px]">
      <span className="truncate text-ink">{c.name}</span>
      <span className="h-2 rounded-full bg-spend" style={{ width: `${Math.max(c.share * 100, 4)}%` }} aria-hidden="true" />
      <Money cents={c.cents} className="text-right text-ink" />
    </li>
  )
  return (
    <Card className="flex flex-col gap-4 md:col-span-2">
      <h2 className="text-[17px] font-semibold text-ink">Para onde seu dinheiro vai</h2>
      <ul className="flex flex-col gap-3.5">{top.map((c) => <Row key={c.name} c={c} />)}</ul>
      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center font-medium text-brand-text">
            Ver mais {rest.length} {rest.length === 1 ? 'categoria' : 'categorias'}
          </summary>
          <ul className="flex flex-col gap-3.5 pt-2">{rest.map((c) => <Row key={c.name} c={c} />)}</ul>
        </details>
      )}
    </Card>
  )
}
