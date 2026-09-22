import Link from 'next/link'
import { SignInForm } from '@/features/auth/forms'
import { GoogleButton } from '@/features/auth/google-button'
import { FormAlert } from '@/ui/form-alert'

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Que bom te ver de novo.</h1>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <GoogleButton />
      <SignInForm />
      <Link href="/recuperar-senha" className="flex min-h-11 items-center self-end font-medium text-brand-text">Esqueci minha senha</Link>
      <Link href="/criar-cadastro" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Criar um cadastro</Link>
    </>
  )
}
