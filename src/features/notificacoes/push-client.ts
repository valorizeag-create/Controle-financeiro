// Só no navegador. Nenhuma função lança. O endereço da inscrição nunca é mostrado nem registrado:
// vai apenas para as ações do servidor.
import { removePushSubscription, savePushSubscription, syncPushSubscription } from './actions'

export type DeviceState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'checking'

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

function supportsPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// 'none': não há service worker registrado (por exemplo em desenvolvimento), então não há inscrição.
// 'slow': registrado, mas ainda ativando; "ready" não é esperado para sempre.
export const READY_WAIT_MS = 3000
async function pushManager(): Promise<PushManager | 'none' | 'slow'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const registered = await navigator.serviceWorker.getRegistration?.()
    if (registered === undefined && typeof navigator.serviceWorker.getRegistration === 'function') return 'none'
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), READY_WAIT_MS) })
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout])
    return registration ? registration.pushManager : 'slow'
  } catch {
    return 'none'
  } finally {
    clearTimeout(timer)
  }
}

export async function deviceState(): Promise<DeviceState> {
  try {
    if (!supportsPush()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
    if (Notification.permission === 'denied') return 'blocked'
    const manager = await pushManager()
    if (manager === 'none') return 'unsupported'
    if (manager === 'slow') return 'checking'
    const current = await manager.getSubscription()
    if (!current) return 'off'
    // Inscrição que sobrou de outra pessoa neste aparelho: o banco diz de quem é.
    const { mine } = await syncPushSubscription(current.endpoint)
    if (mine) return 'on'
    await current.unsubscribe().catch(() => false)
    return 'off'
  } catch {
    return 'unsupported'
  }
}

function toKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

// Só chamar depois de um toque da pessoa: é aqui que o navegador pergunta.
export async function enablePush(vapidPublicKey: string): Promise<'on' | 'blocked' | 'dismissed' | 'failed'> {
  let created: PushSubscription | null = null
  try {
    if (!supportsPush()) return 'failed'
    const permission = await Notification.requestPermission()
    if (permission === 'denied') return 'blocked'
    if (permission !== 'granted') return 'dismissed'
    const manager = await pushManager()
    if (typeof manager === 'string') return 'failed'
    created = (await manager.getSubscription()) ?? (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidPublicKey) }))
    const json = created.toJSON()
    const saved = await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } })
    if (saved.ok) return 'on'
    await created.unsubscribe().catch(() => false)
    return 'failed'
  } catch {
    await created?.unsubscribe().catch(() => false)
    return 'failed'
  }
}

// Apaga no banco e cancela no navegador (quem sai ou desativa deixa de receber aqui).
export async function disablePush(): Promise<void> {
  try {
    if (!supportsPush()) return
    const manager = await pushManager()
    const current = typeof manager === 'string' ? null : await manager.getSubscription()
    if (!current) return
    await removePushSubscription(current.endpoint).catch(() => {})
    await current.unsubscribe().catch(() => false)
  } catch {
    // nada a fazer: quem chama segue em frente
  }
}
