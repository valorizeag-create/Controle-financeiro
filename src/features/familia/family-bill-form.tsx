'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle } from '@/lib/forms'
import { centsToInput } from '@/features/registro/form-values'
import { updateFamilyBill } from './money-actions'

type Props = { bill: { id: string; name: string; amountCents: number; dueDay: number } }

export function FamilyBillForm({ bill }: Props) {
  const [state, action, pending] = useActionState(updateFamilyBill, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? { name: bill.name, amount: centsToInput(bill.amountCents), dueDay: String(bill.dueDay) }
  const e = err?.fieldErrors ?? {}

  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="id" value={bill.id} />
      <TextField name="name" label="Nome" defaultValue={v.name} error={e.name} />
      <TextField name="amount" label="Valor" inputMode="decimal" defaultValue={v.amount} error={e.amount} />
      <TextField name="dueDay" label="Vence dia" inputMode="numeric" defaultValue={v.dueDay} error={e.dueDay} />
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending} className="h-[52px]">Salvar conta</Button>
    </form>
  )
}
