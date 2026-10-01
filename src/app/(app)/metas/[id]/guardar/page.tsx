import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { MoveForm } from '@/features/metas/move-form'
import { SheetClose } from '@/features/registro/sheet-close'

type Props = { params: Promise<{ id: string }> }

export default async function GuardarPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  if (data.goal.status !== 'active') redirect(`/metas/${id}`)

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="guardar-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col">
            <h1 id="guardar-titulo" className="text-xl font-semibold tracking-tight text-ink">Guardar dinheiro nesta meta</h1>
            <p className="text-sm text-muted">{data.goal.name}</p>
          </div>
          <SheetClose href={`/metas/${id}`} />
        </div>
        <MoveForm goalId={id} mode="deposit" family={data.kind === 'family'} />
      </section>
    </div>
  )
}
