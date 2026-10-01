import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/ui/card'
import { FormAlert } from '@/ui/form-alert'
import { ListCard, ListRow } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'
import { revokeInvite } from './actions'
import { FamilyCreate } from './family-create'
import { InvitePanel } from './invite-panel'
import { LeaveFamily } from './leave-family'
import { MemberActions } from './member-actions'
import type { FamiliaPageView } from './view-model'

const SEES =
  'Só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O Disponível, as entradas, os cartões e as metas individuais de cada pessoa continuam privados.'
const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

function Sees() {
  return (
    <Card labelledBy="sees-title">
      <h2 id="sees-title" className="text-base font-semibold text-ink">O que a família vê</h2>
      <p className="mt-2 text-[15px] text-muted">{SEES}</p>
    </Card>
  )
}

// Valores desconhecidos de `erro` são ignorados.
function ErrorAlert({ erro }: { erro: string | undefined }) {
  if (erro === 'admin') return <FormAlert>Antes de sair, escolha quem vai administrar a família.</FormAlert>
  if (erro === '1') return <FormAlert>{UNEXPECTED}</FormAlert>
  return null
}

function CardLink({ href, title, caption }: { href: string; title: string; caption?: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-card px-4 py-3 text-ink shadow-card">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {caption && <span className="text-[13px] text-muted">{caption}</span>}
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}

export function FamiliaPage({ view, erro }: { view: FamiliaPageView; erro?: string }) {
  if (view.kind === 'none') {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-[18px] px-4 pt-4 md:px-9 md:pt-7">
        <PageHeader title="Família" backHref="/mais" backOnMobileOnly />
        <ErrorAlert erro={erro} />
        <Card labelledBy="create-title">
          <h2 id="create-title" className="text-lg font-semibold text-ink">Criar família</h2>
          <p className="mb-4 mt-2 text-[15px] text-muted">
            Anote os gastos da casa junto com quem mora com você. Cada pessoa continua com o próprio mês.
          </p>
          <FamilyCreate />
        </Card>
        <p className="px-1 text-[15px] text-muted">Recebeu um convite? Abra o link que chegou para você.</p>
        <Sees />
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-[18px] px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={view.name} backHref="/mais" backOnMobileOnly />
      <ErrorAlert erro={erro} />
      <CardLink href="/inicio/familia" title="Ver o mês da família" caption="Gastos comuns, contas e metas da casa" />
      <CardLink href="/familia/contas" title="Contas da família" />

      <section aria-labelledby="members-title" className="flex flex-col gap-2">
        <h2 id="members-title" className="px-1 text-sm font-semibold text-inactive">Quem participa</h2>
        <ListCard>
          {view.members.map((m) => (
            <ListRow key={m.userId}>
              <div className="flex flex-col gap-1 py-3">
                <div className="flex items-center gap-3.5">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-[15px] font-semibold text-ink">
                    {m.initial}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] text-ink">{m.label}</span>
                    <span className="text-[13px] text-muted">{m.caption}</span>
                  </span>
                </div>
                {view.isAdmin && !m.isMe && (
                  <div className="pl-[54px]">
                    <MemberActions userId={m.userId} name={m.label} />
                  </div>
                )}
              </div>
            </ListRow>
          ))}
        </ListCard>
      </section>

      {view.isAdmin && (view.invite || view.canInvite) && (
        <section aria-labelledby="invite-title" className="flex flex-col gap-3">
          <h2 id="invite-title" className="px-1 text-sm font-semibold text-inactive">Convidar pessoa</h2>
          {view.invite && (
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] text-ink">{view.invite.caption}</p>
              <form action={revokeInvite}>
                <input type="hidden" name="id" value={view.invite.id} />
                <button type="submit" className="min-h-11 text-sm font-medium text-error-ink">Cancelar convite</button>
              </form>
            </Card>
          )}
          {view.canInvite && <InvitePanel />}
        </section>
      )}

      {view.events.length > 0 && (
        <section aria-labelledby="events-title" className="flex flex-col gap-2">
          <h2 id="events-title" className="px-1 text-sm font-semibold text-inactive">Avisos da família</h2>
          <ListCard>
            {view.events.map((t, i) => (
              <ListRow key={i}><p className="py-3 text-[15px] text-ink">{t}</p></ListRow>
            ))}
          </ListCard>
        </section>
      )}

      <Sees />
      <LeaveFamily mode={view.leave} />
    </main>
  )
}
