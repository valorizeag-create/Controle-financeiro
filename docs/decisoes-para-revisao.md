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

## Plano 7

| # | Decisão | Motivo |
|---|---|---|
| 94 | Família: nome de 1 a 40 caracteres, escolhido por quem cria (que passa a administrar); uma família por pessoa; até 10 participantes; só administrador e membro; o nome não muda nesta versão. | RF-41, RN-26, etapa-2 §6; nenhuma entrada sem limite. |
| 95 | Convite por link: só o administrador cria; vale 7 dias e serve para uma pessoa; o código (192 bits aleatórios) é gerado pelo banco, que guarda só o resumo; um link por vez (o novo cancela o anterior ainda não usado); o link aparece só na hora de criar ("Copiar link", "Compartilhar") e depois vira "Convite pendente · vale até {dia}", com "Cancelar convite"; todo convite que não vale mostra a mesma mensagem; quem entra é sempre membro; quem já participa de uma família não entra, e o convite não se gasta. E-mail e "Reenviar": Plano 8. | RF-42, RN-26; roteiro (e-mails no Plano 8); pedido de segurança; conflito 1. |
| 96 | Quem abre o link sem sessão vai para "Criar meu cadastro" ou "Entrar" e volta ao convite; a página do convite não é indexada e não repassa o endereço a outros sites. | RF-42 ("aceita após criar o cadastro ou entrar"). |
| 97 | A família vê só os gastos marcados da família (valor, dia, categoria, nota e quem registrou), as contas da família e as metas da família (total). Nunca cartão, forma de pagamento, parcela, entradas, Disponível, Saldo total, metas individuais nem a parte de outra pessoa. Quem sai ou é removido perde na hora todo o espaço da família, inclusive o histórico dos outros; continua com os próprios registros (os que eram da família seguem no histórico dela com o nome dele) e pode editá-los ou desmarcar "Gasto da família", mas não marcar nada novo. (interpretação — confirme) | RN-17, RN-23, RN-31, A4 B, etapa-3 §4; conflito 8. |
| 98 | "Gasto da família" fica em "Mais detalhes" do Anotar e na edição; só gasto; vale também para parcelado (todas as parcelas) e para conta que se repete (vira conta da família). Sai do Disponível de quem registrou; com cartão, conta no total do cartão dessa pessoa, e a família não vê o cartão. | RF-10, RN-18, RN-19, RN-31; decisão 50; protótipo Desktop-Anotar. |
| 99 | Categorias na família: as padrão somadas pela chave e mostradas com o nome padrão (Casa, Mercado…), mesmo que alguém as tenha renomeado; as criadas pela pessoa somadas pelo nome, sem diferenciar maiúsculas. | A3 A. |
| 100 | Seu mês → Família (seletor "Eu · Família", só para quem tem família): "Gastos da família em {mês}" com o valor inteiro de cada compra (a paga com meta da família conta uma vez), por pessoa ("Você", nome, "Ex-membro"), até 3 contas da família (só no mês atual), "Para onde vai o dinheiro da casa", até 2 metas da família e os 5 últimos gastos ("{dia} · por {quem}"); mesmas setas de mês. Sem "Ver todos" nos últimos gastos. | RF-35, RF-43, RN-22c; protótipo Mobile-Familia; conflito 5. |
| 101 | O administrador ajusta valor, dia e nota e exclui gasto da família de outra pessoa (ou de Ex-membro); a categoria continua a de quem registrou; parcelas e gastos pagos com meta ficam de fora; o Disponível de quem registrou muda. | RN-21, RF-44; categorias são de cada pessoa. |
| 102 | Conta da família: criada pelo Anotar ("É uma conta que se repete" + "Gasto da família") ou em Nova conta ("Conta da família"); aparece para todos em Família → Contas e no mês da família; enquanto não é paga, não entra no "Disponível depois das contas" nem em "Próximas contas" de ninguém; quem marca como paga fica com o gasto hoje, na categoria dele de mesma chave (ou mesmo nome; senão "Outros"), sem cartão (se quem paga é quem criou, é como em Contas, com o cartão). Alterar (nome, valor, dia) e encerrar: quem criou e o administrador. (interpretação — confirme) | RN-20, RN-03, A1, etapa-3 §4; conflito 4. |
| 103 | As contas da família aparecem quando qualquer membro abre o app. As contas que se repetem da família saem da lista pessoal de Contas e ficam em Família → Contas. | Etapa-3 §5; decisão 27. |
| 104 | Meta da família: qualquer membro cria ("Meta da família" em Criar meta); todos veem o total e só a própria parte ("Sua parte"); editar: quem criou e o administrador; guardar e tirar a própria parte: qualquer membro; usar e excluir: só o administrador. O Guardado de cada pessoa inclui a parte dela nas metas da família; o histórico da meta mostra só os próprios movimentos. | RF-25, RN-22, RN-22a, RN-22b, A4 B, A6 A. |
| 105 | Usar a meta da família: a parte paga pela meta é dividida na proporção do que cada um guardou (centavos que sobram para os maiores restos da divisão); a diferença sai do Disponível do administrador; a sobra fica com cada um, na mesma proporção, sem a pergunta "Devolver" (cada um tira a sua); o administrador pode desfazer o uso. (interpretação — confirme) | RN-22b, RN-22c, RN-15b, decisão 66; conflito 3. |
| 106 | Excluir a meta da família: só o administrador; a parte de cada pessoa volta hoje para o Disponível dela, como "Tirado da meta"; os meses anteriores não mudam. | A6 A, decisão 67. |
| 107 | Sair: a parte nas metas da família volta hoje para o Disponível de quem sai; as contas da família que ela criou são encerradas e as ainda não pagas dela saem; o administrador com outras pessoas passa a administração antes ("Tornar administrador"); sozinho, sair encerra a família. Remover (só o administrador, nunca a si mesmo) faz o mesmo com a parte de quem é removido. Quem saiu pode voltar por um convite novo. | RN-22d, RN-25, RF-44, RF-45. |
| 108 | Avisos da família, em Família (os 5 mais recentes): "{nome} saiu da família, e {valor} da meta {meta} voltaram para {nome}." (um por meta; também na remoção) ou "{nome} saiu da família."; na exclusão de cadastro, "Um membro saiu da família, e a meta {meta} foi atualizada." ou "Um membro saiu da família.". Push e e-mail: Plano 8. | RN-22d, RN-22e. |
| 109 | Excluir o cadastro já vale no banco (a tela é do Plano 9): gastos da família ficam como "Ex-membro", sem nome, com a categoria guardada; contas da família não pagas saem; a parte nas metas da família sai (elas diminuem); a parte já usada numa compra da família fica na compra; o administrador que exclui o cadastro passa o papel para quem participa há mais tempo; sozinho, a família é encerrada. | RN-22e, RN-24, RN-25. |
| 110 | Família no menu lateral e em Mais, depois de Relatórios; em Mais, o nome da família sob o nome da pessoa. | Protótipos Desktop e Mais; decisão 90. |
| 111 | A família lê e grava só por funções do banco que conferem quem pede, a família e o papel; as tabelas pessoais continuam só do dono (nenhuma regra de privacidade anterior foi afrouxada). | RNF-06; pedido de segurança. |

**Para você confirmar (interpretações):**
- **97**: quem saiu ou foi removido ainda pode editar, ou desmarcar "Gasto da família", dos gastos que registrou enquanto participava (eles seguem no histórico dela com o nome dele), mas não marca nada novo como da família.
- **102**: conta da família ainda não paga não entra no "Disponível depois das contas" nem em "Próximas contas" de ninguém; só quem a paga fica com o gasto (RN-03 x RN-20).
- **105**: ao usar uma meta da família, cada pessoa fica com a sobra da própria parte e a pergunta "Devolver" não existe (RN-15b x RN-22c); cada um tira a sua.
- **Convite só por link** até o Plano 8 (a especificação fala em e-mail ou link; o protótipo mostra e-mail e "Reenviar").

