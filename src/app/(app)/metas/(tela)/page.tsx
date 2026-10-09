import { Plus } from 'lucide-react'
import { WIDE } from '@/ui/columns'
import { Button } from '@/ui/button'
import { todayInSaoPaulo } from '@/domain/dates'
import { loadGoals, loadGoalMovements } from '@/features/metas/queries'
import { loadFamilyGoals, loadFamilySummary } from '@/features/familia/queries'
import { buildMetas } from '@/features/metas/view-model'
import { MetasList } from '@/features/metas/metas-list'

export default async function MetasPage() {
  const [goals, movements, family] = await Promise.all([loadGoals(), loadGoalMovements(), loadFamilySummary()])
  const familyGoals = family ? await loadFamilyGoals(family.id) : []
  const view = buildMetas({ goals, movements, today: todayInSaoPaulo(), familyGoals })

  return (
    <main className={`mx-auto flex max-w-[720px] ${WIDE} flex-col gap-3.5 px-4 pt-5 md:px-9 md:pt-7`}>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Suas metas</h1>
        <Button href="/metas/nova">
          <Plus className="size-[18px]" aria-hidden="true" />
          Criar meta
        </Button>
      </header>
      <MetasList view={view} />
    </main>
  )
}
