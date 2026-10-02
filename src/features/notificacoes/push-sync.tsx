'use client'

import { useEffect } from 'react'
import { deviceState, recheckWhenReady } from './push-client'

// Não desenha nada. Ao abrir o app, deviceState confere com o banco de quem é a inscrição deste
// aparelho e cancela a que sobrou de outra pessoa. Se o service worker ainda não está pronto, confere de
// novo quando ficar.
export function PushSync() {
  useEffect(() => {
    void deviceState().then((s) => {
      if (s === 'checking') void recheckWhenReady()
    })
  }, [])
  return null
}
