import type { Metadata } from 'next'
import { ForgetDevice } from '@/features/cadastro/forget-device'

export const metadata: Metadata = { robots: { index: false } }

// Página pública: não mostra nada de pessoal (nem nome, nem e-mail) e não oferece criar outro cadastro.
export default function CadastroExcluidoPage() {
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Seu cadastro foi excluído.</h1>
      <p className="text-base text-ink">Obrigado por ter usado a Íris.</p>
      <ForgetDevice />
    </>
  )
}
