import { ConfirmAction } from '@/ui/confirm'
import { markBillPaid } from './actions'

type Props = {
  id: string
  name: string
  back: string
  short?: boolean
  // Padrão: conta pessoal. A conta da família passa a ação da família.
  action?: (fd: FormData) => Promise<void>
}

export function PayBillButton({ id, name, back, short, action = markBillPaid }: Props) {
  return (
    <ConfirmAction
      trigger={short ? 'Paga' : 'Marcar como paga'}
      triggerAriaLabel={`Marcar ${name} como paga`}
      triggerClassName="shrink-0 rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas"
      title={`Marcar ${name} como paga?`}
      confirmLabel="Marcar como paga"
      cancelLabel="Agora não"
      action={action}
      fields={{ id, volta: back }}
    />
  )
}
