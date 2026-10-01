import Link from 'next/link'
import { SignUpForm } from '@/features/auth/forms'
import { inviteReturn, withNext } from '@/features/auth/routes'
import { GoogleButton } from '@/features/auth/google-button'

export default async function CriarCadastroPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = inviteReturn((await searchParams).next) ?? undefined
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Vamos começar.</h1>
        <p className="text-muted">Leva menos de um minuto.</p>
      </header>
      <GoogleButton next={next} />
      <SignUpForm next={next} />
      <p className="text-center text-[13px] text-muted">
        Ao criar seu cadastro, você concorda com os <Link href="/termos" className="text-brand-text">Termos de uso</Link> e a{' '}
        <Link href="/privacidade" className="text-brand-text">Política de privacidade</Link>.
      </p>
      <Link href={withNext('/entrar', next)} className="flex min-h-11 items-center justify-center font-medium text-brand-text">Já tenho cadastro</Link>
    </>
  )
}
