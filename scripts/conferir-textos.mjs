// Conferência de textos: todo texto visível ao usuário no código precisa estar na
// copy oficial (cópia local, fora do git) ou nas listas de "Textos novos" aprovados.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractHtml, extractStrings } from './conferir-textos/extrair.mjs'
import { loadCorpus } from './conferir-textos/fontes.mjs'
import { normalize } from './conferir-textos/normalizar.mjs'

const SINAIS = new Set('.*+?^$|(){}[]\\'.split(''))
const escapar = (s) => [...s].map((c) => (SINAIS.has(c) ? `\\${c}` : c)).join('')

function contem(base, texto) {
  if (!texto) return true
  if (!texto.includes('{}')) return base.includes(texto)
  // {} é curinga: casa qualquer trecho curto do outro lado.
  const partes = texto.split('{}').map((p) => p.trim()).filter(Boolean)
  if (partes.length === 0) return true
  return new RegExp(partes.map(escapar).join('.{0,200}?')).test(base)
}

function achaEm(base, texto) {
  if (contem(base, texto)) return true
  return texto.endsWith('.') && contem(base, texto.slice(0, -1).trim())
}

export function classify(text, corpus) {
  const t = normalize(text)
  if (achaEm(corpus.copy, t)) return 'copy'
  if (achaEm(corpus.listed, t)) return 'listed'
  return 'unlisted'
}

function arquivos(dir, aceita, saida = []) {
  if (!existsSync(dir)) return saida
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__scratch__' || e.name === 'node_modules') continue
      arquivos(caminho, aceita, saida)
    } else if (aceita(e.name)) saida.push(caminho)
  }
  return saida
}

function carregarIgnorados(root) {
  const caminho = join(root, 'scripts/conferir-textos/ignorar.json')
  const lista = existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) : []
  const ignorados = new Set()
  for (const item of lista) {
    if (!item.motivo || !String(item.motivo).trim()) throw new Error(`ignorar.json: "${item.texto}" sem motivo`)
    ignorados.add(normalize(item.texto))
  }
  return ignorados
}

export function run(root) {
  const ignorados = carregarIgnorados(root)
  const corpus = loadCorpus(root)
  const alvos = [
    ...arquivos(join(root, 'src'), (n) => /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)),
    ...['public/sw.js', 'public/sem-conexao.html'].map((f) => join(root, f)).filter(existsSync),
    ...arquivos(join(root, 'supabase/templates'), (n) => n.endsWith('.html')),
  ]
  const counts = { copy: 0, listed: 0, unlisted: 0, ignored: 0 }
  const unlisted = []
  for (const abs of alvos) {
    const file = relative(root, abs).split(sep).join('/')
    const code = readFileSync(abs, 'utf8')
    const achados = file.endsWith('.html') ? extractHtml(code) : extractStrings(code, file)
    for (const { text, line } of achados) {
      if (ignorados.has(normalize(text))) { counts.ignored++; continue }
      const classe = classify(text, corpus)
      counts[classe]++
      if (classe === 'unlisted') unlisted.push({ file, line, text })
    }
  }
  return { unlisted, counts }
}

function main() {
  let r
  try {
    r = run(process.cwd())
  } catch (e) {
    console.error(e.message)
    process.exit(e.codigo === 'SEM_COPY' ? 2 : 1)
  }
  const { counts, unlisted } = r
  const total = counts.copy + counts.listed + counts.ignored + counts.unlisted
  console.log(
    `Conferência de textos — ${total} textos conferidos · copy: ${counts.copy} · listas: ${counts.listed} · ignorados: ${counts.ignored} · fora das listas: ${counts.unlisted}`,
  )
  if (unlisted.length) {
    console.log('Fora das listas (aprovar e listar em "Textos novos", ou corrigir):')
    for (const u of unlisted) console.log(`  ${u.file}:${u.line}  "${u.text}"`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
