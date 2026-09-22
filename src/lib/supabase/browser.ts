import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

export const createBrowserSupabase = () => createBrowserClient(env.supabaseUrl, env.supabaseKey)
