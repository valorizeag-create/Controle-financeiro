import { TO_DEFINE, type LegalController } from './controller'

export type LegalBlock = string | string[] // parágrafo | lista
export interface LegalSection {
  heading: string
  blocks: LegalBlock[]
}
export interface LegalDoc {
  title: string
  sections: LegalSection[]
}

// Rascunho jurídico. Descreve o que o app faz hoje e não substitui a revisão do dono do projeto e de um advogado.
// "cadastro" é a pessoa usuária; "conta" só aparece para contas a pagar e a receber.
const orPending = (v: string | null): string => v || TO_DEFINE

export function termsDoc(c: LegalController): LegalDoc {
  const who = orPending(c.name)
  const contact = orPending(c.contact)
  return {
    title: 'Termos de uso',
    sections: [
      {
        heading: 'O que é a Íris',
        blocks: ['A Íris é um app gratuito para anotar o que entra e o que sai e enxergar o seu mês. Os números que ela mostra vêm do que você anota.'],
      },
      {
        heading: 'Seu cadastro',
        blocks: [
          'Para usar a Íris você cria um cadastro com e-mail e senha, ou entra com o Google.',
          'O cadastro é pessoal. Cuide da sua senha e não a compartilhe.',
          'Use um e-mail que você acompanha: é por ele que a Íris envia o link para criar uma nova senha.',
        ],
      },
      {
        heading: 'Gratuita',
        blocks: [
          'A Íris é gratuita e não pede dados de cartão para funcionar.',
          'Se isso mudar um dia, você será avisado antes e poderá baixar ou excluir os seus dados.',
        ],
      },
      {
        heading: 'O que a Íris não é',
        blocks: [
          ['Não é banco e não movimenta dinheiro.', 'Não se conecta ao seu banco e não pede senha de banco.', 'Não dá conselho de investimento nem promete resultado.'],
          'A Íris mostra o que está acontecendo. As decisões continuam sendo suas. Confira valores importantes antes de decidir com base neles.',
        ],
      },
      {
        heading: 'Família',
        blocks: [
          'Quem cria uma família passa a administrá-la e pode convidar outras pessoas.',
          'Tudo o que alguém marca como da família aparece para quem participa dela: os gastos da família, as contas da família e as metas da família.',
          'Quem administra pode ajustar e excluir gastos da família e remover participantes.',
          'O que você não marca como da família continua privado.',
        ],
      },
      {
        heading: 'Uso combinado',
        blocks: [
          [
            'Não use a Íris para atividade ilegal.',
            'Não tente acessar dados de outras pessoas.',
            'Não envie convites a quem não quer recebê-los.',
            'Não sobrecarregue nem tente derrubar o serviço.',
          ],
        ],
      },
      {
        heading: 'Seus dados',
        blocks: [
          'O que você anota é seu. Você pode baixar o que registrou em Configurações → Seus dados → Baixar meus dados e excluir o cadastro em Configurações → Seus dados → Excluir meu cadastro, quando quiser.',
          'A Política de privacidade explica o que a Íris guarda, o que o arquivo traz e para quê.',
        ],
      },
      {
        heading: 'Disponibilidade',
        blocks: [
          'A Íris precisa de conexão com a internet para funcionar.',
          'Ela pode ficar fora do ar por algum tempo, mudar ou ser encerrada. Se for encerrada, a Íris vai avisar com antecedência razoável para você baixar os seus dados.',
        ],
      },
      {
        heading: 'Encerramento',
        blocks: ['Você pode excluir o seu cadastro quando quiser.', 'A Íris pode suspender um cadastro que descumpra estes termos.'],
      },
      {
        heading: 'Mudanças nestes termos',
        blocks: ['Se estes termos mudarem de forma importante, a Íris avisa antes de a mudança valer.'],
      },
      {
        heading: 'Contato e lei aplicável',
        blocks: [`A Íris é mantida por ${who}. Para falar sobre estes termos, escreva para ${contact}.`, 'Estes termos seguem a lei brasileira.'],
      },
    ],
  }
}

