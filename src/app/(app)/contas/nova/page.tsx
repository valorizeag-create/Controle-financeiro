import { loadCategories } from '@/features/registro/queries'
import { createBill } from '@/features/contas/actions'
import { RecurrenceForm } from '@/features/contas/recurrence-form'
import { loadMyFamily } from '@/features/familia/queries'
import { PageHeader } from '@/ui/page-header'

export default async function NovaContaPage() {
  const [categories, family] = await Promise.all([loadCategories(), loadMyFamily()])
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Nova conta" backHref="/contas" />
      <RecurrenceForm kind="expense" categories={categories} action={createBill} inFamily={family !== null} />
    </main>
  )
}
