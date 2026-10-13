import { parseAmount, parseDate } from './valores'
import type { ISODate } from '../dates'
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
// Valor em reais: sinal (antes ou depois) e 'R$' opcionais, milhar com ponto, vírgula decimal, sufixo D/C
// opcional. Não casa número colado a letras, '%' ou outros dígitos ('2,50KG').
const MONEY = /(?<![\d.,])(?:[-+]\s?)?(?:R\$\s?)?(?:[-+]\s?)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[DC](?![A-Za-z]))?-?(?![A-Za-z%\d,])/
const SALDO = /^(?:saldo|s\s+a\s+l\s+d\s+o)(?![a-z])/

function isSaldo(description: string): boolean {
  return SALDO.test(description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
}

// Data de referência do fim do extrato: a maior data completa (dd/mm/aaaa ou dd/mm/aa) do texto.
export function referenceEndDate(text: string, today: ISODate): ISODate {
  let best: ISODate | null = null
  for (const m of text.matchAll(/(?<![\d/])\d{2}\/\d{2}\/(?:\d{4}|\d{2})(?![\d/])/g)) {
    const d = parseDate(m[0])
    if (d && (best === null || d > best)) best = d
  }
  return best ?? today
}

export function parseStatementLines(lines: string[], end: ISODate): ParseResult {
  const endYear = Number(end.slice(0, 4))
  const endMonth = Number(end.slice(5, 7))
  const out: RawLine[] = []
  let skipped = 0
  for (const raw of lines) {
    const line = raw.trim()
    const d = DATE_AT_START.exec(line)
    if (!d) continue
    const rest = line.slice(d[0].length)
    const m = MONEY.exec(rest)
    if (!m) continue
    const description = rest.slice(0, m.index).replace(/\s+/g, ' ').trim()
    if (isSaldo(description)) continue
    let dateText = d[1]
    if (dateText.length === 5) {
      const year = Number(dateText.slice(3)) > endMonth ? endYear - 1 : endYear
      dateText = `${dateText}/${year}`
    }
    const date = parseDate(dateText)
    let token = m[0].replace(/R\$\s?/, '').replace(/^([-+])\s+/, '$1')
    if (token.endsWith('-')) token = '-' + token.slice(0, -1)
    const amount = parseAmount(token)
    if (!date || !amount || amount.cents <= 0 || !description) {
      skipped++
      continue
    }
    out.push({ date, description, amountCents: amount.cents, direction: amount.direction })
  }
  return { lines: out, skipped }
}
