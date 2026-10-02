import type { ISODate, MonthKey } from './dates'
import type { Cents } from './money'

export const CSV_BOM = '\uFEFF'
export const CSV_SEP = ';'
export const CSV_EOL = '\r\n'

// Começo que uma planilha leria como fórmula: = + - @ (e as versões de largura
// total e o menos tipográfico), ou TAB, também depois de espaços na frente.
const FORMULA_START = /^\t|^\s*[=+\-@\u2212\uFF1D\uFF0B\uFF0D\uFF20]/

/**
 * Célula de TEXTO digitado por gente (nome, observação…): sempre entre aspas e
 * neutralizada contra fórmula. Valores do próprio app (dinheiro, datas) NÃO
 * passam por aqui, por isso um valor negativo continua numérico.
 */
export function csvText(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  let text = value.replace(/\r\n|\r|\n/g, ' ')
  if (FORMULA_START.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csvMoney(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const reais = Math.trunc(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}${reais},${rest}`
}

export function csvDate(d: ISODate | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function csvMonth(m: MonthKey): string {
  const [y, mo] = m.split('-')
  return `${mo}/${y}`
}

export function csvLine(cells: string[]): string {
  return cells.join(CSV_SEP) + CSV_EOL
}
