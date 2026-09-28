import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { todayInSaoPaulo } from '@/domain/dates'
import { loadCards } from '@/features/cartoes/queries'
import { loadPurchase } from '@/features/parcelas/queries'
import { SettleForm } from '@/features/parcelas/settle-form'
import { buildPurchase } from '@/features/parcelas/view-model'
import { loadCategories } from '@/features/registro/queries'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }> }

export default async function QuitarAntecipadamentePage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const purchase = await loadPurchase(id)
  if (!purchase) notFound()
  const [categories, cards] = await Promise.all([loadCategories(), loadCards()])
  const v = buildPurchase({ ...purchase, categories, cards, today: todayInSaoPaulo() })
  if (!v.canClose) redirect(`/extrato/parcelas/${id}`)
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Quitar antecipadamente" backHref={`/extrato/parcelas/${id}`} />
      <p className="text-[15px] text-muted">{v.remainingText} Se pagou outro valor, é só ajustar.</p>
      <SettleForm id={id} amountCents={v.remainingCents} />
    </main>
  )
}
