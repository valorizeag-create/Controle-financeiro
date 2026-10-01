import { ConfirmAction } from '@/ui/confirm'
import { leaveFamily } from './actions'

export function LeaveFamily({ mode }: { mode: 'member' | 'admin-with-others' | 'alone' }) {
  if (mode === 'admin-with-others') {
    return (
      <p className="text-[15px] text-muted">
        Antes de sair, escolha quem vai administrar a família: toque em Tornar administrador ao lado da pessoa.
      </p>
    )
  }
  return (
    <ConfirmAction
      trigger="Sair da família"
      triggerClassName="self-start text-[15px] font-medium text-error-ink"
      title="Sair da família?"
      body={
        mode === 'alone'
          ? 'Você é a única pessoa na família. Ao sair, a família é encerrada.'
          : 'Sua parte nas metas da família volta para o seu Disponível deste mês. Os gastos que você registrou continuam no histórico da família.'
      }
      confirmLabel="Sair da família"
      cancelLabel="Ficar"
      action={leaveFamily}
    />
  )
}
