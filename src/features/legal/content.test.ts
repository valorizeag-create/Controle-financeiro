import { expect, test } from 'vitest'
import { privacyDoc, termsDoc, type LegalDoc } from './content'
import { CONTROLLER, isLegalReady, TO_DEFINE, type LegalController } from './controller'

const filled: LegalController = { name: 'Fulano de Tal', contact: 'privacidade@iris.example', emailProvider: 'Provedor X', reviewedOn: '2026-11-01' }
const text = (d: LegalDoc) => [d.title, ...d.sections.flatMap((s) => [s.heading, ...s.blocks.flat()])].join('\n')

test('no repositório os textos estão em rascunho: nada do responsável está preenchido', () => {
  expect(CONTROLLER).toEqual({ name: null, contact: null, emailProvider: null, reviewedOn: null })
  expect(isLegalReady(CONTROLLER)).toBe(false)
  expect(isLegalReady(filled)).toBe(true)
  for (const key of ['name', 'contact', 'emailProvider', 'reviewedOn'] as const) expect(isLegalReady({ ...filled, [key]: null })).toBe(false)
})

test('títulos e seções', () => {
  expect(termsDoc(filled).title).toBe('Termos de uso')
  expect(termsDoc(filled).sections.map((s) => s.heading)).toEqual([
    'O que é a Íris', 'Seu cadastro', 'Gratuita', 'O que a Íris não é', 'Família', 'Uso combinado', 'Seus dados',
    'Disponibilidade', 'Encerramento', 'Mudanças nestes termos', 'Contato e lei aplicável',
  ])
  expect(privacyDoc(filled).title).toBe('Política de privacidade')
  expect(privacyDoc(filled).sections.map((s) => s.heading)).toEqual([
    'Quem cuida dos seus dados', 'O que a Íris guarda', 'O que a Íris não faz', 'Para que os dados são usados', 'O que a família vê',
    'Quem ajuda a Íris a funcionar', 'Cookies e o que fica no aparelho', 'Por quanto tempo', 'Seus direitos', 'Segurança', 'Idade',
    'Mudanças nesta política',
  ])
})

test('responsável, contato e provedor entram no texto; vazios aparecem como "a definir"', () => {
  expect(text(privacyDoc(filled))).toContain('A Íris é mantida por Fulano de Tal, que decide como os dados são tratados.')
  expect(text(privacyDoc(filled))).toContain('Provedor X: envia os e-mails da Íris')
  expect(text(termsDoc(filled))).toContain('escreva para privacidade@iris.example.')
  expect(text(privacyDoc(filled)) + text(termsDoc(filled))).not.toContain(TO_DEFINE)
  expect(text(privacyDoc(CONTROLLER))).toContain(`A Íris é mantida por ${TO_DEFINE}`)
  expect(text(privacyDoc(CONTROLLER))).toContain(`${TO_DEFINE}: envia os e-mails da Íris`)
  expect(text(privacyDoc(CONTROLLER))).toContain(`escreva para ${TO_DEFINE}.`)
  expect(text(termsDoc(CONTROLLER))).toContain(`escreva para ${TO_DEFINE}.`)
})

test('a política diz o que o app faz de verdade', () => {
  const p = text(privacyDoc(filled))
  for (const fact of [
    'Nenhum número de cartão.', 'Supabase', 'servidores em São Paulo', 'Netlify', 'pode funcionar em servidores fora do Brasil',
    'ainda está em definição', 'por até 7 dias', 'por até 90 dias', 'Não há cookies de publicidade nem de medição.',
    'rastreadores de terceiros', 'Configurações → Seus dados → Baixar meus dados', 'Configurações → Seus dados → Excluir meu cadastro',
    'planilha em formato CSV', 'Desativar neste aparelho', 'Configurações → Lembretes', 'anonimização ou o bloqueio', 'retirar o seu consentimento em geral',
    'os nomes e os papéis de quem participa', 'só a sua própria parte', 'o que é da família, se participa de uma',
    'a que item, mês ou dia ele se refere', 'ligado ao seu cadastro', 'ainda está a confirmar', 'um resumo cifrado, nunca a senha em si',
    'como "Ex-membro", sem o seu nome', 'Google, Mozilla, Apple ou Microsoft', 'Autoridade Nacional de Proteção de Dados',
    'Ele não traz as famílias de que você já saiu',
  ]) {
    expect(p, fact).toContain(fact)
  }
  expect(p).not.toMatch(/baixar tudo/i)
  expect(p).not.toMatch(/Aqui aparecem|só o tipo do aviso|ninguém consegue lê-la/)
  expect(text(termsDoc(filled))).toContain('Configurações → Seus dados → Excluir meu cadastro')
})

test('terminologia e tom: "conta" só para contas a pagar; sem exclamação; sem "baixe o app"', () => {
  for (const doc of [termsDoc(filled), privacyDoc(filled)]) {
    const t = text(doc)
    expect(t).not.toMatch(/sua conta|minha conta|uma conta no|conta banc|conta do google|conta google/i)
    expect(t).not.toMatch(/!/)
    expect(t).not.toMatch(/baixe o app|loja de aplicativos|100%/i)
    for (const m of t.matchAll(/\bcontas?\b[^.;]*/gi)) expect(m[0], m[0]).toMatch(/^contas? (a pagar|da família)/i)
  }
})
