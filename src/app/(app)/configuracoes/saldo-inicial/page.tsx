import { loadProfile } from '@/features/perfil/queries'
import { updateInitialBalance } from '@/features/perfil/actions'
import { InitialBalanceForm } from '@/features/perfil/forms'
import { centsToInput } from '@/features/registro/form-values'
import { PageHeader } from '@/ui/page-header'

export default async function SaldoInicialPage() {
  const profile = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Quanto você tinha ao começar" backHref="/configuracoes" />
      <p className="text-[15px]">É o ponto de partida do seu Saldo total.</p>
      <InitialBalanceForm action={updateInitialBalance} submitLabel="Salvar alterações" defaultValue={centsToInput(profile.initialBalanceCents)} />
    </main>
  )
}
