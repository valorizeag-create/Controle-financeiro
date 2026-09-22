import { z } from 'zod'

const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
    NEXT_PUBLIC_SITE_URL: z.url(),
  })
  .parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })

export const env = {
  supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: parsed.NEXT_PUBLIC_SITE_URL,
}
