import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o proxy renova a sessão.
        }
      },
    },
  })
}

// `cache()` memoiza por requisição: várias chamadas a requireUser() no mesmo
// request (layout + página, por exemplo) reaproveitam a mesma checagem de
// sessão em vez de bater no Supabase de novo a cada uma.
export const requireUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/entrar')
  return { id: data.user.id, email: data.user.email ?? '' }
})
