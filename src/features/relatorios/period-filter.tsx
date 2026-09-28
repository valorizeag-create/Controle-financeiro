import Link from 'next/link'
import { PERIOD_OPTIONS, periodHref, type Period } from './period'

const INPUT =
  'min-h-11 rounded-control border border-control bg-card px-3 text-[15px] text-ink focus-visible:shadow-[0_0_0_3px_rgba(160,232,112,.45)]'

export function PeriodFilter({ period, de, ate }: { period: Period; de: string; ate: string }) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Período" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="m-0 flex list-none gap-2 p-0">
          {PERIOD_OPTIONS.map((o) => {
            const active = o.key === period.key
            return (
              <li key={o.key} className="shrink-0">
                <Link
                  href={periodHref(o.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-control border px-3.5 text-[15px] ${
                    active ? 'border-[1.5px] border-selected bg-brand-wash font-semibold text-brand-ink' : 'border-control bg-card font-medium text-[#262626]'
                  }`}
                >
                  {o.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {period.key === 'personalizado' && (
        <form method="get" action="/relatorios" className="flex flex-col gap-3">
          <input type="hidden" name="periodo" value="personalizado" />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted">
              De
              <input type="month" name="de" min="2000-01" max="2099-12" defaultValue={de || period.from} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Até
              <input type="month" name="ate" min="2000-01" max="2099-12" defaultValue={ate || period.to} className={INPUT} />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-panel border border-control bg-card px-4 text-[15px] font-semibold text-ink hover:bg-canvas"
            >
              Ver período
            </button>
          </div>
          {period.error && (
            <p role="alert" className="m-0 text-sm text-amber-ink">
              {period.error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
