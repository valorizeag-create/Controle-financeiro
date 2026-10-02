import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Quem chama a rota da tarefa é o agendador do banco (pg_cron + pg_net). Ele
// não manda o segredo: manda o CÓDIGO DE DISPARO, derivado do segredo. Dele não
// se chega ao segredo, e quem o tiver só consegue pedir à rota que entregue um
// lote. A rota confere o código e usa o segredo do próprio ambiente no banco.
export const TRIGGER_HEADER = 'x-iris-job-trigger'

// HMAC-SHA256(JOB_SECRET, 'iris-job-trigger-v1') em base64url (43 caracteres).
// O mesmo cálculo está descrito na migração (item 24) e no README.
export function triggerToken(secret: string): string {
  return createHmac('sha256', secret).update('iris-job-trigger-v1').digest('base64url')
}

// Comparação em tempo constante: os dois lados viram um resumo SHA-256 (sempre
// 32 bytes), então o tempo não depende do tamanho nem do conteúdo do que veio.
export function secretMatches(given: string | null, expected: string): boolean {
  if (typeof given !== 'string' || typeof expected !== 'string' || expected === '') return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
