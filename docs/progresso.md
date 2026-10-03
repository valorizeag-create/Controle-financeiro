# Íris — Progresso do desenvolvimento

Roteiro: [etapa-7-roteiro.md](etapa-7-roteiro.md). Decisões tomadas durante o desenvolvimento, para sua revisão: [decisoes-para-revisao.md](decisoes-para-revisao.md).

## Plano 1 — Fundação e núcleo individual · concluído em 2026-09-25

**Entregue**
- Projeto Next.js 16 + React 19 + Tailwind 4, com Vitest e Playwright configurados.
- Regras de dinheiro num único módulo testado (`src/domain/`): centavos, datas no fuso de Brasília, Disponível, Entrou, Saiu, linha das metas, contas a pagar, Saldo total e gastos por categoria.
- Banco (migração versionada): perfil, categorias padrão, registros; privacidade por pessoa (RLS), categorias padrão protegidas, perfil protegido.
- Cadastro, entrar, recuperar e criar nova senha, login com Google (depende de credenciais), rotas protegidas.
- Anotar gasto e Registrar entrada, com validação no servidor e o formulário mantendo o que foi digitado.
- Seu mês: Disponível, Disponível depois das contas, Entrou, Saiu, maior gasto, "Para onde seu dinheiro vai", últimos registros, Saldo total, navegação entre meses, estados vazios.
- Casca do app: barra inferior (celular), menu lateral (desktop), aviso "Anotado.".

**Testes**
- Unitários e de componentes: 107 passando (19 arquivos). Tipos e lint sem erros. Build de produção sem erros.
- Banco (RLS, 11 testes) e ponta a ponta (Playwright, celular e desktop): escritos, **ainda não executados** — dependem do Docker para o Supabase local.

**Pendências**
- Rodar `npx supabase db reset`, `npm run test:db` e `npm run test:e2e` assim que o Docker estiver instalado.
- Levadas para o Plano 2: aviso "Anotado." pode ficar preso na tela se a pessoa navegar em menos de 4 s; teste do `setFlash` direto; faixa vazia sob o Anotar no celular; campo de data da entrada sem limite visual de hoje.

## Plano 2 — Extrato, onboarding e ajustes básicos · concluído em 2026-09-26

**Entregue**
- Onboarding pulável: 3 telas, "Quanto você tem hoje?" (saldo inicial), convite para o primeiro gasto. Quem não concluiu volta a ele ao abrir o app.
- Extrato: tudo o que entrou e saiu, por dia, com busca (nome, nota, origem, forma de pagamento e valor, sem acento) e filtros Entradas, Gastos, Categoria e mês.
- Editar e excluir registros (com confirmação); fechar o Anotar com algo digitado pergunta antes de descartar.
- Categorias: criar, renomear, excluir levando os gastos para "Outros"; nome sem repetição (maiúsculas e espaços não contam).
- Mais e Configurações: nome, e-mail, mudar senha, saldo inicial, categorias, sair com confirmação.
- Pendências do Plano 1 resolvidas: aviso some em 4 s mesmo trocando de página; teste do setFlash; sem faixa vazia sob o Anotar; campo de data da entrada limitado a hoje.

**Testes**
- Unitários e de componentes: 222 passando (39 arquivos). Tipos, lint e build sem erros.
- Banco (privacidade, categorias e onboarding) e ponta a ponta (`nucleo.spec.ts`: 3 testes — 2 no celular, 1 no desktop; `plano2.spec.ts`: 9 execuções — celular: 6, desktop: 3) escritos e conferidos com `npx playwright test --list` (18 entradas listadas, correspondendo aos 2 navegadores × os testes acima, com os `test.skip` de projeto resolvidos em tempo de execução): **pendentes**, dependem do Docker para o Supabase local (mesma pendência do Plano 1, ainda não resolvida no ambiente de desenvolvimento).

## Plano 3 — Contas e recorrências · concluído em 2026-09-27

**Entregue**
- Contas e entradas que se repetem (todo mês ou todo ano), criadas pelo Anotar ("É uma conta que se repete", "Isso se repete") ou por "Nova conta".
- Contas: a pagar, pagas e vencidas por mês, "A pagar em {mês}" e "Disponível depois", entradas a receber com "Recebi" (valor ajustável), contas e entradas que se repetem (alterar e encerrar sem apagar o histórico).
- Marcar como paga pela lista ou pelo Seu mês ("Próximas contas"); conta paga com atraso conta no mês em que foi paga (A1).
- Ocorrências geradas ao abrir o app, sem duplicar; dia 29–31 ajustado ao tamanho do mês.
- Contas no menu lateral (desktop) e em Mais (celular).

**Testes**
- Unitários e de componentes: 303 passando (50 arquivos). Tipos, lint e build sem erros.
- Banco (20 testes em `plano3.test.ts`) e ponta a ponta (`plano3.spec.ts`: 3 testes — celular: 2, desktop: 1 — conferidos com `npx playwright test --list`: 6 entradas listadas, correspondendo aos 2 navegadores × os testes acima, com os `test.skip` de projeto resolvidos em tempo de execução): **pendentes**, dependem do Docker para o Supabase local (mesma pendência dos Planos 1 e 2, ainda não resolvida no ambiente de desenvolvimento).

**Pendências levadas a outros planos**
- Tarefa diária às 00h05 para gerar ocorrências e notificar quem não abre o app, e marcar como paga pela notificação (RF-16): Plano 8.
- Família em `recurrences` e as regras de conta compartilhada da família (RN-20): Plano 7.
- Cópia de "Alterações salvas." específica ao tentar alterar/encerrar uma recorrência já encerrada (hoje cai em `SAVE_FAILED` genérico).
- Mensagem de erro de categoria inválida (FK) ainda genérica, sem texto dedicado.
- Local definitivo de `txName` (hoje em `src/features/contas/view-model.ts`, usado também por Registrar entrada) a revisar se `txName` crescer.
- Ordem de bloqueio entre `delete_category` e `generate_occurrences()` (deadlock) a rever se o volume de dados crescer.
- Guarda para `starts_on` no passado além do já coberto pelos testes de banco.
- Concessão da coluna `generated_through` a revisar junto da tarefa diária do Plano 8.
- Convenção de nota da primeira ocorrência criada pelo Anotar (decisão 33) a documentar formalmente quando outros formulários passarem a criar recorrências.
- "A pagar em {mês}" soma também as vencidas de meses anteriores (coerente com a decisão 1); rever o rótulo se confundir.
- Não há como dispensar uma ocorrência indesejada sem pagá-la (ou excluí-la no Extrato depois de paga).
- A geração de ocorrências acrescenta uma ida ao banco ao abrir Seu mês, Extrato e Contas (some com a tarefa diária do Plano 8).
- Erro ao marcar como paga a partir do Seu mês volta para Contas, não para o Seu mês.

**Revisão final do Plano 3 (corrigido):** seletores dos testes ponta a ponta exatos; limpeza de usuários de teste por navegador (sem apagar os do outro em paralelo); nota das recorrências separada do nome (migração `20260927000001`), sem "Mercado · Mercado"; leituras do Extrato em paralelo com a geração.

## Plano 4 — Parcelas e cartões · concluído em 2026-09-28

