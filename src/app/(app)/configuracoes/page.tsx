import { formatBRL } from '@/domain/money'
import { loadFamilySummaryOrNull } from '@/features/familia/queries'
import { loadSignIn } from '@/features/cadastro/queries'
import { loadNotificationPrefs } from '@/features/notificacoes/queries'
import { RemindersSection } from '@/features/notificacoes/reminders-section'
import { loadProfile } from '@/features/perfil/queries'
import { env } from '@/lib/env'
import { WIDE } from '@/ui/columns'
import { FormAlert } from '@/ui/form-alert'
import { ListCard, ListRow, ListSection, RowLink, RowStatic } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const [p, prefs, family, signIn] = await Promise.all([loadProfile(), loadNotificationPrefs(), loadFamilySummaryOrNull(), loadSignIn()])
  return (
    <main className={`mx-auto flex max-w-[720px] ${WIDE} flex-col gap-[18px] px-4 pt-4 md:px-9 md:pt-7`}>
      <PageHeader title="Configurações" backHref="/mais" backOnMobileOnly />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <div data-settings-columns className="flex flex-col gap-[18px] lg:block lg:columns-2 lg:gap-x-6">
        <div className="break-inside-avoid lg:mb-[18px]">
        <ListSection title="Seu cadastro">
          <ListCard>
            <ListRow><RowLink href="/configuracoes/nome" caption="Nome" title={p.displayName} /></ListRow>
            <ListRow>
              {signIn.hasPassword ? (
                <RowLink href="/configuracoes/e-mail" caption="E-mail" title={p.email} />
              ) : (
                <RowStatic caption="E-mail" title={p.email} />
              )}
            </ListRow>
            <ListRow><RowLink href="/nova-senha?de=configuracoes" title="Mudar senha" /></ListRow>
          </ListCard>
        </ListSection>
        </div>
        <div className="break-inside-avoid lg:mb-[18px]">
        <ListSection title="Seu dinheiro">
          <ListCard>
            <ListRow><RowLink href="/configuracoes/saldo-inicial" caption="Quanto você tinha ao começar" title={formatBRL(p.initialBalanceCents)} /></ListRow>
            <ListRow><RowLink href="/categorias" title="Categorias" value={String(p.categoriesCount)} /></ListRow>
          </ListCard>
        </ListSection>
        </div>
        <div className="break-inside-avoid lg:mb-[18px]">
        <RemindersSection prefs={prefs} hasFamily={family !== null} vapidPublicKey={env.vapidPublicKey} />
        </div>
        <div className="break-inside-avoid lg:mb-[18px]">
        <ListSection title="App">
          <ListCard>
            <ListRow><RowLink href="/configuracoes/instalar" title="Adicionar à tela de início" /></ListRow>
          </ListCard>
        </ListSection>
        </div>
        <div className="break-inside-avoid lg:mb-[18px]">
        <ListSection title="Seus dados">
          <ListCard>
            <ListRow><RowLink href="/configuracoes/dados" title="Baixar meus dados" /></ListRow>
            <ListRow><RowLink href="/termos" title="Termos de uso" /></ListRow>
            <ListRow><RowLink href="/privacidade" title="Política de privacidade" /></ListRow>
            <ListRow><RowLink href="/configuracoes/excluir" title="Excluir meu cadastro" /></ListRow>
          </ListCard>
        </ListSection>
        </div>
      </div>
    </main>
  )
}
