import { parseCsv } from '@/domain/importacao/csv'
import { parseOfx } from '@/domain/importacao/ofx'
import type { RawLine } from '@/domain/importacao/tipos'
import { decodeBytes } from '@/domain/importacao/valores'
import { readPdf } from './ler-pdf'

const MAX_BYTES = 5 * 1024 * 1024

export const FILE_ERRORS = {
  tipo: 'Escolha um arquivo PDF, CSV ou OFX.',
  tamanho: 'Este arquivo passa de 5 MB. Escolha um período menor no app do banco.',
  senha: 'Este PDF tem senha. Baixe de novo sem senha, ou use o CSV ou o OFX.',
  pdf: 'Não conseguimos ler este PDF. Tente o arquivo CSV ou OFX do seu banco.',
} as const

export type FileRead =
  | { kind: 'linhas'; lines: RawLine[]; skipped: number }
  | { kind: 'colunas'; text: string; headers: string[]; preview: string[][] }
  | { kind: 'erro'; message: string }

// Tudo acontece no aparelho: o arquivo nunca vai para o servidor.
export async function readStatementFile(file: File): Promise<FileRead> {
  const ext = file.name.toLowerCase().match(/\.(pdf|csv|ofx)$/)?.[1]
  if (!ext) return { kind: 'erro', message: FILE_ERRORS.tipo }
  if (file.size > MAX_BYTES) return { kind: 'erro', message: FILE_ERRORS.tamanho }

  if (ext === 'pdf') {
    const result = await readPdf(file).catch(() => ({ error: 'sem-texto' as const }))
    if ('error' in result) return { kind: 'erro', message: result.error === 'senha' ? FILE_ERRORS.senha : FILE_ERRORS.pdf }
    if (result.lines.length === 0) return { kind: 'erro', message: FILE_ERRORS.pdf }
    return { kind: 'linhas', ...result }
  }

  const text = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  if (ext === 'ofx') return { kind: 'linhas', ...parseOfx(text) }
  const csv = parseCsv(text)
  if (!csv.ok) return { kind: 'colunas', text, headers: csv.headers, preview: csv.preview }
  return { kind: 'linhas', lines: csv.lines, skipped: csv.skipped }
}
