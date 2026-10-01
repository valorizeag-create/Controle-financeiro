import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { loadCategories } from '@/features/registro/queries'
import { buildGoalDetail } from '@/features/metas/view-model'
import { UseGoalForm } from '@/features/metas/use-form'
import { SheetClose } from '@/features/registro/sheet-close'

type Props = { params: Promise<{ id: string }> }

export default async function UsarPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  // Na meta da família, só o administrador usa o dinheiro (o banco confere de novo ao salvar).
  if (data.kind === 'family' && !data.isAdmin) redirect(`/metas/${id}`)
  const { summary, balanceText, canUse } = buildGoalDetail({ goal: data.goal, movements: data.movements, today: todayInSaoPaulo() })
  const family = data.kind === 'family'
  const usable = family ? data.goal.status === 'active' && data.goal.savedCents > 0 : canUse
  if (!usable) redirect(`/metas/${id}`)
  const categories = await loadCategories()

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="usar-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <h1 id="usar-titulo" className="flex-1 text-xl font-semibold tracking-tight text-ink">Usar o dinheiro da meta</h1>
          <SheetClose href={`/metas/${id}`} />
        </div>
        {!family && <p className="rounded-panel bg-brand-wash px-3.5 py-3 text-[15px] text-brand-ink">{balanceText}</p>}
        <UseGoalForm goalId={id} balanceCents={family ? data.goal.savedCents : summary.balanceCents} categories={categories} family={family} />
      </section>
    </div>
  )
}
