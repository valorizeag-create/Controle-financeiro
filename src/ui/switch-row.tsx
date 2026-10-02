import { useId } from 'react'

type Props = {
  label: string
  caption?: string
  checked: boolean
  action: (formData: FormData) => void | Promise<void>
  fields: Record<string, string>
}

// Chave de liga/desliga: tocar envia o formulário com o valor contrário (enabled).
// O estado é dito por aria-checked e pela posição do botão, não só pela cor.
export function SwitchRow({ label, caption, checked, action, fields }: Props) {
  const labelId = useId()
  const captionId = useId()
  return (
    <form action={action} className="contents">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="enabled" value={String(!checked)} />
      <button
        type="submit"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={caption ? captionId : undefined}
        className="flex min-h-11 w-full items-center gap-3.5 py-2 text-left text-ink"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={labelId} className="text-[15px]">{label}</span>
          {caption && <span id={captionId} className="text-[13px] text-muted">{caption}</span>}
        </span>
        <span aria-hidden="true" className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${checked ? 'justify-end bg-brand' : 'justify-start bg-sunken'}`}>
          <span className="size-6 rounded-full bg-card shadow-sm" />
        </span>
      </button>
    </form>
  )
}
