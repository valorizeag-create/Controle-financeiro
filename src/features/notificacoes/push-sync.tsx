'use client'

import { useEffect } from 'react'
import { deviceState } from './push-client'

// Não desenha nada. Ao abrir o app, deviceState confere com o banco de quem é a inscrição deste
// aparelho e cancela a que sobrou de outra pessoa.
export function PushSync() {
  useEffect(() => {
    void deviceState()
  }, [])
  return null
}
