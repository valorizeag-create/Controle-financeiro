import { todayInSaoPaulo } from '@/domain/dates'
import { loadMyFamily } from '@/features/familia/queries'
import { buildFamiliaPage } from '@/features/familia/view-model'
import { FamiliaPage } from '@/features/familia/familia-page'

export default async function FamiliaRoute({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  const { erro } = await searchParams
  const family = await loadMyFamily()
  const view = buildFamiliaPage({ family, today: todayInSaoPaulo() })
  return <FamiliaPage view={view} erro={typeof erro === 'string' ? erro : undefined} />
}
