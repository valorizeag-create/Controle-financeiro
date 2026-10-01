import { createGoal } from '@/features/metas/actions'
import { GoalForm } from '@/features/metas/goal-form'
import { todayInSaoPaulo, monthOf } from '@/domain/dates'
import { loadFamilySummary } from '@/features/familia/queries'
import { PageHeader } from '@/ui/page-header'

export default async function NovaMetaPage() {
  const today = todayInSaoPaulo()
  const family = await loadFamilySummary()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Criar meta" backHref="/metas" />
      <GoalForm action={createGoal} minMonth={monthOf(today)} inFamily={family !== null} />
    </main>
  )
}
