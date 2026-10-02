const PUBLIC = new Set(['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/auth/callback', '/termos', '/privacidade', '/confirmar-email', '/cadastro-excluido'])
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

// Toque em "marcar como paga" numa notificação sem sessão: depois de entrar, volta à mesma tela.
// Só os dois formatos exatos que o aviso gera (id minúsculo); nada mais passa por aqui.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PAY_RETURN = [
  new RegExp(String.raw`^/contas\?mes=20\d{2}-(0[1-9]|1[0-2])&pagar=${UUID}$`),
  new RegExp(String.raw`^/familia/contas\?pagar=${UUID}$`),
]

// `next` vem de searchParams ou de formulário: pode ser lista (?next=a&next=b) ou outra coisa que não texto.
export function inviteReturn(next: unknown): string | null {
  if (typeof next !== 'string' || !next || safeNext(next) !== next) return null
  return INVITE_RETURN.test(next) || PAY_RETURN.some((re) => re.test(next)) ? next : null
}

// Para onde levar quem não entrou: /entrar, guardando o retorno só quando for um dos formatos exatos.
export function loginPath(pathWithSearch: string): string {
  return withNext('/entrar', pathWithSearch)
}

export function withNext(path: string, next: unknown): string {
  const back = inviteReturn(next)
  return back ? `${path}?next=${encodeURIComponent(back)}` : path
}
