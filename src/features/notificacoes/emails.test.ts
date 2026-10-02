import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { escapeHtml, inviteEmail, monthSummaryEmail, plainName } from './emails'

const LINK = 'https://iris.app/convite/AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const SUBJECT = 'Você recebeu um convite na Íris'
const invite = (over: Partial<Parameters<typeof inviteEmail>[0]> = {}) =>
  inviteEmail({ inviterName: 'Camila', familyName: 'Família Souza', link: LINK, expiresOn: '2026-10-08', ...over })

describe('e-mail de convite', () => {
  const m = invite()

  test('assunto fixo, sem nome de pessoa nem de família; os nomes aparecem só no texto, entre aspas', () => {
    expect(m.subject).toBe(SUBJECT)
    expect(m.text).toContain('“Camila” convidou você para participar da família “Família Souza” na Íris.')
    expect(m.text).toContain('A família vê só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O que é seu continua privado.')
    expect(m.text).toContain('O convite vale até 8 de outubro e serve para uma pessoa.')
    expect(m.text).toContain(LINK)
    expect(m.text).toContain('Se você não esperava este convite, é só ignorar este e-mail.')
    expect(m.text).toContain('Íris — Veja para onde seu dinheiro vai')
  })

  test('o assunto é o mesmo para qualquer nome', () => {
    for (const x of [
      invite({ inviterName: null }),
      invite({ inviterName: 'Banco X: regularize em bit.ly/abc', familyName: 'Seu cadastro foi bloqueado' }),
      invite({ inviterName: 'A\r\nBcc: x@y.dev', familyName: 'B\nSubject: outro' }),
    ]) {
      expect(x.subject).toBe(SUBJECT)
    }
  })

  test('HTML simples e acessível: idioma, um título, link com texto claro e o endereço por extenso, sem imagem, script nem rastreio', () => {
    expect(m.html.startsWith('<!doctype html><html lang="pt-BR">')).toBe(true)
    expect(m.html).toContain('<meta charset="utf-8">')
    expect(m.html).toContain(`<title>${SUBJECT}</title>`)
    expect(m.html.match(/<h1/g)?.length).toBe(1)
    expect(m.html).toContain('<h1>Você recebeu um convite</h1>')
    expect(m.html).toContain(`<a href="${LINK}">Ver o convite</a>`)
    expect(m.html).toContain('Se o link não abrir, copie este endereço no navegador:')
    expect(m.html).toContain(`<p>${LINK}</p>`)
    expect(m.html).not.toMatch(/<img|<script|<style|<iframe|<link|<object|<form|background|\bsrc=|\bon[a-z]+=/i)
    // O único endereço no e-mail é o do convite.
    expect([...m.html.matchAll(/https?:\/\/[^\s"<]+/g)].map((x) => x[0])).toEqual([LINK, LINK])
  })

  test('sem nome de quem convidou', () => {
    const anon = invite({ inviterName: null })
    expect(anon.text).toContain('Há um convite para você participar da família “Família Souza” na Íris.')
    expect(anon.text).not.toContain('convidou')
    expect(invite({ inviterName: '   ' }).text).toBe(anon.text)
  })

  test('nome que parece endereço, telefone ou recado não entra no e-mail: vale a frase sem nome', () => {
    const noPerson = invite({ inviterName: 'Banco X: acesse bit.ly/abc' })
    expect(noPerson.text).toContain('Há um convite para você participar da família “Família Souza” na Íris.')
    expect(noPerson.text + noPerson.html).not.toContain('bit.ly')

    const noFamily = invite({ familyName: 'Regularize em www.banco-x.com' })
    expect(noFamily.text).toContain('“Camila” convidou você para participar de uma família na Íris.')
    expect(noFamily.text + noFamily.html).not.toContain('banco-x')

    const neither = invite({ inviterName: 'ligue 11999990000', familyName: 'pix: a@b.dev' })
    expect(neither.text).toContain('Há um convite para você participar de uma família na Íris.')
    expect(neither.text + neither.html).not.toMatch(/11999990000|a@b\.dev/)
  })

  test('plainName', () => {
    expect(plainName('Camila')).toBe('Camila')
    expect(plainName('  Família   Souza \n')).toBe('Família Souza')
    expect(plainName('Sr. João d’Ávila')).toBe('Sr. João d’Ávila')
    expect(plainName('A “melhor” "família"')).toBe('A melhor família')
    expect(plainName('a'.repeat(200))).toBe('a'.repeat(60))
    // Caracteres invisíveis (direção do texto, largura zero) viram espaço.
    expect(plainName(`Ca${String.fromCharCode(0x202e)}mila${String.fromCharCode(0x200b)}`)).toBe('Ca mila')
    for (const bad of [
      null, undefined, '', '   ', 'http://x', 'HTTPS://x', 'www.x', 'evil.dev', 'evil.dev/x', 'a@b', 'a/b', 'a\\b',
      'tel 11999990000', 'ano 2026', 'x.COM',
    ]) {
      expect(plainName(bad), String(bad)).toBeNull()
    }
    expect(plainName(42 as unknown as string)).toBeNull()
  })

  test('plainName: o que parece link é recusado mesmo disfarçado (letras de largura inteira, hífen opcional, caracteres de largura zero)', () => {
    const c = (...codes: number[]) => String.fromCharCode(...codes)
    const SHY = c(0x00ad), ZWSP = c(0x200b), ZWNJ = c(0x200c), ZWJ = c(0x200d), WJ = c(0x2060), BOM = c(0xfeff)
    const fullwidth = (s: string) => Array.from(s).map((ch) => c(ch.charCodeAt(0) + 0xfee0)).join('')
    for (const bad of [
      fullwidth('evil.dev'), `evil${fullwidth('.')}dev`, `a${fullwidth('@')}b`, `a${fullwidth('/')}b`, fullwidth('2026'),
      `evil${c(0x2024)}dev`, // ponto de uma letra só (one dot leader)
      `evil${SHY}.dev`, `evil.${SHY}dev`, `www${ZWSP}.evil`, `www.${ZWNJ}evil`, `ht${ZWJ}tps://x`, `evil${WJ}.${BOM}dev`,
      `20${ZWSP}26`, `a${SHY}@${SHY}b`,
    ]) {
      expect(plainName(bad), JSON.stringify(bad)).toBeNull()
    }
    // Um nome de verdade continua nome: sai sem os caracteres invisíveis e na forma composta.
    expect(plainName(`Cami${SHY}la`)).toBe('Camila')
    expect(plainName(`Jo${ZWSP}ão`)).toBe('João')
    expect(plainName(`${fullwidth('A')}na`)).toBe('Ana')
    expect(plainName(`Joa${c(0x0303)}o`)).toBe('João')
  })

  test('escapa nomes no HTML; nenhuma quebra de linha passa', () => {
    const x = invite({ inviterName: '<img src=x onerror=alert(1)>', familyName: 'A & B\r\nC' })
    expect(x.html).not.toContain('<img')
    expect(x.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(x.html).toContain('A &amp; B C')
    expect(x.text).toContain('“A & B C”')
    expect(x.subject).not.toMatch(/[\r\n]/)
  })

  test('link que não é da Íris por https é recusado (http só na máquina local)', () => {
    for (const link of [
      'javascript:alert(1)', 'http://iris.app/convite/x', 'https://iris.app/convite/x y', 'https://iris.app/"><script>',
      'https://user:pass@iris.app/x', 'ftp://iris.app/x', '', '/convite/x', 'https://iris.app/<x>', `https://iris.app/${'a'.repeat(2100)}`,
    ]) {
      expect(() => invite({ link }), link).toThrow()
    }
    expect(invite({ link: 'http://localhost:3000/convite/abc' }).html).toContain('<a href="http://localhost:3000/convite/abc">Ver o convite</a>')
    expect(invite({ link: 'http://127.0.0.1:3000/convite/abc' }).text).toContain('http://127.0.0.1:3000/convite/abc')
  })

  test('data de validade que não é um dia é recusada', () => {
    expect(() => invite({ expiresOn: '2026-13-40' })).toThrow()
    expect(() => invite({ expiresOn: '8 de outubro<script>' })).toThrow()
  })

  test('escapeHtml', () => expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'))
})

describe('e-mail do resumo do mês', () => {
  const m = monthSummaryEmail({ month: '2026-09', link: 'https://iris.app/relatorios?periodo=mes-passado' })

  test('texto da copy, sem valores, com o caminho para desligar', () => {
    expect(m.subject).toBe('Seu mês de setembro está fechado')
    expect(m.text).toContain('Seu mês de setembro está fechado. Quer ver como foi?')
    expect(m.text).toContain('https://iris.app/relatorios?periodo=mes-passado')
    expect(m.text).toContain('Você recebe este e-mail porque o resumo do mês está ligado. Para desligar, abra Configurações na Íris.')
    expect(m.html).toContain('<h1>Resumo do mês</h1>')
    expect(m.html.match(/<h1/g)?.length).toBe(1)
    expect(m.html).toContain('<a href="https://iris.app/relatorios?periodo=mes-passado">Ver meu mês</a>')
    expect(m.html).toContain('Se o link não abrir, copie este endereço no navegador:')
    expect(m.html).not.toMatch(/<img|<script|<style|<iframe|<link|\bsrc=/i)
    expect(m.text + m.html).not.toMatch(/R\$|\d,\d{2}/)
  })

  test('mês ou link que não servem são recusados', () => {
    expect(() => monthSummaryEmail({ month: '2026-13', link: 'https://iris.app/relatorios?periodo=mes-passado' })).toThrow()
    expect(() => monthSummaryEmail({ month: 'setembro', link: 'https://iris.app/relatorios?periodo=mes-passado' })).toThrow()
    expect(() => monthSummaryEmail({ month: '2026-09', link: 'javascript:alert(1)' })).toThrow()
  })

  test('nenhum e-mail tem exclamação, urgência nem "baix"', () => {
    const all = [m, invite(), invite({ inviterName: null }), invite({ familyName: 'x.com' }), invite({ inviterName: null, familyName: 'x.com' })]
    for (const e of all) for (const part of [e.subject, e.text, e.html.replace(/^<!doctype html>/i, '')]) {
      expect(part).not.toContain('!')
      expect(part.toLowerCase()).not.toMatch(/baix|urgente|agora mesmo|última chance|não perca/)
    }
  })
})

test('modelo de recuperação de senha do Supabase', () => {
  const html = readFileSync('supabase/templates/recovery.html', 'utf8')
  expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBe(2)
  expect(html).toContain('<html lang="pt-BR">')
  expect(html.match(/<h1/g)?.length).toBe(1)
  expect(html).not.toMatch(/!(?!doctype)|<img|<script/i)
  expect(html.toLowerCase()).not.toMatch(/\bconta\b/)
  const toml = readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n')
  expect(toml).toMatch(/^smtp_port = 54325$/m)
  expect(toml).toContain('[auth.email.template.recovery]\nsubject = "Crie uma nova senha na Íris"\ncontent_path = "./supabase/templates/recovery.html"')
})
