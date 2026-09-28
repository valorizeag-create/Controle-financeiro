# Íris — Decisões para sua revisão

Decisões tomadas durante o desenvolvimento, quando a documentação aprovada não definia o detalhe. Cada uma diz o que foi decidido e por quê. Qualquer uma pode ser revertida.

## Plano 1

| # | Decisão | Motivo |
|---|---|---|
| 1 | "Disponível depois das contas" no mês atual inclui também contas **vencidas de meses anteriores** ainda não pagas. Em meses passados ou futuros, só as contas daquele mês. | Uma conta atrasada continua devida; escondê-la deixaria o número otimista demais. |
| 2 | Meses futuros mostram, em "Saiu", os gastos já datados para eles (ex.: parcelas). O Saldo total considera só o que aconteceu até hoje. | Ao olhar novembro, a pessoa espera ver a parcela de novembro. |
| 3 | Valores digitados com espaço no meio ("1 2") ou só com vírgula são recusados com "Esse valor não parece certo. Use apenas números." | Evita que um erro de digitação vire outro valor válido. |
| 4 | Datas aceitas: de 01/01/2000 até 1 ano à frente para gastos; **entradas só até hoje** ("Escolha o dia."). | Um ano digitado errado sumiria do mês; dinheiro que não chegou não conta (regra RN-12). |
| 5 | A navegação entre meses vai de 2000 a 2099. | Mesmo limite das datas de registro. |
| 6 | Forma de pagamento desconhecida (fora da lista) é tratada como "Não informar". | Evita mensagem de erro técnica em inglês. |
| 7 | A categoria "Outros" não pode ser excluída, e as categorias padrão não perdem sua identificação interna. | "Outros" recebe os gastos de categorias excluídas (RN-27). |
| 8 | Senha com no máximo 72 bytes (letras acentuadas contam mais), mesma mensagem "Use até 72 caracteres.". | Limite técnico do armazenamento seguro de senhas. |
| 9 | Troca de senha exige login recente (configuração de segurança do Supabase). | Protege a conta se alguém tiver acesso a uma sessão antiga. |
| 10 | O histórico completo é lido em páginas de 1.000 registros. | O banco corta respostas grandes sem avisar; o Saldo total ficaria errado. |
| 11 | Logo provisório (círculo verde com "íris" escura) usado no app até existir o definitivo. | Aprovado na Etapa 5 (V2). |

## Plano 2

| # | Decisão | Motivo |
|---|---|---|
| 12 | Barra inferior com 4 itens até existir Metas: Seu mês · Extrato · Anotar · Mais. Metas entra no Plano 5. | Não mostrar botão que leva a tela vazia. |
| 13 | Menu lateral lista as áreas diretamente (Seu mês, Extrato, Categorias, Configurações); "Mais" é só do celular. | No desktop há espaço; o "Mais" existe para caber na barra do celular. |
| 14 | Onboarding "concluído" = salvou ou pulou "Quanto você tem hoje?". Quem para antes volta às boas-vindas ao abrir o app; quem concluiu nunca volta. Cadastros anteriores ao Plano 2 contam como concluídos. | Garante que ninguém caia no Seu mês sem ter visto o saldo inicial, sem prender quem já usa. |
| 15 | Saldo inicial em branco vale R$ 0,00; valor negativo não é aceito nesta versão. | É opcional; negativo pede texto próprio (dívida), que não está na copy. |
| 16 | Período do Extrato = mês, com as mesmas setas do Seu mês; a busca vale dentro do mês escolhido. | Coerente com o "Seu mês"; evita misturar meses sem aviso. |
| 17 | Busca por valor aceita parte do número ("142" encontra R$ 142,30), com ou sem milhar, vírgula, ponto ou "R$". | É como a pessoa lembra do valor. |
| 18 | Tocar num registro abre a edição (o mesmo formulário do Anotar); "Excluir" fica dentro da edição, com confirmação. | Um toque a menos que um menu de ações; excluir sempre confirmado. |
| 19 | Depois de editar, a tela volta ao Extrato no mês do registro — se a data mudou de mês, no mês novo. | A pessoa vê onde o registro foi parar. |
| 20 | "Outros" não pode ser renomeada (nem excluída) e fica sempre por último; categorias padrão podem ser renomeadas e excluídas. | A confirmação diz 'vão para "Outros"'; o nome precisa continuar verdadeiro. |
| 21 | Nomes de categoria não diferenciam maiúsculas nem espaços extras; acentos diferenciam ("Saude" ≠ "Saúde"). | Evita duplicatas óbvias sem instalar extensão de acentos no banco. |
| 22 | E-mail aparece em Configurações só para leitura; trocar e-mail fica para o Plano 9. | Trocar e-mail exige confirmação por e-mail (SMTP próprio, Plano 8/9). |
| 23 | "Mudar senha" usa a tela "Crie uma nova senha."; com login antigo, a Íris pede para sair e entrar de novo. | O Supabase exige login recente para trocar senha (decisão 9). |
| 24 | "Sair da Íris?" pede confirmação também no menu lateral do desktop. | Mesmo comportamento em todo lugar. |
| 25 | Fechar Anotar/Editar com algo digitado pergunta "Descartar este registro?". | Evita perder o que foi digitado por um toque sem querer. |
| 26 | Rótulo do saldo inicial trocado de "Somando conta e dinheiro guardado" (texto já aprovado) para "Somando banco, carteira e dinheiro guardado". | A regra de terminologia aprovada reserva "conta" para contas a pagar/receber; "conta" no texto antigo significava conta bancária. |

