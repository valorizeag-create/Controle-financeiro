import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('anel de foco com contraste (≥ 3:1): contorno de 2 px na cor brand-text, afastado 2 px', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const rule = css.match(/:focus-visible\s*\{([^}]*)\}/)?.[1] ?? ''
  expect(rule).toContain('outline: 2px solid var(--color-brand-text)')
  expect(rule).toContain('outline-offset: 2px')
})
