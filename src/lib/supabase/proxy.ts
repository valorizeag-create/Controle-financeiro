import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { isAnonOnlyPath, isPublicPath } from '@/features/auth/routes'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let cacheHeaders: Record<string, string> = {}
  const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        cacheHeaders = headers ?? {}
        Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    const r = NextResponse.redirect(url)
    response.cookies.getAll().forEach((c) => r.cookies.set(c))
    Object.entries(cacheHeaders).forEach(([key, value]) => r.headers.set(key, value))
    return r
  }

  if (!data.user && !isPublicPath(path)) return redirectTo('/entrar')
  if (data.user && isAnonOnlyPath(path)) return redirectTo('/inicio')
  return response
}
