import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import manifest from '@/app/manifest'
import nextConfig from '../../../next.config'

const size = (path: string) => {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString('latin1'), path).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('manifest (RNF-03)', () => {
  const m = manifest()
  test('nome, início, modo e cores dos tokens', () => {
    expect(m).toMatchObject({
      name: 'Íris', short_name: 'Íris', start_url: '/inicio', scope: '/', display: 'standalone', lang: 'pt-BR',
      background_color: '#f8f8f8', theme_color: '#f8f8f8',
    })
    expect(JSON.stringify(m).toLowerCase()).not.toMatch(/baix|loja|store/)
  })
  test('ícones do logo provisório, inclusive os adaptáveis', () => {
    expect(m.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })
  test('os arquivos existem com o tamanho declarado', () => {
    expect(size('public/icons/icon-192.png')).toEqual([192, 192])
    expect(size('public/icons/icon-512.png')).toEqual([512, 512])
    expect(size('public/icons/maskable-192.png')).toEqual([192, 192])
    expect(size('public/icons/maskable-512.png')).toEqual([512, 512])
    expect(size('public/icons/badge-96.png')).toEqual([96, 96])
    expect(size('src/app/icon.png')).toEqual([192, 192])
    expect(size('src/app/apple-icon.png')).toEqual([180, 180])
  })
  // Navegadores pedem /favicon.ico por conta própria; sem o arquivo, a resposta é 404.
  test('favicon.ico: um arquivo .ico com o logo provisório em 48 px (PNG dentro do .ico)', () => {
    const b = readFileSync('src/app/favicon.ico')
    // Cabeçalho: reservado 0, tipo 1 (ícone), 1 imagem; depois a entrada de 16 bytes e a imagem.
    expect([b.readUInt16LE(0), b.readUInt16LE(2), b.readUInt16LE(4)]).toEqual([0, 1, 1])
    expect([b[6], b[7]]).toEqual([48, 48])
    expect(b.readUInt16LE(12)).toBe(32)
    expect(b.readUInt32LE(18)).toBe(22)
    expect(b.readUInt32LE(14)).toBe(b.length - 22)
    const png = b.subarray(22)
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([48, 48])
    expect(b.length).toBeLessThan(10_000)
  })
})

describe('página "Sem conexão"', () => {
  const html = readFileSync('public/sem-conexao.html', 'utf8')
  test('texto da copy, idioma, e um caminho de volta', () => {
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('Sem conexão no momento. Assim que voltar, a gente tenta de novo.')
    expect(html).toContain('<a href="/inicio">Tentar de novo</a>')
    expect(html.match(/<h1/g)?.length).toBe(1)
  })
  test('é estática e sozinha: sem script, sem arquivo de fora, sem dado de ninguém', () => {
    expect(html).not.toMatch(/<script|<link|src=|https?:\/\/|@import|url\(/i)
    expect(html.toLowerCase()).not.toMatch(/baix|r\$/)
    expect(html).not.toContain('!important')
  })
})

describe('cabeçalhos', () => {
  test('o service worker nunca fica em cache e só roda código da própria Íris', async () => {
    const all = await nextConfig.headers!()
    const sw = all.find((h) => h.source === '/sw.js')!.headers
    expect(sw).toEqual(expect.arrayContaining([
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
    ]))
    const every = all.find((h) => h.source === '/(.*)')!.headers
    expect(every).toEqual(expect.arrayContaining([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]))
    expect(all.find((h) => h.source === '/sem-conexao.html')!.headers).toEqual([{ key: 'Cache-Control', value: 'no-cache' }])
  })
})
