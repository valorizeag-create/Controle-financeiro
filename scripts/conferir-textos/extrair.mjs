import ts from 'typescript'

const ATRIBUTOS_DE_TEXTO = new Set([
  'aria-label', 'title', 'placeholder', 'alt', 'label', 'caption', 'description',
  'trigger', 'triggerAriaLabel', 'confirmLabel', 'empty',
])
const ATRIBUTOS_DE_ESTILO = new Set(['className', 'class'])
// Propriedades cujo valor é texto de tela (mensagens, rótulos…): ali nada é descartado por "parecer técnico".
const CHAVES_VISIVEIS = new Set([
  'message', 'title', 'description', 'label', 'text', 'error', 'empty', 'subject', 'body',
  'placeholder', 'caption', 'hint', 'success', 'ariaLabel',
])
// Propriedades cujo valor é sempre código (tipos, ids, modos…).
const CHAVES_TECNICAS = new Set([
  'type', 'kind', 'id', 'key', 'mode', 'status', 'role', 'variant', 'size', 'tone', 'method', 'href', 'rel',
  'target', 'as', 'scope', 'source', 'channel', 'event', 'table', 'column', 'dir', 'direction', 'locale',
  'timeZone', 'currency', 'style', 'format', 'sort', 'field', 'path', 'url', 'icon', 'color', 'display',
  'value', 'runtime', 'dynamic', 'referrer', 'robots', 'index', 'follow', 'sameSite', 'cache', 'credentials', 'purpose', 'tag', 'lang', 'theme', 'orientation', 'start_url',
])
// Funções cujos argumentos de texto são nomes de coluna, chaves, seletores, formatos…
const CHAMADAS_TECNICAS = new Set([
  'select', 'eq', 'neq', 'in', 'order', 'from', 'rpc', 'get', 'getAll', 'set', 'append', 'has', 'delete',
  'insert', 'update', 'upsert', 'ilike', 'like', 'is', 'gte', 'lte', 'gt', 'lt', 'match', 'filter', 'or',
  'not', 'contains', 'on', 'off', 'channel', 'querySelector', 'querySelectorAll', 'getItem', 'setItem',
  'removeItem', 'addEventListener', 'removeEventListener', 'matchMedia', 'createElement', 'revalidatePath',
  'revalidateTag', 'redirect', 'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'normalize',
  'replace', 'replaceAll', 'split', 'startsWith', 'endsWith', 'includes', 'getElementById', 'register',
  'postMessage', 'fetch', 'require', 'cn', 'clsx', 'cva', 'headers', 'cookies', 'storage', 'DateTimeFormat',
  'NumberFormat', 'RegExp', 'Date', 'URL', 'URLSearchParams', 'setHeader', 'getAttribute', 'setAttribute',
  'removeAttribute', 'matches', 'closest', 'getRegistration', 'unstable_cache',
])
const PALAVRAS_TAILWIND = new Set(['flex', 'grid', 'block', 'hidden', 'inline', 'truncate', 'relative', 'absolute', 'fixed', 'sticky', 'underline'])
const PEDACO_TAILWIND = /^(?:[a-z0-9]+:)*!?-?[a-z][\w\-[\]/.()%#:,]*$/

const temLetra = (s) => /\p{L}/u.test(s)

/** Texto que, pela forma, é código e não prosa. `visivel`: o contexto já garante que é texto de tela. */
export function ehTecnico(s, visivel = false) {
  const t = s.trim()
  if (!temLetra(t)) return true
  if (/<\/?[a-z!][^>]*>/i.test(t)) return true // marcação HTML
  if (/^(?:\/|#|https?:|mailto:)/.test(t) || t.includes('://')) return true
  if (/^(?:text|application|image|audio|video|font|multipart)\/[\w.+-]+(?:\s*;.*)?$/i.test(t)) return true // tipos MIME
  if (/^[\d{}\-:.+TZ\s]+$/.test(t) && /[\d{}]/.test(t)) return true // fragmentos de data ISO
  if (!/\s/.test(t)) {
    if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true // camelCase
    if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true // PascalCase
    if (/^[A-Za-z]+\d+$/.test(t)) return true // códigos de erro: PGRST301
    if (t.includes('_')) return true // snake_case, fusos (America/Sao_Paulo)
    if (/^[A-Z][A-Z0-9]+$/.test(t)) return !visivel // UTC, BRL
    if (/[*()=;]/.test(t) && !/\p{Lu}/u.test(t)) return true
    // palavra minúscula solta: só é texto quando o contexto garante (rótulo, mensagem, valor de um mapa)
    return !visivel && !/\p{Lu}|[^\x00-\x7f]/u.test(t)
  }
  if (/^[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+$/.test(t) && /_|[a-z][A-Z]/.test(t)) return true // lista de colunas
  const pedacos = t.split(/\s+/)
  if (pedacos.every((p) => p === '{}' || PEDACO_TAILWIND.test(p)) && (/[-:]/.test(t) || pedacos.every((p) => PALAVRAS_TAILWIND.has(p)))) return true
  if (/[\w-]+\s*:\s*\S+;/.test(t) && !/\p{Lu}/u.test(t)) return true // css inline
  if (/[\w-]=\S/.test(t) && !/\p{Lu}/u.test(t)) return true // chave=valor
  return false
}

function textoDe(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((sp) => `{}${sp.literal.text}`).join('')
  }
  return null
}

const nomeDe = (n) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText())

function nomeDaChamada(p) {
  const e = p.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

const COMPARACOES = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword,
])

/** Contextos em que o literal nunca é texto de tela. */
function contextoTecnico(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p)) return true
    if (ts.isTypeNode(p)) return true
    if (ts.isJsxAttribute(p) && ATRIBUTOS_DE_ESTILO.has(p.name.getText())) return true
    if (ts.isPropertyAssignment(p) && ['className', 'class'].includes(nomeDe(p.name))) return true
    if (ts.isThrowStatement(p)) return true
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const e = p.expression
      if (ts.isNewExpression(p) && ts.isIdentifier(e) && e.text === 'Error') return true
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console') return true
    }
    if (ts.isFunctionLike(p)) break // um throw/chamada fora desta função não diz nada sobre o literal
  }
  const p = node.parent
  if (!p) return false
  if (ts.isCaseClause(p)) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  if (ts.isPropertyAssignment(p) && p.name === node) return true
  if (ts.isEnumMember(p) || ts.isBindingElement(p) || ts.isPropertySignature(p)) return true
  if (ts.isExpressionStatement(p) && ts.isStringLiteral(node)) return true // diretivas
  if (ts.isBinaryExpression(p) && COMPARACOES.has(p.operatorToken.kind)) return true
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== node) {
    if (CHAMADAS_TECNICAS.has(nomeDaChamada(p))) return true
    if (ts.isNewExpression(p) && ts.isPropertyAccessExpression(p.expression)) return true // new Intl.X(...)
  }
  if (ts.isPropertyAssignment(p) && p.initializer === node && (CHAVES_TECNICAS.has(nomeDe(p.name)) || nomeDe(p.name).includes('-'))) return true
  return false
}

