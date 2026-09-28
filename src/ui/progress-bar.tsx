type Size = 'md' | 'lg'

const track: Record<Size, string> = {
  md: 'h-2.5 bg-brand-wash',
  lg: 'h-3 bg-card',
}

export function ProgressBar({ percent, label, size = 'md' }: { percent: number; label: string; size?: Size }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`w-full overflow-hidden rounded-full ${track[size]}`}
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </div>
  )
}