Decisões do controlador ao longo da execução:
- **Revisão de segurança antes de implementar (1 crítico e 6 importantes, todos corrigidos).** Uma revisão independente do SQL do plano achou: (C1) desfazer o uso de uma meta da família depois que alguém saiu devolvia a parte de quem saiu e deixava a meta sem poder ser usada nem excluída, mudando o mês de quem já tinha saído; (I1) a saída não travava as metas da família, e um depósito feito no mesmo instante podia ficar preso com quem saiu; (I2) depois de sair ou ser removida, a pessoa ainda podia ter os registros pessoais editados ou apagados pelo administrador; (I3) quem saiu podia, por registros antigos, criar contas a pagar para a família ou reabrir contas encerradas, derrubando a geração de contas dos outros; (I4) passar a administração e remover alguém ao mesmo tempo podia deixar a família sem administrador; (I5) faltavam testes que provassem casos negativos do pedido de segurança (convites, acesso sem entrar, transferência); (I6) qualquer membro podia criar por gravação direta uma "conta da família" com valor qualquer para outro pagar. Correções: travas na ordem certa, conferência da participação depois da trava, um único administrador garantido no fim da transação, ex-membro sem acesso, conta da família só nascendo de um molde guardado, e testes de banco para cada caso.
- **Resposta de erro que revelava a parte dos outros (A4 B)**, achado na revisão do Task 4: gravar direto um movimento de meta em nome de outro membro devolvia erros diferentes conforme o saldo dele; agora é sempre a mesma mensagem.
- **Impasse entre duas gravações simultâneas (Task 5):** a ordem das travas entre gerar contas da família e sair foi corrigida; ainda existem casos raros de impasse (código 40P01, sem dano, tentar de novo resolve), descritos no cabeçalho da seção 4 da migração. A tela mostra a mensagem calma de tentar de novo.
- **Ao sair, as parcelas FUTURAS de quem saiu deixam a família**, em tensão com RN-23 ("os gastos continuam no histórico"): parcela futura ainda não é histórico, e isso impede que ex-membro escreva dentro da família (I3). As parcelas já lançadas continuam na família com o nome.
- **Quando a família termina porque a última pessoa excluiu o cadastro, os gastos da família dela são apagados:** não sobra família para guardar "Ex-membro", e guardar seria reter dados sem necessidade.
- **Sem aviso quando a última pessoa sai:** não há mais quem leia.
- **O aviso "saiu da família" de quem excluiu o cadastro vira "Um membro saiu da família"** (`member_deleted`): o nome da pessoa não pode sobreviver à exclusão (RN-24).
- **A marca "da família" só em gasto novo ou confirmado:** nunca numa ocorrência pessoal ainda pendente e nunca num gasto pago com meta pessoal (esse gasto seria apagado, em vez de virar "Ex-membro", se o cadastro fosse excluído).
- **Um gasto só sai da família por escolha explícita:** ao editar, a tela manda um marcador junto com a caixa "Gasto da família"; sem o marcador, a família do gasto não muda.
- **O código do convite viaja no endereço durante o entrar/criar cadastro** (`?next=` e, no login com Google, na volta do provedor); o código vale uma vez e por 7 dias, e a página do convite não é indexada nem repassa o endereço. Alternativa futura: guardar o retorno num cookie curto.
- **A lista de participantes lê `family_members` pela política do banco** (só a própria família; nomes e papéis, sem dinheiro): exceção consciente à regra "só por funções do banco".
- **Desfazer o uso de uma meta da família** que envolve alguém que saiu é recusado pelo banco; como a mesma resposta vale para toque duplo, o texto é neutro ("Este uso não pode mais ser desfeito.").
- **Revisão final: "ajustar" só onde o banco deixa.** As leituras dos gastos da família passaram a devolver um sim/não (`can_adjust`) dizendo se quem pede pode ajustar aquele gasto, com as mesmas condições das funções de ajuste do administrador (decisão 101): administra a família, o gasto não é parcela nem foi pago com meta, e é de quem ainda participa (ou histórico sem dono). Não revela nada novo: é sobre uma linha que a pessoa já vê, e para quem não administra é sempre "não". Sem o "sim", o link de ajuste não aparece e a tela de ajuste não abre.
- **Revisão final: o aviso verde também aparece quando a ação volta para a mesma tela.** O aviso passou a acompanhar o próprio cookie (na hora em que muda e por uma conferida a cada meio segundo com a aba visível), além da troca de tela. Continua texto simples, some em 4 segundos, é apagado ao ser lido e aparece uma vez só.
- **Revisão final: limitação conhecida.** Depois de passar a administração, o novo administrador sem parte numa meta da família não vê nem desfaz os usos feitos pelo anterior; corrigir pede uma função nova do banco (decisão de segurança à parte), adiada. Nenhum valor fica errado.

## Plano 8

Decisões 112 a 136 como ficaram depois da revisão de segurança do SQL (ela alterou as decisões 129, 130, 133 e 134 e o conflito 15 do plano; as alterações estão marcadas em cada linha).

| # | Decisão | Motivo |
|---|---|---|
| 112 | Manifest: nome e nome curto "Íris", abre em "Seu mês" (`/inicio`), tela cheia sem barra do navegador, cores do fundo do app (`#F8F8F8`); ícones do logo provisório em 192 e 512, versões adaptáveis (fundo verde de ponta a ponta) e ícone do iPhone. O ícone padrão do modelo do Next sai. | RNF-03; decisão 11; tokens da etapa 5. |
| 113 | O service worker não guarda nenhuma tela, dado ou arquivo do app: só a página "Sem conexão" e um ícone. Por isso atualiza direto, sem perguntar. | Dado financeiro nunca velho nem de outra pessoa no mesmo aparelho; offline está fora da v1. |
| 114 | Sem rede: faixa "Sem conexão no momento. Assim que voltar, a gente tenta de novo." em qualquer tela aberta, e uma página estática com o mesmo texto e "Tentar de novo" quando a navegação falha. Nada é anotado sem rede. | RNF-09; etapa-2 §6. |
| 115 | "Instalar a Íris": tela do onboarding entre o saldo inicial e o primeiro gasto (pulada se a Íris já está na tela de início) e em Configurações → App. O botão "Adicionar à tela de início" aparece só onde o navegador oferece a instalação; no iPhone, a instrução do protótipo; nos outros, a instrução pelo menu. "Agora não" sempre disponível. | RF-07; etapa-3 §6; protótipo `Instalar`; conflito 11. |
| 116 | A permissão de notificação só é pedida quando a pessoa toca em "Ativar lembretes": em Configurações → Lembretes e num cartão em Contas (para quem tem contas e ainda não decidiu; "Agora não" esconde o cartão naquele navegador). No iPhone fora da tela de início, a Íris explica que é preciso adicionar antes. | RF-08. |
| 117 | Inscrição por aparelho: guarda só o endereço e as duas chaves do navegador (sem nome nem modelo do aparelho); ninguém lê pela API; um aparelho = uma pessoa (quem ativa por último fica; abrir o app com a inscrição de outra pessoa a apaga); sair da Íris desativa naquele aparelho; até 10 aparelhos por pessoa; some com o cadastro. | LGPD; pedido de segurança; conflito 8. |
| 118 | Oito chaves em Lembretes: Contas perto do vencimento, Entradas a receber, Planejado quase no limite, Meta perto de ser concluída, Resumo do mês, Depois de alguns dias sem registro, Avisos da família (só para quem tem família) e Lembrete para anotar. Todas ligadas por padrão, menos a última. Desligar vale para push e e-mail daquele tipo. | RF-47, RF-50; protótipo `Configuracoes`; conflito 4. |
| 119 | Horários (Brasília): 9h para contas, entradas, retomada e resumo; 21h para o lembrete para anotar. (interpretação — confirme) | A8; protótipo "Todo dia às 21h"; conflito 2. |
| 120 | Contas: aviso na véspera ("vence amanhã") e no dia ("Hoje é o dia de…"). Conta vencida não gera aviso. Conta da família avisa todos que participam. Conta do dia 1 só tem o aviso do dia. | RF-46; copy; RN-20; decisão 27; tom calmo. |
| 121 | Entrada a receber: no dia previsto, "Hoje é o dia de receber {entrada}.", abrindo Contas. (texto novo — confirme) | RF-46; conflito 3. |
| 122 | Planejado quase no limite: quando, depois de um gasto, uma categoria fica "perto do limite" (de 90% a 100%, decisão 77) no mês atual; uma vez por categoria por mês. Passar do planejado não gera push. Só há aviso se o mês tem planejamento. | Etapa-3 §5; RNF-11; copy (sem alarme). |
| 123 | Meta perto: quando, depois de guardar, falta até um décimo do valor (e a meta não está completa); uma vez por meta por mês. Na meta da família avisa todos, só com o total. Na hora do envio o banco confere de novo que a meta ainda está perto (uma retirada ou a saída de um membro no meio do caminho cancela o aviso). | Etapa-3 §5; A4 B. |
| 124 | Retomada: quando o último registro foi há 5 dias (até 30), uma vez por intervalo; quem nunca registrou não recebe; quem voltou a registrar antes do envio também não. | RF-48; etapa-3 §5 (quantidade de dias em aberto). |
| 125 | Lembrete para anotar: só para quem ligou, e só nos dias em que ainda não anotou nada. | RF-47; não lembrar quem já fez. |
| 126 | Resumo do mês: dia 1 às 9h, para quem teve algum registro no mês que fechou; push e e-mail com "Seu mês de {mês} está fechado. Quer ver como foi?" e o caminho para Relatórios → Mês passado. O e-mail não traz valores. (interpretação — confirme) | RF-46, RF-49; conflito 6. |
| 127 | Tocar num aviso abre só destinos de uma lista fixa (Seu mês, Anotar, Contas, Família, Planejamento, a meta, Relatórios), conferida no servidor e de novo no service worker. "Marcar como paga" no aviso abre a confirmação na Íris; nada é pago sem confirmar, e quem toca sem ter entrado volta à confirmação depois de entrar. | RF-16; pedido de segurança; conflito 10. |
| 128 | Avisos da família (alguém saiu; cadastro excluído) também chegam por push a quem continua, com as mesmas frases da decisão 108. Sem e-mail. | RN-22d, RN-22e; pendência do Plano 7. |
| 129 | **Alterada pela revisão de segurança.** Convite por e-mail: o administrador digita o e-mail e a Íris envia o link (mesmas regras do link: 7 dias, uma pessoa, um por vez). O pendente mostra o e-mail, "Convite enviado · aguardando", "Reenviar" e "Cancelar convite". O e-mail fica guardado só enquanto o convite está pendente e só o administrador vê. **Limites** (qualquer um recusa com a mesma mensagem, sem dizer qual): 5 por dia por família ou por pessoa que convida (somados, então recriar a família não zera), 3 por endereço em 7 dias somando todas as famílias, e 100 por dia no total do app. **O assunto é sempre o mesmo e sem nome de ninguém**; os nomes só aparecem no corpo, entre aspas, e se parecem link, endereço, e-mail ou número longo são trocados por "uma família". A Íris não diz se o e-mail já tem cadastro. Se o e-mail não sair (inclusive sem servidor de e-mail configurado), a pessoa recebe o link para enviar. O convite por link continua. | RF-42; protótipo `Familia`; LGPD; decisão 95; revisão de segurança C2. |
| 130 | **Alterada.** Agendador: `pg_cron` do Supabase (gratuito), com **cinco** tarefas: 00h05 (contas), 00h15 (limpeza, separada para que um erro nela não desfaça as contas do dia), 9h, 21h e a entrega a cada 10 minutos (só chama o app quando há algo na fila). Escolhido em vez das funções agendadas da Netlify porque roda e é testado localmente, sem publicar nada; a tarefa das contas é SQL puro e não depende de rede; e há um agendador só. A rota do app é neutra: outro agendador pode chamá-la no futuro. | Pedido do projeto (gratuito, local, sem deploy); etapa-2 §5; revisão de segurança (M5). |
| 131 | As contas do mês nascem pela tarefa das 00h05 e, como antes, ao abrir o app. O marcador "até que mês já gerou" deixa de ser alterável pela API. | Etapa-3 §5; pendências do Plano 3. |
| 132 | E-mail por SMTP, atrás de uma interface: local = caixa de e-mail do Supabase local; produção = qualquer provedor SMTP (sempre cifrado fora da máquina local). O e-mail de recuperação de senha continua sendo enviado pelo Supabase, com modelo próprio da Íris. E-mails em HTML simples e em texto, sem imagem nem rastreio. | Pedido do projeto; RF-49. |
| 133 | **Substituída pela revisão de segurança (no plano: "a chave de serviço é usada no app só pela rota da tarefa").** O app **não usa a chave de serviço em lugar nenhum** e ela não vai para a Netlify (`SUPABASE_SECRET_KEY` fica só para testes de banco, e2e e scripts locais; um teste confere que nenhum arquivo do app a cita). A rota da tarefa usa a chave pública e chama funções do banco que exigem o segredo da tarefa (`JOB_SECRET`) e devolvem só o que a entrega precisa. O banco guarda só o resumo (SHA-256) do segredo. Quem chama a rota (o agendador do banco) leva um código de disparo derivado do segredo, do qual não se volta ao segredo e que só pede à rota para entregar um lote. A rota compara em tempo constante, ignora sessão e cookies e responde só números (401 sem o código, 503 se a tarefa não estiver configurada). | Pedido de segurança; revisão de segurança C1 e I2; conflito 15 (alterado). |
| 134 | **Ampliada.** A fila guarda só o tipo e uma referência; o texto é montado no envio, depois de o banco conferir de novo a chave e se quem recebe ainda pode ver aquilo. Cada pedaço de entrega leva um número de lote; cada linha é encerrada logo depois de enviada, push e e-mail separadamente, e um canal que já saiu não se repete na nova tentativa. Até 3 tentativas, com 15 minutos entre elas; o que não saiu em 2 dias é abandonado; linhas com mais de 90 dias são apagadas. A entrega respeita um orçamento de tempo (cerca de 6 segundos enviando) e nunca deixa uma linha pega sem encerrar. | LGPD; Review Focus 2 e 5; revisão de segurança I1, I3 e I4. |
| 135 | Não há tela de avisos dentro do app nesta versão. (interpretação — confirme) | Etapa-3 §6 e protótipo não têm; conflito 9. |
| 136 | O servidor só envia push para serviços conhecidos (Google, Mozilla, Apple, Microsoft), por HTTPS, sem porta nem usuário no endereço; a mesma lista vale no banco, que recusa outros endereços ao salvar; o aviso viaja cifrado até o navegador; o título é sempre "Íris". | Review Focus 3; protótipo "Notificação no celular"; revisão de segurança M1. |

