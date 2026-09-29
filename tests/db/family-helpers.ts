import { expect } from 'vitest'
import { categoryId, type TestUser } from './helpers'

export const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export async function createFamily(user: TestUser, name = 'Família Teste'): Promise<string> {
  const { data, error } = await user.client.rpc('create_family', { p_name: name })
  if (error) throw error
  return data as string
}

export async function inviteCode(adminUser: TestUser): Promise<string> {
  const { data, error } = await adminUser.client.rpc('create_family_invite')
  if (error) throw error
  const code = (data as { invite_code: string }[])[0].invite_code
  expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/)
  return code
}

export async function joinFamily(user: TestUser, adminUser: TestUser): Promise<void> {
  const { error } = await user.client.rpc('accept_family_invite', { p_code: await inviteCode(adminUser) })
  if (error) throw error
}

export async function expense(user: TestUser, key: string, cents: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('transactions')
    .insert({ user_id: user.id, kind: 'expense', amount_cents: cents, category_id: await categoryId(user, key), occurred_on: todaySP(), ...extra })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
