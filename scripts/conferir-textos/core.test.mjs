import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { normalize } from './normalizar.mjs'
import { extractHtml, extractStrings } from './extrair.mjs'
import { loadCorpus, sectionText } from './fontes.mjs'
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
  const corpus = { copy: normalize('**Passou do planejado:** Passou {valor} do planejado. Quer ajustar o valor deste mês?'), listed: normalize('- "Pular para o conteúdo"') }
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