**Entregue**
- Cartões ilustrativos (apelido, tipo, cor; nenhum número): cadastrar, editar, excluir; "Gasto neste cartão em {mês}" com navegação entre meses e "Ver gastos".
- Anotar: "Como pagou?" com um toque por cartão (o do último gasto já marcado) e "Outra forma"; "Foi parcelado" com o número de parcelas.
- Compra parcelada: uma parcela por mês, a 1ª no mês da compra, centavos que sobram na 1ª; ver as parcelas, quitar antecipadamente (valor ajustável), cancelar por devolução, excluir a compra.
- Extrato: filtro por cartão, cartão (ou "Cartão excluído") e "parcela n de N" em cada registro. Seu mês sem bloco de cartões (RF-61).
- Cartões no menu lateral (desktop) e em Mais (celular).

**Testes**
- Unitários e de componentes: 387 passando (65 arquivos). Tipos, lint e build sem erros.
- Banco (21 testes em `plano4.test.ts`) e ponta a ponta (`plano4.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): pendentes, dependem do Docker para o Supabase local (mesma pendência dos Planos 1, 2 e 3, ainda não resolvida no ambiente de desenvolvimento).

**Pendências**
- Retentativa sem saída: uma quitação ou devolução já feita (segunda aba) mostra "tente de novo", que nunca funciona; melhor redirecionar para `/extrato/parcelas/{id}` nesses casos.
- Excluir um cartão ou uma compra já excluída (segunda aba) termina em 404; melhor redirecionar para `/cartoes` ou `/extrato`.
- "Último cartão usado" pode vir de uma conta que se repete paga em Contas, não só do que foi digitado no Anotar (decisão 48).
- Anotar mostra os erros de "Foi parcelado" só depois dos campos básicos, em duas rodadas.
- Contas já geradas com um cartão depois excluído aparecem como "Cartão excluído".

**Pendências levadas a outros planos**
- Parcelado da família e cartão em gasto da família (RN-31): Plano 7.
- Exportar o cartão e a compra parcelada no CSV: Plano 9.

## Plano 5 — Metas · concluído em 2026-09-28

**Entregue**
- Metas individuais: criar (nome, valor, prazo opcional), editar e excluir (o guardado volta ao Disponível de hoje; o histórico continua).
- Guardar e tirar (nunca mais do que a meta tem), com "Guardado este mês" / "Tirado das metas" no Seu mês e o Guardado no Saldo total.
- Usar o dinheiro da meta: gasto com categoria; a parte paga pela meta fica fora do "Saiu"; a diferença sai do mês; pergunta da sobra com "Devolver" e "Deixar guardado"; o uso pode ser desfeito na meta.
- Progresso: quanto falta, percentual e quanto guardar por mês até o prazo; comemoração na metade e na meta completa.
- Seu mês com "Meta em destaque"; Extrato com "Guardado na meta", "Tirado da meta" e "pago com a meta {meta}".
- Metas na barra inferior (Seu mês · Extrato · Anotar · Metas · Mais) e no menu lateral.

**Testes**
- Unitários e de componentes: 465 passando (79 arquivos). Tipos, lint e build sem erros.
- Banco (27 testes em `plano5.test.ts`) e ponta a ponta (`plano5.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): pendentes, dependem do Docker para o Supabase local (mesma pendência dos Planos 1 a 4, ainda não resolvida no ambiente de desenvolvimento). Confirmar, no lançamento, que o Postgres hospedado é ≥ 17 (a guarda de exclusão de meta depende disso durante a exclusão de conta).
- O seed do e2e (`seedGoal`) grava o depósito com a data de hoje e depois volta a data ao mês passado com uma atualização administrativa (`goal_movements` não tem gatilho nem política de UPDATE; a `service_role` não passa pelo RLS) — a guarda do banco só aceita movimento datado de hoje quando gravado pela própria pessoa.

**Revisão final (2026-09-28): pendências aceitas, não corrigidas agora**
- M-5: guardar numa meta que virou "usada" ou foi excluída em outra aba mostra "Não conseguimos salvar agora… é só tentar de novo.", que engana (a nova tentativa nunca funciona). Redirecionar para a meta (ou para Metas, se ela sumiu) em vez desse aviso.
- M-6: erro de "tirar" com saldo zerado (outra aba já tirou tudo) deveria redirecionar para a meta em vez de mostrar "Esta meta tem R$ 0,00…"; o prazo do formulário de editar aceita qualquer mês a partir de 2000-01 (deveria ser só a partir do mês atual ou igual ao prazo já salvo, decisão 61).
- M-7: a lista "recente" do Seu mês mostra um gasto pago com meta pelo valor cheio, sem a etiqueta "pago com a meta {meta}" (só o Extrato tem a etiqueta hoje).
- M-8: no detalhe da meta, uma meta usada com sobra mostra um grid de 2 colunas com um só botão de meia largura ("Tirar dinheiro"); devia ser `grid-cols-1`. A busca do Extrato não encontra pelo nome da meta na etiqueta "pago com a meta".
- M-9: falta um teste de banco para `delete_category` num gasto pago com meta (o vínculo adiado com um "use" que não muda) — é o único caminho do Plano 1–4 que atualiza uma linha financiada; hoje só coberto no nível de domínio.

**Pendências levadas a outros planos**
- Metas da família (RN-22 a RN-22e, "Sua parte", saída da família com `return_on_exit`): Plano 7.
- Aviso "Faltam só {valor} para {meta}." (notificação "Meta perto"): Plano 8.
- Exportar metas e movimentos no CSV: Plano 9.

## Plano 6 — Planejamento e relatórios · concluído em 2026-09-28

**Entregue**
- Planejamento individual por categoria e mês: "{gasto} de {planejado}", "Ainda tem {valor} disponível.", "Falta pouco para chegar ao que você planejou." e "Passou {valor} do planejado." (âmbar, sem vermelho) com o link "Quer ajustar o valor deste mês?" em toda categoria que passou, total planejado e "Você está dentro do planejado em {n} de {total} categorias."; ajustar valor, planejar outra categoria, repetir o planejamento do mês anterior.
- O gasto do planejado é o mesmo de "Para onde seu dinheiro vai" (parte paga com meta fora; conta paga com atraso no mês em que foi paga).
- Excluir uma categoria leva o planejado dela para "Outros", somado.
- Seu mês com o bloco "Planejado" (mês atual, até 3 categorias), aberto por "Você ainda tem {valor} para {categoria} este mês."
- Relatórios: Este mês, Mês passado, Últimos 3 meses e Personalizado (até 12 meses); "O que mudou" em frases, gráfico "Entrou e saiu" com alternativa em texto, "Mês a mês" (entrou, saiu, guardado) e gastos por categoria no período — números iguais aos do Seu mês.
- Planejamento e Relatórios no menu lateral e em Mais.

