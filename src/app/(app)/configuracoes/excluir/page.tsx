import { DeleteForm } from '@/features/cadastro/delete-form'
import { loadDeletionContext } from '@/features/cadastro/queries'
import { REAUTH_DELETE } from '@/features/cadastro/state'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

export default async function ExcluirPage() {
  const ctx = await loadDeletionContext()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Excluir seu cadastro" backHref="/configuracoes" />
      {ctx.sessionRecent ? (
        <DeleteForm notice={ctx.notice} shareCents={ctx.shareCents} passesAdmin={ctx.passesAdmin} />
      ) : (
        // Sem formulário: a pessoa não digita EXCLUIR à toa para só então ser mandada sair e entrar.
        <>
          <FormAlert>{REAUTH_DELETE}</FormAlert>
          <SignOutButton variant="row" />
        </>
      )}
    </main>
  )
}
