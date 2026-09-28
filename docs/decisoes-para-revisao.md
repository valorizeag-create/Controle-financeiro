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
| 33 | Nome da conta criada pelo Anotar: a nota, ou o nome da categoria; entrada: a origem, ou "Entrada". A nota das próximas é a nota do Anotar (vazia se não houve nota), nunca o nome repetido. | O Anotar não tem campo de nome; a lista precisa de um título. Evita "Mercado · Mercado" no Extrato. |
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

## Plano 4

| # | Decisão | Motivo |
|---|---|---|
| 45 | Cartão guarda só apelido (até 30 caracteres), tipo (Crédito ou Débito) e uma de 6 cores do protótipo (Verde, Roxo, Azul, Laranja, Grafite, Rosa). Padrão: Crédito, Verde. Dois cartões podem ter o mesmo apelido. | RN-29; o apelido precisa caber no chip do Anotar. |
| 46 | Excluir um cartão o apaga de vez (o apelido não fica guardado). Gastos, parcelas e restante quitado ficam como "Cartão excluído", com os mesmos valores; contas que se repetem com ele seguem sem cartão. Tudo de uma vez. | RN-32 e o mínimo de dados guardados (LGPD). |
| 47 | Gasto com cartão não guarda forma de pagamento: o tipo vem do cartão. O Extrato mostra o apelido (ou "Cartão excluído") no lugar da forma, e a busca acha pelo apelido. Mudar o tipo de um cartão vale para todos os gastos dele. | Uma fonte só; nunca "Crédito" num gasto de cartão de débito. |
| 48 | "Como pagou?" aparece no Anotar só para quem tem cartões. Vem marcada a escolha do último gasto anotado: o cartão dele, ou "Outra forma" se foi pago de outro jeito ou com um cartão excluído. "Outra forma" desmarca o cartão e mostra "Forma de pagamento" em Mais detalhes (escondida enquanto um cartão está marcado). Na edição, vem o cartão do registro. (interpretação — confirme) | K6 A sem atribuir ao cartão, sem a pessoa perceber, um gasto pago de outro jeito. |
| 49 | Parcelado: "Quanto foi?" é o total; de 2 a 48 parcelas; centavos que sobram vão para a 1ª; cada parcela é um gasto no mesmo dia dos meses seguintes (dia 29–31 ajustado, decisão 28). A data da compra vai até hoje; numa compra antiga, as parcelas que já passaram contam nos meses delas. | RN-07 e etapa 3 §3.1; permite anotar uma compra que já está na parcela 4. |
| 50 | Parcelado e "se repete" não andam juntos (marcar um desmarca o outro). Parcelado só em gasto e só ao anotar; parcelado da família fica para o Plano 7. | Uma compra parcelada não é uma conta mensal. |
| 51 | Parcela "futura" é a de depois de hoje (Brasília); a parcela de hoje já contou. | Quitar ou devolver no dia da parcela não apaga o que já saiu do mês. |
| 52 | Quitar antecipadamente abre uma tela com o valor que falta, que a pessoa pode ajustar (desconto ou juros). As parcelas futuras saem e o valor entra como um gasto único de hoje, com a mesma categoria, nota e cartão. Uma vez só; sem parcela futura, a opção não aparece. (interpretação — confirme) | RN-08 ("o valor quitado"); quitar costuma ter desconto. |
| 53 | Devolução: as parcelas futuras saem; as que já contaram ficam. A Íris não cria uma entrada de reembolso (se algo voltou, anota-se como entrada). | RN-09. |
| 54 | Parcelas não são editadas uma a uma. No Extrato, tocar numa parcela (ou no restante quitado) abre a compra: as parcelas, quitar, devolver e excluir a compra inteira. Para mudar valor, número de parcelas, categoria ou cartão, exclua e anote de novo. | As parcelas precisam sempre somar o total da compra. |
| 55 | "Gasto neste cartão em {mês}" = gastos com o cartão no mês em que contam (RN-06, A1), com parcelas e restante quitado, pelo valor inteiro. Contas a pagar com cartão só entram quando pagas. Nunca "Fatura". | RN-30. |
| 56 | "Ver gastos" abre o Extrato no mês e no cartão. O filtro "Cartão" do Extrato só aparece para quem tem cartões e combina com categoria e busca; "Entradas" e "Gastos" limpam o cartão. | RF-59 e RF-60 com uma tela só. |
| 57 | Cartões no menu lateral logo depois de Contas e em Mais depois de Contas; Novo cartão e editar são páginas no visual do protótipo. O Seu mês não ganha bloco de cartões. | Protótipo, RF-58 e RF-61; mesmo padrão de Categorias e Nova conta. |
| 58 | Conta que se repete anotada com cartão: as próximas vêm com o mesmo cartão. "Nova conta" (Contas) não pede cartão. | Assinaturas costumam cair sempre no mesmo cartão. |
| 59 | A compra parcelada não guarda categoria e nota à parte: vêm das parcelas. Excluir uma categoria leva as parcelas para "Outros" como qualquer gasto. | Uma fonte só; RN-27 sem regra nova. |

