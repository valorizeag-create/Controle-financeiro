import { z } from 'zod'
import { monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadCategories } from '@/features/registro/queries'
import { loadBudgets } from '@/features/planejamento/queries'
import { saveBudgets } from '@/features/planejamento/actions'
import { buildPlanForm } from '@/features/planejamento/view-model'
import { PlanForm } from '@/features/planejamento/plan-form'
import { PageHeader } from '@/ui/page-header'

type Props = { searchParams: Promise<{ mes?: string; categoria?: string }> }

export default async function EditarPlanejamentoPage({ searchParams }: Props) {
  const { mes, categoria } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(todayInSaoPaulo())
  const focus = z.uuid().safeParse(categoria)
  const [categories, budgets] = await Promise.all([loadCategories(), loadBudgets([month])])
  const view = buildPlanForm({ month, categories, budgets, focusCategoryId: focus.success ? focus.data : null })

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-4 pb-6 md:px-9 md:pt-7">
      <PageHeader title="Planejar meu mês" backHref={`/planejamento?mes=${month}`} />
      <p className="m-0 text-sm text-muted">{view.monthText}</p>
      <p className="m-0 text-[15px] text-ink">Defina um valor para cada área. A Íris mostra quanto ainda está disponível.</p>
      <p className="m-0 text-sm text-muted">Deixe em branco o que não quiser planejar.</p>
      <PlanForm view={view} action={saveBudgets} />
    </main>
  )
}
