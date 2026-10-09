import type { Category } from '@/features/registro/queries'
import { dictionaryKey } from './dicionario'
import { normalizeMerchant, semAcento } from './normalizar'
import type { RawLine } from './tipos'

export type Special = 'fatura' | 'transferencia' | 'pagamento-fatura-no-cartao' | 'estorno' | 'salario'
export type Rule = { merchantKey: string; kind: 'income' | 'expense'; categoryId: string | null; source: string | null }
export type Classification = {
  kind: 'income' | 'expense'
  categoryId: string | null
  source: string | null
  via: 'memoria' | 'dicionario' | null
}

export function specialOf(desc: string, origin: 'conta' | 'cartao'): Special | null {
  const s = semAcento(desc).toLowerCase()
  if (/\bestorno\b/.test(s)) return 'estorno'
  if (origin === 'cartao') {
    return /\bpagamento (recebido|efetuado|de fatura|fatura|on ?line)\b/.test(s) ? 'pagamento-fatura-no-cartao' : null
  }
  if (/\b(pagamento|pagto|pgto|pag) fatura\b|\bfatura cartao\b/.test(s)) return 'fatura'
  if (/\b(aplicacao|resgate|mesma titularidade|entre contas)\b/.test(s)) return 'transferencia'
  if (/\b(salario|folha)\b/.test(s)) return 'salario'
  return null
}

export function classify(line: RawLine, ctx: { rules: Rule[]; categories: Category[] }): Classification {
  const kind = line.direction === 'in' ? 'income' : 'expense'
  const merchant = normalizeMerchant(line.description)
  const rule = ctx.rules.find((r) => r.merchantKey === merchant && r.kind === kind)

  if (kind === 'income') {
    if (rule && rule.source) return { kind, categoryId: null, source: rule.source, via: 'memoria' }
    if (specialOf(line.description, 'conta') === 'salario') return { kind, categoryId: null, source: 'Salário', via: 'dicionario' }
    return { kind, categoryId: null, source: null, via: null }
  }

  if (rule && rule.categoryId && ctx.categories.some((c) => c.id === rule.categoryId)) {
    return { kind, categoryId: rule.categoryId, source: null, via: 'memoria' }
  }
  const key = dictionaryKey(merchant)
  const category = key ? ctx.categories.find((c) => c.defaultKey === key) : undefined
  if (category) return { kind, categoryId: category.id, source: null, via: 'dicionario' }
  return { kind, categoryId: null, source: null, via: null }
}
