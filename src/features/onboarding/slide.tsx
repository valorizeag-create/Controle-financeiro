import Link from 'next/link'
import { Clock, Eye, PenLine, type LucideIcon } from 'lucide-react'
import { Button } from '@/ui/button'

export const SLIDES: { title: string; body: string; icon: LucideIcon }[] = [
  { title: 'Aqui, tudo começa com um gasto.', body: 'Anote o que entrou e o que saiu, em segundos. A Íris organiza o resto.', icon: PenLine },
  { title: 'Veja para onde seu dinheiro vai.', body: 'Cada registro vai para uma categoria. Com poucos dias, seu mês já começa a fazer sentido.', icon: Eye },
  { title: 'No seu ritmo.', body: 'Esqueceu de anotar? Tudo bem. É só continuar de onde parou.', icon: Clock },
]

export function parseStep(raw: string | undefined): 1 | 2 | 3 {
  return raw === '2' ? 2 : raw === '3' ? 3 : 1
}

export function OnboardingSlide({ step }: { step: 1 | 2 | 3 }) {
  const slide = SLIDES[step - 1]
  const Icon = slide.icon
  const last = step === 3
  return (
    <>
      <div className="flex justify-end px-4 pt-3">
        <Link href="/boas-vindas/saldo" className="flex h-11 items-center px-3 text-[15px] font-medium text-brand-text">Pular</Link>
      </div>
      <div className="mx-6 mt-2 flex h-[300px] items-center justify-center rounded-[24px] bg-brand-wash md:h-[260px]">
        <span className="flex size-[136px] items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_24px_rgba(18,40,1,.1)]">
          <Icon className="size-[60px]" strokeWidth={1.6} aria-hidden="true" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-6 pb-8 pt-8">
        <div aria-hidden="true" className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-2 rounded-full ${i === step ? 'w-6 bg-selected' : 'w-2 bg-[#d4d4d4]'}`} />
          ))}
        </div>
        <span className="sr-only">Passo {step} de 3</span>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{slide.title}</h1>
        <p className="text-[17px] leading-relaxed">{slide.body}</p>
        <div className="flex-1" />
        <Button href={last ? '/boas-vindas/saldo' : `/boas-vindas?passo=${step + 1}`} className="h-[52px]">
          {last ? 'Começar' : 'Próximo'}
        </Button>
      </div>
    </>
  )
}
