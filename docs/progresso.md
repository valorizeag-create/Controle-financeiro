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
