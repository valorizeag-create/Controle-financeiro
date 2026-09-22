const PUBLIC = new Set(['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/auth/callback', '/termos', '/privacidade'])
const ANON_ONLY = new Set(['/entrar', '/criar-cadastro', '/recuperar-senha'])

export const isPublicPath = (path: string) => PUBLIC.has(path)
export const isAnonOnlyPath = (path: string) => ANON_ONLY.has(path)

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/inicio'
  return next
}
