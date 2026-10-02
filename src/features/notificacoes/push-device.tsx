'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/ui/button'
import { deviceState, disablePush, enablePush, type DeviceState } from './push-client'

type View = 'loading' | DeviceState

export function PushDevice({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [view, setView] = useState<View>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<'enabled' | 'failed' | null>(null)

  useEffect(() => {
    let alive = true
    void (vapidPublicKey ? deviceState() : Promise.resolve<DeviceState>('unsupported')).then((s) => {
      if (alive) setView(s)
    })
    return () => { alive = false }
  }, [vapidPublicKey])

  async function enable() {
    if (!vapidPublicKey || busy) return
    setBusy(true)
    setMessage(null)
    const result = await enablePush(vapidPublicKey)
    setBusy(false)
    if (result === 'on') { setView('on'); setMessage('enabled') }
    else if (result === 'blocked') setView('blocked')
    else setMessage('failed')
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    await disablePush()
    setBusy(false)
    setMessage(null)
    setView('off')
  }

  if (view === 'loading') return null
  return (
    <div className="flex flex-col gap-2 pb-3">
      {view === 'unsupported' && <p className="text-[15px] text-muted">Este navegador não recebe lembretes.</p>}
      {view === 'blocked' && (
        <p className="text-[15px] text-muted">
          Os lembretes estão bloqueados neste navegador. Para receber, libere as notificações da Íris nas configurações do navegador.
        </p>
      )}
      {view === 'needs-install' && (
        <>
          <p className="text-[15px] text-muted">No iPhone, os lembretes funcionam depois de adicionar a Íris à tela de início.</p>
          <Link href="/configuracoes/instalar" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text">
            Adicionar à tela de início
          </Link>
        </>
      )}
      {view === 'on' && (
        <>
          {message === 'enabled' ? (
            <p role="status" className="text-[15px] text-muted">Lembretes ativados.</p>
          ) : (
            <p className="text-[15px] text-muted">Os lembretes estão ativos neste aparelho.</p>
          )}
          <Button type="button" variant="secondary" disabled={busy} onClick={disable} className="min-h-11 self-start text-sm">
            Desativar neste aparelho
          </Button>
        </>
      )}
      {view === 'off' && (
        <>
          {message === 'failed' && (
            <p role="alert" className="text-[15px] text-[#7f1d1d]">Não conseguimos ativar os lembretes agora. Tente de novo em instantes.</p>
          )}
          <Button type="button" disabled={busy} onClick={enable} className="min-h-11 self-start text-sm">
            Ativar lembretes
          </Button>
        </>
      )}
    </div>
  )
}