**Conflitos com a especificação resolvidos neste plano** (os que pedem sua atenção; a lista completa está no plano): 2 (lembretes às 9h × protótipo "Todo dia às 21h" → decisão 119); 3 (RF-46 lista "entrada a receber", a copy não tem a frase → decisão 121); 6 (resumo "push + e-mail" × copy com valores → e-mail sem valores, decisão 126); 9 (estado vazio "Tudo tranquilo por aqui." supõe uma tela de avisos que não existe → decisão 135); **15 (alterado pela revisão de segurança):** o plano dizia que a chave de serviço passaria a ser usada no servidor por um módulo só, na rota da tarefa; agora a regra "`SUPABASE_SECRET_KEY` nunca no código do app" continua valendo sem exceção (decisão 133).

**Para você confirmar (interpretações):**
- **119**: tudo às 9h (A8), menos o "Lembrete para anotar", às 21h, como no protótipo aprovado depois de A8; às 9h a pergunta "Teve algum gasto hoje?" não faria sentido.
- **121**: o aviso de entrada a receber é texto novo ("Hoje é o dia de receber {entrada}.").
- **126**: o e-mail do resumo do mês não traz valores (e-mail é canal menos privado, e recalcular o mês fora da sessão da pessoa abriria uma segunda porta para os números); o push traz só a frase e leva para Relatórios.
- **135**: sem tela de avisos dentro do app.
- **O assunto do e-mail de convite é fixo** ("Você recebeu um convite na Íris") e os nomes entram só no corpo, entre aspas ("“Camila” convidou você…"). Citar o nome entre aspas soa um pouco formal; uma alternativa é citar só o nome da família.
- **O convite por e-mail não fica preso ao endereço digitado** (M9): como o convite por link, vale para quem tiver o link (uso único, 7 dias). Um endereço digitado errado dá a um desconhecido um link que funciona. Prender ao endereço é uma troca de uma função do banco e de um teste, se você quiser.

**Limites conhecidos, aceitos (para registro):**
- O limite de 100 convites por e-mail por dia, no total do app, pode ser esgotado por cerca de 20 contas; o convite por link continua funcionando.
- A recusa por endereço (3 convites em 7 dias, somando todas as famílias) diz a um administrador que aquele endereço foi convidado por outras famílias 3 vezes na semana. Não diz se o endereço tem cadastro.
- O resumo por e-mail é entregue "pelo menos uma vez": se a Íris enviar e o banco não registrar a confirmação, o mesmo resumo pode chegar duas vezes (raro; no push o aviso novo substitui o antigo).
- O banco guarda um resumo (SHA-256, sem sal) do endereço convidado por 7 dias, mesmo se o convite for cancelado, para que cancelar não zere o limite. Ninguém o lê pela API. A política de privacidade (Plano 9) precisa citar.
- O código de disparo continua valendo até o `JOB_SECRET` ser trocado; tudo que ele permite é pedir à rota que entregue um lote.
- Quem tiver o `JOB_SECRET` pode pegar linhas da fila (endereços de push, chaves e e-mails do resumo), encerrar as que pegou e disparar as três tarefas: é a capacidade que a rota precisa e é bem menor que a da chave de serviço, mas é o segredo mais sensível do app depois da senha do banco.

