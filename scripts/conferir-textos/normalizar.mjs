// Normalização comum à extração e às fontes: o mesmo texto, escrito de jeitos
// diferentes (aspas curvas, NBSP, ênfase em Markdown, variáveis), vira a mesma coisa.

const NOMEADAS = {
  quot: '"', apos: "'", amp: '&', nbsp: ' ', lt: '<', gt: '>', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ',
}
const MARCAS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈' }
for (const letra of 'aeiouAEIOU') {
  for (const [nome, marca] of Object.entries(MARCAS)) NOMEADAS[letra + nome] = (letra + marca).normalize('NFC')
}

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NOMEADAS[e] ?? m
  })
}

/** Markdown exportado: remove imagens, links `[texto](url)` e escapes (`\.`). */
export function unmarkdown(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~"'<&:,])/g, '$1')
}

export function normalize(s) {
  let t = decodeEntities(String(s).normalize('NFC'))
  t = t
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[—–]/g, '-')
    .replace(/\*\*|\*|_|`/g, '')
  // Qualquer {…} (inclusive aninhado) é uma variável: vira curinga.
  let anterior
  do {
    anterior = t
    t = t.replace(/\{[^{}]*\}/g, '\u0000')
  } while (t !== anterior)
  t = t.replace(/\u0000/g, '{}')
  return t.replace(/[\s  ]+/g, ' ').trim()
}
