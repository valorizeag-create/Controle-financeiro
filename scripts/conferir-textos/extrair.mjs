import ts from 'typescript'
import { normalize } from './normalizar.mjs'

const ATRIBUTOS_DE_TEXTO = new Set([
  'aria-label', 'title', 'placeholder', 'alt', 'label', 'caption', 'description',
  'trigger', 'triggerAriaLabel', 'confirmLabel', 'empty',
])
const ATRIBUTOS_DE_ESTILO = new Set(['className', 'class'])
const PALAVRAS_TAILWIND = new Set(['flex', 'grid', 'block', 'hidden', 'inline', 'truncate', 'relative', 'absolute', 'fixed', 'sticky', 'underline'])
const PEDACO_TAILWIND = /^(?:[a-z0-9]+:)*!?-?[a-z][\w\-[\]/.()%#:,]*$/

const temLetra = (s) => /\p{L}/u.test(s)
const temMaiusculaOuAcento = (s) => /[\p{Lu}]|[^\x00-\x7f]/u.test(s)

function ehTecnico(s) {
  const t = s.trim()
  if (!temLetra(t)) return true
  if (!/\s/.test(t) && !temMaiusculaOuAcento(t)) return true
  const pedacos = t.split(/\s+/)
  if (pedacos.every((p) => p === '{}' || PEDACO_TAILWIND.test(p)) && (/[-:]/.test(t) || pedacos.every((p) => PALAVRAS_TAILWIND.has(p)))) return true
  if (/[_*()=/;]/.test(t) && !/\p{Lu}/u.test(t)) return true
  if (!/\s/.test(t) && /[_/]/.test(t)) return true // identificadores: pt_BR, America/Sao_Paulo
  if (/^(?:\/|#|http|mailto:)/.test(t)) return true
  return false
}

function textoDe(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((sp) => `{}${sp.literal.text}`).join('')
  }
  return null
}

function ancestraBloqueada(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p)) return true
    if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return true
    if (ts.isThrowStatement(p)) return true
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const e = p.expression
      if (ts.isNewExpression(p) && ts.isIdentifier(e) && e.text === 'Error') return true
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console') return true
    }
    if (ts.isJsxAttribute(p) && ATRIBUTOS_DE_ESTILO.has(p.name.getText())) return true
    if (ts.isPropertyAssignment(p) && ['className', 'class'].includes(p.name.getText().replace(/['"]/g, ''))) return true
    if (ts.isCaseClause(p) && p.expression === node) return true
  }
  return false
}

export function extractStrings(code, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.js') || fileName.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind)
  const out = []
  const tratados = new Set()
  const linhaDe = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
  const add = (text, pos) => out.push({ text: text.replace(/\s+/g, ' ').trim(), line: linhaDe(pos) })

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = node.text
      if (temLetra(raw)) {
        const inicio = node.getFullStart() + raw.search(/\S/)
        add(raw, inicio)
      }
      return
    }
    if (ts.isJsxAttribute(node)) {
      const nome = node.name.getText()
      if (ATRIBUTOS_DE_ESTILO.has(nome)) return
      if (ATRIBUTOS_DE_TEXTO.has(nome) && node.initializer) {
        let alvo = node.initializer
        if (ts.isJsxExpression(alvo) && alvo.expression) alvo = alvo.expression
        const t = textoDe(alvo)
        if (t !== null) {
          tratados.add(alvo)
          if (temLetra(t)) add(t, alvo.getStart(sf) + 1)
        }
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      if (!tratados.has(node)) considerarLiteral(node)
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((sp) => visit(sp.expression))
      return
    }
    ts.forEachChild(node, visit)
  }

  function considerarLiteral(node) {
    const p = node.parent
    if (p) {
      if (ts.isPropertyAssignment(p) && p.name === node) return
      if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return
      if (ts.isExpressionStatement(p) && ts.isStringLiteral(node)) return // diretivas
      if (ts.isEnumMember(p) || ts.isBindingElement(p) || ts.isPropertySignature(p)) return
    }
    if (ancestraBloqueada(node)) return
    const t = textoDe(node)
    if (t === null || ehTecnico(t)) return
    add(t, node.getStart(sf) + 1)
  }

  visit(sf)
  return out.sort((a, b) => a.line - b.line)
}

export function extractHtml(html) {
  const mascarar = (re) => (s) => s.replace(re, (m) => m.replace(/[^\n]/g, ' '))
  let src = html
  src = mascarar(/<!--[\s\S]*?-->/g)(src)
  src = mascarar(/<style[\s\S]*?<\/style>/gi)(src)
  src = mascarar(/<script[\s\S]*?<\/script>/gi)(src)
  // Variáveis do Supabase viram {} sem mudar o número de linhas.
  src = src.replace(/\{\{[\s\S]*?\}\}/g, (m) => '{}' + m.slice(2).replace(/[^\n]/g, ' '))
  const out = []
  const linhaDe = (pos) => src.slice(0, pos).split('\n').length
  const re = /<[^>]*>|[^<]+/g
  let m
  while ((m = re.exec(src))) {
    const tok = m[0]
    if (tok.startsWith('<')) {
      const attrs = /\b(alt|title|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
      let a
      while ((a = attrs.exec(tok))) {
        const v = a[2] ?? a[3]
        if (temLetra(v)) out.push({ text: v.replace(/\s+/g, ' ').trim(), line: linhaDe(m.index + a.index) })
      }
    } else if (temLetra(tok)) {
      out.push({ text: tok.replace(/\s+/g, ' ').trim(), line: linhaDe(m.index + tok.search(/\S/)) })
    }
  }
  return out
}

export { normalize }
