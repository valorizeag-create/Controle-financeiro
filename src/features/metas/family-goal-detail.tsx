'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/ui/button'
import { ConfirmAction } from '@/ui/confirm'
import type { FamilyGoalRow } from '@/features/familia/types'
import { deleteFamilyGoal, deleteFamilyGoalUse } from './family-goal-actions'
import { GoalHero, GoalHistory } from './goal-detail'
import type { FamilyGoalDetailView } from './view-model'

// A4 B: o cabeçalho mostra o total da família e só a parte da própria pessoa; o histórico é só dela.
// Usar a meta e excluir são do administrador: aqui só somem para os outros, quem decide é o banco.
type Props = {
  goal: FamilyGoalRow
  view: FamilyGoalDetailView
  isAdmin: boolean
  canEdit: boolean
}

export function FamilyGoalDetail({ goal, view, isAdmin, canEdit }: Props) {
  const { myPartCents, canDeposit, canWithdraw, canUse, history } = view
  const showUse = isAdmin && canUse
  const showMore = canEdit || isAdmin

  return (
    <>
      <GoalHero view={view} myPartCents={myPartCents} showUseLink={false} />

      {(canDeposit || canWithdraw || showUse) && (
        <div className="flex flex-col gap-2">
          {canDeposit && (
            <Button href={`/metas/${goal.id}/guardar`} className="h-[52px]">
              <Plus className="size-[18px]" aria-hidden="true" />
              Guardar dinheiro
            </Button>
          )}
          {(canWithdraw || showUse) && (
            <div className="grid grid-cols-2 gap-2">
              {canWithdraw && (
                <Button variant="secondary" href={`/metas/${goal.id}/tirar`}>
                  Tirar dinheiro
                </Button>
              )}
              {showUse && (
                <Button variant="secondary" href={`/metas/${goal.id}/usar`}>
                  Usar o dinheiro da meta
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {showMore && (
        <details className="rounded-card border border-line bg-card px-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-[15px] font-medium text-ink">Mais opções</summary>
          <div className="flex flex-col gap-2 pb-4">
            {canEdit && (
              <Link
                href={`/metas/${goal.id}/editar`}
                className="flex min-h-11 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
              >
                Editar
              </Link>
            )}
            {isAdmin && (
              <ConfirmAction
                trigger="Excluir"
                triggerClassName="flex min-h-11 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
                title={`Excluir ${goal.name}?`}
                body="O valor guardado continua registrado no seu histórico. A parte de cada pessoa volta para quem guardou."
                confirmLabel="Excluir"
                cancelLabel="Cancelar"
                action={deleteFamilyGoal}
                fields={{ id: goal.id }}
              />
            )}
          </div>
        </details>
      )}

      <GoalHistory goalId={goal.id} items={history} deleteUse={isAdmin ? deleteFamilyGoalUse : null} />
    </>
  )
}
