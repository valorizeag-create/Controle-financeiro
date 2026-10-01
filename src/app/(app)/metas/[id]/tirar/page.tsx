import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { buildFamilyGoalDetail, buildGoalDetail } from '@/features/metas/view-model'
import { MoveForm } from '@/features/metas/move-form'
import { SheetClose } from '@/features/registro/sheet-close'

type Props = { params: Promise<{ id: string }> }

export default async function TirarPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  const today = todayInSaoPaulo()
  // Na meta da família só existe a parte da própria pessoa para tirar ("Sua parte").
  const family = data.kind === 'family'
  const detail = family
    ? buildFamilyGoalDetail({ goal: data.goal, movements: data.movements, today })
    : buildGoalDetail({ goal: data.goal, movements: data.movements, today })
  const availableCents = family ? (detail as ReturnType<typeof buildFamilyGoalDetail>).myPartCents : detail.summary.balanceCents
  if (availableCents <= 0) redirect(`/metas/${id}`)
  const balanceText = family ? `Sua parte: ${formatBRL(availableCents)}` : detail.balanceText

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="tirar-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <h1 id="tirar-titulo" className="flex-1 text-xl font-semibold tracking-tight text-ink">Tirar dinheiro</h1>
          <SheetClose href={`/metas/${id}`} />
        </div>
        <p className="rounded-panel bg-brand-wash px-3.5 py-3 text-[15px] text-brand-ink">{balanceText}</p>
        <MoveForm goalId={id} mode="withdraw" family={family} />
      </section>
    </div>
  )
}
