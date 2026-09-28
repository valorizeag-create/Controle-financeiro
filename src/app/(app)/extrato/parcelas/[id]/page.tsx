import { notFound } from 'next/navigation'
import { z } from 'zod'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { loadCards } from '@/features/cartoes/queries'
import { deletePurchase, refundPurchase } from '@/features/parcelas/actions'
import { loadPurchase } from '@/features/parcelas/queries'
import { buildPurchase } from '@/features/parcelas/view-model'
import { loadCategories } from '@/features/registro/queries'
import { Button } from '@/ui/button'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { ListCard, ListRow, ListSection } from '@/ui/list'
import { Money } from '@/ui/money'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function CompraParceladaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const purchase = await loadPurchase(id)
  if (!purchase) notFound()
  const [categories, cards] = await Promise.all([loadCategories(), loadCards()])
  const v = buildPurchase({ ...purchase, categories, cards, today: todayInSaoPaulo() })
  const secondary = 'flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas'
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={v.title} backHref={`/extrato?mes=${monthOf(purchase.plan.purchasedOn)}`} />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <section data-testid="compra-resumo" className="flex flex-col gap-1.5 rounded-card border border-line bg-card p-4 text-[15px] shadow-card">
        <p className="text-[17px] font-semibold text-ink">{v.totalText}</p>
        {v.payment && <p>{v.payment}</p>}
        {v.remainingText && <p>{v.remainingText}</p>}
        {v.statusText && <p>{v.statusText}</p>}
      </section>
      <ListSection title="Parcelas">
        <ListCard>
          {v.rows.map((r) => (
            <ListRow key={r.id}>
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5"><span className="text-[15px] text-ink">{r.title}</span><span className="text-[13px] text-muted">{r.detail}</span></span>
                <Money cents={r.amountCents} className="num shrink-0 text-[15px] font-medium text-ink" />
              </div>
            </ListRow>
          ))}
        </ListCard>
      </ListSection>
      {v.canClose && (
        <>
          <Button href={`/extrato/parcelas/${v.id}/quitar`} variant="secondary" className="min-h-12">Quitar antecipadamente</Button>
          <ConfirmAction
            trigger="Cancelar por devolução" triggerClassName={secondary}
            title="Cancelar as parcelas por devolução?"
            body="As parcelas que ainda não chegaram deixam de existir. As que já contaram continuam no seu histórico."
            confirmLabel="Cancelar parcelas" cancelLabel="Agora não" action={refundPurchase} fields={{ id: v.id }}
          />
        </>
      )}
      <ConfirmAction
        trigger="Excluir" triggerClassName={secondary}
        title="Excluir esta compra?" body="Todas as parcelas saem do seu histórico. Seu mês será recalculado."
        confirmLabel="Excluir" cancelLabel="Cancelar" action={deletePurchase} fields={{ id: v.id }}
      />
    </main>
  )
}
