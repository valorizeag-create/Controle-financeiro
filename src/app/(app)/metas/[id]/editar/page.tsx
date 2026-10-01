import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { updateFamilyGoal } from '@/features/metas/family-goal-actions'
import { buildGoalDetail } from '@/features/metas/view-model'
import { deleteGoal, updateGoal } from '@/features/metas/actions'
import { GoalForm } from '@/features/metas/goal-form'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function EditarMetaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  if (data.kind === 'family') {
    // Quem não criou a meta nem administra volta para ela (o banco confere de novo ao salvar).
    if (!data.canEdit) redirect(`/metas/${id}`)
    return (
      <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
        <PageHeader title="Editar meta" backHref={`/metas/${id}`} />
        {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
        <GoalForm action={updateFamilyGoal} goal={data.goal} minMonth="2000-01" />
      </main>
    )
  }
  const { goal } = data
  const { summary } = buildGoalDetail({ goal, movements: data.movements, today: todayInSaoPaulo() })

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Editar meta" backHref={`/metas/${id}`} />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <GoalForm action={updateGoal} goal={goal} minMonth="2000-01" />
      <ConfirmAction
        trigger="Excluir"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title={`Excluir ${goal.name}?`}
        body={
          `O valor guardado continua registrado no seu histórico.` +
          (summary.balanceCents > 0 ? ` ${formatBRL(summary.balanceCents)} volta para o seu Disponível deste mês.` : '')
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        action={deleteGoal}
        fields={{ id: goal.id }}
      />
    </main>
  )
}
