import { formatBRL } from '@/domain/money'
import { loadProfile } from '@/features/perfil/queries'
import { ListCard, ListRow, ListSection, RowLink, RowStatic } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'

// Seções que chegam depois: Cartões (Plano 4), Lembretes e App (Plano 8),
// Seus dados e troca de e-mail (Plano 9).
export default async function ConfiguracoesPage() {
  const p = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-[18px] px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Configurações" backHref="/mais" backOnMobileOnly />
      <ListSection title="Seu cadastro">
        <ListCard>
          <ListRow><RowLink href="/configuracoes/nome" caption="Nome" title={p.displayName} /></ListRow>
          <ListRow><RowStatic caption="E-mail" title={p.email} /></ListRow>
          <ListRow><RowLink href="/nova-senha?de=configuracoes" title="Mudar senha" /></ListRow>
        </ListCard>
      </ListSection>
      <ListSection title="Seu dinheiro">
        <ListCard>
          <ListRow><RowLink href="/configuracoes/saldo-inicial" caption="Quanto você tinha ao começar" title={formatBRL(p.initialBalanceCents)} /></ListRow>
          <ListRow><RowLink href="/categorias" title="Categorias" value={String(p.categoriesCount)} /></ListRow>
        </ListCard>
      </ListSection>
    </main>
  )
}
