import 'server-only'
import { z } from 'zod'

// Variáveis que só o servidor lê (push, e-mail e a tarefa dos avisos).
// Diferente de `@/lib/env`: aqui nada derruba o app. Valor ausente ou
// malformado devolve `null` e o recurso fica desligado.
// A chave de serviço do Supabase não é lida aqui nem em nenhum outro arquivo
// de `src/`: é só de testes e de scripts locais.

type Env = Record<string, string | undefined>

export type PushConfig = { publicKey: string; privateKey: string; subject: string }
export type MailConfig = { host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string }
export type JobConfig = { secret: string }

// Linha sem valor no .env chega como texto vazio: é o mesmo que não existir.
const present = (v: string | undefined): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

const pushSchema = z.object({
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
  privateKey: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/),
  subject: z.string().max(200).regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/),
})

// A chave pública vai para o navegador (é com ela que o aparelho se inscreve);
// a privada só existe aqui, e nunca numa variável NEXT_PUBLIC_.
export function readPushConfig(e: Env = process.env): PushConfig | null {
  const parsed = pushSchema.safeParse({
    publicKey: present(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    privateKey: present(e.VAPID_PRIVATE_KEY),
    subject: present(e.VAPID_SUBJECT),
  })
  return parsed.success ? parsed.data : null
}

const mailSchema = z.object({
  host: z.string().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/),
  port: z.string().regex(/^\d{1,5}$/).optional(),
  user: z.string().min(1).max(320).optional(),
  pass: z.string().min(1).max(1000).optional(),
  from: z.string().min(3).max(320).regex(/^[^\r\n]*@[^\r\n]*$/),
})

export function readMailConfig(e: Env = process.env): MailConfig | null {
  const parsed = mailSchema.safeParse({
    host: present(e.SMTP_HOST),
    port: present(e.SMTP_PORT),
    user: present(e.SMTP_USER),
    pass: present(e.SMTP_PASS),
    from: present(e.MAIL_FROM),
  })
  if (!parsed.success) return null
  const { host, user, pass, from } = parsed.data
  const port = parsed.data.port === undefined ? 587 : Number(parsed.data.port)
  if (port < 1 || port > 65535) return null
  if ((user === undefined) !== (pass === undefined)) return null
  return { host, port, secure: e.SMTP_SECURE === 'true', user: user ?? null, pass: pass ?? null, from }
}

// O segredo é gerado, nunca escolhido: 32 bytes ao acaso em base64url (43
// caracteres). O banco recusa o que estiver fora de 43 a 128.
const jobSchema = z.object({ secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/) })

export function readJobConfig(e: Env = process.env): JobConfig | null {
  const parsed = jobSchema.safeParse({ secret: present(e.JOB_SECRET) })
  return parsed.success ? parsed.data : null
}
