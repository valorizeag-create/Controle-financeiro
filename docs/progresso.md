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
