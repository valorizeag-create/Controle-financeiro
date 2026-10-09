'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle, type FormState } from '@/lib/forms'
import { CardFace } from './card-face'
import { CHIP } from '@/ui/chip'
import { CARD_COLORS } from './palette'
import { CARD_BRANDS, CARD_BRAND_LABELS, type CardBrand, type CardColor, type CardKind, type CardRow } from './types'

type Props = {
  action: (s: FormState, fd: FormData) => Promise<FormState>
  card?: CardRow
}

// "Outra" (vazio) = sem bandeira: o cartão mostra "Íris" no lugar do logo.
const BRAND_OPTIONS: { value: CardBrand | ''; label: string }[] = [
  ...CARD_BRANDS.map((b) => ({ value: b, label: CARD_BRAND_LABELS[b] })),
  { value: '', label: 'Outra' },
]

const KIND_OPTIONS: { value: CardKind; label: string }[] = [
  { value: 'credit', label: 'Crédito' },
  { value: 'debit', label: 'Débito' },
]

export function CardForm({ action, card }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? (card ? { nickname: card.nickname, kind: card.kind, color: card.color, brand: card.brand ?? '' } : {})
  const e = err?.fieldErrors ?? {}

  const [nickname, setNickname] = useState(v.nickname ?? '')
  const [kind, setKind] = useState<CardKind>((v.kind as CardKind) ?? 'credit')
  const [color, setColor] = useState<CardColor>((v.color as CardColor) ?? 'green')
  const [brand, setBrand] = useState<CardBrand | ''>(CARD_BRANDS.includes(v.brand as CardBrand) ? (v.brand as CardBrand) : '')

  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-5">
      {card && <input type="hidden" name="id" value={card.id} />}

      <CardFace nickname={nickname} kind={kind} color={color} brand={brand || null} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="text-sm font-medium text-[#262626]">Como você chama esse cartão?</label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          maxLength={30}
          autoComplete="off"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          aria-invalid={e.nickname ? true : undefined}
          aria-describedby={e.nickname ? 'nickname-error' : undefined}
          className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${e.nickname ? 'border-error-ink' : 'border-control'}`}
        />
        {e.nickname && <span id="nickname-error" className="text-sm text-error-ink">{e.nickname}</span>}
      </div>

      <fieldset>
        <legend className="mb-2.5 text-[15px] font-medium">Tipo</legend>
        <div className="grid grid-cols-2 gap-1 rounded-panel bg-sunken p-1">
          {KIND_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-control px-3 text-[15px] font-medium text-ink has-[:checked]:bg-card has-[:checked]:font-semibold has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(18,40,1,.08)] has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]"
            >
              <input
                type="radio"
                name="kind"
                value={o.value}
                checked={kind === o.value}
                onChange={() => setKind(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-[15px] font-medium">Bandeira</legend>
        <div className="grid grid-cols-2 gap-2">
          {BRAND_OPTIONS.map((o) => (
            <label key={o.value || 'outra'} className={CHIP}>
              <input
                type="radio"
                name="brand"
                value={o.value}
                checked={brand === o.value}
                onChange={() => setBrand(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-[15px] font-medium">Cor</legend>
        <div className="flex flex-wrap gap-3">
          {CARD_COLORS.map(({ key, label, gradient }) => (
            <label
              key={key}
              className="relative flex size-11 cursor-pointer rounded-full has-[:checked]:ring-2 has-[:checked]:ring-selected has-[:checked]:ring-offset-2 has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]"
              style={{ backgroundImage: gradient }}
            >
              <input
                type="radio"
                name="color"
                value={key}
                checked={color === key}
                onChange={() => setColor(key)}
                className="sr-only"
              />
              <span className="sr-only">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-[13px] text-muted">A Íris guarda só o apelido, o tipo, a cor e a bandeira. Nenhum número do cartão.</p>

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {card ? 'Salvar alterações' : 'Salvar cartão'}
      </Button>
    </form>
  )
}
