import type { ReactNode } from 'react'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-card border border-line bg-card p-5 shadow-card ${className}`}>{children}</section>
}
