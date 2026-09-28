import { createCard } from '@/features/cartoes/actions'
import { CardForm } from '@/features/cartoes/card-form'
import { PageHeader } from '@/ui/page-header'

export default function NovoCartaoPage() {
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Novo cartão" backHref="/cartoes" />
      <CardForm action={createCard} />
    </main>
  )
}
