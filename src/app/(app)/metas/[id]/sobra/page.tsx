import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { buildGoalDetail } from '@/features/metas/view-model'
import { LeftoverPrompt } from '@/features/metas/leftover-prompt'

type Props = { params: Promise<{ id: string }> }

export default async function SobraPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  // Meta da família não tem a pergunta da sobra: cada pessoa tira a sua parte (decisão 105).
  if (data.kind === 'family') redirect(`/metas/${id}`)
  const { summary } = buildGoalDetail({ goal: data.goal, movements: data.movements, today: todayInSaoPaulo() })
  if (data.goal.status !== 'used' || summary.balanceCents <= 0) redirect(`/metas/${id}`)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[rgba(18,40,1,.32)] px-4">
      <LeftoverPrompt goalId={id} leftoverCents={summary.balanceCents} />
    </main>
  )
}
