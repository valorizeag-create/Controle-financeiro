import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { deleteCategory, renameCategory } from '@/features/categorias/actions'
import { CategoryForm } from '@/features/categorias/category-form'
import { loadCategories } from '@/features/registro/queries'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function CategoriaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const category = (await loadCategories()).find((c) => c.id === id)
  if (!category) notFound()
  if (category.defaultKey === 'outros') redirect('/categorias')

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={category.name} backHref="/categorias" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <CategoryForm action={renameCategory} submitLabel="Salvar alterações" category={{ id: category.id, name: category.name }} />
      <ConfirmAction
        trigger="Excluir"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title={`Excluir a categoria "${category.name}"?`}
        body={'Os gastos desta categoria vão para "Outros". Nada será apagado.'}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        action={deleteCategory}
        fields={{ id: category.id }}
      />
    </main>
  )
}
