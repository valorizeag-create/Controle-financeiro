const ALLOWED = /^\/(inicio|contas)(\?mes=20\d{2}-(0[1-9]|1[0-2])(&aba=(a-pagar|pagas|vencidas))?)?$/

export function safeReturnPath(raw: string): string {
  return ALLOWED.test(raw) ? raw : '/contas'
}
