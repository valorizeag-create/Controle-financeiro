import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// De 768 a 1023 px o menu lateral já ocupa 248 px: três colunas ali ficariam com ~140 px.
const GRIDS = ['src/app/(app)/inicio/page.tsx', 'src/features/familia/family-month.tsx']
const SPANS = ['src/features/seu-mes/hero.tsx', 'src/features/seu-mes/categories-card.tsx', 'src/features/seu-mes/featured-goal.tsx', 'src/features/seu-mes/planned-card.tsx', 'src/features/familia/family-month.tsx']

test('as grades do mês só abrem em três colunas a partir de 1024 px, sem buracos', () => {
  for (const f of GRIDS) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/md:grid-cols-3/)
    expect(src, f).toContain('lg:grid-cols-3 lg:grid-flow-dense')
  }
  for (const f of SPANS) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/md:col-span-2/)
    expect(src, f).toContain('lg:col-span-2')
  }
})
