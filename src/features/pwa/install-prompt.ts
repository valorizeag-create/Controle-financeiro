export type InstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let saved: InstallPromptEvent | null = null
let listening = false
const listeners = new Set<() => void>()

function onBeforeInstall(event: Event) {
  event.preventDefault()
  saved = event as InstallPromptEvent
  listeners.forEach((listener) => listener())
}

// Guarda o convite de instalação do navegador para a tela "Instalar a Íris".
export function captureInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
}

// Devolve o convite e o esquece: o navegador só deixa usar uma vez.
export function takeInstallPrompt(): InstallPromptEvent | null {
  const event = saved
  saved = null
  return event
}

export function onInstallable(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Há convite guardado? (não gasta o convite)
export function peekInstallPrompt(): boolean {
  return saved !== null
}