Decisões do controlador ao longo da execução:
- **Revisão de segurança antes de implementar (2 críticos e 6 importantes, todos corrigidos).** Uma revisão independente do SQL do plano achou: (C1) a rota da tarefa precisaria da chave de serviço do Supabase na Netlify, uma chave que abre todos os dados de todas as pessoas, quando só precisava de três operações; (C2) o convite por e-mail virava um canal aberto para mandar e-mail com a marca da Íris a qualquer endereço, porque o limite era por família (e dava para recriar a família) e o assunto levava texto escolhido por quem convida; (I1) a entrega só encerrava as linhas no fim, então um corte por tempo mandava tudo de novo, até três vezes; (I2) o segredo guardado e enviado em texto recuperável podia vazar com um endereço digitado errado; (I3) a função de encerrar podia marcar qualquer linha como enviada e apagar qualquer inscrição; (I4) a função de pegar o lote devolvia mais que o necessário e podia estourar o tempo; (I5) faltavam testes que provassem os casos negativos do pedido de segurança; (I6) vários arquivos do plano ainda carregavam a chave de serviço. Correções: nenhuma chave de serviço no app (funções do banco protegidas por segredo, que o banco só conhece pelo resumo, com um código de disparo derivado no caminho do agendador); limites por pessoa, por endereço e no total, e assunto fixo; número de lote, encerramento por linha e por canal, orçamento de tempo; trava do endereço convidado entre famílias; testes de banco para cada caso. Junto, foram aplicados os menores baratos: lista de serviços de push também no banco, aviso de família sem revelar quantos aparelhos existem, limpeza separada das contas, limpeza do histórico do agendador, pausa do agendador durante os testes de banco, e as conferências de "retomada" e "meta perto" na hora do envio.
- **Rota da tarefa: 401 e 503, não 404.** O plano mandava responder 404 a quem não tem o segredo; a rota responde 401 (igual para ausente e errado) e 503 quando `JOB_SECRET` não está configurado (só revela que a tarefa está desligada).
- **Entrega "pelo menos uma vez"** aceita (ver limites acima).
- **Convite por e-mail: depois de criado o convite, nenhuma falha vira erro.** Se o envio falha, a pessoa recebe o link e o aviso calmo (nunca um erro que convide a tentar de novo e gaste o limite). O mesmo aviso vale para "e-mail não configurado" e para "falhou", para não revelar se o envio funcionou.
- **A tarefa só chama endereços https** (ou a própria máquina, em desenvolvimento), e o banco só aceita esses endereços para a rota.
- **Avisos de planejado e de meta saem depois da resposta** (`after()`), sem atrasar a pessoa; a entrega acontece na próxima passada da fila (até 10 minutos).
- **`job_set_paused`** (pausar o agendador) é uma função de produção usada pelos testes de banco; só o papel de serviço a chama e também serve de chave de emergência.
- **Revisão da Task 11:** o botão do aviso "Marcar como paga" abre uma confirmação que não existia no servidor (a página quebrava ao renderizar com o painel aberto) e não aparecia para conta vencida; ambos corrigidos, com testes das duas páginas com o destino do aviso.

## Plano 9

Decisões 137 a 156 como ficaram depois da execução e das revisões (as alterações estão marcadas em cada linha). Os textos jurídicos e as decisões de hospedagem pedem a sua revisão antes do lançamento.

| # | Decisão | Motivo |
|---|---|---|
| 137 | Baixar meus dados gera **um arquivo CSV só, em blocos** (Cadastro, Registros, Contas e entradas que se repetem, Compras parceladas, Cartões, Metas, Movimentos das metas, Planejamento, Categorias, Lembretes, Família). Separador ponto e vírgula, UTF-8 com a marca que o Excel reconhece, datas `dd/mm/aaaa`, valores `1234,56`. Nome: `iris-meus-dados-AAAA-MM-DD.csv`. (interpretação — confirme) | A7 A; RF-52; abre direto no Excel em português; sem dependência nova. |
| 138 | O arquivo traz só o que é da pessoa, inclusive as contas da família que ela criou e a parte dela nas metas da família. **Não traz**: nada de outros participantes, endereços técnicos dos aparelhos (push), a fila de avisos, e-mails de convidados nem identificadores internos. *Alterada na execução:* os registros também trazem quando foram pagos, a forma de pagamento, a parcela (n de N) e a compra parcelada a que pertencem; as contas que se repetem trazem a nota e como se paga. Também **não traz** (a página e a política dizem o que traz): as famílias de que a pessoa já saiu, se algum aparelho recebe avisos, o histórico de avisos enviados, os convites que ela criou, a data em que concluiu o onboarding e a data de uso das metas. | RN-17; LGPD; pendência do Plano 8. |
| 139 | Toda célula de texto vai entre aspas; a que começaria com `=`, `+`, `-`, `@` ou tabulação ganha um apóstrofo; quebra de linha vira espaço. | Uma nota como "=1+1" não pode virar fórmula na planilha de ninguém. |
| 140 | O download é um link simples (sem pré-carregamento), só com sessão, nunca guardado (navegador, intermediários, service worker), enviado em partes. Falha no meio interrompe o download, com uma mensagem genérica; pedido vindo de outro site não baixa nada. *Alterada na execução:* a sessão é lida antes de começar a enviar (lida durante o envio, o servidor perdia o acesso e o arquivo saía vazio). | Review Focus 3; decisão 113. |
| 141 | Excluir o cadastro **sem chave de serviço**: função do banco `delete_my_account()`, sem parâmetro, que só enxerga quem chama, apaga a linha de `auth.users` e deixa a cascata e a regra da família (Plano 7) agirem. A migração para ao ser aplicada se o banco não permitir isso. *Alterada na execução:* a conferência na aplicação é mais rígida (também `audit_log_entries`, `flow_state`, `auth.uid()`/`auth.jwt()` e a segurança por linha ligada para o dono da função) e a função confere de novo ao rodar, para "não achei" nunca ser confundido com "já excluído"; só o papel `authenticated` executa. | Decisão 133; pedido de segurança. |
| 142 | **Entrada recente = sessão criada há no máximo 15 minutos**, conferida dentro do banco pela sessão que vem no token (sessão encerrada não vale). Quem está com a sessão mais antiga vê "Por segurança, saia e entre de novo antes de…", com o botão "Sair da Íris" — o mesmo padrão da troca de senha (decisão 23) — e serve igual para quem entra com senha ou com o Google. Vale para excluir o cadastro (no banco) e para trocar o e-mail (na ação). Renovar o token não renova a entrada; um link de recuperação aberto a partir do e-mail cria sessão e conta como entrada. (interpretação — confirme) | Decisões 9 e 23; Review Focus 5. |
| 143 | Depois de excluir: a sessão termina naquele aparelho, a página pública "Seu cadastro foi excluído." aparece, e o navegador apaga a inscrição de lembretes e o que a Íris guardou nele. Outros aparelhos caem em "Entrar" na próxima tela. *Alterada na execução:* a limpeza do navegador roda na própria página "Seu cadastro foi excluído." (a sessão já não existe no servidor) e uma pessoa que ainda tem sessão é levada ao início em vez de ver essa página. | RF-53; LGPD; decisão 117. |
| 144 | Tela de exclusão: quem não deixa nada vê o texto da copy; quem tem gastos numa família que continua vê o texto do RF-53 e "Isso não pode ser desfeito."; com parte nas metas da família, "Sua parte nas metas da família ({valor}) também sairá delas." (soma das partes positivas nas metas ativas); administradora com outras pessoas: "A administração da família passa para quem participa há mais tempo." (texto novo). Sem vermelho e sem ícone de alerta. *Alterada na execução:* a exclusão da administradora **não é bloqueada** (nem exige passar a administração antes): o papel passa sozinho a quem participa há mais tempo, como já fazia o banco desde o Plano 7 (decisão 109), e a tela avisa. Quem teve gastos numa família que depois terminou também vê o texto do RF-53 (conservador). (interpretação — confirme) | RF-53, RN-22e, RN-25, decisão 109; V5; conflito 2. |
| 145 | Dois toques ou duas abas: a segunda chamada encontra o cadastro já excluído e termina igual, sem erro. Impasse no banco (40P01): uma nova tentativa, só nesse caso. *Alterada na execução:* as duas chamadas ao mesmo tempo foram examinadas no banco (a segunda não confunde "já excluído" com "entrada antiga"). | Review Focus 1; pendência do Plano 7. |
| 146 | **Família encerrada não guarda o nome**: vira "Família encerrada" na hora, por qualquer caminho. Quando a exclusão do cadastro deixa uma família encerrada sem nada de outra pessoa, o que sobrou dela (participações anônimas, convites, avisos, metas sem movimento e a própria família) é apagado. Se ainda há algo de quem saiu antes e continua com cadastro, a linha fica, sem nome, até essa pessoa também excluir. *Ampliada na execução:* se ninguém com cadastro participa mais, nenhum gasto da família tem dono, não há conta que se repete e nenhum movimento de meta tem dono, a varredura apaga também o que restava sem dono (gastos, partes usadas, metas e a família). (interpretação — confirme) | Pendência do Plano 7; LGPD (não guardar sem necessidade). |
| 147 | O que fica depois da exclusão é só o histórico sem nome de uma família que continua (RN-24, decisão 109) e, por até 7 dias, um convite pendente que outra família tenha enviado para aquele e-mail e o resumo (SHA-256) desse endereço no registro dos limites de convite. | RN-24; decisão 129. |
| 148 | `account_leftovers` (só o papel de serviço): diz onde ainda existe algo de um cadastro. Os testes a usam para provar a exclusão, e você pode usá-la no banco hospedado para conferir um pedido de exclusão. Ela não vê o que o dono da função não consegue ler e não confere `storage` (o app não usa). | LGPD; prova da exclusão. |
| 149 | A exclusão também apaga os rastros da pessoa no serviço de login que não saem sozinhos (registro de acessos e pedidos de login em andamento) e trava todas as famílias da pessoa, em ordem, antes de apagar. | LGPD; duas exclusões ao mesmo tempo. |
| 150 | Trocar e-mail: pedido em Configurações → E-mail; o Supabase envia um link ao endereço atual e outro ao novo, e a troca só vale com os dois. A tela responde sempre a mesma frase. O link abre uma página com botão (abrir o link não confirma nada) e confirmar não inicia sessão em quem confirma. *Alterada na revisão:* **sai** "Uma troca pendente aparece na tela" (recarregar a tela revelaria se o endereço tinha cadastro). Falha de rede, do servidor ou da sessão ao pedir mostra o aviso calmo de erro, nunca "enviado"; falha passageira ao confirmar mostra o aviso de erro e mantém o link. (interpretação — confirme) | RF-51; decisão 22; Review Focus 4. |
| 151 | Quem entra só com o Google vê o e-mail apenas para leitura. (interpretação — confirme) | Conflito 5. |
| 152 | Modelos de e-mail do Supabase Auth em português para a troca de e-mail e para a confirmação de cadastro (este fica pronto; a confirmação continua desligada). | Pendência do Plano 8. |
| 153 | No ambiente local, o limite de e-mails do Supabase Auth sobe de 2 para 20 por hora. No projeto hospedado o limite é o do painel. | Cada troca envia dois e-mails; os testes precisam de mais de um. |
| 154 | Termos e Política: páginas públicas, texto num arquivo só, em rascunho com aviso visível (que diz que a revisão é do responsável e de um advogado) e sem indexação até você preencher o responsável, o contato, o provedor de e-mail e a data da revisão; enquanto isso, cada campo vazio aparece marcado "[a definir antes do lançamento]". Nenhum nome, CNPJ, endereço ou e-mail foi inventado. | RF-54; RNF-07; texto jurídico pede revisão. |
| 155 | Concordância: a frase da copy no cadastro ("Ao criar seu cadastro, você concorda com…"), agora também em "Entrar" (o Google cria cadastro por lá). Sem caixa de marcar e sem registrar a versão aceita. (interpretação — confirme) | Copy; os requisitos não pedem caixa. |
| 156 | Supabase Pro e domínio próprio ficam só documentados, com o que cada escolha muda. | Pedido do projeto; etapa-2 §5. |

