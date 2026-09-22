import type { z } from 'zod'

export type FormState =
  | { status: 'idle' }
  | { status: 'sent' }
  | {
      status: 'error'
      submission: number
      message?: string
      fieldErrors?: Record<string, string>
      values?: Record<string, string>
    }

export const idle: FormState = { status: 'idle' }

export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

export function readFields<K extends string>(fd: FormData, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? '')])) as Record<K, string>
}

export function errorState(input: Omit<Extract<FormState, { status: 'error' }>, 'status' | 'submission'>): FormState {
  return { status: 'error', submission: Date.now(), ...input }
}
