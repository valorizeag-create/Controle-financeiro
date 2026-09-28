import { Card } from '@/ui/card'
import type { MonthRow, Sentence } from './view-model'

function SentenceText({ sentence }: { sentence: Sentence }) {
  return (
    <>
      {sentence.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <strong key={i} className="num font-semibold text-ink">
            {part.value}
          </strong>
        ),
      )}
    </>
  )
}

export function WhatChanged({ summary, changes }: { summary: Sentence; changes: Sentence[] }) {
  return (
    <Card labelledBy="o-que-mudou" className="flex flex-col gap-3">
      <h2 id="o-que-mudou" className="text-[17px] font-semibold text-ink">
        O que mudou
      </h2>
      <div className="flex flex-col">
        {[summary, ...changes].map((s, i) => (
          <p key={i} className={`m-0 py-2.5 text-[15px] text-body ${i > 0 ? 'border-t border-line' : ''}`}>
            <SentenceText sentence={s} />
          </p>
        ))}
      </div>
    </Card>
  )
}

export function MonthByMonth({ months }: { months: MonthRow[] }) {
  return (
    <Card labelledBy="mes-a-mes" className="flex flex-col gap-3">
      <h2 id="mes-a-mes" className="text-[17px] font-semibold text-ink">
        Mês a mês
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {months.map((m, i) => (
          <li key={m.month} className={`flex flex-col gap-0.5 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] text-ink">
                {m.label}
                {m.current && <span className="text-[13px] text-muted"> até agora</span>}
              </span>
              <span className="num text-[15px] text-ink">{m.saiuText}</span>
            </div>
            <span className="text-sm text-muted">
              {m.entrouText}
              {m.goalText ? ` · ${m.goalText}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
