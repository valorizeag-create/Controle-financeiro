import { expect, test } from 'vitest'
import { allLandingTexts, HOW_IT_WORKS_ID, LANDING, SIGNUP_HREF, trustItems } from './content'
import { DATA_RIGHTS_RELEASED } from './release'

const full = (i: { lead: string; text: string }) => `${i.lead} ${i.text}`.trim()

test('hero da copy, com a microcopy adaptada à terminologia ("cadastro"/"conta")', () => {
  expect(LANDING.hero.title).toBe('Seu dinheiro, finalmente à vista.')
  expect(LANDING.hero.subtitle).toBe('Anote seus gastos em segundos e veja, de um jeito simples, para onde seu dinheiro está indo. Sem planilha, sem conta difícil, sem julgamento.')
  expect(LANDING.hero.cta).toBe('Começar a ver meu mês')
  expect(LANDING.hero.secondaryCta).toBe('Ver como funciona')
  expect(LANDING.hero.micro).toBe('Gratuito. Sem cartão. Sem acesso ao seu banco.')
})

test('o CTA principal é o mesmo nas seções 1, 4 e 9; destinos fixos', () => {
  expect(LANDING.solution.cta).toBe(LANDING.hero.cta)
  expect(LANDING.final.cta).toBe(LANDING.hero.cta)
  expect(SIGNUP_HREF).toBe('/criar-cadastro')
  expect(HOW_IT_WORKS_ID).toBe('como-funciona')
})

test('títulos das seções 2 a 9 na ordem da copy', () => {
  expect([
    LANDING.problem.title, LANDING.turn.title, LANDING.solution.title, LANDING.features.title,
    LANDING.benefits.title, LANDING.experience.title, LANDING.trust.title, LANDING.final.title,
  ]).toEqual([
    'Você sabe quanto ganha. O difícil é saber para onde vai.',
    'O problema nunca foi você.',
    'A Íris reúne seu dinheiro em uma visão só.',
    'Tudo o que você precisa para entender seu dinheiro. Nada além disso.',
    'O que muda quando você consegue ver.',
    'Feita para você não desistir.',
    'Clareza também sobre como a Íris funciona.',
    'Seu próximo mês pode ser o primeiro que você realmente entende.',
  ])
})

test('quantidades da copy: 5 situações, 8 funções, 4 + 4 benefícios, 5 itens da experiência, 4 de confiança', () => {
  expect(LANDING.problem.items).toHaveLength(5)
  expect(LANDING.features.items).toHaveLength(8)
  expect(LANDING.benefits.functional).toHaveLength(4)
  expect(LANDING.benefits.emotional).toHaveLength(4)
  expect(LANDING.experience.items).toHaveLength(5)
  expect(trustItems({ legalReady: true, dataReleased: true })).toHaveLength(4)
})

test('frases inteiras como na copy (negrito + resto)', () => {
  expect(full(LANDING.problem.items[0])).toBe('Um café aqui, um delivery ali. Nenhum gasto parece grande, até todos aparecerem juntos na fatura.')
  expect(full(LANDING.features.items[7])).toBe('Encontre qualquer gasto em segundos. Tudo em ordem, fácil de buscar e de corrigir.')
  expect(full(LANDING.benefits.functional[0])).toBe('Você sabe quanto pode gastar — antes de gastar, e não depois.')
  expect(full(LANDING.benefits.emotional[3])).toBe('Alívio. Simples assim.')
  expect(full(LANDING.experience.items[3])).toBe('Nada de configurações longas. Você cria seu cadastro e já pode anotar o primeiro gasto.')
  expect(LANDING.final.micro).toBe('Gratuito. Leva menos de um minuto para começar.')
})

test('terminologia e distribuição: nunca "conta bancária", "sua conta", "baixe", "download" ou loja', () => {
  for (const t of allLandingTexts()) {
    expect(t, t).not.toMatch(/conta bancária|sua conta\b|criar uma conta|baixe|download|app store|play store|google play/i)
    expect(t, t).not.toMatch(/!/)
  }
})

test('Confiança: "Seus dados são seus." só com os textos jurídicos prontos e a liberação do dono', () => {
  const ids = (legalReady: boolean, dataReleased: boolean) => trustItems({ legalReady, dataReleased }).map((i) => i.id)
  expect(ids(false, false)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(true, false)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(false, true)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(true, true)).toEqual(['banco', 'gratuita', 'dados', 'conselhos'])
  const dados = trustItems({ legalReady: true, dataReleased: true })[2]
  expect(full(dados)).toBe('Seus dados são seus. Você pode baixar o que registrou ou excluir seu cadastro quando quiser.')
  expect(full(trustItems({ legalReady: false, dataReleased: false })[0])).toBe('Você decide o que registrar. A Íris não se conecta ao seu banco nem pede senha do banco.')
})

test('a liberação do item de dados começa desligada', () => {
  expect(DATA_RIGHTS_RELEASED).toBe(false)
})
