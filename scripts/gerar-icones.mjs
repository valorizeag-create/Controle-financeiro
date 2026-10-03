// Gera os PNG do app a partir do logo provisório (src/ui/logo.tsx).
// Rode com `npm run icons` quando o logo mudar (decisão 11: logo definitivo).
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

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

// Imagem de compartilhamento (Open Graph): fundo brand-wash e o logo centralizado, sem texto
// (a fonte do sistema varia de máquina para máquina; o título vai no texto alternativo e nas meta tags).
const OG_LARGURA = 1200
const OG_ALTURA = 630
const OG_LOGO = 360
const compartilhamento = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_LARGURA}" height="${OG_ALTURA}" viewBox="0 0 ${OG_LARGURA} ${OG_ALTURA}">
<rect width="${OG_LARGURA}" height="${OG_ALTURA}" fill="#EEF4E9"/>
<g transform="translate(${(OG_LARGURA - OG_LOGO) / 2} ${(OG_ALTURA - OG_LOGO) / 2}) scale(${OG_LOGO / 32})"><circle cx="16" cy="16" r="16" fill="${VERDE}"/>${olho()}</g></svg>`

// [caminho, svg, largura, altura]
const saidas = [
  ['public/icons/icon-192.png', normal(192), 192, 192],
  ['public/icons/icon-512.png', normal(512), 512, 512],
  ['src/app/icon.png', normal(192), 192, 192],
  ['public/icons/maskable-192.png', adaptavel(192), 192, 192],
  ['public/icons/maskable-512.png', adaptavel(512), 512, 512],
  ['src/app/apple-icon.png', adaptavel(180), 180, 180],
  ['public/icons/badge-96.png', selo(96), 96, 96],
  ['src/app/opengraph-image.png', compartilhamento, OG_LARGURA, OG_ALTURA],
]

await mkdir('public/icons', { recursive: true })
for (const [arquivo, svg, largura, altura] of saidas) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(largura, altura).png().toFile(arquivo)
  console.log('ok', arquivo)
}

// favicon.ico: os navegadores pedem esse endereço por conta própria. É um .ico com uma imagem só,
// o próprio PNG de 48 px dentro (cabeçalho de 6 bytes + entrada de 16 bytes + PNG).
const FAVICON = 48
const png = await sharp(Buffer.from(normal(FAVICON)), { density: 384 }).resize(FAVICON, FAVICON).png().toBuffer()
const ico = Buffer.alloc(22)
ico.writeUInt16LE(1, 2) // tipo: ícone
ico.writeUInt16LE(1, 4) // uma imagem
ico.writeUInt8(FAVICON, 6)
ico.writeUInt8(FAVICON, 7)
ico.writeUInt16LE(1, 10) // planos
ico.writeUInt16LE(32, 12) // bits por ponto
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18) // onde a imagem começa
await writeFile('src/app/favicon.ico', Buffer.concat([ico, png]))
console.log('ok', 'src/app/favicon.ico')
