import Link from 'next/link'
import { ResetForm } from '@/features/auth/forms'

export default function RecuperarSenhaPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Sem problema.</h1>
        <p>Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
      </header>
      <ResetForm />
      <Link href="/entrar" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Voltar</Link>
    </>
  )
}
