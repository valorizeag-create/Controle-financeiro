import type { ISODate } from '../dates'
import type { CsvMapping, CsvResult, RawLine } from './tipos'
import { parseAmount, parseDate } from './valores'

const SEPARATORS = [';', ',', '\t']
const MAX_HEADER_LINE = 15
const DESCRIPTION_KEYS = ['historico', 'descricao', 'description', 'lancamento', 'title', 'estabelecimento']

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Divide o texto em linhas de campos, respeitando aspas (separador e quebra de linha dentro de aspas ficam no campo).
function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''))
}

// O separador é o que mais aparece nas 10 primeiras linhas, sem contar o que está entre aspas.
function detectSeparator(text: string): string {
  const counts = new Map(SEPARATORS.map((s) => [s, 0]))
  let quoted = false
  let lines = 0
  for (const c of text) {
    if (c === '"') quoted = !quoted
    else if (!quoted) {
      if (c === '\n') {
        if (++lines >= 10) break
      } else if (counts.has(c)) counts.set(c, counts.get(c)! + 1)
    }
  }
  return SEPARATORS.reduce((best, s) => (counts.get(s)! > counts.get(best)! ? s : best), ';')
}

function mappingFromHeader(header: string[]): CsvMapping | null {
  const h = header.map(normalize)
  const find = (keys: string[], not: number[] = []) =>
    h.findIndex((f, i) => !not.includes(i) && keys.some((k) => f.includes(k)))
  const date = find(['data', 'date'])
  const amount = find(['valor', 'amount'], [date])
  const debit = find(['debito', 'saida'], [date])
  const credit = find(['credito', 'entrada'], [date])
  const description = h.findIndex((f, i) => i !== date && DESCRIPTION_KEYS.some((k) => f.includes(k)))
  if (date < 0 || description < 0 || (amount < 0 && debit < 0 && credit < 0)) return null
  return {
    date,
    description,
    ...(amount >= 0 ? { amount } : {}),
    ...(debit >= 0 ? { debit } : {}),
    ...(credit >= 0 ? { credit } : {}),
  }
}

function readLine(row: string[], m: CsvMapping): RawLine | null {
  const date = parseDate(row[m.date] ?? '')
  const description = row[m.description] ?? ''
  if (!date || normalize(description).startsWith('saldo')) return null
  if (m.amount !== undefined) {
    const v = parseAmount(row[m.amount] ?? '')
    return v && { date, description, amountCents: v.cents, direction: v.direction }
  }
  const debit = m.debit !== undefined ? parseAmount(row[m.debit] ?? '') : null
  if (debit) return { date, description, amountCents: debit.cents, direction: 'out' }
  const credit = m.credit !== undefined ? parseAmount(row[m.credit] ?? '') : null
  return credit && { date, description, amountCents: credit.cents, direction: 'in' }
}

// Sem mapping, procura o cabeçalho sozinho; se não achar, devolve cabeçalho e prévia para o usuário mapear.
// Com mapping, a primeira linha é tratada como cabeçalho.
export function parseCsv(text: string, mapping?: CsvMapping): CsvResult {
  const rows = splitRows(text, detectSeparator(text))
  let headerAt = 0
  let m = mapping ?? null
  if (!m) {
    for (headerAt = 0; headerAt < Math.min(rows.length, MAX_HEADER_LINE); headerAt++) {
      m = mappingFromHeader(rows[headerAt])
      if (m) break
    }
  }
  if (!m) return { ok: false, headers: rows[0] ?? [], preview: rows.slice(1, 6) }
  const lines: RawLine[] = []
  let skipped = 0
  for (const row of rows.slice(headerAt + 1)) {
    const line = readLine(row, m)
    if (line) lines.push(line)
    else skipped++
  }
  return { ok: true, lines, skipped }
}

export function periodOf(lines: RawLine[]): { from: ISODate; to: ISODate } | null {
  if (lines.length === 0) return null
  const dates = lines.map((l) => l.date).sort()
  return { from: dates[0], to: dates[dates.length - 1] }
}
