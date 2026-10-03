import type { ReactNode } from 'react'

// Duas colunas só a partir de 1024 px (`lg:`); abaixo disso, uma coluna.
// Regra: os filhos de `Columns` ficam na ORDEM DO CELULAR. `AsideColumn row={1}` pode vir antes
// de `MainColumn` no DOM (resumo no topo do celular); `row={2}` vem depois. O desktop só
// posiciona (grade), nunca reordena: sem `order-*`, `flex-row-reverse` ou `flex-col-reverse`.

export const WIDE = 'lg:max-w-[1180px]'

export function Columns({ children }: { children: ReactNode }) {
  return (
    <div
      data-columns
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-4"
    >
      {children}
    </div>
  )
}

export function MainColumn({ children }: { children: ReactNode }) {
  return (
    <div data-column="main" className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1 lg:row-span-2">
      {children}
    </div>
  )
}

export function AsideColumn({ children, row = 1 }: { children: ReactNode; row?: 1 | 2 }) {
  return (
    <div
      data-column="aside"
      data-row={row}
      className={`flex min-w-0 flex-col gap-4 lg:col-start-2 ${row === 1 ? 'lg:row-start-1' : 'lg:row-start-2'}`}
    >
      {children}
    </div>
  )
}
