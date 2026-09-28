import type { CardColor } from './types'

export const CARD_COLORS: readonly { key: CardColor; label: string; gradient: string; swatch: string }[] = [
  { key: 'green', label: 'Verde', gradient: 'linear-gradient(135deg, #3f7d1c 0%, #122801 55%, #0f1e3a 100%)', swatch: '#3f7d1c' },
  { key: 'purple', label: 'Roxo', gradient: 'linear-gradient(135deg, #7a3fb0 0%, #4a1f73 55%, #2a1245 100%)', swatch: '#5b2a86' },
  { key: 'blue', label: 'Azul', gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #0f1e3a 100%)', swatch: '#1d4ed8' },
  { key: 'orange', label: 'Laranja', gradient: 'linear-gradient(135deg, #c2410c 0%, #9a3412 55%, #6b230a 100%)', swatch: '#c2410c' },
  { key: 'graphite', label: 'Grafite', gradient: 'linear-gradient(135deg, #525252 0%, #262626 55%, #171717 100%)', swatch: '#404040' },
  { key: 'pink', label: 'Rosa', gradient: 'linear-gradient(135deg, #be185d 0%, #9d174d 55%, #500724 100%)', swatch: '#9d174d' },
]

export function cardColor(key: CardColor): (typeof CARD_COLORS)[number] {
  return CARD_COLORS.find((c) => c.key === key) ?? CARD_COLORS[0]
}
