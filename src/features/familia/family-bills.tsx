import Link from 'next/link'
import { formatBRL } from '@/domain/money'
import { PayBillButton } from '@/features/contas/pay-button'
import { ConfirmAction } from '@/ui/confirm'
import { ListCard, ListRow, ListSection } from '@/ui/list'
import { endFamilyBill, payFamilyBill } from './money-actions'
import type { FamilyBillItem, FamilyBillsView } from './view-model'

const BACK = '/familia/contas'

function BillList({ title, items }: { title: string; items: FamilyBillItem[] }) {
  return (
    <ListSection title={title}>
      <ListCard>
        {items.map((b) => (
          <ListRow key={b.id}>
            <div className="flex min-h-16 items-center gap-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] text-ink">{b.name}</span>
                <span className="text-[13px] text-muted">{formatBRL(b.amountCents)} · {b.due} · criada por {b.author}</span>
              </span>
              <PayBillButton id={b.id} name={b.name} back={BACK} short action={payFamilyBill} />
            </div>
          </ListRow>
        ))}
      </ListCard>
    </ListSection>
  )
}

export function FamilyBills({ view }: { view: FamilyBillsView }) {
  const none = view.overdue.length === 0 && view.due.length === 0
  return (
    <div className="flex flex-col gap-5">
      {view.overdue.length > 0 && <BillList title="Vencidas" items={view.overdue} />}
      {view.due.length > 0 && <BillList title="A pagar" items={view.due} />}
      {none && <p className="rounded-card border border-dashed border-line bg-card p-5 text-[15px]">Nenhuma conta da família a pagar.</p>}

      {view.recurring.length > 0 && (
        <ListSection title="Contas da família que se repetem">
          <ListCard>
            {view.recurring.map((r) => (
              <ListRow key={r.id}>
                <div className="flex min-h-16 items-center gap-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] text-ink">{r.name}</span>
                    <span className="text-[13px] text-muted">{formatBRL(r.amountCents)} · {r.caption}</span>
                  </span>
                  {r.canManage && (
                    <>
                      <Link
                        href={`/familia/contas/${r.id}`}
                        aria-label={`Alterar ${r.name}`}
                        className="flex min-h-11 shrink-0 items-center rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas"
                      >
                        Alterar
                      </Link>
                      <ConfirmAction
                        trigger="Encerrar"
                        triggerAriaLabel={`Encerrar ${r.name}`}
                        triggerClassName="shrink-0 rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas"
                        title={`Encerrar "${r.name}"?`}
                        body="As próximas não serão criadas. O que já foi pago continua no Extrato."
                        confirmLabel="Encerrar"
                        cancelLabel="Cancelar"
                        action={endFamilyBill}
                        fields={{ id: r.id }}
                      />
                    </>
                  )}
                </div>
              </ListRow>
            ))}
          </ListCard>
        </ListSection>
      )}
    </div>
  )
}