**Conflitos encontrados na especificação** (do plano; os de número 1 a 3 pedem a sua decisão)
1. **Copy "Excluir sua conta" / "Excluir minha conta · Manter minha conta" / "Sua conta foi excluída." × terminologia fixa (etapa-2 §1.1: "conta" só para conta a pagar).** Vale a terminologia, como desde o Plano 1 ("Criar meu cadastro"): "Excluir seu cadastro", "Excluir meu cadastro · Manter meu cadastro", "Seu cadastro foi excluído. Obrigado por ter usado a Íris.". **Confirme.**
2. **Copy "Todos os seus dados serão apagados de forma permanente…" × RF-53 e RN-24 (os gastos da família continuam no histórico dela, sem o nome).** Para quem tem gastos numa família que continua, "todos" não é verdade. Decisão 144: o texto da copy aparece só para quem não deixa nada; o texto aprovado do RF-53, seguido de "Isso não pode ser desfeito.", para quem deixa gastos na família. **Confirme.**
3. **RNF-07 "dados no Brasil (região São Paulo)" × Netlify.** O banco fica em São Paulo, mas as páginas e as ações do servidor passam pela hospedagem da Netlify, que pode rodar fora do Brasil. A política diz isso com todas as letras; se a exigência for "nada fora do Brasil", é uma decisão de hospedagem que só você pode tomar. **Precisa da sua decisão antes do lançamento.**
4. **"A Íris nunca diz se um endereço tem cadastro" × Supabase Auth.** O serviço responde `email_exists` a quem pede a troca; a tela esconde (mesma resposta), mas quem chama a API direto, com a própria sessão, vê. Limite conhecido, registrado. O cadastro por e-mail tem o mesmo comportamento desde o Plano 1 ("Esse e-mail já tem um cadastro. Quer entrar?", da copy).
5. **RF-51 "editar e-mail" × quem entra com o Google.** Trocar o e-mail de um cadastro sem senha deixaria o e-mail da Íris diferente do e-mail do Google, sem ganho. A troca só é oferecida a cadastros com senha (decisão 151).
6. **A7 A "CSV" × "todos os dados" (tabelas diferentes).** Um arquivo só, em blocos, em vez de vários arquivos compactados (decisão 137).
7. **Copy "Nunca 'Enviar'" × botão "Enviar link".** A própria copy usa "Enviar link" na recuperação de senha; reaproveitado.
8. **Etapa-2 §5 "Supabase Pro no lançamento" × regra "só planos gratuitos, nada contratado".** O plano só documenta; a decisão e a contratação são suas.
9. **Copy da landing, seção 8: "Você pode exportar ou excluir tudo quando quiser." × RN-24.** "Excluir tudo" tem a mesma tensão do conflito 2; fica para o Plano 10 decidir a frase.
10. **Etapa-3 §6 lista "exportar, excluir cadastro" dentro de Configurações × telas próprias.** São páginas sob `/configuracoes/…`, no mesmo padrão de "Nome" e "Saldo inicial".
11. **README "Antes de publicar (Plano 8)" × lista de lançamento do Plano 9.** A seção foi renomeada para "Lista de lançamento: o que depende de você" e continua a numeração; nenhum item do Plano 8 saiu.
12. **Copy "Rodapé do cadastro" só na tela de cadastro × "Continuar com o Google" na tela de entrar, que também cria cadastro.** A mesma frase aprovada aparece nas duas telas (decisão 155).

**Decisões do controlador ao longo da execução:**
- **RNF-07 aceito como decisão sua, dita com franqueza.** O banco fica em São Paulo; o código das páginas na Netlify pode rodar fora do Brasil. A Política de privacidade diz isso e que a forma de tratar a transferência está em definição pelo responsável. Custo se a decisão for outra: mudar de hospedagem ou reescrever esse trecho.
- **"Cadastro", não "conta", nos textos de exclusão** (a terminologia aprovada no Plano 2 vale mais que a copy).
- **"Todos os seus dados serão apagados…" só quando nada fica.** Para quem deixa gastos numa família, o texto do RF-53.
- **Entrada recente = 15 minutos** desde que a sessão foi criada; quem entrou só com o Google não troca o e-mail (a troca nem é oferecida), mas exclui o cadastro normalmente.
- **A administradora que exclui o cadastro** não precisa passar o papel antes: ele passa sozinho a quem participa há mais tempo (decisão 109 e regra do Plano 7), e a exclusão por LGPD nunca é bloqueada. Texto novo: "A administração da família passa para quem participa há mais tempo."
- **Limites de convite por e-mail sobrevivem à exclusão** (revisão da Task 2): um registro próprio guarda só o resumo do endereço e a data, por cerca de 7 dias, sem ligação com quem convidou nem com a família. Sem isso, criar e excluir cadastros zeraria os limites. Custo se a decisão for outra: manter as linhas dos convites, mais simples, com o risco do reset.
- **A varredura de família encerrada foi ampliada** (apaga o que restou sem dono quando ninguém com cadastro participa mais). Custo se a decisão for outra: remover o último bloco de `sweep_ended_family`; a família sem ninguém ficaria no banco, sem nome.
- **`email_exists` ainda é visível** para quem chama a API do Supabase Auth direto com a própria sessão: limite conhecido, não resolvível no app.
- **A linha "Troca pendente para {e-mail}" saiu** (enumeração ao recarregar). Pedido de troca com limite de envio atingido (429) **não** deve dizer que os links foram enviados: deve mostrar o aviso calmo "Algo não saiu como esperado do nosso lado. Tente novamente em instantes." (como o limite vale para qualquer endereço, não revela cadastro). Esta troca está nos ajustes finais ainda abertos (`docs/progresso.md`).
- **Convite pendente enviado por outra família para o e-mail de quem excluiu o cadastro** fica até vencer (7 dias): limpar seria um oráculo de cadastro.
- **Textos jurídicos em rascunho, com avisos honestos** (revisão da Task 9): "baixar tudo" virou "baixar o que registrou"; a política lista o que o arquivo não traz; o texto sobre a família descreve tudo o que é compartilhado; o registro de avisos enviados é descrito como é (ligado ao cadastro, 90 dias, sem o texto); o caminho de cada direito é indicado; "apagados na hora" virou "apagados"; promessas incondicionais viraram "como a lei pede" e "antecedência razoável".
- **O que não é exportado** (para registro): famílias de que a pessoa já saiu, se algum aparelho recebe avisos, histórico de avisos enviados, convites criados, data do onboarding e data de uso das metas.

