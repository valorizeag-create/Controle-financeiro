// Conferência de textos: todo texto visível ao usuário no código precisa estar na
// copy oficial (cópia local, fora do git) ou nas listas de "Textos novos" aprovados.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractHtml, extractStrings, extractToml } from './conferir-textos/extrair.mjs'
import { casa, loadCorpus } from './conferir-textos/fontes.mjs'
import { normalize } from './conferir-textos/normalizar.mjs'

export function classify(text, corpus) {
  const t = normalize(text)
  if (casa(corpus.copy, t)) return 'copy'
  if (casa(corpus.listed, t)) return 'listed'
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
    if (!item.texto) throw new Error('ignorar.json: entrada sem "texto"')
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
  const srcFiles = alvos.filter((f) => relative(root, f).split(sep)[0] === 'src')
  if (srcFiles.length === 0) {
    throw new Error('Nenhum arquivo de src/ encontrado: rode o comando na raiz do projeto.')
  }
  const toml = join(root, 'supabase/config.toml')
  const usados = new Set()
  const counts = { copy: 0, listed: 0, unlisted: 0, ignored: 0 }
  const unlisted = []
  const fontes = alvos.map((abs) => abs)
  if (existsSync(toml)) fontes.push(toml)
  for (const abs of fontes) {
    const file = relative(root, abs).split(sep).join('/')
    const code = readFileSync(abs, 'utf8')
    const achados = file.endsWith('.html') ? extractHtml(code) : file.endsWith('.toml') ? extractToml(code) : extractStrings(code, file)
    for (const { text, line } of achados) {
      const norm = normalize(text)
      if (ignorados.has(norm)) { counts.ignored++; usados.add(norm); continue }
      const classe = classify(text, corpus)
      counts[classe]++
      if (classe === 'unlisted') unlisted.push({ file, line, text })
    }
  }
  const stale = [...ignorados].filter((i) => !usados.has(i))
  return { unlisted, counts, stale }
}

function main() {
  let r
  try {
    r = run(process.cwd())
  } catch (e) {
    console.error(e.message)
    process.exit(e.codigo === 'SEM_COPY' ? 2 : 1)
  }
  const { counts, unlisted, stale } = r
  const total = counts.copy + counts.listed + counts.ignored + counts.unlisted
  console.log(
    `Conferência de textos — ${total} textos conferidos · copy: ${counts.copy} · listas: ${counts.listed} · ignorados: ${counts.ignored} · fora das listas: ${counts.unlisted}`,
  )
  if (unlisted.length) {
    console.log('Fora das listas (aprovar e listar em "Textos novos", ou corrigir):')
    for (const u of unlisted) console.log(`  ${u.file}:${u.line}  "${u.text}"`)
  }
  if (stale.length) {
    console.log('ignorar.json: entradas sem uso (remova):')
    for (const t of stale) console.log(`  "${t}"`)
  }
  if (unlisted.length || stale.length) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
