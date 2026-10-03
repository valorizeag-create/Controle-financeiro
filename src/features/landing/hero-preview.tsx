import { Money } from '@/ui/money'

// Desenho do Seu mês só com HTML e CSS: decorativo, escondido de leitores de tela (a página explica o mesmo em texto).
export function HeroPreview() {
  return (
    <div aria-hidden="true" data-landing-preview className="w-full max-w-[420px] rounded-hero border border-line bg-card p-6 shadow-sheet">
      <p className="text-sm font-semibold text-muted">Seu mês até agora</p>
      <p className="mt-3 text-sm text-muted">Disponível</p>
      <Money cents={124000} className="block text-[40px] font-bold leading-tight tracking-tight text-ink" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-panel bg-brand-wash px-4 py-3">
          <p className="text-sm text-muted">Entrou</p>
          <Money cents={500000} className="block text-lg font-semibold text-brand-text" />
        </div>
        <div className="rounded-panel bg-sunken px-4 py-3">
          <p className="text-sm text-muted">Saiu</p>
          <Money cents={346000} className="block text-lg font-semibold text-ink" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-panel border border-line px-4 py-3">
        <p className="text-sm text-muted">Guardado este mês</p>
        <Money cents={30000} className="text-base font-semibold text-ink" />
      </div>
      <p className="mt-4 text-sm text-body">
        Seu maior gasto foi com <strong className="text-ink">Mercado</strong>: <Money cents={89000} />.
      </p>
    </div>
  )
}
