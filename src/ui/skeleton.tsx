// Blocos cinza com um brilho passando, no formato da tela que está carregando. Puramente visual:
// o marco principal leva aria-busy, e nenhum texto novo aparece.
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-brilho rounded-control bg-[linear-gradient(90deg,var(--color-sunken)_25%,#fafafa_50%,var(--color-sunken)_75%)] bg-[length:200%_100%] ${className}`}
    />
  )
}

function Rows({ count }: { count: number }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-card px-4 py-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-linha className="flex min-h-[68px] items-center gap-3 border-b border-line last:border-b-0">
          <Skeleton className="size-10 shrink-0 rounded-panel" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

// "mes": cabeçalho, o cartão grande do Disponível e uma lista (Seu mês, Relatórios, Planejamento).
// "lista": cabeçalho e uma lista (Extrato, Contas, Metas, Família).
export function PageSkeleton({ variant }: { variant: 'mes' | 'lista' }) {
  return (
    <main aria-busy="true" className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 py-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-48" />
        </div>
        {variant === 'mes' && (
          <div data-destaque className="flex flex-col gap-4 rounded-hero border border-brand-wash-border bg-brand-wash p-5 md:p-7">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-12 w-full rounded-panel" />
          </div>
        )}
        <Rows count={variant === 'mes' ? 3 : 6} />
      </div>
    </main>
  )
}
