'use client'

import { useEffect } from 'react'
import { env } from '@/lib/env'
import { captureInstallPrompt } from './install-prompt'

export function RegisterServiceWorker() {
  useEffect(() => {
    captureInstallPrompt()
    if (!env.registerServiceWorker || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}