## Plano 3

| # | Decisão | Motivo |
|---|---|---|
| 27 | As contas e entradas do mês são criadas quando a pessoa abre o Seu mês, o Extrato ou Contas; meses futuros ainda não mostram contas (a lista "Contas que se repetem" mostra o que vem). | Etapa 3 §5 ("ao abrir o app"); a tarefa diária é do Plano 8. |
| 28 | Vencimento em dia que o mês não tem (29, 30, 31) cai no último dia do mês; 29 de fevereiro anual cai em 28 nos anos não bissextos. | É quando a conta de verdade costuma vencer. |
| 29 | Quem fica meses sem abrir a Íris recebe no máximo as contas dos 3 últimos meses (o atual e os 2 anteriores). | Evita uma pilha de contas antigas; o resumo continua honesto para o que é recente. |
| 30 | Cada conta aparece uma vez por mês; uma conta paga e depois excluída no Extrato não volta. | A pessoa confia que o que ela apagou fica apagado. |
| 31 | No Anotar, "É uma conta que se repete" / "Isso se repete": o registro de hoje é a primeira (já paga ou recebida); as próximas aparecem no mesmo dia dos meses (ou anos) seguintes. Gasto com data futura: a primeira fica a pagar. | Quem anota a conta que acabou de pagar não deve pagá-la duas vezes. |
| 32 | "Nova conta" (em Contas): nome, valor, categoria, Todo mês / Todo ano (e o mês), dia do vencimento. A primeira vence na próxima data a partir de hoje (se o dia já passou neste mês, começa no próximo). Tela no visual aprovado do Anotar. | Quem cadastra hoje uma conta do dia 10 já passado provavelmente já a pagou. |
| 33 | Nome da conta criada pelo Anotar: a nota, ou o nome da categoria; entrada: a origem, ou "Entrada". | O Anotar não tem campo de nome; a lista precisa de um título. |
| 34 | Marcar como paga não tem "desfazer": a conta paga vira um registro normal, que pode ser editado ou excluído no Extrato. Conta no dia de hoje (A1). | A copy não tem "desfazer"; editar/excluir já cobre o engano. |
| 35 | "Recebi" abre um painel com o valor previsto para ajustar antes de confirmar; entra no dia de hoje. | RF-17. |
| 36 | Alterar uma conta que se repete muda nome, valor, categoria (ou origem) e dia; frequência e mês não mudam (encerre e crie outra). Vale para as ainda não vencidas; pagas e vencidas ficam como estão; o novo dia não é aplicado se cairia antes de hoje. | RF-18 sem reescrever o passado e sem transformar, de repente, uma conta em vencida. |
| 37 | Encerrar: as próximas deixam de ser criadas e as que venceriam depois de hoje somem; a de hoje, as vencidas e todo o histórico ficam. | "Sem apagar o histórico" (RF-18); o que já venceu continua devido. |
| 38 | No mês atual, "Vencidas" inclui as de meses anteriores ainda não pagas; num mês passado, o que ficou sem pagar aparece como vencida. | Coerente com a decisão 1. |
| 39 | "Contas que se repetem" lista só contas; entradas ficam em "Entradas que se repetem". | Terminologia: "conta" é só a pagar. |
| 40 | "Próximas contas" no Seu mês: só no mês atual, até 3, vencidas primeiro; some quando não há conta a pagar. Textos: "vence hoje", "vence amanhã", "vence em {n} dias", "venceu em {dia}". | Tom calmo; o bloco não ocupa espaço sem motivo. |
| 41 | No Extrato, conta paga aparece no dia do pagamento; editar a data dela muda o dia do pagamento. Contas a pagar e entradas a receber continuam fora do Extrato. | A1; a edição precisa mudar o que a pessoa vê. |
| 42 | "Contas" entra no menu lateral (depois de Extrato) e em Mais no celular; a barra inferior não muda. | Etapa 3 §6/§7 e decisão 12. |
| 43 | Na lista de Contas o botão é "Paga" (protótipo), com nome acessível "Marcar {conta} como paga"; no Seu mês, "Marcar como paga". Confirmação da copy nos dois. | Espaço na lista; texto completo onde cabe. |
| 44 | Excluir uma categoria leva também as contas que se repetem dela para "Outros". | RN-27; sem isso a exclusão falharia. |

