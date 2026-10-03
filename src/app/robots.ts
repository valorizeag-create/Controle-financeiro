import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'
import { robotsFor } from '@/features/landing/seo'

export default function robots(): MetadataRoute.Robots {
  return robotsFor(env.siteUrl)
}
