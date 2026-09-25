import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!

export const admin = createClient(url, secret, { auth: { persistSession: false } })

export type TestUser = { id: string; client: SupabaseClient }

export async function newUser(name: string): Promise<TestUser> {
  const email = `db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const password = 'senha-de-teste-123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  })
  if (error) throw error
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id: data.user.id, client }
}

export async function removeUsers(...users: (TestUser | undefined)[]): Promise<void> {
  const errors: unknown[] = []
  for (const u of users) {
    if (!u?.id) continue
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) errors.push(error)
  }
  if (errors.length > 0) throw errors[0]
}

export async function categoryId(user: TestUser, key: string): Promise<string> {
  const { data, error } = await user.client.from('categories').select('id').eq('default_key', key).single()
  if (error) throw error
  return data.id
}
