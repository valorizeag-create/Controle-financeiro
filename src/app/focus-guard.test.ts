import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// O anel de foco global é um `outline` (globals.css). `outline-none` num campo ou botão o apaga:
// só é aceito com um substituto visível no próprio elemento (`focus-visible:` / `focus:` com
// outline, ring ou shadow) ou, no arquivo, um `focus-within:outline` no contêiner.
const FOCUSABLE = /^(input|textarea|select|button|a|Link)$/
const BACKSLASH = String.fromCharCode(92)

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : []
  })
}

// Devolve o texto de cada tag de abertura (até o `>` fora de chaves e aspas).
function openingTags(src: string): { name: string; text: string; line: number }[] {
  const out: { name: string; text: string; line: number }[] = []
  const re = /<([A-Za-z][A-Za-z0-9]*)(?=[\s/>])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let depth = 0
    let quote = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (quote) {
        if (c === quote && src[i - 1] !== BACKSLASH) quote = ''
        continue
      }
      if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push({ name: m[1], text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length })
  }
  return out
}

const KILLS_RING = /(^|[\s"'`])outline-none/
const OWN_RING = /focus(-visible)?:(outline-(?!none)|ring|shadow)/

test('o detector enxerga campos com outline-none sem substituto', () => {
  const tags = openingTags('<input className={`a ${x ? "b" : "c"} outline-none`} onChange={() => 1} />')
  expect(tags).toHaveLength(1)
  expect(KILLS_RING.test(tags[0].text)).toBe(true)
  expect(OWN_RING.test(tags[0].text)).toBe(false)
})

test('nenhum campo, botão ou link apaga o anel de foco sem pôr outro no lugar', () => {
  const offenders: string[] = []
  for (const f of files('src')) {
    const src = readFileSync(f, 'utf8')
    const containerRing = /focus-within:outline/.test(src)
    for (const t of openingTags(src)) {
      if (!FOCUSABLE.test(t.name) || !KILLS_RING.test(t.text)) continue
      if (!OWN_RING.test(t.text) && !containerRing) offenders.push(`${f}:${t.line} <${t.name}>`)
    }
  }
  expect(offenders).toEqual([])
})