**Para você confirmar** (resumo): as interpretações das decisões 137, 142, 144, 146, 150, 151 e 155; "cadastro" no lugar de "conta" (conflito 1); a frase da copy só para quem não deixa nada (conflito 2); a ampliação da varredura e o registro de limites de convite (acima); e todos os textos da lista "Plano 9" em "Textos novos usados".

**Para a revisão jurídica** (pontos ⚖; sua revisão e, de preferência, de um advogado, antes do lançamento):
- Termos, seção 3 (Gratuita): "Se isso mudar um dia, você será avisado antes…" — compromisso de aviso e de poder baixar ou excluir os dados.
- Termos, seção 4 (O que a Íris não é): limite de responsabilidade ("Confira valores importantes antes de decidir com base neles.") e a negativa de aconselhamento financeiro.
- Termos, seção 8 (Disponibilidade): aviso "com antecedência razoável" se o serviço for encerrado.
- Termos, seção 9 (Encerramento): suspensão de cadastro que descumpra os termos.
- Termos, seção 11 (Contato e lei aplicável): quem é o responsável, o contato, a lei brasileira e o foro (hoje não há foro indicado).
- Política, seção 1 (Quem cuida dos seus dados): identificação do responsável e do encarregado (o mesmo contato).
- Política, seção 4 (Para que os dados são usados): **base legal** do tratamento (hoje: execução do serviço pedido ao criar o cadastro, e consentimento para os lembretes no aparelho).
- Política, seção 6 (Quem ajuda a Íris a funcionar): servidores da Supabase em São Paulo; **Netlify com servidores possivelmente fora do Brasil** (transferência internacional, RNF-07); provedor de e-mail (e se o Supabase Auth usa o mesmo).
- Política, seção 8 (Por quanto tempo): prazos das cópias de segurança e dos registros técnicos dos serviços; os 7 dias do resumo do endereço convidado; os 90 dias do registro de avisos.
- Política, seção 9 (Seus direitos): caminho de cada direito da LGPD (art. 18), uso do contato para os que não têm tela, ANPD.
- Política, seção 10 (Segurança): aviso em caso de incidente ("como a lei pede").
- Política, seção 11 (Idade): idade mínima (hoje "pensada para adultos"; menores de 18 só com um responsável).

## Textos novos usados (fora da copy oficial)

Aprovados antes: "Falta o seu nome.", "Falta a senha.", "Use até {n} caracteres.", "Escolha o dia.", "Crie uma nova senha.", "Salvar nova senha", "Voltar", formas de pagamento (Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma, Não informar).
Plano 2: "Somando banco, carteira e dinheiro guardado" (rótulo do saldo inicial, decisão 26) e "Passo {n} de 3" (rótulo acessível do onboarding); demais textos na seção "Textos novos" do plano `docs/superpowers/plans/2026-09-25-iris-plano-2-extrato-onboarding.md`.
Plano 3: "Com que frequência?" (rótulo do grupo Todo mês / Todo ano); prazos "vence hoje" · "vence amanhã" · "venceu em {dia de mês}" · "vence dia {d} · hoje" / "· amanhã" · "paga em {dia de mês}" · "previsto para {dia de mês}"; listas vazias "Nenhuma conta a pagar neste mês." · "Nenhuma conta paga neste mês." · "Nenhuma conta vencida." · "Nenhuma conta que se repete ainda." · "Nenhuma entrada prevista neste mês."; "Entradas que se repetem" (título) · "Situação das contas" (rótulo acessível das abas) · "Recebi {nome}" (rótulo acessível do link "Recebi") · "Marcar {conta} como paga" (rótulo acessível do botão "Paga"); "Nome" · "Valor" · "Vence dia" · "Chega dia" · "Mês" · "Salvar conta" · "Falta o nome." · "Escolha o mês." · "Conta criada."; "Encerrar" · "Encerrar "{nome}"?" · "As próximas não serão criadas. O que já foi pago continua no Extrato." · "Encerrada. O histórico continua no Extrato."; "Confirmar entrada"; "Resumo do mês" (rótulo acessível do resumo em Contas); nome padrão "Entrada" para entrada que se repete sem origem (já usado no Seu mês desde o Plano 1); ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-26-iris-plano-3-contas-recorrencias.md`.
Plano 4: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-27-iris-plano-4-parcelas-cartoes.md`.
Plano 5: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-28-iris-plano-5-metas.md`. Também: "A meta {meta} foi excluída. Este gasto continua no seu histórico, mas não pode ser editado nem excluído." (aviso no gasto pago com uma meta excluída).
Plano 6: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-29-iris-plano-6-planejamento-relatorios.md`. Também: "Quer ajustar o valor deste mês?" com o nome da categoria para leitor de tela (decisão 78) e "{Nome}: Passou {valor} do planejado." (abertura do bloco "Planejado" quando todas as categorias passaram).

