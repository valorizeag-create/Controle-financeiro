import { redirect } from 'next/navigation'
import { EmailForm } from '@/features/cadastro/email-form'
import { loadSignIn } from '@/features/cadastro/queries'
import { REAUTH_EMAIL } from '@/features/cadastro/state'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { requireUser } from '@/lib/supabase/server'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

export default async function EmailPage() {
  const user = await requireUser()
  const sign = await loadSignIn()
  // Quem entra com o Google não tem a troca: o e-mail vem de lá.
  if (!sign.hasPassword) redirect('/configuracoes')
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Trocar e-mail" backHref="/configuracoes" />
      {sign.sessionRecent ? (
        <EmailForm currentEmail={user.email} pendingEmail={sign.pendingEmail} />
      ) : (
        <>
          <FormAlert>{REAUTH_EMAIL}</FormAlert>
          <SignOutButton variant="row" />
        </>
      )}
    </main>
  )
}
