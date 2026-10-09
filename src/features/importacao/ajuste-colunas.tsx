'use client'

import { useState } from 'react'
import type { CsvMapping } from '@/domain/importacao/tipos'
import { Button } from '@/ui/button'
import { SELECT } from './estilos'

type Props = { headers: string[]; preview: string[][]; onUse: (mapping: CsvMapping) => void }

// CSV sem cabeçalho conhecido: a pessoa diz qual coluna é qual, olhando as primeiras linhas.
export function AjusteColunas({ headers, preview, onUse }: Props) {
  const last = Math.max(headers.length - 1, 0)
  const [cols, setCols] = useState({ date: 0, description: Math.min(1, last), amount: Math.min(2, last) })
  const fields = [
    ['date', 'Data'],
    ['description', 'Descrição'],
    ['amount', 'Valor'],
  ] as const

  return (
    <section aria-labelledby="ajuste-titulo" className="flex flex-col gap-4">
      <h2 id="ajuste-titulo" className="text-[17px] font-semibold text-ink">Qual coluna é a data? E a descrição? E o valor?</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {headers.map((h, i) => (
                <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-inactive">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, r) => (
              <tr key={r} className="border-b border-line last:border-b-0">
                {headers.map((_, i) => (
                  <td key={i} className="whitespace-nowrap px-3 py-2 text-ink">{row[i] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map(([key, label]) => (
          <div key={key} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`coluna-${key}`} className="text-sm text-inactive">{label}</label>
            <select
              id={`coluna-${key}`}
              value={cols[key]}
              onChange={(e) => setCols({ ...cols, [key]: Number(e.target.value) })}
              className={SELECT}
            >
              {headers.map((h, i) => (
                <option key={i} value={i}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={() => onUse(cols)}>Usar estas colunas</Button>
    </section>
  )
}
