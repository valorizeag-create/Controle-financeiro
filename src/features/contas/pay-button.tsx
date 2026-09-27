import { ConfirmAction } from '@/ui/confirm'
import { markBillPaid } from './actions'

export function PayBillButton({ id, name, back, short }: { id: string; name: string; back: string; short?: boolean }) {
  return (
    <ConfirmAction
      trigger={short ? 'Paga' : 'Marcar como paga'}
      triggerAriaLabel={`Marcar ${name} como paga`}
      triggerClassName="shrink-0 rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas"
      title={`Marcar ${name} como paga?`}
      confirmLabel="Marcar como paga"
      cancelLabel="Agora não"
      action={markBillPaid}
      fields={{ id, volta: back }}
    />
  )
}
