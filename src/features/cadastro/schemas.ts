import { resetSchema } from '@/features/auth/schemas'

// Mesmo formato do e-mail do restante do app: aparado, em minúsculas, com a mensagem da copy.
export const emailChangeSchema = resetSchema

export { TOKEN_HASH } from './token'

export const SAME_EMAIL = 'Esse já é o seu e-mail.'