**Testes**
- Unitários e de componentes: 527 passando (93 arquivos). Tipos, lint e build sem erros.
- Banco (12 testes em `plano6.test.ts`) e ponta a ponta (`plano6.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): pendentes, dependem do Docker para o Supabase local (mesma pendência dos Planos 1 a 5, ainda não resolvida no ambiente de desenvolvimento).
- O seed do e2e grava gastos e planejado direto nas tabelas `transactions` e `budgets` pelo administrador (sem gatilho de guarda por data; o mês do planejado vai no 1º dia).

**Pendências levadas a outros planos**
- Aviso "Você já usou boa parte do que planejou para {categoria}." (notificação "Planejado quase no limite") e resumo do mês fechado: Plano 8.
- Exportar o planejado no CSV: Plano 9.
- Relatórios e planejamento no desktop com layout de duas colunas: Plano 10.

**Pendências (revisão final do Plano 6)**
- Corrigido na revisão final: frase de abertura do bloco "Planejado" (sem "R$ 0"; sem frase quando tudo está exatamente no planejado), ordem das inserções em `set_month_budgets`, testes do banco (corrida real na primeira cópia, erro do `delete_category`, gasto pago com meta ao excluir categoria), legenda e borda do gráfico.
- Ainda abertas (baixo risco): o aviso "Planejamento salvo." aparece mesmo se todas as categorias enviadas foram excluídas em outra aba (`actions.ts`); a linha "Tirado das metas" no Mês a mês depende do texto "Guardado este mês" (`relatorios/view-model.ts`); `?de=` repetido chega como lista na página de Relatórios; texto da decisão 79 em `docs/decisoes-para-revisao.md` ainda fala em "Ajustar valor"; barra âmbar com contraste abaixo de 3:1 (o estado sempre aparece em texto) e layout `md:col-span-2` do bloco Planejado: conferir no Plano 10; migration e testes do banco/e2e ainda nunca rodaram (sem Docker).

## Plano 7 — Família · concluído em 2026-10-01

**Entregue**
- Criar a família (quem cria administra), convidar por link (7 dias, uma pessoa, código aleatório que o banco não guarda), aceitar depois de entrar ou criar o cadastro, cancelar convite; no máximo uma família por pessoa e 10 participantes.
- "Gasto da família" no Anotar (também parcelado e conta que se repete) e na edição; "Conta da família" em Nova conta; etiqueta "da família" no Extrato.
- Seu mês → Família (seletor Eu · Família): gastos da família do mês, por pessoa e por categoria da casa, contas da família, metas da família e últimos gastos; nada do Disponível, das entradas, dos cartões ou das metas individuais de ninguém.
- Contas da família: qualquer membro marca como paga (sai do Disponível de quem pagou); alterar e encerrar: quem criou e o administrador.
- Metas da família: todos veem o total e só a própria parte; guardar e tirar a própria parte; usar (dividido na proporção do guardado) e excluir (cada parte volta a quem guardou) só pelo administrador.
- Administrador ajusta e exclui gasto da família, passa a administração e remove membros; sair devolve a parte das metas e avisa a família; excluir o cadastro deixa os gastos como "Ex-membro" (tela no Plano 9).
- Família no menu lateral e em Mais.

**Segurança**
- Tabelas pessoais continuam "só o dono" (nenhuma política antiga afrouxada); a família lê e grava só por funções do banco que conferem quem pede, a família e o papel; ex-membro perde tudo na hora. Testes de banco tentam furar cada regra por gravação direta.
- Revisão independente do SQL antes de implementar (1 crítico e 6 importantes, todos corrigidos; ver `docs/decisoes-para-revisao.md`), mais uma correção da revisão do Task 4 (resposta de erro que revelava a parte de outro membro) e uma do Task 5 (ordem das travas).

**Testes**
- Unitários e de componentes: 747 passando (117 arquivos). Tipos, lint e build sem erros.
- Banco (`plano7-familia`, `plano7-gastos`, `plano7-metas`, `plano7-saida`: 119 testes) e ponta a ponta (`plano7.spec.ts`: 3 testes com duas pessoas em dois contextos do navegador, celular: 2, desktop: 1; 6 entradas em `--list`): **pendentes**, dependem do Docker para o Supabase local (mesma pendência dos Planos 1 a 6). Conferido sem Docker: `npx playwright test --list` e `npx tsc --noEmit`.
- O seed do e2e respeita as guardas do banco (família, participação, molde da conta da família, movimentos de meta de hoje com a data voltada por atualização administrativa); a limpeza apaga só os usuários do prefixo da execução, com uma nova tentativa se houver impasse (40P01).

**Ao rodar o banco pela primeira vez (Docker)**
- No primeiro `npx supabase db reset`, confirmar que o erro do gatilho adiado "Família sem administrador." chega pela API (PostgREST) como erro, e não só no `psql`.
- Os testes de corrida podem passar sem sobreposição real das transações; não provam ausência de impasse.
- Casos de impasse recuperável (40P01) estão documentados no cabeçalho da seção 4 da migração. A tela mostra "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."
- O Postgres hospedado precisa ser 17 ou mais recente.
- Rodar: `npx supabase db reset && npm run test:db && npm run test:e2e`.
- Confirmar na primeira execução do e2e que o aviso aparece depois de uma ação que volta para a mesma tela ("Você saiu da família.", "Conta marcada como paga.", "Família criada."): a correção foi feita e testada no componente, mas nunca rodou num navegador de verdade (ver "Revisão final").
- Confirmar que `family_expenses` e `family_expense` devolvem `can_adjust` como os testes de banco esperam (parcela, gasto pago com meta e gasto de quem saiu: não; os demais, só para quem administra: sim).

**Revisão final do plano (2026-10-01)**
- Resultado da revisão de todo o plano: nenhum problema crítico; a segurança se manteve em todos os caminhos conferidos (privacidade entre membros, quem saiu, convite, redirecionamento, segredos). Quatro pontos importantes, todos corrigidos:
  - **Aviso depois de uma ação na mesma tela.** O aviso verde só era lido quando a pessoa trocava de tela; depois de "Sair da família", "Remover", "Tornar administrador", "Criar família", "Cancelar convite", marcar ou encerrar uma conta da família e desfazer o uso de uma meta ele não aparecia (ou aparecia atrasado, em outra tela). Agora o aviso acompanha o próprio cookie: aparece na hora em que ele chega, também sem trocar de tela, continua sumindo em 4 segundos e aparece uma vez só. O defeito vinha do Plano 1 e também afetava "Paga" em Contas a partir do Seu mês (Plano 3). Sem navegador com o Supabase local, a correção foi provada só por testes do componente.
  - **"Ajustar" só onde o banco deixa.** O administrador via o link de ajuste em qualquer gasto da família de outra pessoa, mas o banco recusa parcelas, gastos pagos com meta e gastos de quem saiu; a tela respondia "é só tentar de novo", o que nunca era verdade. Agora o próprio banco diz, para cada gasto, se quem pede pode ajustá-lo (`can_adjust`, com as mesmas condições das funções de ajuste; é um sim/não sobre uma linha que a pessoa já vê, e é sempre "não" para quem não administra). Sem esse "sim" não há link, e a tela de ajuste manda de volta para o mês da família.
  - **Teste de quem saiu.** A conferência do e2e não podia falhar ("/inicio/familia" também termina em "/familia"). Agora confere o caminho inteiro, a tela de criar família e a ausência de qualquer dado da família (contas, últimos gastos, nome da família, da meta e da administradora), também em Família → Contas e em Metas.
  - **Este documento** estava desatualizado.
- Também corrigido: aviso de saída sem nome usa a frase anônima já aprovada (nunca "voltaram para Um membro"); botão "Entrar na família" fica desativado enquanto envia (toque duplo); falha ao ler a família no Seu mês vai para o registro do servidor (só código e mensagem do banco); a linha "Usou" da meta da família mostra o que saiu da meta, não o gasto inteiro; testes novos para o nome da meta da família no Extrato e para as contas da família ficarem fora de Contas.
- Tarefas 12 e 13 (Anotar, Extrato, metas da família, menu): revisadas e aprovadas depois de uma rodada de correções (administrador sem parte não conseguia desfazer o uso; faltava o aviso da diferença quando o uso passa do guardado; o Extrato perdia o nome de meta da família excluída).

**Limitação conhecida**
- Depois de "Tornar administrador", um novo administrador que não tem parte numa meta da família não vê nem consegue desfazer os usos feitos pelo administrador anterior (a linha "Usou" com "desfazer" vem dos gastos da própria pessoa; o banco aceitaria o pedido, decisão 105). Nenhum valor fica errado; a meta só fica como usada. Saída possível hoje: devolver a administração a quem usou. A correção pede uma função nova do banco que mostre o gasto do uso a quem administra, o que é uma decisão de segurança à parte: adiada.

**Pendências levadas a outros planos**
- Convite por e-mail, "Reenviar" (protótipo) e avisos da família por push/e-mail: Plano 8 (inclui um limite de convites por período, que precisa de texto novo).
- Plano 9: a ação de excluir cadastro tenta de novo uma vez se o banco devolver 40P01 (impasse com a exclusão de `auth.users`); tela "Sua parte nas metas da família ({valor}) também sairá delas."; `families.name` de família encerrada fica guardado (limpar ou anonimizar); exportar a família no CSV (gastos que a pessoa registrou, parte nas metas).
- Trocar o nome da família; extrato da família ("Ver todos" dos últimos gastos): depois da v1, se fizer falta.
- Desktop da tela Família e do mês da família com layout próprio: Plano 10.

**Pendências menores adiadas (registradas no livro-razão da execução)**
- Tarefa 1: o rótulo "Ex-membro" confunde com um membro de mesmo nome (comparar `authorId` nulo); `BigInt` com número não inteiro; empate de uuid; ordem ICU.
- Tarefa 2: transferir a administração cancela o convite pendente de quem passou o papel (avisar na tela); os testes de revogar convite não distinguem exposição pela API; `data ?? []` esconde erros nos testes; blocos repetidos de trava e conferência.
- Tarefa 3: 9 pequenos itens em `task-3-review.md` (linhas com data futura mantidas; limpar `family_id` direto num molde deixa ocorrências pendentes com a família).
- Tarefa 4: a guarda de autor recusa por nome de papel (um papel novo da API a contornaria; preferir conferir `auth.uid()`); a função nova fora do teste "não chamável"; duplicação; sinal de existência do uuid da meta.
- Tarefa 5: 10 pequenos itens em `task-5-review.md`; impasse com a exclusão de `auth.users` aceito como menor.
- Tarefa 6: comentário sobre a origem do `familyId`; leitura duplicada. (Os testes que faltavam foram escritos na revisão final.)
- Tarefa 7: o código do convite viaja em `?next=` e na volta do login com Google (mitigado: uso único, 7 dias); considerar cookie curto; 6 outros itens.
- Tarefa 8: itens 4 a 7 de `task-8-review.md`.
- Tarefa 9: "Meta inválida." (ex-membro com saldo) mostra "Atualize a página", que não resolve; "Sessão necessária." mostra o texto de só-administrador; marco da meta com corrida; constantes duplicadas.
- Tarefa 10: "Convidar pessoa" continua ativo depois de criar um link, e apertar de novo cancela o link recém-compartilhado sem avisar; estado "copiado"; caminhos sem teste; página do convite sem título próprio. (Frase "voltaram para Um membro" e toque duplo no aceitar: corrigidos na revisão final.)
- Tarefa 11: comparador de contas duplicado; `byMember` por rótulo e `key` por rótulo em `family-month.tsx` (dois membros com o mesmo nome: só um aviso do React); 5 outros itens. (`.catch` silencioso: corrigido na revisão final.)
- Tarefas 12 e 13: a tela "Usar" calcula o detalhe pessoal de uma meta da família e descarta, e usa `personal!` duas vezes; linhas "Usou" do mesmo dia ficam sempre abaixo dos outros movimentos (falta a hora do gasto); o jsdom imprime "Not implemented: navigation" nos testes de registro e contas (já existia antes).
- Tarefa 14: a limpeza do e2e deixa famílias, avisos, metas sem dono e gastos "Ex-membro" no banco local (some no `db reset`).

**Acessibilidade adiada para o Plano 10 (precisa de texto novo, para aprovação)**
- "Remover {nome} da família" e "Tornar {nome} administrador" ficam com o mesmo nome acessível quando dois membros têm o mesmo primeiro nome.
- As telas "Este convite não vale mais…" e "Você já participa de uma família…" não têm título (h1).
- O bloco "Da família" em Metas não é uma região com nome (os blocos vizinhos são); o e2e acha a seção pelo título.

**Outros itens da revisão final, adiados**
- Erros que tentar de novo não resolve ainda dizem "é só tentar de novo": criar convite sem ser administrador, ajustar gasto ou alterar conta da família sem permissão, e anotar com "Gasto da família" logo depois de sair. Para o caso "sem permissão" já existe o texto "Só quem administra a família pode fazer isso."; "você não participa mais da família" precisa de texto novo.
- Criar o cadastro a partir de um convite não tem teste de ponta a ponta, e o aviso "Você entrou na família …" se perde porque a pessoa passa antes pelas boas-vindas (o aviso dura 30 segundos).
- `loadFamilyExpenses` pagina a função do banco sem repetir a ordem do lado do app (só importa acima de 1.000 gastos da família num mês).
- `NEXT_PUBLIC_SITE_URL` com barra no fim gera "//convite/…" no link e na volta do login com Google: aparar em `lib/env.ts`. No lançamento, a lista de endereços de retorno do Supabase hospedado precisa do curinga ("…/**", como em `supabase/config.toml`), senão entrar com Google a partir de um convite volta para a página inicial.
- `family_events` é liberada por tabela inteira, então `member_id` pode ser lido pela API (é só o número da linha de participação, que a família já vê; o app nunca o pede). Liberar por coluna, como em `family_invites`, faria o banco garantir a regra.
- O plano diz 36 funções `security definer`; a migração tem 37 (`family_one_admin_check`, acrescentada pela revisão de segurança). Corrigir o número no plano.
- O "pode ajustar" (`can_adjust`), o "pode alterar" das contas e o "é administrador" das metas são calculados em lugares diferentes; juntar a regra "quem pode o quê" num lugar só.
- Com entrar por e-mail exigindo confirmação (configuração do Supabase hospedado), a volta para o convite se perde depois de confirmar: conferir no lançamento.
- Custo da segunda chamada ao banco (contas da família) em toda leitura do mês de quem não tem família: medir no Plano 10.

## Plano 8 — PWA e notificações · concluído em 2026-10-02

**Entregue**
- A Íris pode ir para a tela de início: manifest, ícones do logo provisório (inclusive adaptáveis), service worker que não guarda nenhuma tela do app, convite "Instalar a Íris" no onboarding (depois do saldo inicial) e em Configurações → App, com a instrução do iPhone. Nunca "baixe o app".
- "Sem conexão": aviso nas telas quando a rede cai e página estática quando a navegação falha. Nada funciona offline (fora da v1).
- Lembretes por push, cada tipo com sua chave em Configurações → Lembretes: conta vence amanhã e hoje (com "Marcar como paga", que abre a confirmação), entrada a receber, planejado quase no limite, meta perto, mês fechado, avisos da família, retomada depois de 5 dias e lembrete para anotar (desligado por padrão, às 21h). Os demais às 9h de Brasília. "Ativar lembretes" só pede a permissão ao toque, em Configurações e num cartão em Contas.
- E-mails: convite da família (com "Reenviar" e limites por família, por pessoa, por endereço e no total), resumo do mês (sem valores) e recuperação de senha com texto da Íris.
- Tarefa diária das 00h05 cria as contas do mês de quem não abre o app; abrir o app continua criando também.
- Agendador: pg_cron do Supabase (cinco tarefas); a entrega passa por uma rota do app que só abre com um código de disparo derivado do segredo da tarefa.
- Scripts: `npm run job:configurar` (registra o resumo do segredo no banco local e mostra os comandos do Vault; `-- producao https://…` mostra os comandos para o banco hospedado) e `npm run job:notificacoes` (roda a tarefa à mão no computador local). Nenhum mostra nem grava o `JOB_SECRET`.
- Pendências de planos anteriores fechadas: tarefa diária das contas e `generated_through` fora do alcance da API (Plano 3); "Faltam só…" e "Você já usou boa parte…" (Planos 5 e 6); convite por e-mail, "Reenviar", limite de convites e avisos da família por push (Plano 7).

**Segurança e privacidade**
- Endereços de push sem leitura pela API, um aparelho = uma pessoa, apagados ao desativar, ao sair, quando deixam de valer e na exclusão do cadastro. O servidor só chama serviços de push conhecidos, e o banco recusa outros endereços ao salvar.
- A fila guarda só tipo e referência; o texto é montado no envio, depois de o banco conferir de novo se quem recebe ainda pode ver aquilo. Aviso da família só com o que as telas da família já mostram.
- **Nenhuma chave de serviço no app** (revisão de segurança C1): a rota da tarefa usa a chave pública e funções do banco que exigem o segredo da tarefa; o banco guarda só o SHA-256 do segredo; o agendador leva um código de disparo derivado; a rota compara em tempo constante, ignora sessão e responde só números. Um teste confere que nenhum arquivo do app cita a chave de serviço, e o `.env.example` e o README dizem que ela não vai para a Netlify.
- **Convite por e-mail sem canal aberto** (C2): assunto fixo, sem nome de ninguém; limites por família e por pessoa (5 por dia), por endereço (3 em 7 dias, somando todas as famílias) e no total (100 por dia); nunca diz se o endereço tem cadastro.
- Revisão de segurança do SQL antes de implementar: 2 críticos e 6 importantes corrigidos (entrega que encerrava só no fim e reenviava tudo; segredo recuperável no caminho do agendador; função de encerrar sem escopo; função de pegar o lote devolvendo demais; testes que faltavam; arquivos do plano ainda com a chave de serviço). Mais uma correção da revisão das Tasks 4 e 5 (limite por endereço sem trava entre famílias), uma da Task 9 (limpeza do push ao sair podia prender o "Sair") e uma da Task 11 (painel de confirmação quebrava na renderização do servidor; conta vencida sem confirmação). Detalhes em `docs/decisoes-para-revisao.md`.
- `generated_through` deixou de ser alterável pela API (pendência do Plano 3).

**Testes**
- Unitários e de componentes: 1183 passando (151 arquivos), depois da revisão final. Tipos, lint e build sem erros.
- Banco (`plano8-preferencias` 24, `plano8-ocorrencias` 11, `plano8-convite` 16 e `plano8-fila` 42: 93 testes) e ponta a ponta (`plano8.spec.ts`: 10 testes — celular: 5, desktop: 5; 20 entradas em `--list`): **pendentes**, dependem do Docker para o Supabase local (mesma pendência dos Planos 1 a 7). Conferido sem Docker: `npx playwright test --list` (20 entradas do Plano 8, 68 no total) e `npx tsc --noEmit`.
- Os testes de ponta a ponta de push, da tarefa e do convite por e-mail rodam quando `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `JOB_SECRET` e `SMTP_HOST` estão em `.env.local`; sem eles ficam marcados como pulados (README). Os testes da tarefa e do convite por e-mail têm ainda uma guarda de segurança (`tests/e2e/local-only.ts`): só rodam contra o Supabase local e a caixa de e-mail local (`localhost` ou `127.0.0.1`), para nenhum aviso ou e-mail de teste chegar a pessoas de verdade; no ambiente local rodam por inteiro. A configuração do Playwright liga `NEXT_PUBLIC_REGISTER_SW=1` para o service worker registrar em `npm run dev`; um servidor de desenvolvimento já em execução precisa ser reiniciado. O teste da tarefa registra o resumo do `JOB_SECRET` no banco sob o nome `e2e-p8` e o remove no fim.
- No e2e do Plano 8 push de verdade não é exercitado: a inscrição do navegador é simulada e a entrega usa um endereço de teste.
- Os dois testes de onboarding do Plano 2 e o teste de cadastro do núcleo (`nucleo.spec.ts`, corrigido na revisão final) ganharam o passo "Agora não" da tela de instalar (duas linhas cada); nenhuma afirmação foi removida. Os testes dos Planos 3 a 7 não passam pelo onboarding (os usuários já são criados com ele concluído).

**Ao rodar o banco pela primeira vez (Docker)** — o SQL do Plano 8 nunca foi executado, só lido
- `npx supabase db reset && npm run test:db && npm run test:e2e`. Esperado: `plano8-preferencias` 24, `plano8-ocorrencias` 11, `plano8-convite` 16, `plano8-fila` 42, e todos os testes dos Planos 1 a 7 (em especial `plano3`, `plano7-familia`, `plano7-gastos` e `plano7-saida`, que passam pelo gatilho novo em `family_events` e pela concessão de colunas em `recurrences`).
- `create extension pg_cron` e `pg_net` na migração: confirmar que o `db reset` local aceita (a imagem do Supabase traz as duas). Se o `pg_cron` reclamar do banco, conferir `cron.database_name`.
- `vault.decrypted_secrets` existe no banco local (extensão `supabase_vault`, criada na migração dentro de um bloco protegido); sem ela, `job_dispatch` só devolve falso.
- Pontos do SQL mais sujeitos a surpresa: `extensions.hmac` e `extensions.digest` em `private.job_secret_ok`; `cron.alter_job(…, active := …)` dentro de `job_set_paused` (se o dono do job não for o dono da função, a execução dos testes de banco para no `global-setup` com mensagem clara); `delete from cron.job_run_details` na limpeza; o `bytea` em `\x…` pelo PostgREST nos testes de limite; `client.schema('private')` recusado (PGRST106) para os três clientes; `hashtextextended` e `pg_advisory_xact_lock(int, int)` com `search_path` vazio; `limit … * 4` com `for update skip locked` e saída antecipada; o CTE que grava em `queue_own_notification`; a expressão regular POSIX da lista de endereços de push.
- Do banco em Docker para o app: `http://host.docker.internal:3000` (README, `npm run job:configurar`). Conferir em `net._http_response` que a chamada chegou, e que a resposta guardada tem só números.
- A caixa de e-mail local: confirmar a porta SMTP 54325 (`[local_smtp] smtp_port`) e a API usada pelo e2e (`/api/v1/search`, `/api/v1/message/{ID}`); ajustar `E2E_MAILBOX_URL` se a versão local for outra.
- Primeira execução do e2e no navegador: confirmar que `context.setOffline(true)` também derruba as chamadas do service worker (se não, a página "Sem conexão" não aparece e o teste do celular falha por isso, não por defeito do app), e que o aviso "Conta marcada como paga." aparece depois do pagamento pelo destino do aviso.
- Os testes de corrida do convite e os do limite global são de tempo: passam sem sobreposição real das chamadas.
- Se uma execução dos testes de banco for interrompida antes do fim, o agendador local continua pausado: `select public.job_set_paused(false);`.
- O pg_cron local dispara às 00h05, 9h e 21h (Brasília) durante testes de ponta a ponta (não são pausados; só os de banco são): pode, raramente, pegar linhas de um teste.

**Verificar na hospedagem e em aparelho de verdade (não dá para provar localmente)**
- O limite de tempo da função na Netlify: a entrega assume cerca de 10 segundos (6 s enviando, 2,5 s encerrando); ajustar `BUDGET_MS` em `deliver.ts` se for maior.
- Se os trechos `after()` (avisos de planejado e de meta) rodam na Netlify; se não, `waitUntil`.
- Se a lista de endereços de retorno do Supabase hospedado aceita a volta do Google com o parâmetro `next` mais longo.
- Endereços de push reais: a lista de serviços aceitos falha fechada; conferir o endereço que cada navegador atual usa (o Chrome pode usar um host que não seja `fcm.googleapis.com`).
- Aparelho de verdade: iPhone (iOS 16.4 ou mais novo, app instalado) e Android; instalar, "Sem conexão", push de verdade e o toque no aviso.
- Postgres hospedado 17 ou mais novo; `pg_cron`, `pg_net` e Vault ligados; SMTP com domínio verificado (app e Supabase Auth); modelo de recuperação de senha colado no Supabase; chaves VAPID de produção; `JOB_SECRET` na Netlify e `npm run job:configurar -- producao …` rodado uma vez. A lista completa está no README, em "Antes de publicar: o que depende de você (Plano 8)". (A lista "O que depende de você" do documento do plano foi substituída e não vale mais: ela mandava colocar a chave de serviço na Netlify.)
- Não ligar `log_statement = 'all'` nem pgaudit para os papéis da API no projeto hospedado (os parâmetros das chamadas, que incluem o segredo da tarefa, iriam para o registro).

**Pendências levadas a outros planos**
- Plano 9: tela de excluir cadastro (as inscrições, preferências e avisos já saem na cascata); exportar no CSV não inclui endereços de push; a política de privacidade precisa citar push, e-mail e o resumo (SHA-256) do endereço convidado guardado por 7 dias; e-mail de confirmação de cadastro (se a confirmação por e-mail for ligada no Supabase hospedado) e de troca de e-mail precisam de texto.
- Plano 9 (lançamento): tudo do README, agora consolidado em "Lista de lançamento: o que depende de você" (feito no Plano 9).
- Plano 10: Configurações → Lembretes e "Instalar a Íris" no desktop com layout próprio; acessibilidade adiada pelo Plano 7 continua lá.
- Depois da v1, se fizer falta: tela de avisos dentro do app; escolher o horário do lembrete; aviso de conta que vence no dia 1 já na véspera; trocar o nome da família.

**Ajustes finais combinados (revisão final do plano, 2026-10-02)**

Feitos na revisão final (riscados):
- ~~Nomes de membro e meta nos avisos de push cortados em 60 caracteres~~ (Task 6).
- ~~`.env.example` com `NEXT_PUBLIC_REGISTER_SW`~~ (Task 13).
- ~~`save_push_subscription` com `on conflict`~~: duas chamadas com o mesmo endereço ao mesmo tempo não devolvem mais 23505; continua uma linha só por endereço, de quem ativou por último. Dois testes de banco novos (pendentes, como os demais).
- ~~O ramo "falha ao montar os dados" da pegada do lote zera `claim_id`~~.
- ~~`JOB_SECRET` só enviado a um endereço https (ou local) do Supabase~~: a rota responde 503 "não configurada" e `npm run job:notificacoes` para antes de chamar o banco.
- ~~O encerramento de uma linha tenta de novo em erro passageiro do banco (57014, 40001, 40P01)~~; se o erro continuar, a linha fica aberta e o banco tenta em 15 minutos.
- ~~Normalização Unicode (NFKC, sem hífen opcional nem caracteres de largura zero) em `plainName`~~.
- ~~Comentário de `endpoint.ts`~~.
- ~~Aviso calmo quando o push chega com dados inválidos~~: sem texto novo. Usa a frase já aprovada da retomada, "Seu mês continua aqui. Quer atualizar?", que abre o Seu mês; nada do que chegou é usado. Para confirmar com você: o uso dessa frase também nesse caso raro.
- ~~O toque no aviso foca uma janela já aberta~~: só quando ela já está exatamente no destino do aviso. Uma janela aberta em outra tela não é trocada de lugar (a pessoa pode estar no meio de um registro); nesse caso o destino abre em outra janela, como antes.
- ~~`/favicon.ico`~~: voltou a existir, com o logo provisório (gerado por `npm run icons`).
- ~~`deviceState` devolve 'checking' em vez de 'unsupported' enquanto o service worker ainda não registrou~~, e a tela confere de novo quando ele fica pronto.
- ~~O registro da falha de envio do convite por e-mail leva só o código do erro~~; ~~teste "mesma resposta para qualquer destinatário" reforçado~~.
- ~~Teste de cadastro do núcleo com o passo "Instalar a Íris"~~; ~~aviso de "contrato substituído" no documento do plano~~; ~~testes de ponta a ponta da tarefa e do convite por e-mail só no ambiente local~~.

Continuam por fazer:
- Contar e registrar (sem dado pessoal) as linhas encerradas por dado inválido.
- Margem de área segura no aviso "Sem conexão" (Plano 10).
- Sem teste para o ramo "falha ao montar os dados" da pegada do lote (não dá para provocar pela API).
- README, item 4 de "Antes de publicar": o script lê só o `.env.local`, então o segredo de produção precisa passar por lá uma vez (deixar isso explícito, ou aceitar o valor por uma variável de uso único).
- README, item 1: ~~um domínio próprio não é gratuito~~ e ~~o projeto gratuito do Supabase pausa por inatividade~~ (feito no Plano 9: itens 12 e 13 da lista de lançamento); o resumo do mês por e-mail não tem teto diário e divide a cota do SMTP com a recuperação de senha.
- O teste de ponta a ponta da tarefa pode falhar por disputa com o agendador local (pausar com `job_set_paused` e consultar `attempts` em laço); o do "Sem conexão" depende de `context.setOffline(true)` também cortar as chamadas do service worker.
- A regra do proxy exclui o prefixo `api/jobs/`, não só a rota da tarefa.
- A descrição do manifest ("Anote seus gastos em segundos e entenda seu mês de um jeito simples.") é uma variação da descrição aprovada do site e não está na lista dos textos novos: aprovar ou trocar pela frase aprovada.
- ~~`.gitignore` sem a entrada `.claude/`~~ (feito no Plano 9).

**Pendências menores adiadas (registradas no livro-razão da execução)**
- Tarefa 1: tag igual para aviso da família e de planejado (colisão); UUID em maiúsculas é descartado; teste de `PREF_ORDER` ordena antes de comparar.
- Tarefa 2: 10 itens em `task-2-review.md`; o dono pode inserir direto uma ocorrência pendente de um período já removido (fora do escopo).
- Tarefas 4 e 5: M9 (prender o convite por e-mail ao endereço convidado) e M10 (limpar o e-mail de uma conta excluída de um convite pendente; seria um oráculo de cadastro) não aplicados; M11 (um aviso de família por evento, `family-{id}`, em vez de uma tag só: hoje vários avisos de saída em seguida se substituem); 14 itens em `task-4-review.md`; o limite de 100 por dia pode ser esgotado por cerca de 20 contas; `job_set_paused` é função de produção usada por testes.
- Tarefas 6 e 7: 11 itens em `task-6-review.md`; entrega "pelo menos uma vez" (um envio abandonado no limite de tempo pode ainda chegar, e um encerramento não registrado reenvia em 15 minutos: o resumo por e-mail pode, raramente, chegar duas vezes); linha cortada pelo limite de tempo gasta uma das 3 tentativas; envio parcial (um aparelho recebe e outro falha: a linha conta como enviada); sem chaves VAPID, as linhas são encerradas sem envio; uma chamada de pegar o lote que dá tempo esgotado no cliente deixa linhas pegas até os 15 minutos; sem limite de taxa na rota além do código de 256 bits; `plainName` é rígido (uma família "Família 2024" vira "uma família" no e-mail).
- Tarefa 8: 7 itens em `task-8-review.md`; `sharp` não declarado em `package.json` (só o script de ícones usa); ícone pré-guardado sem uso; sem teste de navegação por POST. Verificação manual de instalar, "Sem conexão" e push de verdade pendente.
- Tarefas 9 e 10: 8 itens em `task-9-review.md`; uma ação do servidor parada ainda pode atrasar o "Sair" (o Next serializa ações); tentar de novo o RPC de apagar; mover `isStandalone`/`isIOS` para um módulo de plataforma; flash da tela de instalar; layout de desktop de `/configuracoes/instalar` (Plano 10); linhas de inscrição que sobram depois de uma falha ao apagar são removidas na próxima entrega (404/410).
- Tarefa 11: 7 itens em `task-11-review.md`; renomear `inviteReturn` (também usado por `src/features/familia/view-model.ts`); restringir o retorno a "só criar cadastro" de convite; consulta mais estreita do livro-razão nos avisos de planejado (hoje lê o mês inteiro se há planejamento). (O comportamento das páginas com o destino do aviso também é coberto de ponta a ponta, em `plano8.spec.ts`.)
- Tarefa 12: o envio do e-mail é aguardado dentro da ação (até 4 s + 4 s + 5 s) em vez de `after()`, para poder mostrar o aviso de "não enviado"; o campo do e-mail é limpo depois de cada envio, inclusive depois de um erro; a mensagem de sucesso devolve ao navegador o endereço digitado (não é guardado nem registrado).

## Plano 9 — Seus dados e lançamento · concluído em 2026-10-02

**Entregue**
- Configurações → Seus dados: Baixar meus dados, Termos de uso, Política de privacidade e Excluir meu cadastro.
- Baixar meus dados: um arquivo CSV (abre no Excel) com tudo o que é da pessoa — cadastro, registros (com a data em que foram pagos, a forma de pagamento, a parcela e a compra parcelada), contas e entradas que se repetem, compras parceladas, cartões, metas e movimentos, planejamento, categorias, lembretes e a família atual. Nada de outras pessoas. Texto que viraria fórmula na planilha sai neutralizado. Só com sessão, nunca guardado, enviado em partes.
- Excluir meu cadastro: aviso conforme a família (o texto da copy só para quem não deixa nada; o do RF-53 quando há gastos na família), a parte nas metas da família com o valor, a frase sobre a administração da família quando ela passa para outra pessoa, "Baixar meus dados antes", palavra EXCLUIR. Depois: sessão encerrada, página "Seu cadastro foi excluído.", nada pessoal no banco.
- Trocar e-mail (cadastro com senha): pedido em Configurações → E-mail, confirmação nos dois endereços, página de confirmação com botão. Quem entra só com o Google vê o e-mail apenas para leitura.
- Termos de uso e Política de privacidade em páginas públicas, em rascunho, com aviso visível, os campos que só o dono preenche marcados e sem indexação.
- Pendências de planos anteriores fechadas: troca de e-mail (decisão 22); nova tentativa em impasse na exclusão; nome de família encerrada; frase dos Termos também em "Entrar"; e-mails de troca de e-mail e de confirmação de cadastro (modelos); CSV sem endereços de push; política citando push, e-mail e o resumo do endereço convidado; `.claude/` no `.gitignore`.

**Segurança e privacidade**
- Nenhuma chave de serviço no app: a exclusão é uma função do banco, sem parâmetro, que só enxerga quem chama e exige entrada recente (sessão criada há no máximo 15 minutos, conferida no banco). O teste `no-service-key.test.ts` continua passando.
- O que fica depois da exclusão: numa família que continua, os gastos marcados como da família ("Ex-membro", sem nome), a parte já usada numa compra da família, o aviso sem nome e a participação anônima. Numa família que termina com a pessoa, nada (a limpeza vai além do plano: apaga também linhas sem dono quando ninguém com cadastro participa mais). Por até 7 dias: um convite pendente que outra família mandou para o e-mail da pessoa e o resumo (SHA-256) do endereço convidado no registro dos limites de convite, sem ligação com quem convidou.
- Os limites de convite por e-mail (por endereço e no total) passaram a ser contados num registro próprio (`invite_email_ledger`: só o resumo do endereço e a data, 7 dias), para que criar e excluir cadastros não zere os limites (revisão da Task 2).
- A exclusão também apaga os rastros no serviço de login que não saem sozinhos (registro de acessos e pedidos de login em andamento) e trava todas as famílias da pessoa em ordem antes de apagar, para duas exclusões ao mesmo tempo não deixarem família encerrada para trás. `account_leftovers` (só o papel de serviço) prova o que sobra.
- A troca de e-mail responde igual para qualquer endereço; o link não confirma sozinho (abrir a página não muda nada), não inicia sessão e sai da barra de endereço depois de usado; falha de rede ou do servidor nunca diz que enviou nem queima o link.
- Download: pedido vindo de outro site não baixa nada; falha no meio do envio interrompe o arquivo com uma mensagem genérica; sem sessão, 307 para Entrar.

**Testes**
- Unitários e de componentes: 1321 passando (171 arquivos), incluindo a guarda "só local" da troca de e-mail. Tipos, lint e build sem erros.
- Banco (`plano9`: 19 testes; `plano8-convite` e `notify-helpers` adaptados ao registro de limites, sem afirmação alterada) e ponta a ponta (`plano9.spec.ts`: 6 testes — celular: 2, desktop: 4; 12 entradas em `--list`): **pendentes**, dependem do Docker (mesma pendência dos Planos 1 a 8). O teste da troca de e-mail só roda com o banco local; o da sessão antiga também precisa do `docker exec` no contêiner do banco local (`supabase_db_Planilha_financeira`, ou `E2E_DB_CONTAINER`) e fica marcado como pulado sem ele.
- Uma execução do `npm test` teve uma falha intermitente em `pay-pages`/pay-target (Plano 8: relógio falso que não volta ao normal), sem relação com o Plano 9; a seguinte passou inteira. Está em "Ajustes finais" abaixo.

**Ao rodar o banco pela primeira vez (Docker)** — o SQL do Plano 9 nunca foi executado, só lido
- `npx supabase db reset && npm run test:db && npm run test:e2e`. Esperado: `plano9` 19 testes e todos os dos Planos 1 a 8 (em especial `plano7-familia`, `plano7-saida` e `plano8-convite`, que passam pelo gatilho do nome da família e pelo registro de limites).
- A migração para no bloco 0 se o papel que a aplica não tiver SELECT e DELETE em `auth.users`, `auth.audit_log_entries` e `auth.flow_state`, SELECT em `auth.sessions`, USAGE no esquema `auth`, EXECUTE em `auth.uid()` e `auth.jwt()`, ou se a segurança por linha valer para o dono da função nessas tabelas. Se parar: não usar a chave de serviço no app. Saídas, para decisão: (a) conceder os privilégios ao papel no projeto, se o Supabase permitir; (b) mover a exclusão para uma função do Supabase (Edge Function) fora de `src/`, com o segredo guardado só no Supabase.
- Se `auth.sessions` não puder ser lida: trocar o corpo de `session_recent_at` pela data de entrada que vem no próprio token (`amr`), numa migração nova.
- `account_leftovers` vazio depois de excluir é o que prova a exclusão. Se sobrar uma linha de `auth` (por exemplo `auth.audit_log_entries`, `auth.flow_state`, `auth.one_time_tokens`), acrescentar o `delete` correspondente em `delete_my_account`, numa migração nova, dentro de um bloco protegido como os outros dois. Ela não vê o que o papel não consegue ver (compare `pg_tables where schemaname = 'auth'`) e não confere `storage`, que o app não usa.
- Sessão antiga: nenhum teste de banco consegue envelhecer uma sessão pela API; o e2e da sessão antiga faz isso pelo `psql` do contêiner. Sem ele: `update auth.sessions set created_at = now() - interval '16 minutes' where user_id = 'ID';` e a exclusão deve ser recusada ("Entrada recente necessária.").
- Conferir que `auth.jwt() ->> 'session_id'` vem preenchido; que `supabase.auth.verifyOtp({ type: 'email_change', token_hash })` devolve sessão só na segunda confirmação (é como a ação distingue "falta um passo" de "alterado"); e que o modelo `email_change.html` recebe um `{{ .TokenHash }}` diferente em cada endereço.
- Medir a exclusão de um cadastro grande: a limpeza do registro de acessos varre `auth.audit_log_entries` sem índice, dentro do limite de tempo do papel `authenticated` (8 s no Supabase hospedado). Se estourar, a exclusão volta atrás inteira (nada é apagado pela metade).
- Os testes do Plano 7 que encerram uma família agora passam pelo gatilho do nome: conferir `plano7-familia` e `plano7-saida`.
- A caixa de e-mail local: se a mensagem do Supabase Auth vier só em HTML, o teste já lê os dois campos (`Text` e `HTML`).

**Verificar na hospedagem e em aparelho de verdade (não dá para provar localmente)**
- Download autenticado de um cadastro grande num deploy de prévia da Netlify, e o que acontece se a conexão cair no meio do envio (o download deve falhar, não terminar "completo"); o teste de ponta a ponta do download é um portão de lançamento.
- `after()` na Netlify (também do Plano 8).
- No Supabase hospedado: "Secure email change" e "Secure password change" ligados, "Site URL", modelos de e-mail, SMTP próprio e limite de e-mails por hora (README, item 15). Sem "Secure password change", qualquer sessão antiga troca a senha e entra de novo, o que anula a regra dos 15 minutos.
- O banco hospedado precisa ser Postgres 17 ou mais novo, na região São Paulo.

**Limites conhecidos**
- Quem chama a API do Supabase Auth direto, com a própria sessão, recebe "esse e-mail já tem cadastro" ao tentar trocar para um endereço existente, e não passa pela conferência de entrada recente da troca de e-mail. As telas da Íris nunca mostram isso; os limites de envio são os do Supabase.
- "Entrada recente" mede a criação da sessão, não a atividade: qualquer entrada que cria sessão conta, inclusive um link de recuperação aberto a partir do e-mail (quem tem a caixa de e-mail já controla o cadastro). Com "Secure password change" ligado, uma sessão de até 24 horas ainda consegue trocar a senha, entrar de novo e excluir.
- Um token de sessão já emitido vale até vencer (até 1 hora) depois da exclusão, mas não lê nem grava nada.
- Os nomes das metas de uma família encerrada que ainda guarda algo de outra pessoa ficam no banco, sem ligação com quem excluiu o cadastro; ninguém os lê. A família encerrada em que alguém que saiu antes ainda tem cadastro fica, sem nome, até essa pessoa também excluir.
- Um convite pendente enviado por outra família para o e-mail de quem excluiu o cadastro fica até vencer (7 dias); limpar seria um oráculo de cadastro.
- O limite por pessoa e por família (5 convites em 24 horas) volta a zero quando uma família com um só membro é encerrada junto com a exclusão; os limites por endereço e no total valem de qualquer jeito.
- O arquivo "Baixar meus dados" não traz: as famílias de que a pessoa já saiu, se algum aparelho recebe avisos, o histórico de avisos enviados, os convites que ela criou, a data em que concluiu o onboarding e a data de uso das metas. A política de privacidade e a página dizem o que traz; a página diz "tudo o que você registrou". O arquivo não é um retrato único do banco (uma anotação feita durante o envio pode duplicar ou pular uma linha).
- Backups e registros técnicos do Supabase e da Netlify seguem os prazos desses serviços e ficam fora do alcance da exclusão.
- Se o envio do arquivo for interrompido depois de começar, o navegador pode mostrar o download como falho, sem o arquivo parcial como "completo"; o comportamento na Netlify não foi verificado.
- Depois de sair e entrar de novo, a pessoa volta a Configurações por conta própria (o retorno automático só existe para convite e pagamento de conta).
- O registro de que um aviso foi enviado fica 90 dias ligado ao cadastro (tipo, referência, datas e resultado, sem o texto) e sai na exclusão.

**Ajustes finais combinados (Plano 9, ainda abertos na data desta nota)**
- Remover caracteres de controle (NUL e semelhantes) das células do CSV antes da conferência de fórmula (`src/domain/csv.ts`).
- Teste intermitente do Plano 8 (`pay-pages`/pay-target): restaurar o relógio falso ao fim de cada teste.
- `sessionEnded` em `src/features/cadastro/session.ts` tem um ramo morto (`error.status === 401`; o status vem no resultado, não no erro).
- Troca de e-mail: limite de envio (429) ao pedir a troca deve mostrar "Algo não saiu como esperado do nosso lado. Tente novamente em instantes." (hoje cai na resposta neutra "Pronto…", que diz que os links estão a caminho). Como o limite vale para qualquer endereço, não revela cadastro.
- Remover `pendingEmail` de `loadSignIn()` (código morto desde que a linha "Troca pendente" saiu, risco de revelar se o endereço tem cadastro ao recarregar) e a afirmação do teste que o cobre.

**Pendências menores adiadas (registradas no livro-razão da execução)**
- Tarefa 1: sem teto de tamanho por célula; `csvMoney`/`csvDate` confiam nos tipos; o apóstrofo de neutralização aparece literalmente no Excel.
- Tarefa 2: o limite por pessoa/família volta a zero com a família de um só membro varrida; o registro de limites não tem chave primária; a varredura do registro de acessos sem índice; mais itens em `task-2-review.md`.
- Tarefas 3 e 4: renovação do token no meio da exportação não chega ao navegador (login de novo, raro); 7 itens em `task-3-review.md`.
- Tarefas 5 e 6: uma permissão faltando em `delete_my_account` desconectaria a pessoa repetidas vezes (a migração concede); o campo EXCLUIR aceita maiúscula automática e corretor no celular (precisa de props em `TextField`); 9 itens em `task-5-review.md`.
- Tarefas 7 e 8: sem teste de página para `/configuracoes/e-mail` e `/confirmar-email`; recarregar depois de "falta um passo" ou "alterado" mostra "Este link não vale mais"; 9 itens em `task-7-review.md`.
- Tarefas 9 e 10: lista do dono, links sublinhados e outros itens em `task-9-review.md`; contraste e visual das páginas novas não foram vistos no navegador.

**Pendências levadas a outros planos**
- Plano 10: landing (seção Confiança só depois da lista de lançamento, itens 16 a 18, RF-57; a frase "Você pode exportar ou excluir tudo quando quiser." tem a mesma tensão do conflito 2 do Plano 9); layout de desktop das telas novas.
- Depois da v1, se fizer falta: digitar a senha de novo em vez de sair e entrar; cancelar uma troca de e-mail pendente; limpeza completa de famílias encerradas em que alguém que saiu ainda tem cadastro; registrar a versão dos Termos aceita por cada cadastro; exportar as famílias antigas e o histórico de avisos.
