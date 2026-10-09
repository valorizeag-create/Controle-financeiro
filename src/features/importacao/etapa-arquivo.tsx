'use client'

import { useState, type ReactNode } from 'react'
import { FileUp } from 'lucide-react'
import type { ISODate } from '@/domain/dates'
import type { CardRow } from '@/features/cartoes/types'
import { cardColor } from '@/features/cartoes/palette'
import { Button, buttonClass } from '@/ui/button'
import { CHIP } from '@/ui/chip'
import { FormAlert } from '@/ui/form-alert'

export type Period = { from: ISODate; to: ISODate }

type Props = {
  cards: CardRow[]
  cardId: string | null
  onCardId: (id: string | null) => void
  fileName: string | null
  onFile: (file: File) => void
  // Ajuste de colunas do CSV, quando o arquivo precisa dele.
  columns: ReactNode
  range: Period | null
  period: Period | null
  onPeriod: (period: Period) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
}

const clamp = (d: ISODate, r: Period): ISODate => (d < r.from ? r.from : d > r.to ? r.to : d)

export function EtapaArquivo({ cards, cardId, onCardId, fileName, onFile, columns, range, period, onPeriod, busy, error, onSubmit }: Props) {
  const [dragging, setDragging] = useState(false)

  // Data vazia (campo apagado) não muda nada; fora do arquivo, encosta na ponta; De depois de Até puxa o outro junto.
  function change(field: 'from' | 'to', value: string) {
    if (!range || !period || !value) return
    const d = clamp(value as ISODate, range)
    if (field === 'from') onPeriod({ from: d, to: d > period.to ? d : period.to })
    else onPeriod({ from: d < period.from ? d : period.from, to: d })
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className={`flex flex-col items-center gap-2.5 rounded-card border border-dashed px-4 py-6 text-center ${dragging ? 'border-selected bg-brand-wash' : 'border-control bg-card'}`}
      >
        <label className={buttonClass('secondary', 'cursor-pointer has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]')}>
          <FileUp className="size-5" aria-hidden="true" />
          Escolher arquivo
          <input
            type="file"
            accept=".pdf,.csv,.ofx"
            aria-describedby="arquivo-dica"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
            className="sr-only"
          />
        </label>
        <span id="arquivo-dica" className="text-sm text-muted">PDF, CSV ou OFX, até 5 MB.</span>
        {fileName && <span className="max-w-full truncate text-[15px] font-medium text-ink">{fileName}</span>}
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[15px] font-medium">De onde é este extrato?</legend>
        <div className="flex flex-wrap gap-2">
          <label className={CHIP}>
            <input type="radio" name="origem" checked={cardId === null} onChange={() => onCardId(null)} className="sr-only" />
            Conta do banco
          </label>
          {cards.map((c) => (
            <label key={c.id} className={`${CHIP} gap-2`}>
              <input type="radio" name="origem" checked={cardId === c.id} onChange={() => onCardId(c.id)} className="sr-only" />
              <span aria-hidden="true" className="h-3.5 w-5 rounded-full" style={{ background: cardColor(c.color).swatch }} />
              {c.nickname}
            </label>
          ))}
        </div>
      </fieldset>

      {columns}

      {range && period && (
        <div className="grid grid-cols-2 gap-3">
          {(['from', 'to'] as const).map((field) => (
            <div key={field} className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`periodo-${field}`} className="text-[15px] font-medium">{field === 'from' ? 'De' : 'Até'}</label>
              <input
                id={`periodo-${field}`}
                type="date"
                value={period[field]}
                min={range.from}
                max={range.to}
                onChange={(e) => change(field, e.target.value)}
                className="h-12 w-full min-w-0 rounded-control border border-control bg-card px-3 text-base"
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-muted">O arquivo é lido aqui no seu aparelho. Só os registros que você confirmar são salvos.</p>

      {error && <FormAlert>{error}</FormAlert>}

      {range && period && (
        <Button type="button" onClick={onSubmit} disabled={busy} aria-busy={busy || undefined} className="h-[52px]">
          Ver o que a Íris encontrou
        </Button>
      )}
    </div>
  )
}
