import { redirect } from 'next/navigation'
import { todayInSaoPaulo } from '@/domain/dates'
import { UNEXPECTED } from '@/features/auth/errors'
import { loadFamilyBills, loadFamilyRecurrences, loadMyFamily } from '@/features/familia/queries'
import { buildFamilyBills } from '@/features/familia/view-model'
import { FamilyBills } from '@/features/familia/family-bills'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

export default async function FamiliaContasPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  const { erro } = await searchParams
  const family = await loadMyFamily()
  if (!family) redirect('/familia')
  const [bills, recurrences] = await Promise.all([loadFamilyBills(), loadFamilyRecurrences()])
  const view = buildFamilyBills({
    today: todayInSaoPaulo(),
    meId: family.meId,
    isAdmin: family.role === 'admin',
    members: family.members,
    bills,
    recurrences,
  })

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Contas da família" backHref="/familia" />
      {erro === '1' && <FormAlert>{UNEXPECTED}</FormAlert>}
      <FamilyBills view={view} />
    </main>
  )
}
