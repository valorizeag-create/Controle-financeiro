import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'
import { sitemapFor } from '@/features/landing/seo'
import { CONTROLLER, isLegalReady } from '@/features/legal/controller'

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(env.siteUrl, isLegalReady(CONTROLLER))
}
