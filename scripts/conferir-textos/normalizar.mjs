// Normalização comum à extração e às fontes: o mesmo texto, escrito de jeitos
// diferentes (aspas curvas, NBSP, ênfase em Markdown, variáveis), vira a mesma coisa.

const ENTIDADES = [
  [/&quot;/g, '"'],
  [/&apos;|&#39;/g, "'"],
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
]

export function normalize(s) {
  let t = String(s).normalize('NFC')
  for (const [re, to] of ENTIDADES) t = t.replace(re, to)
  t = t
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\*\*|\*|_|`/g, '')
  // Qualquer {…} (inclusive aninhado) é uma variável: vira curinga.
  let anterior
  do {
    anterior = t
    t = t.replace(/\{[^{}]*\}/g, '\u0000')
  } while (t !== anterior)
  t = t.replace(/\u0000/g, '{}')
  return t.replace(/[\s\u00a0\u202f]+/g, ' ').trim()
}
