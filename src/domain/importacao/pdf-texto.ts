import { parseAmount, parseDate } from './valores'
import type { ParseResult, RawLine } from './tipos'

export type TextItem = { str: string; x: number; y: number; page: number }

const Y_TOLERANCE = 2

// Agrupa os itens de texto do PDF em linhas: por página, de cima para baixo (y maior primeiro),
// e dentro da linha da esquerda para a direita.
export function linesFromItems(items: TextItem[]): string[] {
  const sorted = items.filter((i) => i.str.trim() !== '').sort((a, b) => a.page - b.page || b.y - a.y)
  const rows: TextItem[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    if (row && row[0].page === item.page && Math.abs(row[row.length - 1].y - item.y) <= Y_TOLERANCE) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str.trim())
      .join(' '),
  )
}

const DATE_AT_START = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+/
// Valor em reais: sinal e 'R$' opcionais, milhar com ponto, vírgula decimal, sufixo D/C opcional.
const MONEY = /(?<![\d.,])(?:[-+]\s?)?(?:R\$\s?)?(?:[-+]\s?)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[DC](?![A-Za-z]))?/

export function parseStatementLines(lines: string[], year: number): ParseResult {
  const out: RawLine[] = []
  let skipped = 0
  for (const raw of lines) {
    const line = raw.trim()
    const d = DATE_AT_START.exec(line)
    if (!d) continue
    const rest = line.slice(d[0].length)
    const m = MONEY.exec(rest)
    if (!m) continue
    const dateText = d[1].length === 5 ? `${d[1]}/${year}` : d[1]
    const date = parseDate(dateText)
    const amount = parseAmount(m[0].replace(/R\$\s?/, '').replace(/^([-+])\s+/, '$1'))
    const description = rest.slice(0, m.index).replace(/\s+/g, ' ').trim()
    if (!date || !amount || amount.cents <= 0 || !description) {
      skipped++
      continue
    }
    out.push({ date, description, amountCents: amount.cents, direction: amount.direction })
  }
  return { lines: out, skipped }
}
