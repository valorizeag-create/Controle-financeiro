import { Card } from '@/ui/card'
import { Money } from '@/ui/money'

export function CategoriesCard({ categories }: { categories: { name: string; cents: number; share: number }[] }) {
  const top = categories.slice(0, 4)
  const rest = categories.slice(4)
  const Row = ({ c }: { c: { name: string; cents: number; share: number } }) => (
    // A coluna do nome é flexível (minmax(0,6rem)) e trunca, e a do valor não
    // tem largura fixa (auto) — um valor fixo em 84px estourava com valores
    // grandes (ex.: R$ 10.000,00) em telas estreitas.
    <li className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2.5 text-[15px]">
      <span className="min-w-0 truncate text-ink">{c.name}</span>
      <span className="h-2 origin-left animate-encher rounded-full bg-spend" style={{ width: `${Math.max(c.share * 100, 4)}%` }} aria-hidden="true" />
      <Money cents={c.cents} className="text-right text-ink" />
    </li>
  )
  return (
    <Card className="flex flex-col gap-4 lg:col-span-2">
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
