import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { SEO_TITLE } from '@/features/landing/seo'

test('imagem de compartilhamento: 1200×630, com o título da copy como texto alternativo', async () => {
  const meta = await sharp(readFileSync('src/app/opengraph-image.png')).metadata()
  expect([meta.width, meta.height]).toEqual([1200, 630])
  expect(readFileSync('src/app/opengraph-image.alt.txt', 'utf8').trim()).toBe(SEO_TITLE)
})
