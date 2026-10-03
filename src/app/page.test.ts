import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import * as page from './page'

test('a landing é estática e tem canônico e Open Graph', () => {
  expect(page.dynamic).toBe('force-static')
  expect(page.metadata.alternates?.canonical).toBe('/')
  expect(page.metadata.openGraph).toMatchObject({ type: 'website', locale: 'pt_BR', siteName: 'Íris', url: '/' })
})

test('nenhum arquivo da landing lê sessão, cookies ou roda no navegador', () => {
  const dir = 'src/features/landing'
  const files = [join('src/app', 'page.tsx'), ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.')).map((f) => join(dir, f))]
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/['"]use client['"]/)
    expect(src, f).not.toMatch(/@\/lib\/supabase|next\/headers|cookies\(/)
  }
})
