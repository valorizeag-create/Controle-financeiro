'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { requestPasswordReset, signIn, signUp, updatePassword } from './actions'

function useForm(action: (s: FormState, fd: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  return {
    state,
    formAction,
    pending,
    key: err ? err.submission : 'idle',
    values: err?.values ?? {},
    errors: err?.fieldErrors ?? {},
    message: err?.message,
    code: err?.code,
  }
}

export function SignUpForm() {
  const f = useForm(signUp)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="displayName" label="Como podemos te chamar?" autoComplete="given-name" defaultValue={f.values.displayName} error={f.errors.displayName} />
      <TextField name="email" type="email" label="Seu e-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <TextField name="password" type="password" label="Crie uma senha" autoComplete="new-password" hint="Pelo menos 8 caracteres." error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending} className="mt-2">Criar meu cadastro</Button>
    </form>
  )
}

export function SignInForm() {
  const f = useForm(signIn)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="email" type="email" label="E-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <TextField name="password" type="password" label="Senha" autoComplete="current-password" error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending} className="mt-2">Entrar</Button>
    </form>
  )
}

export function ResetForm() {
  const f = useForm(requestPasswordReset)
  if (f.state.status === 'sent') {
    return (
      <p role="status" className="rounded-panel bg-brand-wash px-4 py-3 text-[15px] text-brand-ink">
        Pronto. Se houver um cadastro com esse e-mail, o link já está na sua caixa de entrada.
      </p>
    )
  }
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="email" type="email" label="E-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <Button type="submit" disabled={f.pending}>Enviar link</Button>
    </form>
  )
}

export function NewPasswordForm({ from }: { from?: 'configuracoes' }) {
  const f = useForm(updatePassword)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      {from && <input type="hidden" name="from" value={from} />}
      <TextField name="password" type="password" label="Crie uma senha" autoComplete="new-password" hint="Pelo menos 8 caracteres." error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      {f.code === 'reauth' && <SignOutButton variant="row" />}
      <Button type="submit" disabled={f.pending}>Salvar nova senha</Button>
    </form>
  )
}
