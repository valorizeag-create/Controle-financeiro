import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-[#8bdc55]',
  secondary: 'border border-control bg-card text-ink hover:bg-canvas',
  ghost: 'text-brand-text hover:text-brand-text-hover',
}

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-panel px-5 text-base font-semibold transition-colors duration-[120ms] active:scale-[0.98] disabled:bg-sunken disabled:text-[#737373]'

type Props = { variant?: Variant; href?: string; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant = 'primary', href, className = '', children, ...rest }: Props) {
  const cls = `${base} ${styles[variant]} ${className}`
  if (href) return <Link href={href} className={cls}>{children}</Link>
  return <button className={cls} {...rest}>{children}</button>
}
