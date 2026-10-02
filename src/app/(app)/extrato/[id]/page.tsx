import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { deleteTransaction } from '@/features/registro/actions'
import { AnotarForm } from '@/features/registro/anotar-form'
import { loadCategories, loadTransaction } from '@/features/registro/queries'
import { SheetClose } from '@/features/registro/sheet-close'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { Money } from '@/ui/money'
import { loadCards } from '@/features/cartoes/queries'
import { paymentText } from '@/features/cartoes/types'
import { loadGoalLabel } from '@/features/metas/queries'
import { loadFamilySummary } from '@/features/familia/queries'
import { buildGoalFundedExpense } from '@/features/metas/view-model'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function EditarRegistroPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const [tx, categories, cards, family] = await Promise.all([loadTransaction(id), loadCategories(), loadCards(), loadFamilySummary()])
  // Contas a pagar/receber (pendentes) ganham tela própria no Plano 3.
  if (!tx || tx.status !== 'confirmed') notFound()
  // Uma parcela ou o restante quitado não têm formulário próprio: a tela é a da compra inteira.
  if (tx.installmentPlanId) redirect(`/extrato/parcelas/${tx.installmentPlanId}`)
  // Gasto pago com uma meta não é editado nem excluído por aqui (RN-01a): a tela é a da meta —
  // exceto quando ela foi excluída, aí não há mais tela dela (M-3): mostramos aqui mesmo, só
  // para ver, em vez de um 404 (decisão 66: esse gasto nunca pode ser removido).
  if (tx.goalId) {
    const goal = await loadGoalLabel(tx.goalId)
    if (goal && goal.deletedOn === null) redirect(`/metas/${tx.goalId}`)
    const categoryName = categories.find((c) => c.id === tx.categoryId)?.name ?? 'Outros'
    const v = buildGoalFundedExpense({
      categoryName,
      note: tx.note,
      amountCents: tx.amountCents,
      payment: paymentText(tx, cards),
      goalName: goal?.name ?? 'excluída',
    })
    return (
      <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
        <section aria-labelledby="gasto-meta-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
          <div className="flex items-center gap-2">
            <h1 id="gasto-meta-titulo" className="flex-1 text-xl font-semibold tracking-tight text-ink">{v.title}</h1>
            <SheetClose href={`/extrato?mes=${monthOf(tx.paidOn ?? tx.occurredOn)}`} />
          </div>
          <section data-testid="gasto-meta-resumo" className="flex flex-col gap-1.5 rounded-card border border-line bg-card p-4 text-[15px] shadow-card">
            <Money cents={v.amountCents} className="text-[17px] font-semibold text-ink" />
            {v.payment && <p>{v.payment}</p>}
            <span className="w-fit rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-inactive">{v.badge}</span>
          </section>
          <p className="text-[15px] text-muted">{v.notice}</p>
        </section>
      </div>
    )
  }

  const isExpense = tx.kind === 'expense'
  const record = {
    id: tx.id,
    kind: tx.kind,
    amountCents: tx.amountCents,
    categoryId: tx.categoryId,
    source: tx.source,
    note: tx.note,
    paymentMethod: tx.paymentMethod,
    occurredOn: tx.paidOn ?? tx.occurredOn,
    cardId: tx.cardId,
    familyId: tx.familyId,
  }

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="editar-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <h1 id="editar-titulo" className="flex-1 text-xl font-semibold tracking-tight text-ink">
            {isExpense ? 'Editar gasto' : 'Editar entrada'}
          </h1>
          <SheetClose href={`/extrato?mes=${monthOf(tx.paidOn ?? tx.occurredOn)}`} />
        </div>
        {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
        <AnotarForm kind={tx.kind} categories={categories} today={todayInSaoPaulo()} record={record} cards={cards} inFamily={family !== null || tx.familyId !== null} />
        <ConfirmAction
          trigger="Excluir"
          triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
          title={isExpense ? 'Excluir este gasto?' : 'Excluir esta entrada?'}
          body="Seu mês será recalculado."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          action={deleteTransaction}
          fields={{ id: tx.id }}
        />
      </section>
    </div>
  )
}
