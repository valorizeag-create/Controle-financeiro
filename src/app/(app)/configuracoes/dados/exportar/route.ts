import { unstable_rethrow } from 'next/navigation'
import { todayInSaoPaulo } from '@/domain/dates'
import { exportCsv, exportFileName } from '@/features/dados/export-csv'
import { exportMovementPages, exportTransactionPages, loadExportData, type ExportData } from '@/features/dados/export-queries'
import { requireUser } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = 'no-store, max-age=0'
const back = (query = '') => new Response(null, { status: 303, headers: { location: `/configuracoes/dados${query}`, 'cache-control': NO_STORE } })

// O arquivo com tudo o que é da pessoa. Só GET, só com sessão (sem sessão,
// requireUser leva a Entrar antes de qualquer leitura). Nunca é guardado: nem
// pelo navegador, nem por intermediário, nem pelo service worker (que não
// guarda nada do app). Um link em outro site não faz o download acontecer.
// Enviado em partes: uma falha no meio interrompe o envio, e o navegador
// mostra o download como incompleto — nunca um arquivo pela metade com cara
// de completo.
export async function GET(request: Request): Promise<Response> {
  await requireUser()
  const site = request.headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin' && site !== 'none') return back()

  let data: ExportData
  try {
    data = await loadExportData()
  } catch (e) {
    unstable_rethrow(e)
    return back('?erro=1')
  }

  const parts = exportCsv(data, exportTransactionPages(), exportMovementPages())
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await parts.next()
        if (done) controller.close()
        else controller.enqueue(encoder.encode(value))
      } catch {
        // Interrompe o envio sem dizer nada do erro ao navegador.
        controller.error(new Error('interrompido'))
      }
    },
    async cancel() {
      await parts.return(undefined)
    },
  })
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(todayInSaoPaulo())}"`,
      'cache-control': NO_STORE,
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  })
}
