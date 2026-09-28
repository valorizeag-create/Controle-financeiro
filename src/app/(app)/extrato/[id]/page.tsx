import { notFound } from 'next/navigation'
import { z } from 'zod'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { deleteTransaction } from '@/features/registro/actions'
import { AnotarForm } from '@/features/registro/anotar-form'
import { loadCategories, loadTransaction } from '@/features/registro/queries'
import { SheetClose } from '@/features/registro/sheet-close'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { loadCards } from '@/features/cartoes/queries'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function EditarRegistroPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const [tx, categories, cards] = await Promise.all([loadTransaction(id), loadCategories(), loadCards()])
  // Contas a pagar/receber (pendentes) ganham tela própria no Plano 3.
  if (!tx || tx.status !== 'confirmed') notFound()

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
        <AnotarForm kind={tx.kind} categories={categories} today={todayInSaoPaulo()} record={record} cards={cards} />
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
