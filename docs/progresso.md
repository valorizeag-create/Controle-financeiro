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
