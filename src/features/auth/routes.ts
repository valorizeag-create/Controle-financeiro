const PUBLIC = new Set(['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/auth/callback', '/termos', '/privacidade'])
const ANON_ONLY = new Set(['/entrar', '/criar-cadastro', '/recuperar-senha'])

// O convite é público só para chegar até a tela (quem não entrou é levado a entrar e volta); a página confere a sessão.
const INVITE_PATH = /^\/convite\/[^/]+$/

export const isPublicPath = (path: string) => PUBLIC.has(path) || INVITE_PATH.test(path)
export const isAnonOnlyPath = (path: string) => ANON_ONLY.has(path)

const UNSAFE_CHARS = /[\u0000-\u001F\u007F\\]/

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/inicio'
  if (UNSAFE_CHARS.test(next)) return '/inicio'
  return next
}

// Volta ao convite depois de entrar ou criar o cadastro: só o formato exato
// /convite/{código de 32 caracteres}. O código é um segredo: nunca vai para log nem aviso.
const INVITE_RETURN = /^\/convite\/[A-Za-z0-9_-]{32}$/

// `next` vem de searchParams ou de formulário: pode ser lista (?next=a&next=b) ou outra coisa que não texto.
export function inviteReturn(next: unknown): string | null {
  if (typeof next !== 'string' || !next || safeNext(next) !== next) return null
  return INVITE_RETURN.test(next) ? next : null
}

export function withNext(path: string, next: unknown): string {
  const back = inviteReturn(next)
  return back ? `${path}?next=${encodeURIComponent(back)}` : path
}
