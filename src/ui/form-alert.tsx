import type { ReactNode } from 'react'

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-[#fee2e2] bg-error-wash px-4 py-3 text-[15px] text-[#7f1d1d]">
      {children}
    </p>
  )
}
