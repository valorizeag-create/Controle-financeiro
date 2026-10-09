'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ISODate } from '@/domain/dates'
import { parseCsv, periodOf } from '@/domain/importacao/csv'
import { buildReview, type ReviewLine } from '@/domain/importacao/revisar'
import type { CsvMapping, RawLine } from '@/domain/importacao/tipos'
import type { CardRow } from '@/features/cartoes/types'
import { loadContextAction } from './actions'
import { AjusteColunas } from './ajuste-colunas'
import { EtapaArquivo, type Period } from './etapa-arquivo'
import { EtapaRevisao } from './etapa-revisao'
import { readStatementFile } from './ler-arquivo'
import type { ImportContext } from './queries'

const CONTEXT_FAILED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const NO_LINES = 'Nenhum registro neste período.'

type Props = {
  cards: CardRow[]
  today: ISODate
  // Só a página de verificação no navegador troca o carregador (sem login, com dados falsos).
  loadContext?: (from: ISODate, to: ISODate) => Promise<ImportContext>
}
type Parsed = { lines: RawLine[]; skipped: number }
type Columns = { text: string; headers: string[]; preview: string[][] }
type Review = { lines: ReviewLine[]; alreadyImported: number; context: ImportContext; version: number }

const BACK = '-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken'

// Etapas no cliente: escolher o arquivo (e, se preciso, as colunas do CSV), revisar e salvar.
export function Importar({ cards, today, loadContext = loadContextAction }: Props) {
  const [cardId, setCardId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [columns, setColumns] = useState<Columns | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Escolher outro arquivo antes do anterior terminar de ser lido descarta o resultado antigo.
  const reading = useRef(0)

  function acceptLines(result: Parsed) {
    const range = periodOf(result.lines)
    if (!range) {
      setError(NO_LINES)
      return
    }
    setParsed(result)
    setPeriod(range)
    setColumns(null)
  }

  async function chooseFile(file: File) {
    const id = ++reading.current
    setBusy(true)
    setError(null)
    setParsed(null)
    setPeriod(null)
    setColumns(null)
    setFileName(file.name)
    const result = await readStatementFile(file)
    if (id !== reading.current) return
    setBusy(false)
    if (result.kind === 'erro') setError(result.message)
    else if (result.kind === 'colunas') setColumns(result)
    else acceptLines(result)
  }

  function applyColumns(mapping: CsvMapping) {
    if (!columns) return
    setError(null)
    const result = parseCsv(columns.text, mapping)
    if (result.ok) acceptLines(result)
  }

  async function showReview() {
    if (!parsed || !period) return
    setBusy(true)
    setError(null)
    try {
      const context = await loadContext(period.from, period.to)
      const built = await buildReview({
        lines: parsed.lines,
        from: period.from,
        to: period.to,
        origin: cardId ? 'cartao' : 'conta',
        rules: context.rules,
        categories: context.categories,
        existing: context.existing,
        usedKeys: new Set(context.usedKeys),
      })
      setReview({ ...built, context, version: (review?.version ?? 0) + 1 })
      window.scrollTo?.(0, 0)
    } catch {
      setError(CONTEXT_FAILED)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        {review ? (
          <button type="button" aria-label="Voltar" onClick={() => setReview(null)} className={BACK}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <Link href="/extrato" aria-label="Voltar" className={BACK}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        )}
        <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">Importar extrato</h1>
      </header>

      {review ? (
        <EtapaRevisao
          key={review.version}
          lines={review.lines}
          alreadyImported={review.alreadyImported}
          skipped={parsed?.skipped ?? 0}
          context={review.context}
          cardId={cardId}
          today={today}
        />
      ) : (
        <EtapaArquivo
          cards={cards}
          cardId={cardId}
          onCardId={setCardId}
          fileName={fileName}
          onFile={chooseFile}
          columns={columns && <AjusteColunas headers={columns.headers} preview={columns.preview} onUse={applyColumns} />}
          range={parsed && periodOf(parsed.lines)}
          period={period}
          onPeriod={setPeriod}
          busy={busy}
          error={error}
          onSubmit={showReview}
        />
      )}
    </div>
  )
}