Plano 7: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-30-iris-plano-7-familia.md` (58 textos, todos fora da copy oficial, para aprovação). Acrescentados durante a execução, também para aprovação:
- "Este uso não pode mais ser desfeito." (desfazer o uso de meta da família recusado pelo banco, inclusive toque duplo)
- "Só quem administra a família pode fazer isso." (ação de meta da família sem permissão)
- "Esta meta mudou. Atualize a página para ver como ela está." (meta da família alterada ou excluída por outra pessoa)
- "Esta meta não tem dinheiro guardado." (tirar ou usar de meta da família sem saldo)
- "Você entrou na família." e "A pessoa" (textos de reserva quando o nome da família ou da pessoa não pôde ser lido, em `src/features/familia/actions.ts`)
- "Membro" (texto de reserva no lugar do nome de um participante sem nome, na lista de Família, em `src/features/familia/view-model.ts`)
- "Um membro" (texto de reserva no aviso de saída quando o nome de quem saiu não pôde ser lido; desde a revisão final só aparece dentro das frases já aprovadas da decisão 108, "Um membro saiu da família." e "Um membro saiu da família, e a meta {meta} foi atualizada.", nunca como "voltaram para Um membro")
- "Oi." (saudação de reserva no mês da família quando o nome da própria pessoa não pôde ser lido, em `src/app/(app)/inicio/familia/page.tsx`)

Plano 8: 39 textos novos, para aprovação, exatamente como estão no código (a lista do plano `docs/superpowers/plans/2026-10-01-iris-plano-8-pwa-notificacoes.md` tinha 38; os textos 18 a 21 do e-mail de convite foram trocados pela revisão de segurança por 1 assunto fixo e 4 frases de abertura). `{…}` são valores. Todos em tom calmo, sem exclamação e sem urgência.

*Instalar e sem conexão*
- "No menu do navegador, escolha "Instalar" ou "Adicionar à tela de início"." (navegador sem botão de instalar)
- "A Íris já está na sua tela de início." (Configurações → App, já instalada)
- "Sem conexão" (título da página estática) e "Íris — Sem conexão" (título da aba)

*Lembretes (Configurações e Contas)*
- "Entradas a receber", "Depois de alguns dias sem registro", "Avisos da família" (chaves)
- "Lembretes neste aparelho" (linha)
- "Ativar lembretes", "Desativar neste aparelho" (botões)
- "Os lembretes estão ativos neste aparelho."
- "Lembretes ativados."
- "No iPhone, os lembretes funcionam depois de adicionar a Íris à tela de início."
- "Os lembretes estão bloqueados neste navegador. Para receber, libere as notificações da Íris nas configurações do navegador."
- "Este navegador não recebe lembretes."
- "Não conseguimos ativar os lembretes agora. Tente de novo em instantes."
- "Quer um lembrete antes de cada conta vencer?" (cartão em Contas)

*Aviso (push)*
- "Hoje é o dia de receber {entrada}."

*E-mail de convite da família* (substitui os textos 18 a 21 do plano)
- Assunto, sempre o mesmo: "Você recebeu um convite na Íris"
- Abertura, quatro variantes conforme os nomes passem ou não pela conferência de nome simples (sem link, endereço, e-mail, barra ou 4 dígitos seguidos): "“{nome}” convidou você para participar da família “{família}” na Íris." · "Há um convite para você participar da família “{família}” na Íris." · "“{nome}” convidou você para participar de uma família na Íris." · "Há um convite para você participar de uma família na Íris."
- "A família vê só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O que é seu continua privado."
- "Ver o convite" (link)
- "O convite vale até {dia} e serve para uma pessoa."
- "Se o link não abrir, copie este endereço no navegador:" (também nos outros e-mails)
- "Se você não esperava este convite, é só ignorar este e-mail."

*E-mail do resumo do mês*
- Assunto: "Seu mês de {mês} está fechado"
- Título: "Resumo do mês" (rótulo já aprovado, reaproveitado como título; o plano não nomeava um)
- "Você recebe este e-mail porque o resumo do mês está ligado. Para desligar, abra Configurações na Íris."

*E-mail de recuperação de senha* (modelo do Supabase)
- Assunto: "Crie uma nova senha na Íris"
- "Recebemos um pedido para criar uma nova senha para o seu cadastro na Íris."
- "Criar nova senha" (link)
- "Se não foi você, é só ignorar este e-mail. Sua senha continua a mesma."

*Convite por e-mail (tela Família)*
- "E-mail de quem vai participar" (rótulo do campo)
- "Enviar convite" (botão)
- "Convite enviado para {e-mail}. Vale até {dia}."
- "Convite reenviado."
- "Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link." (qualquer um dos quatro limites; nunca diz qual)
- "Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo." (usado quando o envio falha, quando o servidor de e-mail não está configurado e quando os nomes não puderam ser lidos; o mesmo texto nos três casos, para não revelar se o envio funcionou)

Reaproveitados (já aprovados; não contam como novos): "Instalar a Íris", "Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.", "No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".", "Adicionar à tela de início", "Agora não", "Lembretes", "App", "Contas perto do vencimento", "Planejado quase no limite", "Meta perto de ser concluída", "Resumo do mês", "Lembrete para anotar", "Todo dia às 21h", "Tentar de novo", "Convite enviado · aguardando", "Reenviar", "Cancelar convite", "Confira o e-mail. Parece que falta alguma coisa.", "Voltar", as sete frases de "Notificações" da copy (por exemplo "{conta} vence amanhã. Quer marcar como paga?" e "Hoje é o dia de {conta}."), "Sem conexão no momento. Assim que voltar, a gente tenta de novo.", "Marcar {conta} como paga?", "Marcar como paga", "Conta marcada como paga.", "Alterações salvas.", "Ver meu mês", "Você recebeu um convite", "Crie uma nova senha.", "A família já está completa.", "Só quem administra a família pode fazer isso.", as frases da decisão 108 (também usadas no push de aviso da família) e "Íris — Veja para onde seu dinheiro vai".

Ainda sem texto (pendência do ajuste final): quando o aviso de push chega com dados que não servem, o service worker hoje não mostra nada; está decidido mostrar um aviso neutro no lugar, e o texto dele será mais um item para aprovação.

Plano 9: textos novos, para aprovação, exatamente como estão no código (a lista do plano `docs/superpowers/plans/2026-10-02-iris-plano-9-seus-dados.md` tinha 32; a revisão acrescentou os cabeçalhos "Pago em", "Compra parcelada", "Nota" e "Como paga" e o valor "Compra de {data}", trocou o aviso de rascunho e tirou o texto 14).

*Excluir o cadastro*
- "A administração da família passa para quem participa há mais tempo."
- "Por segurança, saia e entre de novo antes de excluir o cadastro."

*Baixar meus dados*
- "Um arquivo com tudo o que você registrou na Íris: registros, contas que se repetem, cartões, metas, planejamento e categorias. Abre no Excel e em outras planilhas."
- "O arquivo traz só o que é seu. Nada de outras pessoas da família entra nele."
- "Baixar arquivo" (link)
- Títulos dos blocos do arquivo: "Cadastro", "Registros", "Contas e entradas que se repetem", "Compras parceladas", "Cartões", "Metas", "Movimentos das metas", "Planejamento", "Categorias", "Lembretes", "Família"
- Cabeçalhos do arquivo. Cadastro: "Nome", "E-mail", "Quanto você tinha ao começar", "Cadastro criado em". Registros: "Data", "Tipo", "Situação", "Valor", "Categoria", "De onde veio", "Nota", "Como pagou", "Parcela", "Gasto da família", "Pago com a meta", "Parte paga pela meta", "Vencimento", "Pago em", "Compra parcelada". Contas e entradas que se repetem: "Nome", "Tipo", "Valor", "Categoria", "De onde veio", "Frequência", "Dia", "Mês", "Começou em", "Encerrada em", "Conta da família", "Nota", "Como paga". Compras parceladas: "Data da compra", "Total", "Parcelas", "Situação", "Encerrada em". Cartões: "Apelido", "Tipo", "Cor". Metas: "Nome", "Valor da meta", "Prazo", "Situação", "Meta da família". Movimentos das metas: "Data", "Meta", "Movimento", "Valor". Planejamento: "Mês", "Categoria", "Planejado". Categorias: "Nome". Lembretes: "Lembrete", "Ligado". Família: "Família", "Papel", "Desde".
- Valores do arquivo: "Sim", "Não", "Gasto", "Entrada", "Confirmado", "A pagar", "A receber", "Conta", "Em andamento", "Quitada", "Devolvida", "Ativa", "Usada", "Excluída", "Voltou ao sair da família", "Administra", "Participa", "Meta da família" (meta que a pessoa não alcança mais) e "Compra de {data}" (ligação do registro à compra parcelada)
- Nome do arquivo: `iris-meus-dados-AAAA-MM-DD.csv`

*Trocar e-mail (telas)*
- "Trocar e-mail" (título)
- "E-mail atual" e "Novo e-mail" (rótulos)
- "Esse já é o seu e-mail."
- "Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois."
- "Por segurança, saia e entre de novo antes de trocar o e-mail."
- "Confirmar troca de e-mail" (título e botão)
- "Falta um passo. Confirme também pelo link enviado ao outro endereço."
- "E-mail alterado. Use o novo endereço para entrar."
- "Este link não vale mais. Peça a troca de novo em Configurações."
- (Retirado na revisão: "Troca pendente para {e-mail}. Ela só vale depois de confirmar pelos dois links.")

*E-mail de troca de e-mail* (modelo do Supabase, `supabase/templates/email_change.html`)
- Assunto: "Confirme a troca de e-mail na Íris"
- "Confirme a troca de e-mail." (título)
- "Recebemos um pedido para trocar o e-mail do seu cadastro na Íris para {novo e-mail}."
- "A troca só vale depois de confirmar pelos dois links: o enviado ao e-mail atual e o enviado ao novo."
- "Confirmar troca de e-mail" (link)
- "Se não foi você, é só ignorar este e-mail. O e-mail do cadastro continua o mesmo."

*E-mail de confirmação de cadastro* (modelo pronto; desligado, `supabase/templates/confirmation.html`)
- Assunto: "Confirme seu e-mail na Íris"
- "Confirme seu e-mail." (título) e "Confirmar e-mail" (link)
- "Falta só confirmar o e-mail do seu cadastro na Íris."
- "Se não foi você, é só ignorar este e-mail."

*Termos e Privacidade* (a ordem e o texto são os de `src/features/legal/content.ts`; cada campo marcado "[a definir antes do lançamento]" é preenchido por você em `src/features/legal/controller.ts`)
- "Rascunho em revisão. Este texto ainda será revisado pelo responsável pela Íris e por um advogado antes do lançamento." (aviso de rascunho; substitui o texto 28 do plano)
- "Atualizado em {data}."
- "[a definir antes do lançamento]" (marca de campo que só o dono preenche)
- Rótulos de acessibilidade das páginas: "Íris, página inicial" (logo) e "Textos legais" (links para as duas páginas)
- O texto dos Termos de uso e o da Política de privacidade, por extenso, abaixo.

***Termos de uso***

1. **O que é a Íris**

   A Íris é um app gratuito para anotar o que entra e o que sai e enxergar o seu mês. Os números que ela mostra vêm do que você anota.

2. **Seu cadastro**

   Para usar a Íris você cria um cadastro com e-mail e senha, ou entra com o Google.

   O cadastro é pessoal. Cuide da sua senha e não a compartilhe.

   Use um e-mail que você acompanha: é por ele que a Íris envia o link para criar uma nova senha.

3. **Gratuita**

   A Íris é gratuita e não pede dados de cartão para funcionar.

   Se isso mudar um dia, você será avisado antes e poderá baixar ou excluir os seus dados.

4. **O que a Íris não é**

   - Não é banco e não movimenta dinheiro.
   - Não se conecta ao seu banco e não pede senha de banco.
   - Não dá conselho de investimento nem promete resultado.

   A Íris mostra o que está acontecendo. As decisões continuam sendo suas. Confira valores importantes antes de decidir com base neles.

5. **Família**

   Quem cria uma família passa a administrá-la e pode convidar outras pessoas.

   Tudo o que alguém marca como da família aparece para quem participa dela: os gastos da família, as contas da família e as metas da família.

   Quem administra pode ajustar e excluir gastos da família e remover participantes.

   O que você não marca como da família continua privado.

6. **Uso combinado**

   - Não use a Íris para atividade ilegal.
   - Não tente acessar dados de outras pessoas.
   - Não envie convites a quem não quer recebê-los.
   - Não sobrecarregue nem tente derrubar o serviço.

7. **Seus dados**

   O que você anota é seu. Você pode baixar o que registrou em Configurações → Seus dados → Baixar meus dados e excluir o cadastro em Configurações → Seus dados → Excluir meu cadastro, quando quiser.

   A Política de privacidade explica o que a Íris guarda, o que o arquivo traz e para quê.

8. **Disponibilidade**

   A Íris precisa de conexão com a internet para funcionar.

   Ela pode ficar fora do ar por algum tempo, mudar ou ser encerrada. Se for encerrada, a Íris vai avisar com antecedência razoável para você baixar os seus dados.

9. **Encerramento**

   Você pode excluir o seu cadastro quando quiser.

   A Íris pode suspender um cadastro que descumpra estes termos.

10. **Mudanças nestes termos**

   Se estes termos mudarem de forma importante, a Íris avisa antes de a mudança valer.

11. **Contato e lei aplicável**

   A Íris é mantida por [a definir antes do lançamento]. Para falar sobre estes termos, escreva para [a definir antes do lançamento].

   Estes termos seguem a lei brasileira.

***Política de privacidade***

1. **Quem cuida dos seus dados**

   A Íris é mantida por [a definir antes do lançamento], que decide como os dados são tratados.

   Para falar sobre os seus dados, inclusive com a pessoa encarregada de cuidar deles (encarregado), escreva para [a definir antes do lançamento].

2. **O que a Íris guarda**

   - Seu cadastro: nome, e-mail e senha. A senha fica guardada de forma protegida (um resumo cifrado, nunca a senha em si).
   - Se você entra com o Google (quando essa opção está ativa): o nome, o e-mail e um identificador que o Google informa. Nunca a sua senha do Google.
   - O que você anota: gastos, entradas, contas a pagar e a receber, compras parceladas, metas, planejamento, categorias e notas.
   - Cartões: só o apelido, o tipo e a cor. Nenhum número de cartão.
   - Família, se você participar de uma: o nome da família, quem participa e o que é marcado como da família (gastos, contas da família e metas).
   - Lembretes: quais estão ligados e, se você ativar os lembretes num aparelho, o endereço técnico que o navegador fornece para a Íris enviar avisos a ele.
   - Convites por e-mail: o endereço de quem foi convidado fica guardado, e só quem administra a família o vê, enquanto o convite está pendente. Um resumo cifrado desse endereço fica por até 7 dias, só para limitar a quantidade de convites, sem ligação com quem convidou.
   - Registros técnicos: como em todo site, os serviços que hospedam a Íris registram dados de acesso, como endereço IP, data, hora e tipo de navegador.

3. **O que a Íris não faz**

   - Não se conecta ao seu banco e não pede senha de banco.
   - Não guarda número de cartão.
   - Não vende nem aluga dados.
   - Não mostra publicidade.
   - Não usa ferramentas de medição de audiência nem rastreadores.

4. **Para que os dados são usados**

   - Para mostrar o seu mês e calcular os números a partir do que você anota.
   - Para manter o seu acesso seguro.
   - Para enviar os lembretes e os e-mails que você deixou ligados.
   - Para o espaço da família, quando você participa de uma.

   A Íris trata esses dados para prestar o serviço que você pediu ao criar o cadastro. Os lembretes no aparelho dependem da sua permissão, que você pode retirar quando quiser, em Configurações → Lembretes (veja a seção sobre os seus direitos).

5. **O que a família vê**

   Quem participa de uma família vê os gastos, as contas da família e as metas da família que forem marcados como da família, os nomes e os papéis de quem participa e os avisos da família.

   Numa meta da família, cada pessoa vê o total da meta e só a sua própria parte.

   O Disponível e as entradas de cada pessoa nunca aparecem para a família.

   Os outros participantes também não veem os seus cartões nem as suas metas pessoais.

6. **Quem ajuda a Íris a funcionar**

   - Supabase: guarda o banco de dados e cuida do login. O banco fica em servidores em São Paulo.
   - Netlify: hospeda o site e executa o código das páginas. Esse código pode funcionar em servidores fora do Brasil e, quando funciona, os seus dados passam por lá enquanto você usa o app. Como tratar essa transferência para o exterior ainda está em definição pelo responsável pela Íris.
   - [a definir antes do lançamento]: envia os e-mails da Íris (convites, avisos e resumo do mês). Os e-mails de confirmação do cadastro e de nova senha saem pelo serviço de login (Supabase); se eles usam o mesmo provedor, isso ainda está a confirmar.
   - Serviço de avisos do seu navegador (Google, Mozilla, Apple ou Microsoft): entrega os lembretes ao aparelho. O conteúdo viaja cifrado.
   - Google: só se você escolher entrar com o Google.

   Esses serviços tratam os dados só para a Íris funcionar.

7. **Cookies e o que fica no aparelho**

   A Íris usa só o necessário para funcionar:

   - cookies de sessão, que mantêm você dentro do app;
   - um cookie que dura alguns segundos, para mostrar avisos como "Anotado.";
   - no armazenamento do aparelho: a página "Sem conexão", um ícone e pequenas preferências, como a sua escolha de não ver de novo o convite para ativar lembretes.

   Não há cookies de publicidade nem de medição.

   Também não há rastreadores de terceiros.

8. **Por quanto tempo**

   - Enquanto o seu cadastro existir.
   - Ao excluir o cadastro, seus dados pessoais são apagados.
   - Os gastos que você registrou numa família que continua existindo ficam no histórico dela como "Ex-membro", sem o seu nome. A sua parte nas metas da família sai delas.
   - Um resumo cifrado do endereço de e-mail convidado para uma família fica por até 7 dias, sem ligação com quem convidou, mesmo depois da exclusão do cadastro.
   - O registro de que um aviso foi enviado fica por até 90 dias, ligado ao seu cadastro: o tipo do aviso, a que item, mês ou dia ele se refere, quando foi preparado e enviado e se a entrega deu certo, sem o texto do aviso.
   - Registros técnicos e cópias de segurança dos serviços de hospedagem seguem os prazos desses serviços.

9. **Seus direitos**

   A qualquer momento você pode:

   - corrigir o que anotou, editando nas próprias telas;
   - baixar uma cópia do que registrou, numa planilha em formato CSV, em Configurações → Seus dados → Baixar meus dados (acesso e portabilidade);
   - excluir o cadastro, em Configurações → Seus dados → Excluir meu cadastro;
   - retirar a permissão para avisos, em Configurações → Lembretes: "Desativar neste aparelho" para os avisos no aparelho e os interruptores para os lembretes e os e-mails;
   - pedir, por [a definir antes do lançamento], a confirmação de que a Íris trata dados seus, a anonimização ou o bloqueio do que for desnecessário e informações sobre com quem os dados são compartilhados (veja a seção sobre quem ajuda a Íris);
   - retirar o seu consentimento em geral, também por [a definir antes do lançamento].

   O arquivo para baixar traz o seu cadastro, seus registros, as contas a pagar e as entradas que se repetem, as compras parceladas, os cartões, as metas e seus movimentos, o planejamento, as categorias, quais lembretes estão ligados e a família de que você participa hoje. Ele não traz as famílias de que você já saiu, se algum aparelho recebe avisos, o histórico de avisos enviados nem os convites que você criou.

   Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).

10. **Segurança**

   O acesso é sempre por conexão cifrada (HTTPS).

   Cada pessoa só alcança os próprios dados e o que é da família, se participa de uma. Essa regra é aplicada dentro do banco de dados, não só nas telas.

   Nenhum sistema é infalível. Se houver um incidente que afete os seus dados, a Íris avisa você, como a lei pede.

11. **Idade**

   A Íris é pensada para adultos. Menores de 18 anos só devem usar com um responsável.

12. **Mudanças nesta política**

   Se esta política mudar de forma importante, a Íris avisa antes de a mudança valer.

*Banco*
- "Família encerrada" (nome que substitui o de uma família encerrada; nenhuma tela o mostra)

**Adaptados da copy por causa da terminologia fixa (conflito 1; não contam como novos, mas peço a confirmação):** "Excluir seu cadastro", "Excluir meu cadastro", "Manter meu cadastro", "Seu cadastro foi excluído. Obrigado por ter usado a Íris."

**Reaproveitados (já aprovados; não contam como novos):** "Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito." (copy), "Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome." (RF-53), "Sua parte nas metas da família ({valor}) também sairá delas." (RN-22e), "Baixar meus dados antes", "Digite EXCLUIR para confirmar.", "Termos de uso", "Política de privacidade", "Ao criar seu cadastro, você concorda com os Termos de uso e a Política de privacidade.", "Enviar link", "Confira o e-mail. Parece que falta alguma coisa.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.", "Sair da Íris", "Se o link não abrir, copie este endereço no navegador:", "Íris — Veja para onde seu dinheiro vai", "Guardou", "Tirou", "Usou", "Todo mês", "Todo ano", "Crédito", "Débito", os nomes das cores dos cartões, os oito rótulos de Lembretes, "Aqui aparecem só os gastos marcados como da família.", "O Disponível e as entradas de cada pessoa nunca aparecem aqui.", "E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.", e, do mapa de Configurações do Plano 2 (protótipo `Configuracoes`): "Seus dados", "Baixar meus dados", "Excluir meu cadastro".
