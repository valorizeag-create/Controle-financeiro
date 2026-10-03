export type LeadText = { lead: string; text: string }
export type TrustId = 'banco' | 'gratuita' | 'dados' | 'conselhos'
export type TrustItem = LeadText & { id: TrustId }

export const SIGNUP_HREF = '/criar-cadastro'
export const SIGNIN_HREF = '/entrar'
export const HOW_IT_WORKS_ID = 'como-funciona'

const CTA = 'Começar a ver meu mês'

const TRUST: TrustItem[] = [
  // Adaptado: a copy diz "à sua conta bancária" (terminologia §1.1, decisão 159).
  { id: 'banco', lead: 'Você decide o que registrar.', text: 'A Íris não se conecta ao seu banco nem pede senha do banco.' },
  { id: 'gratuita', lead: 'Gratuita, sem letras miúdas.', text: 'Você não precisa cadastrar cartão para usar.' },
  // Texto novo no lugar de "Você pode exportar ou excluir tudo quando quiser." (RN-24; decisão 160).
  { id: 'dados', lead: 'Seus dados são seus.', text: 'Você pode baixar o que registrou ou excluir seu cadastro quando quiser.' },
  { id: 'conselhos', lead: 'Sem conselhos de investimento, sem promessas milagrosas.', text: 'A Íris mostra o que está acontecendo. As decisões continuam sendo suas.' },
]

