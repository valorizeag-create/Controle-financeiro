'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <p role="status" className="fixed inset-x-0 top-0 z-50 bg-ink px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-[15px] text-white">
      Sem conexão no momento. Assim que voltar, a gente tenta de novo.
    </p>
  )
}