## Plano 5

| # | Decisão | Motivo |
|---|---|---|
| 60 | Metas entra na barra inferior (Seu mês · Extrato · Anotar · Metas · Mais) e no menu lateral logo depois de Contas (ordem do protótipo Desktop); não aparece em Mais. | A5 e decisão 12. |
| 61 | Meta individual: nome até 40 caracteres, valor até o limite do app, prazo opcional como mês e ano ("Até quando? (opcional)"), do mês atual até dezembro de 2099; ao editar, um prazo que já passou pode ficar. Metas da família: Plano 7. | RF-25; o protótipo mostra o prazo como mês ("até mar. 2027"). |
| 62 | Guardar e tirar acontecem hoje (Brasília), sem escolher a data. Guardar não é limitado pelo Disponível (ele pode ficar negativo) e pode passar do valor da meta; tirar vai até o que a meta tem. | RN-13 e RN-14 ("mês atual"); a Íris mostra, não proíbe. |
| 63 | "Meta completa" é calculada (guardado ≥ valor): se a pessoa tirar e ficar abaixo, a meta volta a mostrar quanto falta. "Usada" fica gravada. | Números sempre calculados (etapa 3 §2). |
| 64 | Usar o dinheiro: só em meta ativa com dinheiro guardado; o gasto é de hoje, com categoria (sem nota, cartão ou data — protótipo); a meta paga o menor entre o gasto e o guardado; o resto sai do Disponível do mês (RN-15a); a meta vira "usada" e vai para "Concluídas" ("{meta} · usada em {mês}"). | RN-15 e protótipo "Usar o dinheiro da meta". |
| 65 | Sobra: a pergunta da RN-15b aparece logo depois de usar; "Deixar guardado" é o botão destacado (o padrão) e leva para Metas; "Devolver" tira a sobra hoje e leva para o Seu mês. | RN-15b; protótipo "Sobra da meta". |
| 66 | Meta usada com sobra só permite tirar e excluir (não recebe nem é usada de novo). O gasto pago com meta não é editado nem excluído pelo Extrato: tocar nele abre a meta; no histórico, "Usou" tem "Excluir" — o gasto e o uso saem juntos, o dinheiro volta e a meta volta a ser ativa (em meta excluída, não). | A parte paga pela meta precisa sempre bater com o uso (RNF-11). |
| 67 | Excluir meta: some das listas e do Seu mês; o que estava guardado volta ao Disponível do mês atual como "Tirado da meta"; o que foi guardado ou tirado em meses anteriores continua contando neles. A confirmação usa a copy e diz quanto volta. | RN-16 e A6 A. |
| 68 | O Extrato mostra "Guardado na meta" e "Tirado da meta" (com o nome) quando não há filtro de tipo, categoria ou cartão; tocar abre a meta. O gasto pago com meta mostra o valor inteiro e "pago com a meta {meta}". "Para onde seu dinheiro vai" continua só com a parte paga pelo mês. | Protótipo Extrato e RN-01a; categorias batem com o "Saiu". |
| 69 | "Quanto guardar por mês" = o que falta ÷ meses até o prazo (sem contar o atual; no mínimo 1), arredondado para cima em reais inteiros ("cerca de R$ 254 por mês"). Some sem prazo, com prazo que já passou e na meta completa ou usada. | RF-29; bate com o protótipo (R$ 1.520 até março, em setembro → R$ 254). |
| 70 | "Meta em destaque" (Seu mês, só no mês atual): a meta ativa ainda não completa com maior percentual; empate: prazo mais perto, depois a mais antiga. Some quando não há. | RF-33 e protótipo; mostra a que está mais perto de chegar lá. |
| 71 | Percentual arredondado para baixo e no máximo 100% (R$ 3.999,99 de R$ 4.000 mostra 99%). "Guardado em metas" soma as metas não excluídas. | Não mostrar 100% antes da hora. |
| 72 | Criar e editar meta são páginas (visual do Novo cartão); guardar, tirar, usar e a sobra são painéis que sobem (visual do protótipo "Usar o dinheiro da meta"). "Mais opções" (⋯) na meta leva a editar e excluir. | Etapa 3 §6 (ações rápidas por cima da tela) e protótipo. |
| 73 | Comemoração na medida: ao guardar e passar da metade, aviso "Metade do caminho até {meta}."; ao completar, "Você chegou lá. {meta} está completa." e o cartão verde na meta. Uma vez por marco; sem animação. | Copy (sucesso) e RF-30. |
| 74 | Movimentos da meta não são editados nem apagados (só o uso, pela decisão 66): para corrigir um guardar, tira-se o valor, e vice-versa; o histórico mostra os dois. | Livro-razão sem reescrever o passado; o Disponível de meses anteriores não muda sem a pessoa ver. |

