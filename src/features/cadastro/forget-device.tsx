'use client'

import { useEffect } from 'react'

// Depois da exclusão não há mais sessão para pedir nada ao servidor: o aparelho esquece sozinho.
export function ForgetDevice() {
  useEffect(() => {
    try {
      window.localStorage.clear()
    } catch {
      // armazenamento indisponível: nada a apagar
    }
    void (async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        await subscription?.unsubscribe()
      } catch {
        // melhor esforço: nunca mostra erro
      }
    })()
  }, [])
  return null
}