Decisões do controlador ao longo da execução: uma conta paga não pode ter a data de pagamento editada para o futuro; lista vazia de entradas a receber usa o texto "Nenhuma entrada prevista neste mês."; "Recebi" volta para o mês da entrada confirmada; contas do mesmo dia mantêm ordem estável (evita a lista "pular" a cada nova ocorrência gerada).

## Textos novos usados (fora da copy oficial)

Aprovados antes: "Falta o seu nome.", "Falta a senha.", "Use até {n} caracteres.", "Escolha o dia.", "Crie uma nova senha.", "Salvar nova senha", "Voltar", formas de pagamento (Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma, Não informar).
Plano 2: "Somando banco, carteira e dinheiro guardado" (rótulo do saldo inicial, decisão 26) e "Passo {n} de 3" (rótulo acessível do onboarding); demais textos na seção "Textos novos" do plano `docs/superpowers/plans/2026-09-25-iris-plano-2-extrato-onboarding.md`.
Plano 3: "Com que frequência?" (rótulo do grupo Todo mês / Todo ano); prazos "vence hoje" · "vence amanhã" · "venceu em {dia de mês}" · "vence dia {d} · hoje" / "· amanhã" · "paga em {dia de mês}" · "previsto para {dia de mês}"; listas vazias "Nenhuma conta a pagar neste mês." · "Nenhuma conta paga neste mês." · "Nenhuma conta vencida." · "Nenhuma conta que se repete ainda." · "Nenhuma entrada prevista neste mês."; "Entradas que se repetem" (título) · "Situação das contas" (rótulo acessível das abas) · "Recebi {nome}" (rótulo acessível do link "Recebi") · "Marcar {conta} como paga" (rótulo acessível do botão "Paga"); "Nome" · "Valor" · "Vence dia" · "Chega dia" · "Mês" · "Salvar conta" · "Falta o nome." · "Escolha o mês." · "Conta criada."; "Encerrar" · "Encerrar "{nome}"?" · "As próximas não serão criadas. O que já foi pago continua no Extrato." · "Encerrada. O histórico continua no Extrato."; "Confirmar entrada"; "Resumo do mês" (rótulo acessível do resumo em Contas); nome padrão "Entrada" para entrada que se repete sem origem (já usado no Seu mês desde o Plano 1); ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-26-iris-plano-3-contas-recorrencias.md`.
