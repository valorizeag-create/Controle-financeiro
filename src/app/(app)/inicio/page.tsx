import { ShoppingCart } from 'lucide-react'
import { monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadGoals } from '@/features/metas/queries'
import { loadBudgets } from '@/features/planejamento/queries'
import { loadFamilySummaryOrNull } from '@/features/familia/queries'
import { ViewSwitch } from '@/features/familia/view-switch'
import { buildSeuMes } from '@/features/seu-mes/view-model'
import { Hero } from '@/features/seu-mes/hero'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { CategoriesCard } from '@/features/seu-mes/categories-card'
import { FeaturedGoal } from '@/features/seu-mes/featured-goal'
import { PlannedCard } from '@/features/seu-mes/planned-card'
import { RecentCard } from '@/features/seu-mes/recent-card'
import { UpcomingBills } from '@/features/seu-mes/upcoming-bills'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const today = todayInSaoPaulo()
  const { mes } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  // O seletor Eu · Família só aparece para quem tem família; os números pessoais não dependem dele (RNF-11).
  const [{ profile, categories, transactions, goalMovements }, goals, budgets, family] = await Promise.all([
    loadLedger(),
    loadGoals(),
    loadBudgets([month]),
    loadFamilySummaryOrNull(),
  ])
  const v = buildSeuMes({ month, today, profile, categories, transactions, goals, goalMovements, budgets })

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">Seu mês até agora</span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[26px]">Oi, {profile.displayName}.</h1>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {family && <ViewSwitch month={month} current="eu" />}
          <MonthNav month={month} label={v.label} />
        </div>
      </header>

      <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
        <Hero summary={v.summary} />

        <div className="flex flex-col gap-3 md:gap-4">
          {v.biggest ? (
            <Card className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-panel bg-sunken text-[#262626]"><ShoppingCart className="size-5" aria-hidden="true" /></span>
              <p>Seu maior gasto foi com <strong className="text-ink">{v.biggest.name}</strong>: <Money cents={v.biggest.cents} />.</p>
            </Card>
          ) : (
            <Card className="flex flex-col items-start gap-3.5 border-dashed">
              <p className="text-[17px] font-medium text-ink">
                {v.isCurrentMonth ? 'Seu mês começa aqui. Anote o primeiro gasto e veja ele ganhar forma.' : 'Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.'}
              </p>
              <Button href="/anotar">{v.isCurrentMonth ? 'Anotar primeiro gasto' : 'Anotar gasto'}</Button>
            </Card>
          )}
          <section className="flex flex-col gap-2 rounded-card bg-sunken p-4">
            <div className="flex justify-between"><span>Saldo total</span><Money cents={v.summary.saldoTotalCents} className="font-semibold text-ink" /></div>
            <div className="flex justify-between text-sm text-muted"><span>Guardado</span><Money cents={v.summary.guardadoTotalCents} /></div>
          </section>
        </div>

        {v.upcoming.length > 0 && <UpcomingBills items={v.upcoming} />}
        {v.planned && <PlannedCard card={v.planned} />}
        {v.categories.length > 0 && <CategoriesCard categories={v.categories} />}
        {v.featured && <FeaturedGoal goal={v.featured} />}
        {v.recent.length > 0 && <RecentCard recent={v.recent} />}
      </div>
    </main>
  )
}
