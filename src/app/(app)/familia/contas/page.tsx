import { redirect } from 'next/navigation'
import { todayInSaoPaulo } from '@/domain/dates'
import { UNEXPECTED } from '@/features/auth/errors'
import { loadFamilyBills, loadFamilyRecurrences, loadMyFamily } from '@/features/familia/queries'
import { buildFamilyBills } from '@/features/familia/view-model'
import { payTarget } from '@/features/contas/pay-target'
import { FamilyBills } from '@/features/familia/family-bills'
import { payFamilyBill } from '@/features/familia/money-actions'
import { PayFromNotification } from '@/features/notificacoes/pay-from-notification'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

export default async function FamiliaContasPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; pagar?: string | string[] }> }) {
  const { erro, pagar } = await searchParams
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
  // Aberto por uma notificação: só uma conta a pagar da família que esta tela já lista.
  const target = payTarget(pagar, [...view.overdue, ...view.due])

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      {target && <PayFromNotification id={target.id} name={target.name} back="/familia/contas" action={payFamilyBill} />}
      <PageHeader title="Contas da família" backHref="/familia" />
      {erro === '1' && <FormAlert>{UNEXPECTED}</FormAlert>}
      <FamilyBills view={view} />
    </main>
  )
}
