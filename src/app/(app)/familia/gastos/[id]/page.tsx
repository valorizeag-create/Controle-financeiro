import { redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { authorLabel } from '@/domain/family'
import { loadFamilyExpense, loadMyFamily } from '@/features/familia/queries'
import { FamilyExpenseForm } from '@/features/familia/family-expense-form'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }> }

export default async function AjustarGastoDaFamiliaPage({ params }: Props) {
  const { id } = await params
  const family = await loadMyFamily()
  if (!family) redirect('/familia')
  // Só o administrador ajusta o gasto de outra pessoa; o banco confere de novo.
  if (family.role !== 'admin') redirect('/inicio/familia')
  if (!z.uuid().safeParse(id).success) redirect('/inicio/familia')
  const expense = await loadFamilyExpense(id)
  if (!expense) redirect('/inicio/familia')
  // O gasto da própria pessoa tem a tela de sempre, no Extrato.
  if (expense.authorId === family.meId) redirect(`/extrato/${id}`)
  // Parcela, gasto pago com meta ou de quem saiu: o banco não deixa ajustar, então não há formulário.
  if (!expense.canAdjust) redirect('/inicio/familia')
  const who = authorLabel(expense.authorId, expense.authorName, family.meId)

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Gasto da família" backHref="/inicio/familia" />
      <FamilyExpenseForm expense={expense} author={who} today={todayInSaoPaulo()} />
    </main>
  )
}
