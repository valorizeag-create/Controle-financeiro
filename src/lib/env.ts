import { z } from 'zod'

const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
    NEXT_PUBLIC_SITE_URL: z.url(),
    // Única chave de push permitida no navegador (a pública). Formato errado ou ausente: sem lembretes, o app segue.
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/).optional().catch(undefined),
  })
  .parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  })

export const env = {
  supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: parsed.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, ''),
  vapidPublicKey: parsed.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  // Service worker só no build de produção (ou com a variável ligada, para testar à mão): em desenvolvimento atrapalha o HMR.
  registerServiceWorker: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_REGISTER_SW === '1',
}
