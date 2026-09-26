import { createCategory } from '@/features/categorias/actions'
import { CategoryForm } from '@/features/categorias/category-form'
import { PageHeader } from '@/ui/page-header'

export default function NovaCategoriaPage() {
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Criar categoria" backHref="/categorias" />
      <CategoryForm action={createCategory} submitLabel="Criar categoria" />
    </main>
  )
}
