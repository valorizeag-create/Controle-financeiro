import { createGoal } from '@/features/metas/actions'
import { GoalForm } from '@/features/metas/goal-form'
import { todayInSaoPaulo, monthOf } from '@/domain/dates'
import { PageHeader } from '@/ui/page-header'

export default function NovaMetaPage() {
  const today = todayInSaoPaulo()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Criar meta" backHref="/metas" />
      <GoalForm action={createGoal} minMonth={monthOf(today)} />
    </main>
  )
}
