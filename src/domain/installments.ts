import { addMonths, monthOf, type ISODate } from './dates'
import type { Cents } from './money'
import { dueDateIn } from './recurrence'

export const MIN_INSTALLMENTS = 2
export const MAX_INSTALLMENTS = 48

export interface Installment {
  number: number
  amountCents: Cents
  occurredOn: ISODate
}

/** Divide o total em `count` parcelas mensais; a 1ª no mês da compra, mesmo dia (ajustado ao tamanho do mês), com os centavos que sobram. */
export function splitInstallments(totalCents: Cents, count: number, purchasedOn: ISODate): Installment[] {
  const base = Math.floor(totalCents / count)
  const rest = totalCents - base * count // o que sobra vai para a 1ª
  const day = Number(purchasedOn.slice(8, 10))
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    amountCents: base + (i === 0 ? rest : 0),
    occurredOn: dueDateIn(addMonths(monthOf(purchasedOn), i), day),
  }))
}

/** "Futura" = depois de hoje; a parcela de hoje já contou. */
export function isFutureInstallment(occurredOn: ISODate, today: ISODate): boolean {
  return occurredOn > today
}

export function remainingInstallments(
  items: { occurredOn: ISODate; amountCents: Cents }[],
  today: ISODate,
): { count: number; cents: Cents } {
  const future = items.filter((i) => isFutureInstallment(i.occurredOn, today))
  return { count: future.length, cents: future.reduce((s, i) => s + i.amountCents, 0) }
}

export function installmentBadge(number: number, count: number): string {
  return `parcela ${number} de ${count}`
}