export function privacyDoc(c: LegalController): LegalDoc {
  const who = orPending(c.name)
  const contact = orPending(c.contact)
  const mail = orPending(c.emailProvider)
  return {
    title: 'Política de privacidade',
    sections: [
      {
        heading: 'Quem cuida dos seus dados',
        blocks: [
          `A Íris é mantida por ${who}, que decide como os dados são tratados.`,
          `Para falar sobre os seus dados, inclusive com a pessoa encarregada de cuidar deles (encarregado), escreva para ${contact}.`,
        ],
      },
      {
        heading: 'O que a Íris guarda',
        blocks: [
          [
            'Seu cadastro: nome, e-mail e senha. A senha fica guardada de forma protegida (um resumo cifrado, nunca a senha em si).',
            'Se você entra com o Google (quando essa opção está ativa): o nome, o e-mail e um identificador que o Google informa. Nunca a sua senha do Google.',
            'O que você anota: gastos, entradas, contas a pagar e a receber, compras parceladas, metas, planejamento, categorias e notas.',
            'Cartões: só o apelido, o tipo e a cor. Nenhum número de cartão.',
            'Família, se você participar de uma: o nome da família, quem participa e o que é marcado como da família (gastos, contas da família e metas).',
            'Lembretes: quais estão ligados e, se você ativar os lembretes num aparelho, o endereço técnico que o navegador fornece para a Íris enviar avisos a ele.',
            'Convites por e-mail: o endereço de quem foi convidado fica guardado, e só quem administra a família o vê, enquanto o convite está pendente. Um resumo cifrado desse endereço fica por até 7 dias, só para limitar a quantidade de convites, sem ligação com quem convidou.',
            'Registros técnicos: como em todo site, os serviços que hospedam a Íris registram dados de acesso, como endereço IP, data, hora e tipo de navegador.',
          ],
        ],
      },
      {
        heading: 'O que a Íris não faz',
        blocks: [
          [
            'Não se conecta ao seu banco e não pede senha de banco.',
            'Não guarda número de cartão.',
            'Não vende nem aluga dados.',
            'Não mostra publicidade.',
            'Não usa ferramentas de medição de audiência nem rastreadores.',
          ],
        ],
      },
      {
        heading: 'Para que os dados são usados',
        blocks: [
          [
            'Para mostrar o seu mês e calcular os números a partir do que você anota.',
            'Para manter o seu acesso seguro.',
            'Para enviar os lembretes e os e-mails que você deixou ligados.',
            'Para o espaço da família, quando você participa de uma.',
          ],
          'A Íris trata esses dados para prestar o serviço que você pediu ao criar o cadastro. Os lembretes no aparelho dependem da sua permissão, que você pode retirar quando quiser, em Configurações → Lembretes (veja a seção sobre os seus direitos).',
        ],
      },
      {
        heading: 'O que a família vê',
        blocks: [
          'Quem participa de uma família vê os gastos, as contas da família e as metas da família que forem marcados como da família, os nomes e os papéis de quem participa e os avisos da família.',
          'Numa meta da família, cada pessoa vê o total da meta e só a sua própria parte.',
          'O Disponível e as entradas de cada pessoa nunca aparecem para a família.',
          'Os outros participantes também não veem os seus cartões nem as suas metas pessoais.',
        ],
      },
      {
        heading: 'Quem ajuda a Íris a funcionar',
        blocks: [
          [
            'Supabase: guarda o banco de dados e cuida do login. O banco fica em servidores em São Paulo.',
            'Netlify: hospeda o site e executa o código das páginas. Esse código pode funcionar em servidores fora do Brasil e, quando funciona, os seus dados passam por lá enquanto você usa o app. Como tratar essa transferência para o exterior ainda está em definição pelo responsável pela Íris.',
            `${mail}: envia os e-mails da Íris (convites, avisos e resumo do mês). Os e-mails de confirmação do cadastro e de nova senha saem pelo serviço de login (Supabase); se eles usam o mesmo provedor, isso ainda está a confirmar.`,
            'Serviço de avisos do seu navegador (Google, Mozilla, Apple ou Microsoft): entrega os lembretes ao aparelho. O conteúdo viaja cifrado.',
            'Google: só se você escolher entrar com o Google.',
          ],
          'Esses serviços tratam os dados só para a Íris funcionar.',
        ],
      },
      {
        heading: 'Cookies e o que fica no aparelho',
        blocks: [
          'A Íris usa só o necessário para funcionar:',
          [
            'cookies de sessão, que mantêm você dentro do app;',
            'um cookie que dura alguns segundos, para mostrar avisos como "Anotado.";',
            'no armazenamento do aparelho: a página "Sem conexão", um ícone e pequenas preferências, como a sua escolha de não ver de novo o convite para ativar lembretes.',
          ],
          'Não há cookies de publicidade nem de medição.',
          'Também não há rastreadores de terceiros.',
        ],
      },
      {
        heading: 'Por quanto tempo',
        blocks: [
          [
            'Enquanto o seu cadastro existir.',
            'Ao excluir o cadastro, seus dados pessoais são apagados.',
            'Os gastos que você registrou numa família que continua existindo ficam no histórico dela como "Ex-membro", sem o seu nome. A sua parte nas metas da família sai delas.',
            'Um resumo cifrado do endereço de e-mail convidado para uma família fica por até 7 dias, sem ligação com quem convidou, mesmo depois da exclusão do cadastro.',
            'Um convite pendente que outra família enviou para o seu endereço de e-mail guarda esse endereço até vencer, por até 7 dias, mesmo depois da exclusão do cadastro.',
            'O registro de que um aviso foi enviado fica por até 90 dias, ligado ao seu cadastro: o tipo do aviso, a que item, mês ou dia ele se refere, quando foi preparado e enviado e se a entrega deu certo, sem o texto do aviso.',
            'Registros técnicos e cópias de segurança dos serviços de hospedagem seguem os prazos desses serviços.',
          ],
        ],
      },
      {
        heading: 'Seus direitos',
        blocks: [
          'A qualquer momento você pode:',
          [
            'corrigir o que anotou, editando nas próprias telas;',
            'baixar uma cópia do que registrou, numa planilha em formato CSV, em Configurações → Seus dados → Baixar meus dados (acesso e portabilidade);',
            'excluir o cadastro, em Configurações → Seus dados → Excluir meu cadastro;',
            'retirar a permissão para avisos, em Configurações → Lembretes: "Desativar neste aparelho" para os avisos no aparelho e os interruptores para os lembretes e os e-mails;',
            `pedir, por ${contact}, a confirmação de que a Íris trata dados seus, a anonimização ou o bloqueio do que for desnecessário e informações sobre com quem os dados são compartilhados (veja a seção sobre quem ajuda a Íris);`,
            `retirar o seu consentimento em geral, também por ${contact}.`,
          ],
          'O arquivo para baixar traz o seu cadastro, seus registros, as contas a pagar e as entradas que se repetem, as compras parceladas, os cartões, as metas e seus movimentos, o planejamento, as categorias, quais lembretes estão ligados e a família de que você participa hoje. Ele não traz as famílias de que você já saiu, se algum aparelho recebe avisos, o histórico de avisos enviados nem os convites que você criou.',
          'Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).',
        ],
      },
      {
        heading: 'Segurança',
        blocks: [
          'O acesso é sempre por conexão cifrada (HTTPS).',
          'Cada pessoa só alcança os próprios dados e o que é da família, se participa de uma. Essa regra é aplicada dentro do banco de dados, não só nas telas.',
          'Nenhum sistema é infalível. Se houver um incidente que afete os seus dados, a Íris avisa você, como a lei pede.',
        ],
      },
      {
        heading: 'Idade',
        blocks: ['A Íris é pensada para adultos. Menores de 18 anos só devem usar com um responsável.'],
      },
      {
        heading: 'Mudanças nesta política',
        blocks: ['Se esta política mudar de forma importante, a Íris avisa antes de a mudança valer.'],
      },
    ],
  }
}
