'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/ui/button'
import { deviceState, enablePush } from './push-client'

const LATER_KEY = 'iris:lembretes:depois'

function decidedLater(): boolean {
  try {
    return window.localStorage.getItem(LATER_KEY) !== null
  } catch {
    return false
  }
}

// Convite em Contas: só aparece onde os lembretes ainda estão desligados e a pessoa não disse "Agora não".
export function BillsReminderCard({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [view, setView] = useState<'hidden' | 'ask' | 'done'>('hidden')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    if (decidedLater()) return
    void deviceState().then((s) => { if (alive && s === 'off') setView('ask') })
    return () => { alive = false }
  }, [])

  async function enable() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const result = await enablePush(vapidPublicKey)
    setBusy(false)
    if (result === 'on') setView('done')
    else if (result === 'blocked') setView('hidden')
    else if (result === 'failed') setFailed(true)
  }

  function later() {
    try {
      window.localStorage.setItem(LATER_KEY, '1')
    } catch {
      // sem armazenamento: o cartão só some nesta visita
    }
    setView('hidden')
  }

  if (view === 'hidden') return null
  if (view === 'done') return <p role="status" className="rounded-card border border-line bg-card px-4 py-3 text-[15px]">Lembretes ativados.</p>
  return (
    <section aria-label="Lembretes" className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
      <p className="text-[15px] text-ink">Quer um lembrete antes de cada conta vencer?</p>
      {failed && <p role="alert" className="text-[15px] text-error-ink">Não conseguimos ativar os lembretes agora. Tente de novo em instantes.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={enable} className="min-h-11 text-sm">Ativar lembretes</Button>
        <Button type="button" variant="ghost" onClick={later} className="min-h-11 text-sm">Agora não</Button>
      </div>
    </section>
  )
}
