import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { normalize } from './normalizar.mjs'

export const FALTA_COPY =
  'Falta docs/copy/documento-base.md: exporte o documento de copy (Claude Docs, "Íris — Documento-base de comunicação") e salve nesse caminho. ' +
  'O arquivo é privado: docs/copy/ está no .gitignore e a cópia nunca vai para o git.'

/** Texto do título que casa (e de seus subtítulos) até o próximo título de mesmo nível ou maior. */
export function sectionText(md, heading) {
  const re = new RegExp(heading.source, heading.flags.replace(/[gy]/g, ''))
  const linhas = md.split(/\r?\n/)
  const partes = []
  for (let i = 0; i < linhas.length; i++) {
    if (!re.test(linhas[i])) continue
    const nivel = /^(#+)\s/.exec(linhas[i])?.[1].length ?? 1
    const corpo = [linhas[i]]
    for (i++; i < linhas.length; i++) {
      const h = /^(#+)\s/.exec(linhas[i])
      if (h && h[1].length <= nivel) break
      corpo.push(linhas[i])
    }
    i--
    partes.push(corpo.join('\n'))
  }
  return partes.join('\n')
}

const ler = (caminho) => (existsSync(caminho) ? readFileSync(caminho, 'utf8') : '')

export function loadCorpus(root) {
  const copyPath = join(root, 'docs/copy/documento-base.md')
  if (!existsSync(copyPath)) {
    const erro = new Error(FALTA_COPY)
    erro.codigo = 'SEM_COPY'
    throw erro
  }
  const copy = normalize(readFileSync(copyPath, 'utf8'))
  const planosDir = join(root, 'docs/superpowers/plans')
  const planos = existsSync(planosDir) ? readdirSync(planosDir).filter((f) => f.endsWith('.md')).sort() : []
  const listed = [
    ler(join(root, 'docs/etapa-2-requisitos.md')),
    sectionText(ler(join(root, 'docs/etapa-5-ui.md')), /^##\s+Textos novos aprovados/m),
    ler(join(root, 'docs/decisoes-para-revisao.md')),
    ...planos.map((f) => sectionText(ler(join(planosDir, f)), /^##\s+Textos novos/m)),
  ].join('\n')
  return { copy, listed: normalize(listed) }
}
