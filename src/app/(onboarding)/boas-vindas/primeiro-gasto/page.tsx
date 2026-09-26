import { Coffee } from 'lucide-react'
import { Button } from '@/ui/button'

export default function PrimeiroGastoPage() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-6 pb-8 pt-3">
      <div className="h-11" />
      <div className="flex h-[300px] items-center justify-center rounded-[24px] bg-brand-wash md:h-[260px]">
        <span className="flex size-[136px] items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_24px_rgba(18,40,1,.1)]">
          <Coffee className="size-[60px]" strokeWidth={1.6} aria-hidden="true" />
        </span>
      </div>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">Que tal anotar seu primeiro gasto?</h1>
      <p className="text-[17px] leading-relaxed">Pode ser o último café.</p>
      <div className="flex-1" />
      <div className="flex flex-col gap-2">
        <Button href="/anotar" className="h-[52px]">Anotar agora</Button>
        <Button href="/inicio" variant="ghost">Depois</Button>
      </div>
    </div>
  )
}
