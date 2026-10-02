const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Alvo do "marcar como paga" aberto por uma notificação: só uma conta a pagar que a própria tela
// já lista para a pessoa. Qualquer outra coisa (id estranho, conta paga, de outra pessoa) é sem alvo.
export function payTarget(raw: string | string[] | undefined, bills: { id: string; name: string }[]): { id: string; name: string } | null {
  if (typeof raw !== 'string' || !UUID.test(raw)) return null
  const bill = bills.find((b) => b.id === raw)
  return bill ? { id: bill.id, name: bill.name } : null
}
