import { notFound } from 'next/navigation'
import { z } from 'zod'
import { deleteCard, updateCard } from '@/features/cartoes/actions'
import { CardForm } from '@/features/cartoes/card-form'
import { loadCard } from '@/features/cartoes/queries'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function CartaoPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const card = await loadCard(id)
  if (!card) notFound()

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={card.nickname} backHref="/cartoes" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <CardForm action={updateCard} card={card} />
      <ConfirmAction
        trigger="Excluir"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title={`Excluir o cartão "${card.nickname}"?`}
        body={'Os gastos feitos com ele continuam no histórico como "Cartão excluído". Os valores não mudam.'}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        action={deleteCard}
        fields={{ id: card.id }}
      />
    </main>
  )
}
