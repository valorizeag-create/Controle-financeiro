import { notFound } from 'next/navigation'
import { z } from 'zod'
import { dayMonthLabel, monthOf } from '@/domain/dates'
import { loadTransaction } from '@/features/registro/queries'
import { txName } from '@/features/contas/view-model'
import { ReceiveForm } from '@/features/contas/receive-form'
import { SheetClose } from '@/features/registro/sheet-close'

type Props = { params: Promise<{ id: string }> }

export default async function ReceberPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const tx = await loadTransaction(id)
  if (!tx || tx.kind !== 'income' || tx.status !== 'pending' || tx.dueOn === null) notFound()

  const title = txName(tx, [])

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="receber-titulo" data-sheet className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col">
            <h1 id="receber-titulo" className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            <p className="text-sm text-muted">previsto para {dayMonthLabel(tx.dueOn)}</p>
          </div>
          <SheetClose href={`/contas?mes=${monthOf(tx.dueOn)}`} />
        </div>
        <ReceiveForm id={tx.id} amountCents={tx.amountCents} />
      </section>
    </div>
  )
}
