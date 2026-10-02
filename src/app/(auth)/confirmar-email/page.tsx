import type { Metadata } from 'next'
import { ConfirmEmailForm } from '@/features/cadastro/confirm-email-form'

// O código do link é um segredo de uso único: a página não aparece em busca nem vaza no Referer.
export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' }

// Pública e sem chamar o Supabase: abrir o link não confirma nada; quem confirma é o botão.
export default async function ConfirmarEmailPage({ searchParams }: { searchParams: Promise<{ token_hash?: string | string[] }> }) {
  const { token_hash } = await searchParams
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Confirmar troca de e-mail</h1>
      <ConfirmEmailForm tokenHash={typeof token_hash === 'string' ? token_hash : null} />
    </>
  )
}
