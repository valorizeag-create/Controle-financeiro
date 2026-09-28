import type { ReactNode } from 'react'

export function Card({ className = '', children, labelledBy }: { className?: string; children: ReactNode; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`rounded-card border border-line bg-card p-5 shadow-card ${className}`}>
      {children}
    </section>
  )
}
