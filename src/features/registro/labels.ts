export const INCOME_SOURCES = ['Salário', 'Freela', 'Presente', 'Outros'] as const

export const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  debit: 'Débito',
  credit: 'Crédito',
  other: 'Outra forma',
}
