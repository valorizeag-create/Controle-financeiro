export type Cents = number

export const MAX_CENTS = 9_999_999_999

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: Cents): string {
  const text = brl.format(Math.abs(cents) / 100).replace(/\s/g, '\u00a0')
  return cents < 0 ? `\u2212${text}` : text
}

const brlWhole = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatWholeBRL(cents: Cents): string {
  return brlWhole.format(Math.ceil(cents / 100)).replace(/\s/g, ' ')
}

export function parseBRL(input: string): Cents | null {
  const s = input.trim().replace(/^R\$[\s\u00a0]*/i, '').trim()
  if (s === '' || /[\s\u00a0]/.test(s) || !/\d/.test(s) || !/^[\d.,]+$/.test(s)) return null

  let intPart: string
  let decPart = ''
  const lastComma = s.lastIndexOf(',')
  if (lastComma >= 0) {
    intPart = s.slice(0, lastComma)
    decPart = s.slice(lastComma + 1)
    if (decPart.includes('.') || intPart.includes(',')) return null
  } else {
    const firstDot = s.indexOf('.')
    const lastDot = s.lastIndexOf('.')
    const digitsAfter = s.length - lastDot - 1
    if (lastDot >= 0 && firstDot === lastDot && digitsAfter >= 1 && digitsAfter <= 2) {
      intPart = s.slice(0, lastDot)
      decPart = s.slice(lastDot + 1)
    } else {
      intPart = s
    }
  }

  if (intPart.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null
    intPart = intPart.replace(/\./g, '')
  }
  if (intPart === '') intPart = '0'
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null

  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null
  return cents
}

/** Como `formatBRL`, mas sem ",00" quando o valor é de reais inteiros ("R$ 890"). */
export function formatCompactBRL(cents: Cents): string {
  const text = formatBRL(cents)
  return Math.abs(cents) % 100 === 0 ? text.replace(/,00$/, '') : text
}
