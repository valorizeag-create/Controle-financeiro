export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#a0e870" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#122801" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="3.2" fill="#122801" />
        <circle cx="19.5" cy="12.5" r="1.6" fill="#ffffff" />
      </svg>
      <span className="text-[22px] font-bold tracking-tight text-brand-ink">Íris</span>
    </span>
  )
}
