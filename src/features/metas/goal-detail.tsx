'use client'

import Link from 'next/link'
import { Plus, Target } from 'lucide-react'
import { Button } from '@/ui/button'
import { AnimatedMoney } from '@/ui/animated-money'
import { ProgressBar } from '@/ui/progress-bar'
import { ConfirmAction } from '@/ui/confirm'
import { formatBRL } from '@/domain/money'
import { deleteGoalUse } from './movement-actions'
import type { GoalDetailView, GoalHistoryItem } from './view-model'

// `myPartCents` (meta da família): o resumo é o total de todos e "Sua parte" é só da pessoa.
// `showUseLink: false` esconde "Usar o dinheiro da meta" (na família, só o administrador usa, e a ação fica nos botões).
export function GoalHero({ view, myPartCents, showUseLink = true }: { view: GoalDetailView; myPartCents?: number; showUseLink?: boolean }) {
  const { summary, state, celebration, usedText } = view
  const { goal, balanceCents, percent, remainingText, suggestion } = summary

  return (
    <section data-testid="meta-resumo" className="flex flex-col gap-3.5 rounded-hero border border-brand-wash-border bg-brand-wash p-5">
      <span className="text-[15px] font-medium text-brand-text">Guardado</span>
      <div className="flex items-baseline gap-2">
        <AnimatedMoney cents={balanceCents} className="text-[40px] font-bold leading-none text-brand-ink" />
        <span className="text-[15px] text-brand-text">de {formatBRL(goal.targetCents)}</span>
      </div>
      <ProgressBar percent={percent} size="lg" label={`Progresso de ${goal.name}`} />
      {myPartCents !== undefined && <p className="text-[15px] font-medium text-brand-ink">Sua parte: {formatBRL(myPartCents)}</p>}

      {state === 'active' && (
        <>
          {remainingText && <p className="text-base text-brand-ink">{remainingText}</p>}
          {suggestion && (
            <div className="rounded-panel bg-card px-3.5 py-3 text-sm leading-relaxed text-body">
              Para chegar até {suggestion.untilLabel}, guarde cerca de <strong className="text-ink">{suggestion.perMonth}</strong>.
            </div>
          )}
        </>
      )}

      {state === 'complete' && (
        <div className="flex flex-col gap-3 rounded-card bg-brand p-[22px] text-brand-ink">
          <Target className="size-8" aria-hidden="true" />
          {celebration && <p className="text-xl font-bold leading-snug">{celebration}</p>}
          {showUseLink && (
            <Link
              href={`/metas/${goal.id}/usar`}
              className="inline-flex min-h-11 w-fit items-center rounded-panel bg-brand-ink px-4 text-[15px] font-semibold text-white"
            >
              Usar o dinheiro da meta
            </Link>
          )}
        </div>
      )}

      {state === 'used' && usedText && <p className="text-base text-brand-ink">{usedText}</p>}
    </section>
  )
}

export function GoalActions({ view }: { view: GoalDetailView }) {
  const { canDeposit, canWithdraw, canUse, summary } = view
  const id = summary.goal.id

  if (!canDeposit && !canWithdraw && !canUse) return null

  return (
    <div className="flex flex-col gap-2">
      {canDeposit && (
        <Button href={`/metas/${id}/guardar`} className="h-[52px]">
          <Plus className="size-[18px]" aria-hidden="true" />
          Guardar dinheiro
        </Button>
      )}
      {(canWithdraw || canUse) && (
        <div className="grid grid-cols-2 gap-2">
          {canWithdraw && (
            <Button variant="secondary" href={`/metas/${id}/tirar`}>
              Tirar dinheiro
            </Button>
          )}
          {canUse && (
            <Button variant="secondary" href={`/metas/${id}/usar`}>
              Usar o dinheiro
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// `deleteUse`: a ação que desfaz o uso (a da meta da família, para o administrador); `null` esconde o botão.
export function GoalHistory({
  goalId,
  items,
  deleteUse = deleteGoalUse,
}: {
  goalId: string
  items: GoalHistoryItem[]
  deleteUse?: ((fd: FormData) => Promise<void>) | null
}) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="historico-heading" className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
      <h2 id="historico-heading" className="text-[17px] font-semibold text-ink">Histórico</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line pb-3 text-[15px] last:border-b-0 last:pb-0">
            <span className="flex flex-col gap-0.5">
              <span className="text-ink">{item.label}</span>
              <span className="text-[13px] text-muted">{item.dateLabel}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`font-semibold ${item.positive ? 'text-brand-text' : 'text-ink'}`}>{item.amountText}</span>
              {item.transactionId && deleteUse && (
                <ConfirmAction
                  trigger="Excluir"
                  triggerAriaLabel={`Excluir o gasto de ${item.dateLabel}`}
                  title="Excluir este gasto?"
                  body="Seu mês será recalculado. O valor volta para a meta."
                  confirmLabel="Excluir"
                  cancelLabel="Cancelar"
                  action={deleteUse}
                  fields={{ transactionId: item.transactionId, goalId }}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
