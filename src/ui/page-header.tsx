import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Props = { title: string; backHref: string; backOnMobileOnly?: boolean }

// Páginas principais (Categorias, Configurações) voltam para "Mais" no celular;
// no desktop o menu lateral já leva a elas, então o Voltar some.
export function PageHeader({ title, backHref, backOnMobileOnly = false }: Props) {
  return (
    <header className="flex items-center gap-2">
      <Link
        href={backHref}
        aria-label="Voltar"
        className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken ${backOnMobileOnly ? 'md:hidden' : ''}`}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">{title}</h1>
    </header>
  )
}
