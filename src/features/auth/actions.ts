'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { newPasswordSchema, resetSchema, signInSchema, signUpSchema } from './schemas'

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['displayName', 'email', 'password'] as const)
  const values = { displayName: raw.displayName, email: raw.email }
  const parsed = signUpSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error?.code === 'user_already_exists') {
    return errorState({ message: 'Esse e-mail já tem um cadastro. Quer entrar?', values })
  }
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/inicio')
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['email', 'password'] as const)
  const values = { email: raw.email }
  const parsed = signInSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error?.code === 'invalid_credentials') {
    return errorState({ message: 'E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.', values })
  }
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/inicio')
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env.siteUrl}/auth/callback` },
  })
  redirect(error || !data.url ? '/entrar?erro=1' : data.url)
}

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['email'] as const)
  const parsed = resetSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values: raw })
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/nova-senha`,
  })
  return { status: 'sent' }
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(readFields(fd, ['password'] as const))
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error) })
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return errorState({ message: UNEXPECTED })
  redirect('/inicio')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/entrar')
}
