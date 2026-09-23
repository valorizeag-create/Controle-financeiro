import Link from 'next/link'
import { X } from 'lucide-react'
import { loadCategories } from '@/features/registro/queries'
import { AnotarForm } from '@/features/registro/anotar-form'

export default async function AnotarPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const kind = tipo === 'entrada' ? 'income' : 'expense'
  const categories = await loadCategories()
  const tab = (active: boolean) =>
    `flex h-10 items-center justify-center rounded-control text-[15px] ${active ? 'bg-card font-semibold text-ink shadow-[0_1px_2px_rgba(18,40,1,.08)]' : 'font-medium text-inactive'}`

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-label="Anotar" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <nav aria-label="Tipo de registro" className="grid flex-1 grid-cols-2 gap-1 rounded-panel bg-sunken p-1">
            <Link href="/anotar" aria-current={kind === 'expense' ? 'page' : undefined} className={tab(kind === 'expense')}>Saiu dinheiro</Link>
            <Link href="/anotar?tipo=entrada" aria-current={kind === 'income' ? 'page' : undefined} className={tab(kind === 'income')}>Entrou dinheiro</Link>
          </nav>
          <Link href="/inicio" aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full bg-sunken text-[#262626]">
            <X className="size-5" aria-hidden="true" />
          </Link>
        </div>
        <AnotarForm key={kind} kind={kind} categories={categories} />
      </section>
    </div>
  )
}
