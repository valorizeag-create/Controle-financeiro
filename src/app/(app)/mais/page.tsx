import { CalendarDays, CreditCard, SlidersHorizontal, Tag } from 'lucide-react'
import { loadProfile } from '@/features/perfil/queries'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { ListCard, ListRow, RowLink } from '@/ui/list'

// Metas está na barra inferior e no menu lateral (Plano 5), não aqui.
// Itens que ainda não existem (Planejamento, Relatórios, Família)
// entram aqui nos planos 6 e 7; nada de link para tela que não existe.
export default async function MaisPage() {
  const profile = await loadProfile()
  const initial = profile.displayName.trim().charAt(0).toUpperCase()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex items-center gap-3 pb-1">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-ink">{initial}</span>
        <h1 className="text-lg font-semibold text-ink">{profile.displayName}</h1>
      </header>
      <nav aria-label="Mais opções">
        <ListCard>
          <ListRow><RowLink href="/contas" title="Contas" icon={<CalendarDays className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/cartoes" title="Cartões" icon={<CreditCard className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/categorias" title="Categorias" icon={<Tag className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
        </ListCard>
      </nav>
      <ListCard>
        <ListRow><RowLink href="/configuracoes" title="Configurações" icon={<SlidersHorizontal className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
        <ListRow><SignOutButton variant="row" /></ListRow>
      </ListCard>
    </main>
  )
}
