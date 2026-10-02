// Gera os PNG do app a partir do logo provisório (src/ui/logo.tsx).
// Rode com `npm run icons` quando o logo mudar (decisão 11: logo definitivo).
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const VERDE = '#a0e870'
const ESCURO = '#122801'
const BRANCO = '#ffffff'

// Grade de 32 do logo; `escala` e o centro permitem reduzir o desenho dentro do quadro.
function olho(cor = ESCURO, brilho = BRANCO) {
  return `<circle cx="16" cy="16" r="8" fill="none" stroke="${cor}" stroke-width="2.5"/>
<circle cx="16" cy="16" r="3.2" fill="${cor}"/>
${brilho ? `<circle cx="19.5" cy="12.5" r="1.6" fill="${brilho}"/>` : ''}`
}

// Logo completo, fundo transparente, ocupando 94% do quadro.
const normal = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">
<g transform="translate(16 16) scale(${0.94 * 32 / 30}) translate(-16 -16)"><circle cx="16" cy="16" r="15" fill="${VERDE}"/>${olho()}</g></svg>`

// Adaptavel: fundo verde de ponta a ponta; anel, pupila e brilho dentro de 60% do quadro.
// O anel (r=8 + traco) ocupa 19,25 de 32 = 60%.
const adaptavel = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">
<rect width="32" height="32" fill="${VERDE}"/>${olho()}</svg>`

// Selo pequeno da barra do Android: so anel e pupila em branco.
const selo = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">
<g transform="translate(16 16) scale(1.45) translate(-16 -16)">${olho(BRANCO, null)}</g></svg>`

const saidas = [
  ['public/icons/icon-192.png', normal(192), 192],
  ['public/icons/icon-512.png', normal(512), 512],
  ['src/app/icon.png', normal(192), 192],
  ['public/icons/maskable-192.png', adaptavel(192), 192],
  ['public/icons/maskable-512.png', adaptavel(512), 512],
  ['src/app/apple-icon.png', adaptavel(180), 180],
  ['public/icons/badge-96.png', selo(96), 96],
]

await mkdir('public/icons', { recursive: true })
for (const [arquivo, svg, px] of saidas) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(px, px).png().toFile(arquivo)
  console.log('ok', arquivo)
}
