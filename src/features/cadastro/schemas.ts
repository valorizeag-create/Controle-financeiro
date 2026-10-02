import { resetSchema } from '@/features/auth/schemas'

// Mesmo formato do e-mail do restante do app: aparado, em minúsculas, com a mensagem da copy.
export const emailChangeSchema = resetSchema

// Formato do código que o Supabase põe no link (com ou sem o prefixo "pkce_"). É segredo de uso único.
export const TOKEN_HASH = /^[A-Za-z0-9_-]{16,128}$/

export const SAME_EMAIL = 'Esse já é o seu e-mail.'
