import type { HTMLInputTypeAttribute } from 'react'

type Props = {
  name: string
  label: string
  type?: HTMLInputTypeAttribute
  hint?: string
  error?: string
  defaultValue?: string
  autoComplete?: string
  inputMode?: 'text' | 'decimal' | 'email' | 'numeric'
}

export function TextField({ name, label, type = 'text', hint, error, defaultValue, autoComplete, inputMode }: Props) {
  const describedBy = [hint && !error && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-[#262626]">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${error ? 'border-error-ink' : 'border-control'}`}
      />
      {hint && !error && <span id={`${name}-hint`} className="text-[13px] text-muted">{hint}</span>}
      {error && <span id={`${name}-error`} className="text-sm text-error-ink">{error}</span>}
    </div>
  )
}
