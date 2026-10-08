'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { isIOS, isStandalone } from '@/features/notificacoes/push-client'
import { Button } from '@/ui/button'
import { Logo } from '@/ui/logo'
import { onInstallable, peekInstallPrompt, takeInstallPrompt } from './install-prompt'

type Mode = 'unknown' | 'installed' | 'ready' | 'ios' | 'manual'

function detect(): Mode {
  if (isStandalone()) return 'installed'
  if (peekInstallPrompt()) return 'ready'
  return isIOS() ? 'ios' : 'manual'
}

// A tela nunca prende ninguém: "Agora não" está sempre à vista e, sem convite do navegador, só há instrução.
// `wide` (só em Configurações): a partir de 1024 px, o quadro do logo fica à esquerda e o texto à direita.
export function InstallCard({ nextHref, skipWhenInstalled = false, wide = false }: { nextHref: string; skipWhenInstalled?: boolean; wide?: boolean }) {
  const router = useRouter()
  // O estado só é calculado depois de montar, para não divergir do que o servidor desenhou.
  const [mode, setMode] = useState<Mode>('unknown')

  useEffect(() => {
    const update = () => setMode(detect())
    update()
    return onInstallable(update)
  }, [])

  useEffect(() => {
    if (mode === 'installed' && skipWhenInstalled) router.replace(nextHref)
  }, [mode, skipWhenInstalled, nextHref, router])

  async function install() {
    const event = takeInstallPrompt()
    if (!event) return setMode('manual')
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') return router.push(nextHref)
    } catch {
      // o navegador recusou abrir o convite: fica a instrução
    }
    setMode('manual')
  }

  if (mode === 'installed' && skipWhenInstalled) return null
  const Right = wide ? 'div' : Fragment
  const rightProps = wide ? { className: 'contents lg:flex lg:flex-col lg:gap-5' } : {}
  return (
    <div className={`flex flex-1 flex-col gap-5 px-6 pb-8 pt-3${wide ? ' lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center lg:gap-x-10' : ''}`}>
      <div className={`h-11${wide ? ' lg:hidden' : ''}`} />
      <div className={`flex h-[300px] items-center justify-center rounded-[24px] bg-brand-wash md:h-[260px]${wide ? ' lg:w-[260px]' : ''}`}>
        <span className="flex size-[136px] items-center justify-center rounded-full bg-brand-wash shadow-[0_8px_24px_rgba(18,40,1,.1)]">
          <Logo size={72} />
        </span>
      </div>
      <Right {...rightProps}>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">Instalar a Íris</h1>
        {mode === 'installed' ? (
          <p className="text-[17px] leading-relaxed">A Íris já está na sua tela de início.</p>
        ) : (
          <>
            <p className="text-[17px] leading-relaxed">Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.</p>
            {mode === 'ios' && <p className="text-[15px] text-muted">No iPhone: toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.</p>}
            {mode === 'manual' && <p className="text-[15px] text-muted">No menu do navegador, escolha &quot;Instalar&quot; ou &quot;Adicionar à tela de início&quot;.</p>}
          </>
        )}
        <div className={`flex-1${wide ? ' lg:hidden' : ''}`} />
        <div className="flex flex-col gap-2">
          {mode === 'ready' && (
            <Button type="button" onClick={install} className="h-[52px]">Adicionar à tela de início</Button>
          )}
          <Button href={nextHref} variant="ghost">{mode === 'installed' ? 'Voltar' : 'Agora não'}</Button>
        </div>
      </Right>
    </div>
  )
}