export const LANDING = {
  hero: {
    title: 'Seu dinheiro, finalmente à vista.',
    subtitle: 'Anote seus gastos em segundos e veja, de um jeito simples, para onde seu dinheiro está indo. Sem planilha, sem conta difícil, sem julgamento.',
    cta: CTA,
    secondaryCta: 'Ver como funciona',
    // Adaptado: a copy diz "Sem acesso à sua conta bancária." (decisão 159).
    micro: 'Gratuito. Sem cartão. Sem acesso ao seu banco.',
  },
  problem: {
    title: 'Você sabe quanto ganha. O difícil é saber para onde vai.',
    items: [
      { lead: 'Um café aqui, um delivery ali.', text: 'Nenhum gasto parece grande, até todos aparecerem juntos na fatura.' },
      { lead: '"Será que ainda posso gastar?"', text: 'Você abre o app do banco, olha o saldo e continua sem a resposta.' },
      { lead: 'A conta que venceu ontem.', text: 'Não por descuido, mas porque ela estava escondida no meio de tudo.' },
      { lead: 'Pix, cartão, dinheiro, boleto.', text: 'Cada gasto em um lugar diferente, e nenhum lugar mostrando o todo.' },
      { lead: 'Dia 30 chega.', text: 'O dinheiro acabou, e você não consegue explicar exatamente como.' },
    ],
    closing: 'Se alguma dessas situações parece familiar, você não está sozinho — e não está fazendo nada de errado.',
  },
  turn: {
    title: 'O problema nunca foi você.',
    text: 'A maioria das pessoas não perde o controle do dinheiro por ganhar pouco ou gastar demais. Perde porque nunca consegue ver tudo em um lugar só. Gasto espalhado vira gasto invisível. E ninguém consegue cuidar do que não consegue enxergar.',
    highlight: 'Antes de controlar, você precisa ver.',
  },
  solution: {
    title: 'A Íris reúne seu dinheiro em uma visão só.',
    text: 'Você anota o que entrou e o que saiu. A Íris organiza, soma e mostra — o que foi para cada lugar, quanto ainda está disponível e como o mês está andando. Sem fórmulas, sem colunas, sem precisar entender de finanças. É o seu mês, finalmente legível.',
    cta: CTA,
  },
  features: {
    title: 'Tudo o que você precisa para entender seu dinheiro. Nada além disso.',
    items: [
      { lead: 'Anote em segundos.', text: 'Valor, categoria e pronto. Mais rápido que abrir uma planilha.' },
      { lead: 'Veja seu mês de relance.', text: 'Quanto entrou, quanto saiu e quanto sobrou, logo na primeira tela.' },
      { lead: 'Descubra para onde seu dinheiro vai.', text: 'Mercado, transporte, lazer: cada gasto no seu lugar, sem você precisar fazer contas.' },
      { lead: 'Saiba quanto ainda pode gastar.', text: 'Defina um valor para cada área e acompanhe quanto ainda está disponível, sem susto.' },
      { lead: 'Veja sua meta chegando mais perto.', text: 'Guarde para o que importa e acompanhe quanto falta, passo a passo.' },
      { lead: 'Entenda seus meses, não só este.', text: 'Compare períodos e perceba o que mudou, sem precisar interpretar gráficos complicados.' },
      { lead: 'Não deixe uma conta passar.', text: 'A Íris te avisa antes do vencimento — e lembra você de anotar, se quiser.' },
      { lead: 'Encontre qualquer gasto em segundos.', text: 'Tudo em ordem, fácil de buscar e de corrigir.' },
    ],
  },
  benefits: {
    title: 'O que muda quando você consegue ver.',
    functional: [
      { lead: 'Você sabe quanto pode gastar', text: '— antes de gastar, e não depois.' },
      { lead: 'Suas contas deixam de te pegar de surpresa.', text: '' },
      { lead: 'Você entende seus hábitos', text: 'sem precisar se analisar.' },
      { lead: 'Suas metas saem da cabeça', text: 'e ganham um número e um caminho.' },
    ],
    emotional: [
      { lead: 'Menos ansiedade ao abrir o app do banco.', text: '' },
      { lead: 'Mais segurança para dizer sim', text: '— e para dizer não.' },
      { lead: 'A sensação de estar por dentro da própria vida.', text: '' },
      { lead: 'Alívio.', text: 'Simples assim.' },
    ],
  },
  experience: {
    title: 'Feita para você não desistir.',
    text: 'Planilhas e apps complicados costumam ser abandonados pelo mesmo motivo: dão trabalho demais. A Íris foi pensada para caber na sua rotina.',
    items: [
      { lead: 'Um registro leva segundos.', text: 'Valor, categoria, pronto.' },
      { lead: 'Você começa com pouco.', text: 'Não precisa organizar a vida inteira no primeiro dia.' },
      { lead: 'Esqueceu de anotar por uns dias?', text: 'Tudo bem. É só continuar de onde parou.' },
      // Adaptado: a copy diz "Você cria sua conta…" (decisão 159).
      { lead: 'Nada de configurações longas.', text: 'Você cria seu cadastro e já pode anotar o primeiro gasto.' },
      { lead: 'A Íris faz as contas.', text: 'Você só precisa olhar.' },
    ],
    highlight: 'Organizar não precisa ser mais um compromisso.',
  },
  trust: { title: 'Clareza também sobre como a Íris funciona.' },
  final: {
    title: 'Seu próximo mês pode ser o primeiro que você realmente entende.',
    text: 'Comece com um gasto. Em poucos dias, você já vai enxergar o seu mês com outros olhos.',
    cta: CTA,
    micro: 'Gratuito. Leva menos de um minuto para começar.',
  },
} as const

// "Seus dados são seus." só aparece com os textos jurídicos prontos e a liberação do dono (RF-57).
export function trustItems(gate: { legalReady: boolean; dataReleased: boolean }): TrustItem[] {
  const showData = gate.legalReady && gate.dataReleased
  return TRUST.filter((i) => i.id !== 'dados' || showData)
}

function collect(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value !== '') out.push(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collect(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collect(v, out)
  }
}

// Todos os textos da landing, inclusive os quatro itens de confiança (mesmo os que ficam ocultos).
export function allLandingTexts(): string[] {
  const out: string[] = []
  collect(LANDING, out)
  collect(TRUST.map(({ lead, text }) => ({ lead, text })), out)
  return out
}
