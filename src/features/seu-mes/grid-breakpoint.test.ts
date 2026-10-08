import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// De 768 a 1023 px o menu lateral já ocupa 248 px: três colunas ali ficariam com ~140 px.
const GRIDS = ['src/app/(app)/inicio/page.tsx', 'src/features/familia/family-month.tsx']
const SPANS = ['src/features/seu-mes/hero.tsx', 'src/features/seu-mes/categories-card.tsx', 'src/features/seu-mes/featured-goal.tsx', 'src/features/seu-mes/planned-card.tsx', 'src/features/familia/family-month.tsx']
const read = (f: string) => readFileSync(f, 'utf8')
const classNames = (src: string) => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2])

test('as grades do mês só abrem em três colunas a partir de 1024 px', () => {
  for (const f of GRIDS) {
    const src = read(f)
    expect(src, f).not.toMatch(/md:grid-cols-3/)
    expect(classNames(src).some((c) => /(^|\s)grid(\s|$)/.test(c) && /(^|\s)lg:grid-cols-3(\s|$)/.test(c)), f).toBe(true)
  }
})

test('blocos largos ocupam duas colunas só a partir de 1024 px, em cada elemento', () => {
  for (const f of SPANS) {
    const src = read(f)
    expect(src, f).not.toMatch(/md:col-span-2/)
    const wide = classNames(src).filter((c) => /(^|\s)lg:col-span-2(\s|$)/.test(c))
    expect(wide.length, f).toBe(f.endsWith('family-month.tsx') ? 2 : 1)
  }
})

test('a ordem visual é a ordem do DOM: nada de grid-flow-dense, order-* ou posição de grade nesses arquivos', () => {
  for (const f of [...new Set([...GRIDS, ...SPANS])]) {
    const cls = classNames(read(f)).join(' ')
    expect(cls, f).not.toMatch(/grid-flow-(dense|row-dense|col-dense)/)
    expect(cls, f).not.toMatch(/(^|[\s:])-?order-/)
    expect(cls, f).not.toMatch(/(^|[\s:])(col-start|col-end|row-start|row-end|row-span)-/)
    expect(cls, f).not.toMatch(/flex-(row|col)-reverse/)
  }
})
