'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { CHIP } from '@/ui/chip'
import { idle } from '@/lib/forms'
import { formatBRL, parseBRL } from '@/domain/money'
import type { Category } from '@/features/registro/queries'
import { spendFromGoal } from './movement-actions'
import { spendFromFamilyGoal } from './family-goal-actions'

// `family`: meta da família, usada pelo administrador (balanceCents = total da família). O banco divide o uso entre as partes;
// o que passar do total sai do Disponível do administrador, então o aviso da diferença vale igual.
type Props = { goalId: string; balanceCents: number; categories: Category[]; family?: boolean }

export function UseGoalForm({ goalId, balanceCents, categories, family = false }: Props) {
  const [state, action, pending] = useActionState(family ? spendFromFamilyGoal : spendFromGoal, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? {}
  const e = err?.fieldErrors ?? {}
  const [amount, setAmount] = useState(v.amount ?? '')

  const parsed = parseBRL(amount)
  const diffCents = parsed !== null && parsed > balanceCents ? parsed - balanceCents : null

  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="id" value={goalId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">Quanto foi o gasto?</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          aria-invalid={e.amount ? true : undefined}
          aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink placeholder:text-[#a3a3a3] ${
            e.amount ? 'border-error-ink' : 'border-brand'
          }`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
        {diffCents !== null && (
          <p aria-live="polite" className="text-sm text-muted">
            {`A diferença de ${formatBRL(diffCents)} sai do seu Disponível deste mês.`}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2.5" aria-describedby={e.categoryId ? 'cat-error' : undefined}>
        <legend className="mb-2.5 text-[15px] font-medium">Com o quê?</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className={CHIP}>
              <input type="radio" name="categoryId" value={c.id} defaultChecked={v.categoryId === c.id} className="sr-only" />
              {c.name}
            </label>
          ))}
        </div>
        {e.categoryId && <span id="cat-error" className="text-sm text-error-ink">{e.categoryId}</span>}
      </fieldset>

      {!family && (
        <p className="text-sm text-muted">
          Esse gasto não sai do seu Disponível de novo: o dinheiro já tinha saído quando foi guardado.
        </p>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">Usar o dinheiro da meta</Button>
    </form>
  )
}
