import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('anel de foco com contraste (≥ 3:1): contorno de 2 px na cor brand-text, afastado 2 px', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const rule = css.match(/:focus-visible\s*\{([^}]*)\}/)?.[1] ?? ''
  expect(rule).toContain('outline: 2px solid var(--color-brand-text)')
  expect(rule).toContain('outline-offset: 2px')
})

test('a cor do anel tem contraste ≥ 3:1 com as superfícies onde há campos e botões', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const token = (n: string) => css.match(new RegExp(`--color-${n}: *(#[0-9a-fA-F]{6})`))?.[1] ?? ''
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  for (const surface of ['card', 'canvas', 'brand-wash', 'sunken']) {
    expect(token(surface), surface).toMatch(/^#/)
    expect(ratio(token('brand-text'), token(surface)), surface).toBeGreaterThanOrEqual(3)
  }
})
