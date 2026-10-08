import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { normalize } from './normalizar.mjs'
import { extractHtml, extractStrings } from './extrair.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildSource, loadCorpus, sectionText } from './fontes.mjs'
import { classify, run } from '../conferir-textos.mjs'

const texts = (code, file = 'a.tsx') => extractStrings(code, file).map((s) => s.text)

test('normalize: aspas, entidades, ênfase, variáveis e espaços', () => {
  expect(normalize('“Camila”  convidou&nbsp;você')).toBe('"Camila" convidou você')
  expect(normalize('**Passou {valor} do planejado.**')).toBe('Passou {} do planejado.')
  expect(normalize('O que é &quot;Planejado&quot;?')).toBe('O que é "Planejado"?')
})

test('extrai texto de tela e deixa de fora o que é técnico', () => {
  const code = `
    import x from '@/features/a'
    'use client'
    const cls = 'flex px-4 md:pt-7 text-ink'
    const q = supabase.from('profiles').select('id, display_name')
    const t = \`Faltam \${v} para \${meta}.\`
    const prazo = 'vence hoje'
    const modo = mode === 'installed'
    if (!ok) throw new Error('Sessão necessária.')
    console.error('Falha ao enviar')
    const headers = { 'Content-Type': 'text/csv; charset=utf-8' }
    export const P = () => <p className="text-sm" aria-label="Voltar">Olá, Ana.</p>
  `
  expect(texts(code)).toEqual(['Faltam {} para {}.', 'vence hoje', 'Voltar', 'Olá, Ana.'])
})

test('extrai texto de HTML (página "Sem conexão", modelos de e-mail)', () => {
  const html = '<html><style>p{color:red}</style><h1>Sem conexão</h1><p>Olá {{ .SiteURL }}</p><img alt="Íris"></html>'
  expect(extractHtml(html).map((s) => s.text)).toEqual(['Sem conexão', 'Olá {}', 'Íris'])
})

