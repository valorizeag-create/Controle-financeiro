import { Plus } from 'lucide-react'
import { monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadCards } from '@/features/cartoes/queries'
import { buildCartoes } from '@/features/cartoes/view-model'
import { CardsList } from '@/features/cartoes/cards-list'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { WIDE } from '@/ui/columns'
import { Button } from '@/ui/button'
import { PageHeader } from '@/ui/page-header'

export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const today = todayInSaoPaulo()
  const { mes } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const [{ transactions }, cards] = await Promise.all([loadLedger(), loadCards()])
  const v = buildCartoes({ month, cards, transactions })
  return (
    <main className={`mx-auto flex max-w-[720px] ${WIDE} flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7`}>
      <div className="flex items-center gap-2">
        <div className="flex-1"><PageHeader title="Cartões" backHref="/mais" backOnMobileOnly /></div>
        <Button href="/cartoes/novo" className="min-h-11 gap-1.5 px-3.5 text-[15px]"><Plus className="size-[18px]" aria-hidden="true" />Adicionar</Button>
      </div>
      {cards.length > 0 && <MonthNav month={month} label={v.label} basePath="/cartoes" />}
      <CardsList items={v.items} />
      {cards.length > 0 && <p className="text-sm text-muted">A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão.</p>}
    </main>
  )
}
