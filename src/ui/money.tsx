import { formatBRL, type Cents } from '@/domain/money'

export function Money({ cents, className = '' }: { cents: Cents; className?: string }) {
  return <span className={`num ${className}`}>{formatBRL(cents)}</span>
}
