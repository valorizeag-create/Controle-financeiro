import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ForgetDevice } from '@/features/cadastro/forget-device'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { robots: { index: false } }

// Página pública: não mostra nada de pessoal e não oferece criar outro cadastro.
// Quem ainda tem sessão (cadastro existente) não vê "excluído" nem tem o aparelho limpo: volta ao início.
// Um cadastro realmente excluído não devolve usuário, mesmo que sobre algum cookie.
export default async function CadastroExcluidoPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect('/inicio')
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Seu cadastro foi excluído.</h1>
      <p className="text-base text-ink">Obrigado por ter usado a Íris.</p>
      <ForgetDevice />
    </>
  )
}
