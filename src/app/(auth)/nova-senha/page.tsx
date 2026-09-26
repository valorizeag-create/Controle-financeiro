import Link from 'next/link'
import { NewPasswordForm } from '@/features/auth/forms'

export default async function NovaSenhaPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams
  const fromSettings = de === 'configuracoes'
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Crie uma nova senha.</h1>
      <NewPasswordForm from={fromSettings ? 'configuracoes' : undefined} />
      {fromSettings && (
        <Link href="/configuracoes" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Voltar</Link>
      )}
    </>
  )
}
