import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Ellipsis } from 'lucide-react'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { resolveGoal } from '@/features/metas/resolve-goal'
import { buildFamilyGoalDetail, buildGoalDetail } from '@/features/metas/view-model'
import { GoalHero, GoalActions, GoalHistory } from '@/features/metas/goal-detail'
import { FamilyGoalDetail } from '@/features/metas/family-goal-detail'
import { AsideColumn, Columns, MainColumn, WIDE } from '@/ui/columns'
import { FormAlert } from '@/ui/form-alert'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function MetaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await resolveGoal(id)
  if (!data) notFound()
  const today = todayInSaoPaulo()
  const familyView = data.kind === 'family' ? buildFamilyGoalDetail({ goal: data.goal, movements: data.movements, today, uses: data.uses }) : null
  const view = familyView ?? buildGoalDetail({ goal: data.goal, movements: data.movements, today })
  return (
    <main className={`mx-auto flex max-w-[560px] ${data.kind === 'personal' ? WIDE : ''} flex-col gap-3.5 px-4 pt-4 md:px-9 md:pt-7`}>
      <header className="flex items-center gap-2">
        <Link href="/metas" aria-label="Voltar" className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="flex-1 text-xl font-semibold tracking-tight text-ink md:text-[26px]">{data.goal.name}</h1>
        {data.kind === 'personal' && (
          <Link href={`/metas/${id}/editar`} aria-label="Mais opções" className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken">
            <Ellipsis className="size-5" aria-hidden="true" />
          </Link>
        )}
      </header>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      {data.kind === 'family' && familyView ? (
        <FamilyGoalDetail goal={data.goal} view={familyView} isAdmin={data.isAdmin} canEdit={data.canEdit} />
      ) : (
        <Columns>
          <MainColumn>
            <GoalHero view={view} />
            <GoalActions view={view} />
          </MainColumn>
          <AsideColumn row={1}>
            <GoalHistory goalId={id} items={view.history} />
          </AsideColumn>
        </Columns>
      )}
    </main>
  )
}
