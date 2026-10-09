import { parseDate } from './valores'
import type { ParseResult, RawLine } from './tipos'

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([^<\r\n]*)`, 'i').exec(block)
  return m ? m[1].trim() : ''
}

// TRNAMT usa ponto decimal ('-45.90'); converte por texto para não ter erro de float.
function amountToCents(s: string): number | null {
  const m = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(s.replace(',', '.'))
  if (!m) return null
  const cents = Number(m[2]) * 100 + Number(((m[3] ?? '') + '00').slice(0, 2))
  return m[1] === '-' ? -cents : cents
}

// Lê OFX em SGML (sem tags de fechamento) ou XML; só as transações <STMTTRN> interessam.
export function parseOfx(text: string): ParseResult {
  const lines: RawLine[] = []
  let skipped = 0
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const digits = /^\d{8}/.exec(field(block, 'DTPOSTED'))
    const d = digits?.[0]
    const date = d ? parseDate(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`) : null
    const amount = amountToCents(field(block, 'TRNAMT'))
    if (!date || !amount) {
      skipped++
      continue
    }
    lines.push({
      date,
      description: field(block, 'MEMO') || field(block, 'NAME'),
      amountCents: Math.abs(amount),
      direction: amount < 0 ? 'out' : 'in',
    })
  }
  return { lines, skipped }
}
