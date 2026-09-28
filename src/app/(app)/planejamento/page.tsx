import { addMonths, monthLabel, monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadBudgets } from '@/features/planejamento/queries'
import { repeatPreviousBudgets } from '@/features/planejamento/actions'
import { buildPlanejamento } from '@/features/planejamento/view-model'
import { BudgetLines } from '@/features/planejamento/budget-lines'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { FormAlert } from '@/ui/form-alert'
import { Money } from '@/ui/money'
import { PageHeader } from '@/ui/page-header'

type Props = { searchParams: Promise<{ mes?: string; erro?: string }> }

export default async function PlanejamentoPage({ searchParams }: Props) {
  const { mes, erro } = await searchParams
  const today = todayInSaoPaulo()
  const month = parseMonthKey(mes) ?? monthOf(today)
  const [{ categories, transactions }, budgets] = await Promise.all([loadLedger(), loadBudgets([month, addMonths(month, -1)])])
  const v = buildPlanejamento({ month, today, categories, transactions, budgets })

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 pb-6 md:px-9 md:pt-7">
      <PageHeader title="Quanto você quer usar este mês" backHref="/mais" backOnMobileOnly />
      <p className="m-0 text-[15px] text-ink">Defina um valor para cada área. A Íris mostra quanto ainda está disponível.</p>
      <MonthNav month={month} label={monthLabel(month)} basePath="/planejamento" />

      {erro === '1' && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}

      {v.empty ? (
        <Card className="flex flex-col items-start gap-3.5 border-dashed">
          <p className="m-0 text-[17px] font-medium text-ink">
            Você ainda não planejou este mês. Defina quanto quer usar em cada área e a Íris acompanha para você.
          </p>
          <Button href={v.editHref}>Planejar meu mês</Button>
          {v.repeatFrom && (
            <form action={repeatPreviousBudgets}>
              <input type="hidden" name="month" value={month} />
              <Button variant="secondary" type="submit">{v.repeatFrom.label}</Button>
            </form>
          )}
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-1.5 rounded-card border border-brand-wash-border bg-brand-wash p-4">
            <span className="text-sm text-brand-text">{v.heroLabel}</span>
            <Money cents={v.totalCents} className="text-[26px] font-bold tracking-tight text-brand-ink" />
            <span className="text-sm text-brand-ink">{v.withinText}</span>
          </section>
          <Card>
            <BudgetLines lines={v.lines} showAdjust />
          </Card>
          <Button variant="secondary" href={v.editHref}>Planejar outra categoria</Button>
        </>
      )}

      <p className="m-0 px-1 text-sm leading-snug text-muted">
        O que é &quot;Planejado&quot;? Quanto você decidiu usar em cada área este mês. Serve de referência, não é uma regra.
      </p>
    </main>
  )
}