Decisões do controlador ao longo da execução:
- RN-01a: o gasto pago com meta aparece no Extrato com "pago com a meta {meta}", mas o gráfico "Para onde seu dinheiro vai" continua mostrando só a parte paga com o dinheiro do mês, para bater com o "Saiu" (decisão 68) — interpretação, confirme.
- RN-15 × RN-15b: lido como "a meta paga até o que tem" (não zera de fato); com gasto menor que o guardado, a sobra continua na meta até a pessoa decidir devolvê-la ou deixá-la guardada (decisões 65 e 66).
- A frase nova "{valor} volta para o seu Disponível deste mês." (complemento da confirmação de excluir, A6 A) está listada em "Textos novos" para aprovação.

## Plano 6

| # | Decisão | Motivo |
|---|---|---|
| 75 | Planejado é por categoria e por mês, de R$ 0,01 até o limite do app; em branco ou zero = sem planejado. Qualquer mês de 2000 a 2099 pode ser planejado (nada é travado). Só categorias de gasto; sem planejado da família (fora da v1). | RF-22; etapa-3 §3.1 `budgets`; etapa-2 §6. |
| 76 | O "gasto" do planejado é o mesmo de "Para onde seu dinheiro vai": só a parte paga com o dinheiro do mês, conta paga no mês em que foi paga, parcelas no mês delas; conta a pagar não conta. | RN-01a, A1, decisões 2 e 68; RNF-11. |
| 77 | Estados: "passou do planejado" quando o gasto é maior que o planejado; "perto do limite" a partir de 90% (inclusive igual); senão "dentro". "Dentro do planejado em {n} de {total}" conta dentro e perto. | RF-23; protótipo (4 de 6) — conflito 1. |
| 78 | Planejamento mostra só as categorias planejadas, na ordem das categorias (Outros por último), com "{gasto} de {planejado}", barra (âmbar quando passou) e o estado em texto; em toda categoria que passou, o link "Quer ajustar o valor deste mês?" (nome acessível com o nome da categoria); "Planejar outra categoria" abre o formulário. **Substituída pelo controlador:** o plano dizia "Ajustar valor" (protótipo); a copy oficial tem prioridade sobre o protótipo. | Protótipo Planejamento; V5; copy; conflito 2. |
| 79 | Planejar é uma página com um campo por categoria (o formulário do mês); salvar grava tudo de uma vez; só as categorias do formulário mudam; categoria excluída em outra aba é ignorada; "Ajustar valor" abre o mesmo formulário com o cursor na categoria. | Copy "Defina um valor para cada área"; um fluxo só, sem erro sem saída. |
| 80 | "Repetir o planejamento de {mês}" aparece quando o mês não tem planejado e o anterior tem; copia tudo do mês anterior, nunca sobrescreve; tocar duas vezes não duplica. | RF-24. |
| 81 | Excluir uma categoria leva o planejado dela para "Outros" no mesmo mês, somado ao que "Outros" já tinha (até o limite do app); apagar direto uma categoria com planejado é barrado pelo banco. | RN-27 e copy "Nada será apagado."; os gastos já vão para "Outros". |
| 82 | Seu mês ganha o bloco "Planejado" só no mês atual e só com planejado: abre com "Você ainda tem {valor} para {categoria} este mês." (categoria dentro ou perto com menos sobra; se todas passaram, "{Nome}: Passou {valor} do planejado.", texto novo), depois "Você está dentro do planejado em {n} de {total} categorias." e até 3 categorias, as mais usadas (gasto ÷ planejado), empate pelo maior planejado e depois o nome; "Ver planejamento". Some sem planejado. **Substituída pelo controlador:** o plano dizia que a frase da copy não aparecia; a copy tem prioridade. | RF-33 e protótipo Main/Desktop; conflitos 4 e 8; mesmo padrão das decisões 40 e 70. |
| 83 | No planejamento e nos relatórios, valores de reais inteiros aparecem sem ",00" ("R$ 890 de R$ 1.000"); com centavos, aparecem com centavos. O total planejado usa o formato completo. | Protótipo; nenhum número é arredondado. |
| 84 | Relatórios: Este mês, Mês passado, Últimos 3 meses (padrão, protótipo) e Personalizado ("De" e "Até", até 12 meses — cobre o ano inteiro). Período que não vale mostra "Escolha um período de até 12 meses." e os últimos 3 meses. | RF-40; Q2; conflito 6. |
| 85 | Ordem dos relatórios: "O que mudou" (frases), "Entrou e saiu" (gráfico, só com 2 ou mais meses), "Mês a mês" (entrou, saiu e guardado de cada mês, com "até agora" no mês atual) e "Para onde seu dinheiro vai" (soma do período). | RF-38, RF-39; conflito 3. |
| 86 | "O que mudou": resumo do último mês do período ("Em {mês}, entrou {valor} e saiu {valor}.") e até 3 categorias que mais mudaram em relação ao mês anterior a ele, com as frases da copy; as que não mudaram não aparecem. | Copy Relatórios; conflito 5. |
| 87 | Os números dos relatórios vêm das mesmas fórmulas do Seu mês (Entrou, Saiu, "Guardado este mês"/"Tirado das metas" e categorias); o guardado do mês aparece como "Guardado {valor}" ou "Tirado das metas {valor}". | RNF-11; RF-38. |
| 88 | Gráfico feito no próprio app (barras em CSS, sem biblioteca nova): verde para "Entrou" (com contorno para contraste) e grafite para "Saiu"; os números ficam numa tabela para leitor de tela e na lista "Mês a mês". Sem mini-gráficos (V6). | RNF-05, RNF-04; V6. |
| 89 | Relatórios vazios (texto da copy e "Anotar gasto") só quando a pessoa não tem nenhum registro confirmado nem movimento de meta; um período sem registros mostra os valores zerados. | Copy (estado vazio de Relatórios). |
| 90 | Menu lateral: Seu mês, Extrato, Contas, Planejamento, Metas, Cartões, Relatórios, Categorias, Configurações (protótipo Desktop; Família no Plano 7). Mais: Contas, Planejamento, Cartões, Relatórios, Categorias (protótipo Mais). A barra inferior não muda. | Etapa 3 §6/§7; decisões 42, 57 e 60. |
| 91 | Títulos e textos da copy que dizem "este mês" (título do planejamento, vazio, ajuda "O que é Planejado?") ficam iguais em qualquer mês; o mês aparece no seletor e em "Planejado para {mês}". | Copy sem variante por mês; conflito 9. |
| 92 | Nomes de mês: só o nome no ano atual ("setembro"), com o ano nos outros ("janeiro de 2027"); no gráfico com mais de 4 meses, o nome curto ("Jul"). | Protótipo; leitura rápida. |
| 93 | Os relatórios e o planejamento leem o histórico pela mesma leitura paginada do Seu mês; o planejado é lido só do mês mostrado e do anterior. | Decisão 10; nada de números diferentes entre telas. |

