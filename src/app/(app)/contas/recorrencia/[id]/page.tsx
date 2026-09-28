import { notFound } from 'next/navigation'
import { z } from 'zod'
import { loadCategories } from '@/features/registro/queries'
import { loadRecurrence } from '@/features/contas/queries'
import { endRecurrence, updateRecurrence } from '@/features/contas/actions'
import { RecurrenceForm } from '@/features/contas/recurrence-form'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function EditarRecorrenciaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const [recurrence, categories] = await Promise.all([loadRecurrence(id), loadCategories()])
  if (!recurrence) notFound()

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={recurrence.name} backHref="/contas" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <RecurrenceForm kind={recurrence.kind} categories={categories} action={updateRecurrence} recurrence={recurrence} />
      <ConfirmAction
        trigger="Encerrar"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title={`Encerrar "${recurrence.name}"?`}
        body="As próximas não serão criadas. O que já foi pago continua no Extrato."
        confirmLabel="Encerrar"
        cancelLabel="Cancelar"
        action={endRecurrence}
        fields={{ id }}
      />
    </main>
  )
}
