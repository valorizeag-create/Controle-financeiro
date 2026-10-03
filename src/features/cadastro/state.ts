export const REAUTH_DELETE = 'Por segurança, saia e entre de novo antes de excluir o cadastro.'
export const REAUTH_EMAIL = 'Por segurança, saia e entre de novo antes de trocar o e-mail.'
export const CONFIRM_HINT = 'Digite EXCLUIR para confirmar.'

export type ConfirmEmailState = { status: 'idle' | 'half' | 'done' | 'invalid' | 'error' }
export const confirmIdle: ConfirmEmailState = { status: 'idle' }
