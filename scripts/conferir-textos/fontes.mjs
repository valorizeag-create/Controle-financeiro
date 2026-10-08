import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { normalize, unmarkdown } from './normalizar.mjs'

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

const PALAVRAS_DE_LIGACAO = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por',
  'com', 'que', 'ou', 'um', 'uma', 'se', 'ao', 'à', 'pelo', 'pela',
])
/** Quantas palavras de conteúdo (nem variável, nem ligação) o texto tem. */
export function palavrasDeConteudo(texto) {
  return (texto.replace(/\{\}/g, ' ').match(/\p{L}+/gu) ?? []).filter((w) => !PALAVRAS_DE_LIGACAO.has(w.toLowerCase())).length
}

const temLetra = (s) => /\p{L}/u.test(s)
const LIMITE_TRECHO = 25 // abaixo disso, só texto inteiro de uma entrada vale
const LACUNA = '[^.!?;:\\n]{1,40}' // um {} cobre uma palavra ou duas, nunca uma frase

const SINAIS = new Set('.*+?^$|(){}[]\\'.split(''))
const escapar = (s) => [...s].map((c) => (SINAIS.has(c) ? `\\${c}` : c)).join('')

function padrao(texto) {
  return texto.split('{}').map(escapar).join(LACUNA)
}

/**
 * Divide um documento em entradas discretas (itens de lista, células de tabela, linhas, frases, trechos
 * entre aspas, "rótulo: texto") e guarda o texto corrido para a busca de trechos longos.
 */
export function buildSource(md) {
  const entries = new Set()
  const linhasLimpas = []
  const adicionar = (bruto) => {
    let t = normalize(bruto)
    t = t.replace(/^"(.*)"$/, '$1').trim()
    if (!temLetra(t) || palavrasDeConteudo(t) === 0 && t.includes('{}')) return
    entries.add(t)
  }
  for (const linha of md.split(/\r?\n/)) {
    const limpa = unmarkdown(linha).replace(/^\s*(?:#+|>|[-*+]|\d+[.)])\s+/, '')
    const norm = normalize(limpa)
    if (!temLetra(norm)) continue
    linhasLimpas.push(norm)
    const celulas = linha.includes('|') ? unmarkdown(linha).split('|') : [limpa]
    for (const celula of celulas) {
      adicionar(celula)
      for (const parte of celula.split(/\s+[·|]\s+/)) adicionar(parte)
      for (const frase of normalize(celula).split(/(?<=[.!?])\s+/)) {
        adicionar(frase)
        for (const rotulo of frase.split(/:\s+/)) adicionar(rotulo)
      }
      for (const citado of normalize(celula).matchAll(/"([^"]+)"/g)) adicionar(citado[1])
    }
  }
  return { entries, longo: linhasLimpas.join('\n'), cache: new Map() }
}

function achaTrecho(longo, texto) {
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])${padrao(texto)}(?![\\p{L}\\p{N}])`, 'u')
  return regex.test(longo)
}

function casaUma(source, t) {
  if (!temLetra(t)) return false
  const curinga = t.includes('{}')
  if (curinga && palavrasDeConteudo(t) === 0) return false
  if (source.entries.has(t)) return true
  if (curinga) {
    const re = new RegExp(`^${padrao(t)}$`, 'u')
    for (const e of source.entries) if (re.test(e)) return true
  } else {
    for (const e of source.entries) {
      if (!e.includes('{}')) continue
      let re = source.cache.get(e)
      if (!re) source.cache.set(e, (re = new RegExp(`^${padrao(e)}$`, 'u')))
      if (palavrasDeConteudo(e) > 0 && re.test(t)) return true
    }
  }
  return t.length >= LIMITE_TRECHO && achaTrecho(source.longo, t)
}

/** O texto (já normalizado) está na fonte? Texto inteiro, ou trecho longo com fronteira de palavra. */
export function casa(source, texto) {
  if (casaUma(source, texto)) return true
  return texto.endsWith('.') && casaUma(source, texto.slice(0, -1).trim())
}

const ler = (caminho) => (existsSync(caminho) ? readFileSync(caminho, 'utf8') : '')

export function loadCorpus(root) {
  const copyPath = join(root, 'docs/copy/documento-base.md')
  if (!existsSync(copyPath)) {
    const erro = new Error(FALTA_COPY)
    erro.codigo = 'SEM_COPY'
    throw erro
  }
  const planosDir = join(root, 'docs/superpowers/plans')
  const planos = existsSync(planosDir) ? readdirSync(planosDir).filter((f) => f.endsWith('.md')).sort() : []
  const listado = [
    ler(join(root, 'docs/etapa-2-requisitos.md')),
    sectionText(ler(join(root, 'docs/etapa-5-ui.md')), /^##\s+Textos novos aprovados/m),
    ler(join(root, 'docs/decisoes-para-revisao.md')),
    ...planos.map((f) => sectionText(ler(join(planosDir, f)), /^##\s+Textos novos/m)),
  ].join('\n')
  return { copy: buildSource(readFileSync(copyPath, 'utf8')), listed: buildSource(listado) }
}
