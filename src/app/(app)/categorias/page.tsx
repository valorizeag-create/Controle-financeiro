import { loadCategories } from '@/features/registro/queries'
import { Button } from '@/ui/button'
import { ListCard, ListRow, RowLink, RowStatic } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'

export default async function CategoriasPage() {
  const categories = await loadCategories()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Para onde seu dinheiro vai" backHref="/mais" backOnMobileOnly />
      <p className="text-[15px]">Cada gasto vai para um lugar. Assim fica fácil enxergar o todo.</p>
      <ListCard>
        {categories.map((c) => (
          <ListRow key={c.id}>
            {/* "Outros" recebe os gastos de categorias excluídas: não é renomeada nem excluída. */}
            {c.defaultKey === 'outros' ? <RowStatic title={c.name} /> : <RowLink href={`/categorias/${c.id}`} title={c.name} />}
          </ListRow>
        ))}
      </ListCard>
      <Button href="/categorias/nova">Criar categoria</Button>
    </main>
  )
}