test('sectionText: só a seção pedida', () => {
  const md = '# P\n## Decisões\nx "Fora"\n## Textos novos\n1. "Dentro"\n### Sub\n"Também"\n## Outra\n"Não"'
  expect(sectionText(md, /^## Textos novos/m)).toContain('"Dentro"')
  expect(sectionText(md, /^## Textos novos/m)).toContain('"Também"')
  expect(sectionText(md, /^## Textos novos/m)).not.toContain('"Não"')
  expect(sectionText(md, /^## Textos novos/m)).not.toContain('"Fora"')
})

test('classify: da copy, das listas ou fora delas', () => {
  const corpus = { copy: buildSource('**Passou do planejado:** Passou {valor} do planejado. Quer ajustar o valor deste mês?'), listed: buildSource('- "Pular para o conteúdo"') }
  expect(classify('Passou {} do planejado.', corpus)).toBe('copy')
  expect(classify('Pular para o conteúdo', corpus)).toBe('listed')
  expect(classify('Baixe o app agora', corpus)).toBe('unlisted')
})

function fixture({ ignore = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'textos-'))
  for (const d of ['docs/copy', 'docs/superpowers/plans', 'src/app', 'scripts/conferir-textos', 'public', 'supabase/templates']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, 'docs/copy/documento-base.md'), '<!-- cópia -->\nSeu dinheiro, finalmente à vista.')
  writeFileSync(join(root, 'docs/etapa-2-requisitos.md'), '')
  writeFileSync(join(root, 'docs/etapa-5-ui.md'), '## Textos novos aprovados\n- "Voltar"')
  writeFileSync(join(root, 'docs/decisoes-para-revisao.md'), '')
  writeFileSync(join(root, 'docs/superpowers/plans/p.md'), '## Textos novos\n1. "Pular para o conteúdo"\n## Outra')
  writeFileSync(join(root, 'scripts/conferir-textos/ignorar.json'), JSON.stringify(ignore))
  return root
}

test('texto fora das listas faz o comando falhar, com arquivo e linha', () => {
  const root = fixture()
  writeFileSync(join(root, 'src/app/page.tsx'), 'export default () => (\n  <main><h1>Seu dinheiro, finalmente à vista.</h1>\n<p>Baixe o app agora</p><a>Voltar</a></main>)')
  const r = run(root)
  expect(r.unlisted).toEqual([{ file: 'src/app/page.tsx', line: 3, text: 'Baixe o app agora' }])
  expect(r.counts).toMatchObject({ copy: 1, listed: 1, unlisted: 1 })
})

test('ignorar exige motivo', () => {
  const ok = fixture({ ignore: [{ texto: 'Íris DEV', motivo: 'nome do ambiente local, nunca aparece em produção' }] })
  writeFileSync(join(ok, 'src/app/page.tsx'), 'export default () => <p>Íris DEV</p>')
  expect(run(ok).unlisted).toEqual([])
  expect(run(ok).counts.ignored).toBe(1)
  const bad = fixture({ ignore: [{ texto: 'Íris DEV', motivo: '' }] })
  writeFileSync(join(bad, 'src/app/page.tsx'), 'export default () => <p>Íris DEV</p>')
  expect(() => run(bad)).toThrow('ignorar.json: "Íris DEV" sem motivo')
})

test('sem a cópia da copy: erro claro', () => {
  const root = mkdtempSync(join(tmpdir(), 'textos-'))
  expect(() => loadCorpus(root)).toThrow('Falta docs/copy/documento-base.md')
})

test('extração: classes com variável e identificadores não são texto de tela', () => {
  const code = "const a = `flex h-11 text-[15px] ${x}`; const b = 'pt_BR'; const c = 'America/Sao_Paulo'; const d = 'Oi, Ana.'"
  expect(texts(code, 'b.ts')).toEqual(['Oi, Ana.'])
})

const SCRIPT = fileURLToPath(new URL('../conferir-textos.mjs', import.meta.url))
const cli = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' })

// --- 1. Comparação por texto inteiro
const fonte = (md) => ({ copy: buildSource('Seu dinheiro à vista.'), listed: buildSource(md) })

test('texto curto só vale como entrada inteira, nunca solto prosa', () => {
  const c = fonte('Para sair do app, toque em Sair da conta. Ver mais detalhes depois.\n- "Entrar"')
  expect(classify('Entrar', c)).toBe('listed')
  expect(classify('Sair', c)).toBe('unlisted')
  expect(classify('Ver', c)).toBe('unlisted')
  expect(classify('Sim', c)).toBe('unlisted')
})

test('frase longa vale como trecho de frase aprovada, respeitando fronteira de palavra', () => {
  const c = fonte('Quando o mês virar, a Íris guarda tudo o que você anotou no Extrato.')
  expect(classify('a Íris guarda tudo o que você anotou', c)).toBe('listed')
  expect(classify('a Íris guarda tudo o que você ano', c)).toBe('unlisted')
  expect(classify('Íris guarda tudo o que você anotou no Extrato.', c)).toBe('listed')
})

test('comparação é sensível a maiúsculas e aceita ponto final só no texto do app', () => {
  const c = fonte('- "Voltar"\n- "Salvar."')
  expect(classify('voltar', c)).toBe('unlisted')
  expect(classify('Voltar.', c)).toBe('listed')
  expect(classify('Salvar', c)).toBe('unlisted')
})

// --- 2. Curinga limitado
test('{} cobre só uma palavra ou duas, sem pontuação de frase', () => {
  const c = fonte('1. "Faltam {valor} para a meta."')
  expect(classify('Faltam {} para a meta.', c)).toBe('listed')
  expect(classify('Faltam {} para a meta', c)).toBe('unlisted')
  expect(classify('Faltam {} para a conta.', c)).toBe('unlisted')
  const longa = fonte('Faltam R$ 10. Ainda depois disso vem outra frase para a meta.')
  expect(classify('Faltam {} para a meta.', longa)).toBe('unlisted')
})

test('texto só de variáveis e ligações não casa com nada', () => {
  const c = fonte('- "{n} de {total}"\n- "Passo {n} de 3"\n- "Oi, {nome}."')
  expect(classify('{} de {}', c)).toBe('unlisted')
  expect(classify('{} do', c)).toBe('unlisted')
  expect(classify('Passo {} de 3', c)).toBe('listed')
  expect(classify('Oi, {}.', c)).toBe('listed')
})

// --- 3. Ruído técnico por regra
test('identificadores e códigos não são texto de tela', () => {
  const code = `
    const a = fd.get('displayName'); const b = 'AuthSessionMissingError'; const c = 'PGRST301'
    const d = 'UTC'; const e = '2026-10-03'; const f = '{}T00:00:00Z'; const g = '<p>oi</p>'
    const h = 'application/json'; const i = supabase.from('t').select('kind, enabled'); const j = 'serviceWorker'
    const k = 'Notification' in window
  `
  expect(texts(code, 'c.ts')).toEqual([])
})

// --- 4. Falsos negativos: o que a pessoa vê
test('palavra minúscula e prosa com barra ou parênteses continuam candidatas', () => {
  const code = `
    const rotulos = { monthly: 'mensal', today: 'hoje' }
    const x = { aba: 'receitas/despesas' }
    const y = 'sem categoria (padrão)'
    const z = { message: 'OK' }
    const m = mode === 'installed'
    const q = supabase.from('profiles').select('id')
  `
  expect(texts(code, 'd.ts')).toEqual(['mensal', 'hoje', 'receitas/despesas', 'sem categoria (padrão)', 'OK'])
})

test('JSX e props de texto ficam, mesmo com uma palavra só', () => {
  expect(texts('export const A = () => <><input placeholder="nome" aria-label="busca" type="text" /><b>sair</b></>', 'e.tsx'))
    .toEqual(['nome', 'busca', 'sair'])
})

// --- Minors
test('entidades HTML e escapes de Markdown são decodificados', () => {
  expect(normalize('Voc&ecirc; &#233; &#xE9; &hellip;')).toBe('Você é é ...')
  const c = { copy: buildSource('Seu m\ês \- é seu\. [Saiba mais](https://x.y) \!'), listed: buildSource('') }
  expect(classify('Seu mês - é seu.', c)).toBe('copy')
})

test('assuntos de e-mail do config.toml são extraídos', () => {
  const root = fixture()
  mkdirSync(join(root, 'supabase'), { recursive: true })
  writeFileSync(join(root, 'supabase/config.toml'), '# subject = "Comentado"\nsubject = "Assunto novo"\n')
  writeFileSync(join(root, 'src/app/page.tsx'), 'export default () => <p>Voltar</p>')
  expect(run(root).unlisted).toEqual([{ file: 'supabase/config.toml', line: 2, text: 'Assunto novo' }])
})

test('entradas paradas em ignorar.json são apontadas', () => {
  const root = fixture({ ignore: [{ texto: 'Nada disso', motivo: 'não existe mais' }] })
  writeFileSync(join(root, 'src/app/page.tsx'), 'export default () => <p>Voltar</p>')
  expect(run(root).stale).toEqual(['Nada disso'])
})

test('código de saída: 2 sem a copy, 1 sem arquivos ou com achados, 0 quando tudo casa', () => {
  const vazio = mkdtempSync(join(tmpdir(), 'textos-'))
  expect(cli(vazio).status).toBe(2)
  expect(cli(vazio).stderr).toContain('Falta docs/copy/documento-base.md')

  const semSrc = fixture()
  const r = cli(semSrc)
  expect(r.status).toBe(1)
  expect(r.stderr).toContain('Nenhum arquivo de src/')

  const fora = fixture()
  writeFileSync(join(fora, 'src/app/page.tsx'), 'export default () => <p>Baixe o app agora</p>')
  const rf = cli(fora)
  expect(rf.status).toBe(1)
  expect(rf.stdout).toContain('src/app/page.tsx:1  "Baixe o app agora"')

  const ok = fixture()
  writeFileSync(join(ok, 'src/app/page.tsx'), 'export default () => <p>Voltar</p>')
  const ro = cli(ok)
  expect(ro.status).toBe(0)
  expect(ro.stdout).toContain('1 textos conferidos')
})

// --- Final do Plano 10: falsos negativos e ruído
test('minúsculas nos ramos de ternário e && dentro do JSX são texto de tela', () => {
  const code = `export const A = () => <p>{ok ? 'sim' : 'ontem'} {pago && 'pago'} <i type={k ? 'button' : 'submit'} className={k ? 'flex' : 'hidden'} /></p>`
  expect(texts(code)).toEqual(['sim', 'ontem', 'pago'])
})

test('prosa sob chave técnica (value:, label:) continua candidata; código sob a mesma chave não', () => {
  const code = `
    const opcoes = [{ value: 'Receitas e despesas' }, { value: 'Ação rápida' }, { type: 'text/csv' }, { id: 'abc_def' }, { kind: 'income' }, { value: 'expense' }]
  `
  expect(texts(code, 'f.ts')).toEqual(['Receitas e despesas', 'Ação rápida'])
})

test('valores de opção, medidas e classes por regra não são ruído de tela', () => {
  const code = `
    const o = { a: 'numeric', b: '2-digit', c: 'long', d: '192x192', e: 'device-width', f: 'default', g: 'unauthorized', h: 'monthly', i: 'bg-brand', j: '--font-geist-sans', k: 'text-ink', l: '512' }
    const p = { m: 'mensal', n: 'guarda-roupa', o: 'Ação' }
  `
  expect(texts(code, 'g.ts')).toEqual(['mensal', 'guarda-roupa', 'Ação'])
})

test('texto repartido por interpolações vira um modelo só', () => {
  expect(texts('export const A = () => <p>\n  Oi, {nome}, tudo bem\n</p>')).toEqual(['Oi, {}, tudo bem'])
  expect(texts('export const A = () => <p>Faltam {fmt(valor)} para <b>{meta}</b></p>')).toEqual(['Faltam {} para'])
  // sem texto ao redor, nada a juntar
  expect(texts('export const A = () => <p>{a} {b}</p>')).toEqual([])
})
