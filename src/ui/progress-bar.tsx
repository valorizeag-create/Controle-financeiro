type Size = 'sm' | 'md' | 'lg'
type Tone = 'brand' | 'over'

const track: Record<Size, string> = {
  sm: 'h-2 bg-sunken',
  md: 'h-2.5 bg-brand-wash',
  lg: 'h-3 bg-card',
}

const fill: Record<Tone, string> = {
  brand: 'bg-brand',
  over: 'bg-amber-bar',
}

export function ProgressBar({ percent, label, size = 'md', tone = 'brand' }: { percent: number; label: string; size?: Size; tone?: Tone }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`w-full overflow-hidden rounded-full ${track[size]}`}
    >
      <div className={`h-full origin-left animate-encher rounded-full ${fill[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  )
}
