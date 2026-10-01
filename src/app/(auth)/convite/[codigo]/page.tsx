import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { INVITE_CODE } from '@/features/familia/schemas'
import { InviteScreen } from '@/features/familia/invite-screen'
import { inviteView } from '@/features/familia/view-model'

// O código na barra de endereço é um segredo: a página não aparece em busca nem vaza no Referer.
export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' }

type Preview = { family_name: string; invited_by: string | null }

// Pública: quem não entrou vê a prévia e volta ao convite depois de entrar. A sessão é lida aqui, sem redirecionar.
export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{ erro?: string | string[] }>
}) {
  const { codigo } = await params
  const { erro: rawErro } = await searchParams
  const erro = typeof rawErro === 'string' ? rawErro : undefined

  // Código fora do formato: nem chega ao banco.
  if (!INVITE_CODE.test(codigo)) return <InviteScreen view={{ kind: 'invalid' }} />

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const signedIn = Boolean(data.user)

  let preview: { familyName: string; invitedBy: string | null } | null = null
  if (signedIn && erro !== 'familia' && erro !== 'convite') {
    const res = await supabase.rpc('invite_preview', { p_code: codigo })
    if (res.error) throw res.error
    const row = ((res.data ?? []) as Preview[])[0]
    if (row) preview = { familyName: row.family_name, invitedBy: row.invited_by }
  }

  const view = inviteView({ code: codigo, signedIn, erro, preview })
  return <InviteScreen view={view} transientError={erro === '1' && view.kind === 'ready'} />
}
