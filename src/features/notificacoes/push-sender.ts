import 'server-only'
import webpush from 'web-push'
import { isAllowedTarget } from '@/domain/notifications'
import { readPushConfig, type PushConfig } from '@/lib/server-env'
import { isAllowedPushEndpoint } from './endpoint'
import type { PushMessage } from './messages'

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string }
// 'gone': o serviço de push disse que a inscrição não vale mais (apagar).
// 'failed': não saiu agora; quem chamou decide se tenta de novo mais tarde.
export type PushResult = 'sent' | 'gone' | 'failed'

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>
}

type PushLib = { sendNotification: (sub: unknown, payload: string, options: unknown) => Promise<unknown> }

const realLib: PushLib = {
  sendNotification: (sub, payload, options) =>
    webpush.sendNotification(sub as webpush.PushSubscription, payload, options as webpush.RequestOptions),
}

const TTL_SECONDS = 12 * 60 * 60 // depois de 12 horas o lembrete não faz mais sentido
const TIMEOUT_MS = 4000
const MAX_BODY = 240
const MAX_TAG = 100

function clip(text: string, max: number, mark = ''): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max - Array.from(mark).length).join('') + mark
}

// O conteúdo vai cifrado para o navegador (padrão do Web Push): o serviço de
// push não lê o texto. Nada daqui vai para o log: o erro da biblioteca carrega
// o endereço da inscrição.
export function webPushSender(config: PushConfig, lib: PushLib = realLib): PushSender {
  const options = {
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: TTL_SECONDS,
    urgency: 'normal',
    timeout: TIMEOUT_MS,
  }
  return {
    async send(target, message) {
      // Conferido de novo na hora de enviar, mesmo que o banco já recuse ao gravar.
      if (!isAllowedPushEndpoint(target.endpoint)) return 'gone'
      // O toque no aviso só abre caminhos da lista fixa.
      if (!isAllowedTarget(message.url)) return 'failed'
      const payload = JSON.stringify({
        body: clip(message.body, MAX_BODY, '…'),
        url: message.url,
        tag: clip(message.tag, MAX_TAG),
        pay: message.pay === true,
      })
      try {
        await lib.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, options)
        return 'sent'
      } catch (error) {
        const status = (error as { statusCode?: unknown } | null)?.statusCode
        return status === 404 || status === 410 ? 'gone' : 'failed'
      }
    },
  }
}

// Sem as chaves no ambiente, o push fica desligado e o app segue funcionando.
export function getPushSender(): PushSender | null {
  const config = readPushConfig()
  return config ? webPushSender(config) : null
}
