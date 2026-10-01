import type { ISODate } from '@/domain/dates'

export type InviteState =
  | { status: 'idle' }
  | { status: 'ready'; link: string; expiresOn: ISODate }
  | { status: 'error'; message: string }

export const INVITE_IDLE: InviteState = { status: 'idle' }
