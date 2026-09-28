import { Plus } from 'lucide-react'
import { Button } from '@/ui/button'
import { todayInSaoPaulo } from '@/domain/dates'
import { loadGoals, loadGoalMovements } from '@/features/metas/queries'
import { buildMetas } from '@/features/metas/view-model'
import { MetasList } from '@/features/metas/metas-list'

export default async function MetasPage() {
  const [goals, movements] = await Promise.all([loadGoals(), loadGoalMovements()])
  const view = buildMetas({ goals, movements, today: todayInSaoPaulo() })

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-4 pt-5 md:px-9 md:pt-7">
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