Decisões do controlador ao longo da execução:
- Decisão 78 substituída: "Quer ajustar o valor deste mês?" (copy) em vez de "Ajustar valor" (protótipo), em toda categoria que passou; a copy tem prioridade sobre o protótipo.
- Decisão 82 substituída: a frase "Você ainda tem {valor} para {categoria} este mês." abre o bloco "Planejado" do Seu mês. Texto novo para aprovação: "{Nome}: Passou {valor} do planejado." quando todas as categorias planejadas passaram.
- Para revisão (copy): em "O que mudou", a frase "…do que no mês passado" / "…em relação ao mês passado" aparece para qualquer período (inclusive "Mês passado" e períodos personalizados), sempre comparando com o mês anterior ao último do período; confirme se a redação deve variar.

## Textos novos usados (fora da copy oficial)

Aprovados antes: "Falta o seu nome.", "Falta a senha.", "Use até {n} caracteres.", "Escolha o dia.", "Crie uma nova senha.", "Salvar nova senha", "Voltar", formas de pagamento (Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma, Não informar).
Plano 2: "Somando banco, carteira e dinheiro guardado" (rótulo do saldo inicial, decisão 26) e "Passo {n} de 3" (rótulo acessível do onboarding); demais textos na seção "Textos novos" do plano `docs/superpowers/plans/2026-09-25-iris-plano-2-extrato-onboarding.md`.
Plano 3: "Com que frequência?" (rótulo do grupo Todo mês / Todo ano); prazos "vence hoje" · "vence amanhã" · "venceu em {dia de mês}" · "vence dia {d} · hoje" / "· amanhã" · "paga em {dia de mês}" · "previsto para {dia de mês}"; listas vazias "Nenhuma conta a pagar neste mês." · "Nenhuma conta paga neste mês." · "Nenhuma conta vencida." · "Nenhuma conta que se repete ainda." · "Nenhuma entrada prevista neste mês."; "Entradas que se repetem" (título) · "Situação das contas" (rótulo acessível das abas) · "Recebi {nome}" (rótulo acessível do link "Recebi") · "Marcar {conta} como paga" (rótulo acessível do botão "Paga"); "Nome" · "Valor" · "Vence dia" · "Chega dia" · "Mês" · "Salvar conta" · "Falta o nome." · "Escolha o mês." · "Conta criada."; "Encerrar" · "Encerrar "{nome}"?" · "As próximas não serão criadas. O que já foi pago continua no Extrato." · "Encerrada. O histórico continua no Extrato."; "Confirmar entrada"; "Resumo do mês" (rótulo acessível do resumo em Contas); nome padrão "Entrada" para entrada que se repete sem origem (já usado no Seu mês desde o Plano 1); ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-26-iris-plano-3-contas-recorrencias.md`.
Plano 4: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-27-iris-plano-4-parcelas-cartoes.md`.
Plano 5: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-28-iris-plano-5-metas.md`. Também: "A meta {meta} foi excluída. Este gasto continua no seu histórico, mas não pode ser editado nem excluído." (aviso no gasto pago com uma meta excluída).
Plano 6: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-29-iris-plano-6-planejamento-relatorios.md`. Também: "Quer ajustar o valor deste mês?" com o nome da categoria para leitor de tela (decisão 78) e "{Nome}: Passou {valor} do planejado." (abertura do bloco "Planejado" quando todas as categorias passaram).
