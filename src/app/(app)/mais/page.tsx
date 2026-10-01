import { CalendarDays, ChartColumn, CreditCard, SlidersHorizontal, Tag, Users, Wallet } from 'lucide-react'
import { loadFamilySummary } from '@/features/familia/queries'
import { loadProfile } from '@/features/perfil/queries'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { ListCard, ListRow, RowLink } from '@/ui/list'

// Metas está na barra inferior e no menu lateral (Plano 5), não aqui.
// Família (Plano 7) fecha as áreas do protótipo: sem família, a página dela oferece criar.
export default async function MaisPage() {
  const [profile, family] = await Promise.all([loadProfile(), loadFamilySummary()])
  const initial = profile.displayName.trim().charAt(0).toUpperCase()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex items-center gap-3 pb-1">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-ink">{initial}</span>
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold text-ink">{profile.displayName}</h1>
          {family && <p className="text-sm text-muted">{family.name}</p>}
        </div>
      </header>
      <nav aria-label="Mais opções">
        <ListCard>
          <ListRow><RowLink href="/contas" title="Contas" icon={<CalendarDays className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/planejamento" title="Planejamento" icon={<Wallet className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/cartoes" title="Cartões" icon={<CreditCard className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/relatorios" title="Relatórios" icon={<ChartColumn className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
          <ListRow><RowLink href="/familia" title="Família" icon={<Users className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
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
