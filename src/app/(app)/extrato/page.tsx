import { todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadCards } from '@/features/cartoes/queries'
import { loadGoals } from '@/features/metas/queries'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { FiltersBar } from '@/features/extrato/filters-bar'
import { ExtratoList } from '@/features/extrato/extrato-list'
import { buildExtrato, extratoParams, parseExtratoFilters } from '@/features/extrato/view-model'

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const today = todayInSaoPaulo()
  const filters = parseExtratoFilters(await searchParams, today)
  const [{ categories, transactions, goalMovements }, cards, goals] = await Promise.all([loadLedger(), loadCards(), loadGoals()])
  const view = buildExtrato({ filters, today, categories, transactions, cards, goals, movements: goalMovements })
  // As setas do mês mantêm tipo, categoria, cartão e busca.
  const query = Object.fromEntries(Object.entries(extratoParams(view.filters)).filter(([key]) => key !== 'mes'))

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">Tudo o que entrou e saiu</h1>
        <MonthNav month={view.filters.month} label={view.monthLabel} basePath="/extrato" query={query} />
      </header>
      <FiltersBar filters={view.filters} categories={categories} categoryName={view.categoryName} cards={cards} cardName={view.cardName} />
      <ExtratoList view={view} />
    </main>
  )
}
