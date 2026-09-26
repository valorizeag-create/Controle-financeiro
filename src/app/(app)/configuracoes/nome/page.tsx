import { loadProfile } from '@/features/perfil/queries'
import { NameForm } from '@/features/perfil/forms'
import { PageHeader } from '@/ui/page-header'

export default async function NomePage() {
  const profile = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Nome" backHref="/configuracoes" />
      <NameForm defaultValue={profile.displayName} />
    </main>
  )
}
