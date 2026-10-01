import { redirect } from 'next/navigation'
import { z } from 'zod'
import { UNEXPECTED } from '@/features/auth/errors'
import { loadFamilyRecurrences, loadMyFamily } from '@/features/familia/queries'
import { FamilyBillForm } from '@/features/familia/family-bill-form'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string | string[] }> }

export default async function EditarContaDaFamiliaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) redirect('/familia/contas')
  const family = await loadMyFamily()
  if (!family) redirect('/familia')
  // O banco só devolve moldes da família ainda ativos; quem não criou e não administra não altera.
  const recurrence = (await loadFamilyRecurrences()).find((r) => r.id === id)
  if (!recurrence || (family.role !== 'admin' && recurrence.authorId !== family.meId)) redirect('/familia/contas')

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={recurrence.name} backHref="/familia/contas" />
      {erro === '1' && <FormAlert>{UNEXPECTED}</FormAlert>}
      <FamilyBillForm bill={recurrence} />
    </main>
  )
}
