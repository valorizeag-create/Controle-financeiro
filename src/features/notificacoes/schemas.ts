import { z } from 'zod'
import { isAllowedPushEndpoint } from './endpoint'

// Inscrição de push vinda do navegador. Campos extras (expirationTime) são ignorados.
export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().refine(isAllowedPushEndpoint),
    keys: z.object({
      p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
      auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
    }),
  })
  .transform(({ endpoint, keys }) => ({ endpoint, p256dh: keys.p256dh, auth: keys.auth }))