function contextoVisivel(node) {
  const p = node.parent
  if (p && ts.isPropertyAssignment(p) && p.initializer === node && CHAVES_VISIVEIS.has(nomeDe(p.name))) return true
  // valor de um mapa (chave => rótulo), p.ex. { monthly: 'mensal' }
  if (p && ts.isPropertyAssignment(p) && p.initializer === node && !(CHAVES_TECNICAS.has(nomeDe(p.name)) || nomeDe(p.name).includes('-'))) return true
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
      if (temLetra(raw)) add(raw, node.getFullStart() + raw.search(/\S/))
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
      } else if (node.initializer && ts.isStringLiteral(node.initializer)) {
        // href, type, name, id…: só vira candidato se for uma frase (com espaço) que não pareça código
        tratados.add(node.initializer)
        const t = node.initializer.text
        if (/\s/.test(t) && !ehTecnico(t)) add(t, node.initializer.getStart(sf) + 1)
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
    if (contextoTecnico(node)) return
    const t = textoDe(node)
    if (t === null || ehTecnico(t, contextoVisivel(node))) return
    add(t, node.getStart(sf) + 1)
  }

  visit(sf)
  return out.sort((a, b) => a.line - b.line)
}

const mascarar = (re) => (s) => s.replace(re, (m) => m.replace(/[^\n]/g, ' '))

export function extractHtml(html) {
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
      const attrs = /\b(alt|title|aria-label|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
      let a
      while ((a = attrs.exec(tok))) {
        const meta = a[1].toLowerCase() === 'content'
        if (meta && !/^<meta\b/i.test(tok)) continue
        const v = (a[2] ?? a[3]).replace(/\s+/g, ' ').trim()
        if (temLetra(v) && !(meta && ehTecnico(v))) out.push({ text: v, line: linhaDe(m.index + a.index) })
      }
    } else if (temLetra(tok)) {
      out.push({ text: tok.replace(/\s+/g, ' ').trim(), line: linhaDe(m.index + tok.search(/\S/)) })
    }
  }
  return out
}

/** Assuntos dos e-mails em supabase/config.toml (linhas `subject = "…"` fora de comentários). */
export function extractToml(toml) {
  const out = []
  toml.split(/\r?\n/).forEach((l, i) => {
    const m = /^\s*subject\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(l)
    if (m) out.push({ text: m[1].replace(/\\"/g, '"'), line: i + 1 })
  })
  return out
}
