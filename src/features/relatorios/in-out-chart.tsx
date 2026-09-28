import { Card } from '@/ui/card'
import type { ChartBar } from './view-model'

export function InOutChart({ bars }: { bars: ChartBar[] }) {
  return (
    <Card labelledBy="entrou-e-saiu" className="flex flex-col gap-4">
      <h2 id="entrou-e-saiu" className="text-[17px] font-semibold text-ink">
        Entrou e saiu
      </h2>
      <div className="flex gap-4 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-brand" />
          Entrou
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-spend" />
          Saiu
        </span>
      </div>
      <div aria-hidden="true" className="flex h-[180px] items-end gap-2">
        {bars.map((b) => (
          <div key={b.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
            <div className="w-full max-w-7 rounded-t-sm border border-brand-text-hover bg-brand" style={{ height: `${b.entrouHeight}%` }} />
            <div className="w-full max-w-7 rounded-t-sm bg-spend" style={{ height: `${b.saiuHeight}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-2">
        {bars.map((b, i) => (
          <span key={b.month} className={`min-w-0 flex-1 truncate text-center text-[13px] ${i === bars.length - 1 ? 'font-semibold text-ink' : 'text-muted'}`}>
            {b.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Entrou e saiu por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Entrou</th>
            <th scope="col">Saiu</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.month}>
              <th scope="row">{b.fullLabel}</th>
              <td>{b.entrouText}</td>
              <td>{b.saiuText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
