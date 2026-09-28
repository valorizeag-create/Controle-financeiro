'use client'

import { useActionState, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { CHIP } from '@/ui/chip'
import { FrequencyField } from '@/ui/frequency-field'
import { idle } from '@/lib/forms'
import { addDays, type ISODate } from '@/domain/dates'
import type { Frequency } from '@/domain/recurrence'
import { createTransaction, updateTransaction } from './actions'
import type { Category } from './queries'
import { INCOME_SOURCES, PAYMENT_LABELS } from './labels'
import { recordToFormValues, type EditableRecord } from './form-values'
import type { CardRow } from '@/features/cartoes/types'
import { cardColor } from '@/features/cartoes/palette'

type Props = {
  kind: 'expense' | 'income'
  categories: Category[]
  today: ISODate
  record?: EditableRecord
  cards?: CardRow[]
  lastCardId?: string | null
}

function RepeatOption({
  label,
  initialOn,
  initialFrequency,
}: {
  label: string
  initialOn: boolean
  initialFrequency: Frequency
}) {
  const [on, setOn] = useState(initialOn)
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency)

  return (
    <div className="flex flex-col gap-3.5">
      <label className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink">
        {label}
        <input
          type="checkbox"
          name="repeats"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="size-[22px] accent-[#6cbf38]"
        />
      </label>
      {on && <FrequencyField value={frequency} onChange={setFrequency} legend="Com que frequência?" hideLegend />}
    </div>
  )
}

export function AnotarForm({ kind, categories, today, record, cards = [], lastCardId = null }: Props) {
  const [state, action, pending] = useActionState(record ? updateTransaction : createTransaction, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? (record ? recordToFormValues(record, today) : {})
  const e = err?.fieldErrors ?? {}
  const [when, setWhen] = useState(v.when || 'today')
  // "Sujo" = há algo digitado que ainda não foi salvo; o botão Fechar pergunta antes de descartar.
  const [touched, setTouched] = useState(false)
  const isExpense = kind === 'expense'
  const hasDetails = Boolean(v.note || v.paymentMethod || v.repeats)
  const hasCards = isExpense && cards.length > 0
  // Erro ou edição trazem o cartão do próprio registro; ao criar do zero, o último cartão usado já
  // vem marcado (se ainda existir); sem nenhum dos dois, "Outra forma" (decisão K6 A / Review Focus 4).
  const initialCardId = v.cardId !== undefined ? v.cardId : cards.some((c) => c.id === lastCardId) ? (lastCardId as string) : ''
  const [cardId, setCardId] = useState(initialCardId)

  return (
    <form
      key={err ? err.submission : 'idle'}
      action={action}
      noValidate
      onInput={() => setTouched(true)}
      onChange={() => setTouched(true)}
      data-dirty={touched || err ? 'true' : undefined}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      {record && <input type="hidden" name="id" value={record.id} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">{isExpense ? 'Quanto foi?' : 'Quanto entrou?'}</label>
        <input
          id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" defaultValue={v.amount}
          aria-invalid={e.amount ? true : undefined} aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink outline-none placeholder:text-[#a3a3a3] ${e.amount ? 'border-error-ink' : 'border-brand'}`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
      </div>

      {isExpense ? (
        <fieldset className="flex flex-col gap-2.5" aria-describedby={e.categoryId ? 'cat-error' : undefined}>
          <legend className="mb-2.5 text-[15px] font-medium">Com o quê?</legend>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((c) => (
              <label key={c.id} className={CHIP}>
                <input type="radio" name="categoryId" value={c.id} defaultChecked={v.categoryId === c.id} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
          {e.categoryId && <span id="cat-error" className="text-sm text-error-ink">{e.categoryId}</span>}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-medium">De onde veio?</legend>
          <div className="flex flex-wrap gap-2">
            {INCOME_SOURCES.map((s) => (
              <label key={s} className={CHIP}>
                <input type="radio" name="source" value={s} defaultChecked={v.source === s} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {hasCards && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-medium">Como pagou?</legend>
          <div className="flex flex-wrap gap-2">
            {cards.map((c) => (
              <label key={c.id} className={`${CHIP} gap-2`}>
                <input
                  type="radio"
                  name="cardId"
                  value={c.id}
                  checked={cardId === c.id}
                  onChange={() => setCardId(c.id)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="h-3.5 w-5 rounded-full" style={{ background: cardColor(c.color).swatch }} />
                {c.nickname}
              </label>
            ))}
            <label className={`${CHIP} border-dashed`}>
              <input
                type="radio"
                name="cardId"
                value=""
                checked={cardId === ''}
                onChange={() => setCardId('')}
                className="sr-only"
              />
              Outra forma
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2.5" aria-describedby={e.date ? 'date-error' : undefined}>
        <legend className="mb-2.5 text-[15px] font-medium">Quando?</legend>
        <div className="flex flex-wrap gap-2">
          {[['today', 'Hoje'], ['yesterday', 'Ontem'], ['other', 'Outro dia']].map(([value, label]) => (
            <label key={value} className={`${CHIP} rounded-full px-[18px]`}>
              <input type="radio" name="when" value={value} checked={when === value} onChange={() => setWhen(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {when === 'other' && (
          <input
            type="date" name="date" defaultValue={v.date} aria-label="Dia"
            min="2000-01-01" max={isExpense ? addDays(today, 365) : today}
            aria-invalid={e.date ? true : undefined} aria-describedby={e.date ? 'date-error' : undefined}
            className="h-12 rounded-control border border-control px-3.5 text-base"
          />
        )}
        {e.date && <span id="date-error" className="text-sm text-error-ink">{e.date}</span>}
      </fieldset>

      {!isExpense && !record && (
        <div className="border-y border-line py-3.5">
          <RepeatOption
            label="Isso se repete"
            initialOn={v.repeats === 'on'}
            initialFrequency={v.frequency === 'yearly' ? 'yearly' : 'monthly'}
          />
        </div>
      )}

      {isExpense && (
        <details open={hasDetails} className="group border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] font-medium text-ink">
            Mais detalhes
            <ChevronDown className="size-[18px] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm text-inactive">Uma nota, se quiser</label>
              <input id="note" name="note" maxLength={140} defaultValue={v.note} className="h-11 rounded-control border border-control px-3 text-base" />
            </div>
            {cardId === '' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentMethod" className="text-sm text-inactive">Forma de pagamento</label>
                <select id="paymentMethod" name="paymentMethod" defaultValue={v.paymentMethod ?? ''} className="h-11 rounded-control border border-control bg-card px-3 text-base">
                  <option value="">Não informar</option>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            {!record && (
              <RepeatOption
                label="É uma conta que se repete"
                initialOn={v.repeats === 'on'}
                initialFrequency={v.frequency === 'yearly' ? 'yearly' : 'monthly'}
              />
            )}
          </div>
        </details>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {record ? 'Salvar alterações' : isExpense ? 'Salvar gasto' : 'Salvar entrada'}
      </Button>
    </form>
  )
}
