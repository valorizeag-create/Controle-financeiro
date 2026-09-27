'use client'

import type { Frequency } from '@/domain/recurrence'

const OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Todo mês' },
  { value: 'yearly', label: 'Todo ano' },
]

type Props = {
  value: Frequency
  onChange: (f: Frequency) => void
  legend: string
  hideLegend?: boolean
}

export function FrequencyField({ value, onChange, legend, hideLegend }: Props) {
  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'mb-2.5 text-[15px] font-medium'}>{legend}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-panel bg-sunken p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-control px-3 text-[15px] font-medium text-ink has-[:checked]:bg-card has-[:checked]:font-semibold has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(18,40,1,.08)] has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]"
          >
            <input
              type="radio"
              name="frequency"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
