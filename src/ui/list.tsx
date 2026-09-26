import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

function slug(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function ListSection({ title, children }: { title: string; children: ReactNode }) {
  const id = `secao-${slug(title)}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-sm font-semibold text-inactive">{title}</h2>
      {children}
    </section>
  )
}

export function ListCard({ children }: { children: ReactNode }) {
  return <ul className="rounded-card border border-line bg-card px-4 py-1">{children}</ul>
}

export function ListRow({ children }: { children: ReactNode }) {
  return <li className="border-b border-line last:border-b-0">{children}</li>
}

type RowLinkProps = { href: string; title: string; caption?: string; value?: string; icon?: ReactNode }

export function RowLink({ href, title, caption, value, icon }: RowLinkProps) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3.5 text-ink">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {caption && <span className="text-[13px] text-muted">{caption}</span>}
        <span className="truncate text-[15px]">{title}</span>
      </span>
      {value && <span className="text-sm text-muted">{value}</span>}
      <ChevronRight className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}

export function RowStatic({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-0.5 text-ink">
      {caption && <span className="text-[13px] text-muted">{caption}</span>}
      <span className="truncate text-[15px]">{title}</span>
    </div>
  )
}
