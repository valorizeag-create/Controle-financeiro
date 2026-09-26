import { redirect } from 'next/navigation'
import { loadProfile } from '@/features/perfil/queries'
import { completeOnboardingBalance, skipOnboardingBalance } from '@/features/perfil/actions'
import { InitialBalanceForm } from '@/features/perfil/forms'
import { FormAlert } from '@/ui/form-alert'

export default async function SaldoInicialOnboardingPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [{ erro }, profile] = await Promise.all([searchParams, loadProfile()])
  if (profile.onboardedAt) redirect('/inicio')
  return (
    <div className="flex flex-1 flex-col gap-[18px] px-6 pb-8 pt-3">
      <form action={skipOnboardingBalance} className="flex justify-end">
        <button type="submit" className="flex h-11 items-center px-3 text-[15px] font-medium text-brand-text">Pular</button>
      </form>
      <header className="flex flex-col gap-2.5 pt-6">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Quanto você tem hoje?</h1>
        <p className="text-base leading-relaxed">É o ponto de partida do seu Saldo total. É opcional, e dá para mudar depois em Configurações.</p>
      </header>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <InitialBalanceForm action={completeOnboardingBalance} submitLabel="Salvar e continuar" />
    </div>
  )
}
