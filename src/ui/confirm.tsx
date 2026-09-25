'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from './button'

type PanelProps = {
  title: string
  body?: string
  cancelLabel: string
  onCancel: () => void
  children: ReactNode
}

export function ConfirmPanel({ title, body, cancelLabel, onCancel, children }: PanelProps) {
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Prende o foco dentro do diálogo: Tab do último item volta ao primeiro, e vice-versa.
  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled)',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(18,40,1,.32)] md:items-center">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-sheet bg-card px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 shadow-sheet md:rounded-sheet md:pb-5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
        {body && <p id={bodyId} className="text-[15px]">{body}</p>}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" autoFocus onClick={onCancel}>{cancelLabel}</Button>
          {children}
        </div>
      </div>
    </div>
  )
}

function ConfirmSubmit({ children }: { children: ReactNode }) {
  // Desativa enquanto a ação roda: dois toques não excluem duas vezes.
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending} className="w-full md:w-auto">{children}</Button>
}

type ActionProps = {
  trigger: ReactNode
  triggerAriaLabel?: string
  triggerClassName?: string
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  action: (formData: FormData) => void | Promise<void>
  fields?: Record<string, string>
}

export function ConfirmAction({
  trigger, triggerAriaLabel, triggerClassName = '', title, body, confirmLabel, cancelLabel, action, fields = {},
}: ActionProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={triggerAriaLabel} className={`min-h-11 ${triggerClassName}`} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <ConfirmPanel title={title} body={body} cancelLabel={cancelLabel} onCancel={close}>
          <form action={action} className="contents">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <ConfirmSubmit>{confirmLabel}</ConfirmSubmit>
          </form>
        </ConfirmPanel>
      )}
    </>
  )
}
