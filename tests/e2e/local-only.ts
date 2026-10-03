// Guarda de segurança dos testes de ponta a ponta que entregam avisos ou enviam e-mail.
// Esses testes só rodam contra o Supabase local e a caixa de e-mail local: apontados para um banco
// hospedado ou para um servidor de e-mail de verdade, mandariam avisos e e-mails a pessoas de verdade.
// Não é um jeito de pular teste: no ambiente local (o do README) eles rodam por inteiro.

type Env = Record<string, string | undefined>

const LOCAL_HOSTS = ['localhost', '127.0.0.1']

// Só http(s)://localhost ou 127.0.0.1 (com ou sem porta). Qualquer outra coisa, inclusive vazio, não é local.
export function isLocalUrl(url: string | undefined): boolean {
  if (typeof url !== 'string' || !/^https?:\/\/[^\s@\\]+$/.test(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.username === '' && parsed.password === '' && LOCAL_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

export function isLocalHost(host: string | undefined): boolean {
  return typeof host === 'string' && LOCAL_HOSTS.includes(host)
}

export const LOCAL_ONLY = 'só contra o Supabase local e a caixa de e-mail local (README): nada sai da máquina'

// A tarefa entrega o que estiver na fila de TODAS as pessoas do banco, com o push e o e-mail configurados:
// banco local, e e-mail desligado ou local.
export function jobTestIsLocal(env: Env = process.env): boolean {
  return isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL) && (!env.SMTP_HOST || isLocalHost(env.SMTP_HOST))
}

// O convite envia e-mail de verdade pelo servidor configurado: banco local e servidor de e-mail local.
export function inviteTestIsLocal(env: Env = process.env): boolean {
  return isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL) && isLocalHost(env.SMTP_HOST)
}

// A troca de e-mail é enviada pelo Supabase Auth: com o banco local, os e-mails caem na caixa local.
export function authEmailTestIsLocal(env: Env = process.env): boolean {
  return isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)
}
