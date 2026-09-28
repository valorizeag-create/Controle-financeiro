import { CARD_KIND_LABELS, type CardColor, type CardKind } from './types'
import { cardColor } from './palette'

type Props = { nickname: string; kind: CardKind; color: CardColor }

export function CardFace({ nickname, kind, color }: Props) {
  return (
    <div
      data-testid="card-face"
      className="flex h-[196px] flex-col justify-between rounded-hero p-5 text-white"
      style={{ backgroundImage: cardColor(color).gradient, boxShadow: '0 8px 24px rgba(18,40,1,.12)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[20px] font-semibold">{nickname}</span>
        <span className="shrink-0 rounded-full bg-white/22 px-2.5 py-1 text-[13px] font-medium">{CARD_KIND_LABELS[kind]}</span>
      </div>
      <div className="flex items-end justify-between">
        <div aria-hidden="true" className="h-[30px] w-10 rounded-[6px] bg-white/22" />
        <span className="text-[13px] font-medium">Íris</span>
      </div>
    </div>
  )
}
