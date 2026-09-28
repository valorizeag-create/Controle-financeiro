import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { loadGoal } from '@/features/metas/queries'
import { buildGoalDetail } from '@/features/metas/view-model'
import { LeftoverPrompt } from '@/features/metas/leftover-prompt'

type Props = { params: Promise<{ id: string }> }

export default async function SobraPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await loadGoal(id)
  if (!data) notFound()
  const { summary } = buildGoalDetail({ ...data, today: todayInSaoPaulo() })
  if (data.goal.status !== 'used' || summary.balanceCents <= 0) redirect(`/metas/${id}`)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[rgba(18,40,1,.32)] px-4">
      <LeftoverPrompt goalId={id} leftoverCents={summary.balanceCents} />
    </div>
  )
}
