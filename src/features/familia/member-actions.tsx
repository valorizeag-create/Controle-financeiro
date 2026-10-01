import { ConfirmAction } from '@/ui/confirm'
import { removeMember, transferAdmin } from './actions'

// Só o identificador vai no formulário; o nome é só para o texto. O banco confere quem administra.
export function MemberActions({ userId, name }: { userId: string; name: string }) {
  const fields = { userId }
  return (
    <div className="flex flex-wrap gap-x-4">
      <ConfirmAction
        trigger="Tornar administrador"
        triggerAriaLabel={`Tornar ${name} administrador`}
        triggerClassName="text-sm font-medium text-brand-text"
        title={`${name} vai administrar a família?`}
        body="Você continua participando como membro."
        confirmLabel="Tornar administrador"
        cancelLabel="Cancelar"
        action={transferAdmin}
        fields={fields}
      />
      <ConfirmAction
        trigger="Remover da família"
        triggerAriaLabel={`Remover ${name} da família`}
        triggerClassName="text-sm font-medium text-error-ink"
        title={`Remover ${name} da família?`}
        body={`A parte de ${name} nas metas da família volta para ${name}. Os gastos que ${name} registrou continuam no histórico da família.`}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        action={removeMember}
        fields={fields}
      />
    </div>
  )
}
