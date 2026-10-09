import { parseDate } from './valores'
import type { ParseResult, RawLine } from './tipos'

const NAMED: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

// Decodifica em uma única passada, então '&amp;amp;' vira '&amp;' (e não '&').
function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|quot|apos|amp));/gi, (all, dec, hex, name) => {
    if (name) return NAMED[name.toLowerCase()]
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all
  })
}

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([^<\r\n]*)`, 'i').exec(block)
  return m ? decodeEntities(m[1]).trim() : ''
}

// TRNAMT normalmente usa ponto decimal ('-45.90'), mas aceita vírgula. Converte por texto para
// não ter erro de float. Se houver vírgula e ponto, o último é o decimal. Na dúvida, null.
function amountToCents(s: string): number | null {
  let t = s.replace(/\s+/g, '')
  let neg = false
  if (t.startsWith('-')) neg = true
  if (t.startsWith('-') || t.startsWith('+')) t = t.slice(1)
  if (t.includes(',') && t.includes('.')) {
    const decimalIsComma = t.lastIndexOf(',') > t.lastIndexOf('.')
    t = decimalIsComma ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (t.includes(',')) {
    t = t.replace(',', '.')
  }
  const m = /^(\d+)(?:\.(\d*))?$/.exec(t)
  if (!m) return null
  const frac = m[2] ?? ''
  if (/[1-9]/.test(frac.slice(2))) return null // mais de 2 casas reais: ambíguo (ex.: '1,234')
  const cents = Number(m[1]) * 100 + Number((frac + '00').slice(0, 2))
  return neg ? -cents : cents
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
    const description = field(block, 'MEMO') || field(block, 'NAME')
    if (!date || !amount || !description) {
      skipped++
      continue
    }
    lines.push({
      date,
      description,
      amountCents: Math.abs(amount),
      direction: amount < 0 ? 'out' : 'in',
    })
  }
  return { lines, skipped }
}
