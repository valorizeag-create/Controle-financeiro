export const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

// Com secure_password_change ligado (supabase/config.toml), trocar a senha
// exige login recente; o Supabase responde "reauthentication_needed".
export function passwordUpdateMessage(code: string | undefined): string {
  if (code === 'reauthentication_needed') return 'Por segurança, saia e entre de novo antes de mudar a senha.'
  if (code === 'same_password') return 'Essa já é a sua senha. Escolha uma diferente.'
  return UNEXPECTED
}
