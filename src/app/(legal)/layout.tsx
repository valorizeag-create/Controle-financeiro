import Link from 'next/link'
import { Logo } from '@/ui/logo'

// Páginas públicas e estáticas: sem barra do app e sem leitura de sessão.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-8 bg-card px-6 py-8 md:my-10 md:min-h-0 md:rounded-hero md:border md:border-line md:px-10">
      <Link href="/" aria-label="Íris, página inicial" className="flex min-h-11 w-fit items-center"><Logo /></Link>
      {children}
      <nav aria-label="Textos legais" className="flex flex-wrap gap-x-6 border-t border-line pt-4">
        <Link href="/termos" className="flex min-h-11 items-center font-medium text-brand-text">Termos de uso</Link>
        <Link href="/privacidade" className="flex min-h-11 items-center font-medium text-brand-text">Política de privacidade</Link>
      </nav>
    </main>
  )
}
