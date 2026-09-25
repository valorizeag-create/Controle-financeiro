import Link from 'next/link'
import { ChevronDown, Search } from 'lucide-react'
import type { Category } from '@/features/registro/queries'
import { MAX_QUERY_LENGTH, extratoHref, type ExtratoFilters } from './view-model'

const chip = (active: boolean) =>
  `flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ${
    active ? 'border-[1.5px] border-selected bg-brand-wash font-semibold text-brand-ink' : 'border border-control bg-card font-medium text-[#262626]'
  }`

type Props = { filters: ExtratoFilters; categories: Category[]; categoryName: string | null }

export function FiltersBar({ filters, categories, categoryName }: Props) {
  const withFilters = (patch: Partial<ExtratoFilters>) => extratoHref({ ...filters, ...patch })
  const isIncome = filters.kind === 'income'
  const isExpense = filters.kind === 'expense' && !filters.categoryId

  return (
    <div className="flex flex-col gap-3.5">
      <form role="search" action="/extrato" className="flex h-12 items-center gap-2.5 rounded-panel border border-control bg-card px-3.5 text-muted">
        <input type="hidden" name="mes" value={filters.month} />
        {filters.categoryId && <input type="hidden" name="categoria" value={filters.categoryId} />}
        {!filters.categoryId && filters.kind && <input type="hidden" name="tipo" value={isIncome ? 'entradas' : 'gastos'} />}
        <Search className="size-[18px] shrink-0" aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          aria-label="Buscar"
          placeholder="Buscar por nome, valor ou categoria"
          maxLength={MAX_QUERY_LENGTH}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </form>

      <nav aria-label="Filtros" className="flex flex-wrap gap-2">
        <Link href={withFilters({ kind: isIncome ? null : 'income', categoryId: null })} aria-current={isIncome ? 'true' : undefined} className={chip(isIncome)}>
          Entradas
        </Link>
        <Link href={withFilters({ kind: isExpense ? null : 'expense', categoryId: null })} aria-current={isExpense ? 'true' : undefined} className={chip(isExpense)}>
          Gastos
        </Link>
        <details role="group" aria-label="Categoria" className="relative">
          <summary className={`${chip(Boolean(filters.categoryId))} cursor-pointer list-none`}>
            {categoryName ?? 'Categoria'}
            <ChevronDown className="size-4" aria-hidden="true" />
          </summary>
          <ul className="absolute left-0 top-12 z-10 flex max-h-72 w-56 flex-col overflow-y-auto rounded-card border border-line bg-card py-1 shadow-sheet">
            {categories.map((c) => {
              const selected = filters.categoryId === c.id
              return (
                <li key={c.id}>
                  <Link
                    href={withFilters(selected ? { categoryId: null, kind: null } : { categoryId: c.id, kind: 'expense' })}
                    aria-current={selected ? 'true' : undefined}
                    className={`flex min-h-11 items-center px-4 text-[15px] ${selected ? 'bg-brand-wash font-semibold text-brand-ink' : 'text-ink hover:bg-canvas'}`}
                  >
                    {c.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </details>
      </nav>
    </div>
  )
}
