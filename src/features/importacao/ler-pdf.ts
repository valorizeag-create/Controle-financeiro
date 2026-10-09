import { todayInSaoPaulo } from '@/domain/dates'
import { linesFromItems, parseStatementLines, referenceEndDate, type TextItem } from '@/domain/importacao/pdf-texto'
import type { ParseResult } from '@/domain/importacao/tipos'

// pdfjs-dist só é carregado aqui, sob demanda, para não entrar no bundle das demais telas.
export async function readPdf(file: File): Promise<ParseResult | { error: 'senha' | 'sem-texto' }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | undefined
  try {
    doc = await pdfjs.getDocument({ data }).promise
    const items: TextItem[] = []
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent()
      for (const it of content.items) {
        if ('str' in it && it.str.trim() !== '') items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page })
      }
    }
    if (items.length === 0) return { error: 'sem-texto' }
    const lines = linesFromItems(items)
    return parseStatementLines(lines, referenceEndDate(lines.join('\n'), todayInSaoPaulo()))
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') return { error: 'senha' }
    throw e
  } finally {
    await doc?.destroy()
  }
}
