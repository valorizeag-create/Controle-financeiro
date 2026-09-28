import { expect, test } from 'vitest'
import { CARD_COLORS, cardColor } from './palette'
import type { CardColor } from './types'

test('as 6 cores do protótipo, na ordem, com os nomes lidos por leitor de tela', () => {
  expect(CARD_COLORS.map((c) => [c.key, c.label])).toEqual([
    ['green', 'Verde'], ['purple', 'Roxo'], ['blue', 'Azul'], ['orange', 'Laranja'], ['graphite', 'Grafite'], ['pink', 'Rosa'],
  ])
  expect(cardColor('purple').gradient).toBe('linear-gradient(135deg, #7a3fb0 0%, #4a1f73 55%, #2a1245 100%)')
  expect(cardColor('purple').swatch).toBe('#5b2a86')
  expect(cardColor('x' as CardColor)).toBe(CARD_COLORS[0])
})
