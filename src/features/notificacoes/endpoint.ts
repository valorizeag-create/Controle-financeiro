// Endereço de push: o servidor só chama os serviços conhecidos (Chrome/Edge,
// Firefox, Windows, Safari), sempre por https. Sem isso, alguém poderia gravar
// como "endereço de push" um endereço interno para o servidor chamar.
// A regra é a mesma do banco (tabela push_subscriptions e
// save_push_subscription, em supabase/migrations/20261002000001_notificacoes.sql):
// mudou aqui, mude lá.
const RULE =
  /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\/\S*$/

const SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com']

export function isAllowedPushEndpoint(url: unknown): boolean {
  if (typeof url !== 'string' || url.length < 20 || url.length > 2048) return false
  if (!RULE.test(url)) return false
  // Segunda leitura, por um analisador de endereços. Quem envia (web-push) usa
  // outro analisador (url.parse), então a proteção de verdade é a regra acima,
  // sobre o texto cru: ela não deixa espaço para os dois lerem o endereço de
  // jeitos diferentes. Não afrouxe a regra confiando nesta conferência.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.port !== '') return false
  const host = parsed.hostname
  return host === 'fcm.googleapis.com' || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}
