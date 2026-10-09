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

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const NO_LINES = 'Nenhum registro neste período.'

type Props = {
  cards: CardRow[]
  today: ISODate
  // Só a página de verificação no navegador troca o carregador (sem login, com dados falsos).
  loadContext?: (from: ISODate, to: ISODate) => Promise<ImportContext>
}
type Parsed = { lines: RawLine[]; skipped: number }
type Columns = { text: string; headers: string[]; preview: string[][] }
// O cartão fica junto da revisão: é com ele que ela foi montada e é ele que vai no salvamento.
type Review = { lines: ReviewLine[]; alreadyImported: number; context: ImportContext; cardId: string | null; version: number }

const BACK = '-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken'

// Etapas no cliente: escolher o arquivo (e, se preciso, as colunas do CSV), revisar e salvar.
export function Importar({ cards, today, loadContext = loadContextAction }: Props) {
  const [cardId, setCardIdState] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [columns, setColumns] = useState<Columns | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [period, setPeriodState] = useState<Period | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [readingFile, setReadingFile] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Só um arquivo escolhido depois descarta a leitura em curso.
  const fileRead = useRef(0)
  // Carregamento do contexto em curso; trocar arquivo, período ou origem o invalida (e libera o botão para outro).
  const contextLoad = useRef(0)

  function invalidateLoad() {
    contextLoad.current++
    setLoadingContext(false)
  }

  function setCardId(id: string | null) {
    invalidateLoad()
    setCardIdState(id)
  }

  function setPeriod(p: Period) {
    invalidateLoad()
    setPeriodState(p)
  }

  function acceptLines(result: Parsed) {
    const range = periodOf(result.lines)
    if (!range) {
      setError(NO_LINES)
      return
    }
    setParsed(result)
    setPeriodState(range)
    setColumns(null)
  }

  async function chooseFile(file: File) {
    const id = ++fileRead.current
    invalidateLoad()
    setReadingFile(true)
    setError(null)
    setParsed(null)
    setPeriodState(null)
    setColumns(null)
    setFileName(file.name)
    try {
      const result = await readStatementFile(file)
      if (id !== fileRead.current) return
      if (result.kind === 'erro') setError(result.message)
      else if (result.kind === 'colunas') setColumns(result)
      else acceptLines(result)
    } catch {
      if (id === fileRead.current) setError(UNEXPECTED)
    } finally {
      if (id === fileRead.current) setReadingFile(false)
    }
  }

  function applyColumns(mapping: CsvMapping) {
    if (!columns) return
    invalidateLoad()
    setError(null)
    const result = parseCsv(columns.text, mapping)
    if (result.ok) acceptLines(result)
    else setError(NO_LINES)
  }

  async function showReview() {
    if (!parsed || !period) return
    const req = ++contextLoad.current
    const origin = cardId
    setLoadingContext(true)
    setError(null)
    try {
      const context = await loadContext(period.from, period.to)
      const built = await buildReview({
        lines: parsed.lines,
        from: period.from,
        to: period.to,
        origin: origin ? 'cartao' : 'conta',
        rules: context.rules,
        categories: context.categories,
        existing: context.existing,
        usedKeys: new Set(context.usedKeys),
      })
      // Arquivo, período ou origem mudaram enquanto carregava: a revisão não vale mais.
      if (req !== contextLoad.current) return
      setReview({ ...built, context, cardId: origin, version: (review?.version ?? 0) + 1 })
      window.scrollTo?.(0, 0)
    } catch {
      if (req === contextLoad.current) setError(UNEXPECTED)
    } finally {
      if (req === contextLoad.current) setLoadingContext(false)
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
          cardId={review.cardId}
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
          busy={readingFile || loadingContext}
          error={error}
          onSubmit={showReview}
        />
      )}
    </div>
  )
}
