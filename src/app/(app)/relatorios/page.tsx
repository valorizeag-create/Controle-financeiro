import { todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { InOutChart } from '@/features/relatorios/in-out-chart'
import { resolvePeriod } from '@/features/relatorios/period'
import { PeriodFilter } from '@/features/relatorios/period-filter'
import { MonthByMonth, WhatChanged } from '@/features/relatorios/report-sections'
import { buildRelatorios } from '@/features/relatorios/view-model'
import { CategoriesCard } from '@/features/seu-mes/categories-card'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { AsideColumn, Columns, MainColumn, WIDE } from '@/ui/columns'
import { PageHeader } from '@/ui/page-header'

type Props = { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }

export default async function RelatoriosPage({ searchParams }: Props) {
  const params = await searchParams
  const today = todayInSaoPaulo()
  const period = resolvePeriod(params, today)
  const { profile, categories, transactions, goalMovements } = await loadLedger()
  const v = buildRelatorios({ period, today, profile, categories, transactions, goalMovements })

  return (
    <main className={`mx-auto flex max-w-[720px] ${WIDE} flex-col gap-4 px-4 pt-4 pb-6 md:px-9 md:pt-7`}>
      <PageHeader title="Seus meses em perspectiva" backHref="/mais" backOnMobileOnly />
      <PeriodFilter period={period} de={params.de ?? ''} ate={params.ate ?? ''} />

      {v.empty ? (
        <Card className="flex flex-col items-start gap-3.5 border-dashed">
          <p className="m-0 text-[17px] font-medium text-ink">
            Os relatórios aparecem depois de alguns registros. Seu primeiro retrato do mês está a poucos gastos de distância.
          </p>
          <Button href="/anotar">Anotar gasto</Button>
        </Card>
      ) : (
        <Columns>
          <MainColumn>
            <WhatChanged summary={v.summary} changes={v.changes} />
            {v.chart && <InOutChart bars={v.chart} />}
            <MonthByMonth months={v.months} />
          </MainColumn>
          {v.categories.length > 0 && (
            <AsideColumn row={1}>
              <CategoriesCard categories={v.categories} />
            </AsideColumn>
          )}
        </Columns>
      )}
    </main>
  )
}
