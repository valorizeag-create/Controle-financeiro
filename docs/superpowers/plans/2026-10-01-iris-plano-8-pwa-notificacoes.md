# Íris — Plano 8: PWA e notificações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Íris pode ser adicionada à tela de início (manifest, ícones, service worker, convite para instalar no onboarding e em Configurações), mostra "Sem conexão" quando a rede cai, e passa a avisar: lembretes por push (conta vence amanhã, hoje é o dia, entrada a receber, planejado quase no limite, meta perto, mês fechado, lembrete para anotar, retomada, avisos da família), e-mails (convite da família, resumo do mês, recuperação de senha) e uma tarefa diária que cria as contas do mês de quem não abre o app. Cada tipo de aviso liga e desliga em Configurações. Tudo funciona localmente, sem serviço pago e sem publicar nada.

**Architecture:** Três camadas, cada uma testável sozinha. **(1) Banco:** uma migração nova com `notification_prefs` (só o dono), `push_subscriptions` (sem acesso direto; só por funções), `notification_log` (fila e registro: guarda só tipo + referência, nunca texto), a geração de contas movida para funções internas chamadas pela tarefa diária, o convite por e-mail sobre o convite por link do Plano 7 e as funções `job_*` (só `service_role`) que enfileiram, entregam o lote e limpam. O **agendador é o `pg_cron` do próprio Supabase**; quando há algo na fila, o banco chama por `pg_net` uma rota do Next protegida por segredo. **(2) Servidor:** a rota `POST /api/jobs/notificacoes` confere o segredo em tempo constante, pede o lote ao banco (único lugar do app com a chave de serviço) e envia por duas interfaces trocáveis por variável de ambiente — `PushSender` (Web Push com chaves VAPID) e `Mailer` (SMTP; local = caixa de e-mail do Supabase local). Os textos são montados na hora do envio, a partir da copy. **(3) Navegador:** `manifest.webmanifest`, ícones do logo provisório, um service worker em `public/sw.js` que **não guarda nenhuma página nem resposta** (só a página estática "Sem conexão" e um ícone), recebe o push e abre só destinos de uma lista fixa.

**Tech Stack:** Next.js 16.3 (App Router, Route Handlers, `after`, `manifest.ts`), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Postgres 17 (Supabase local; `pg_cron`, `pg_net`, Vault, `pgcrypto`), Zod 4, **novas dependências gratuitas:** `web-push`, `nodemailer` (e os tipos), `sharp` (só desenvolvimento, para gerar os ícones), Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-07, RF-08, RF-16 "pela notificação", RF-42 "por e-mail ou link", RF-46–50, RNF-03, RNF-09, RN-22d/e textos "A família recebe", §1.1 terminologia, §5 stack, §6 "Funcionamento offline" fora da v1), `docs/etapa-3-arquitetura.md` (§1 visão geral, §3.1 `notification_prefs`/`push_subscriptions`/`notification_log`/`family_invites` com e-mail, §5 processos automáticos, §6 `/boas-vindas` e `/configuracoes`, A8 — lembretes às 9h de Brasília), `docs/etapa-5-ui.md` (tokens), `docs/etapa-7-roteiro.md` (Plano 8), `docs/decisoes-para-revisao.md` (decisões 1–111, obrigatórias, com as substituições registradas lá; em especial 27, 29, 30, 77, 95, 97, 102, 108, 111), `docs/progresso.md` (pendências marcadas "Plano 8": tarefa diária das 00h05 e pagar pela notificação; concessão da coluna `generated_through`; avisos "Faltam só {valor} para {meta}." e "Você já usou boa parte…"; resumo do mês fechado; convite por e-mail, "Reenviar" e limite de convites; avisos da família por push), protótipo aprovado (`Instalar`, `Configuracoes` seções "Lembretes" e "App", `Estados` "Sem conexão" e "Notificação no celular", `Familia` convite por e-mail com "Reenviar"), copy oficial (Claude Doc "Íris — Documento-base de comunicação": seção "Notificações", "Erros → Sem conexão", "Retomada", "Confirmações", "Rótulos e botões"). **A copy oficial não tem texto de instalação nem de e-mail:** a frase de instalar vem do RF-07 e do protótipo `Instalar`; todo texto de e-mail está em "Textos novos".

## Global Constraints

- **Só planos gratuitos. Nenhum cadastro em serviço pago, nenhuma publicação na Netlify nem em produção.** Tudo roda local e é ligado por variável de ambiente. O que precisa de conta ou chave de verdade (SMTP, chaves VAPID de produção, segredo da tarefa, agendador no Supabase hospedado) fica atrás de uma interface com implementação local, é documentado em `.env.example` **sem valor** e no `README.md`, e está na seção "O que depende de você" no fim deste plano. Sem a variável, o recurso fica desligado e o app continua funcionando.
- **Nenhum segredo no repositório** (nem em `supabase/seed.sql`, nem em migração, nem em teste). `SUPABASE_SECRET_KEY` (service_role) **nunca chega ao navegador** e, no código do app, só pode ser importada por `src/lib/supabase/admin.ts`, usado **só** pela rota da tarefa (um teste confere os imports). Nenhuma Server Action de pessoa usa a chave de serviço.
- **Rota da tarefa:** só `POST`; exige o cabeçalho `x-iris-job-secret`, comparado **em tempo constante** (SHA-256 dos dois lados + `timingSafeEqual`); sem segredo configurado (ou menor que 32 caracteres) responde 404; **não lê cookie nem sessão** — uma sessão de navegador nunca autoriza; fica fora do `proxy.ts`; responde só números. Nunca escreve em log endereço de push, e-mail, nome de conta ou texto do aviso (só tipo e contagem).
- **Endereços de push são dado pessoal (LGPD):** guardados por pessoa, sem leitura pela API (nem a própria pessoa lê; só funções), apagados ao desativar, ao sair da Íris naquele aparelho, quando o serviço de push diz que não valem mais e na exclusão do cadastro (cascata); nunca aparecem para outra pessoa, nem da família. Não se guarda nome nem modelo do aparelho. Um aparelho = uma pessoa: quem ativa num navegador que já tinha a inscrição de outra pessoa fica com ela, e a da outra é apagada. O servidor só envia para os serviços de push conhecidos (lista fixa de domínios, só `https`).
- **Um aviso nunca revela dado de outra pessoa.** Aviso da família diz só o que as telas da família já mostram (colunas seguras do Plano 7: nome, valor e dia da conta da família; total da meta da família; as frases da decisão 108). Nunca cartão (RN-31), forma de pagamento, entrada, Disponível, nem a parte de outro numa meta (A4 B). O banco monta os dados do aviso conferindo de novo, na hora do envio, que quem recebe ainda pode ver aquilo.
- **PWA:** manifest válido (nome "Íris", ícones do logo provisório, inclusive `maskable`, cores dos tokens). O service worker **não guarda página autenticada, resposta de API, nem arquivo de `/_next`**: só `/sem-conexao.html` e um ícone. Dado financeiro nunca é servido velho nem para outro cadastro num aparelho compartilhado. Offline está **fora** do escopo (etapa-2 §6): só o aviso "Sem conexão".
- **Nunca "baixe o app", "baixar", "loja", "app store" nem selo de loja.** A instalação é "Adicionar à tela de início" / "Instalar a Íris".
- Antes de escrever código Next, ler em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`): `01-app/02-guides/progressive-web-apps.md`, `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` e `app-icons.md`, `03-file-conventions/route.md`, `03-file-conventions/proxy.md`, `04-functions/after.md`, `01-app/02-guides/environment-variables.md`. `params`/`searchParams` são `Promise`.
- Idioma pt-BR, moeda só R$, dinheiro em **centavos inteiros**. Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor e de `(now() at time zone 'America/Sao_Paulo')::date` no banco; nunca do navegador. O `pg_cron` roda em UTC e o Brasil não tem horário de verão: 00h05 = `5 3 * * *`, 9h = `0 12 * * *`, 21h = `0 0 * * *`.
- **Uma regra de dinheiro, um lugar (RNF-11):** o "perto do limite" do planejado é o `budgetState` de `src/domain/planning.ts` (decisão 77), calculado no servidor pelos mesmos loaders do Planejamento; o banco só registra o aviso. Nenhuma fórmula do Seu mês é reescrita em SQL.
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar; "lembretes" (tela) e "avisos"; sem exclamação, sem urgência, sem alarme, sem julgamento; a culpa nunca é da pessoa.
- Todo texto visível vem da copy oficial, dos requisitos aprovados, do protótipo aprovado, dos textos já aprovados, ou da seção "Textos novos" no fim deste plano. Prioridade: decisões aprovadas > copy > manual visual > protótipo.
- Alvos de toque ≥ 44 px; texto 15–16 px no celular; contraste WCAG AA; nada depende só de cor (a chave liga/desliga é `role="switch"` com `aria-checked`).
- **Banco:** nunca editar migrações já aplicadas; tudo deste plano vai em **`supabase/migrations/20261002000001_notificacoes.sql`**, escrita em quatro seções (Tasks 2–5, anexadas nessa ordem ao mesmo arquivo novo). RLS ligada em toda tabela nova, com teste de banco provando o isolamento.
- **Funções SQL:** `set search_path = ''`; todo nome com `public.`/`extensions.`/`net.`/`cron.`/`vault.`; entradas limitadas. `security definer` só onde o plano diz, com o motivo no comentário. Funções de pessoa: `auth.uid()` conferido no começo, `revoke execute … from public, anon` + `grant … to authenticated`. Funções `job_*` e internas: `revoke execute … from public, anon, authenticated` + `grant … to service_role`; nunca recebem o id de quem chama por parâmetro vindo do navegador.
- Servidor: o id da pessoa vem **só** de `requireUser()`; Zod no servidor; `redirect()` nunca dentro de `try`; destino de redirecionamento e de clique de notificação só por lista fixa (`isAllowedTarget`). Módulos `'use server'` exportam **somente funções async**.
- E-mails: HTML simples e acessível (`lang="pt-BR"`, um título, parágrafos, link com texto que diz o que acontece e o endereço por extenso; sem imagem, sem rastreio) **e** versão em texto; todo nome vindo de pessoa é escapado no HTML.
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Valores em R$ têm NBSP: conferir por `textContent`. Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `@/lib/refresh`, `next/navigation` e seguem o fake encadeável de `src/features/familia/actions.test.ts` (filtros e parâmetros de `rpc` conferidos). **Nunca remover** um filtro de segurança para um teste passar.
- e2e: usuários com prefixo único por worker e por execução, limpeza só do próprio prefixo (padrão de `tests/e2e/plano7.spec.ts`), nomes de papel exatos (`{ name, exact: true }`).
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/` nem `.env.local`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como **pendente** em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem machucar alguém e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Aparelho compartilhado** — uma pessoa sai da Íris (ou a sessão vence) e outra entra no mesmo navegador. Expectativa: a segunda nunca recebe o lembrete da primeira ("Luz vence amanhã"), e nenhuma tela da primeira aparece sem rede. → **Task 2** (`a mesma inscrição passa para quem ativou por último`, `quem abre o app num aparelho com a inscrição de outra pessoa…`), **Task 8** (`service worker: nada do app fica guardado`), **Task 9** (sair desativa o aparelho; `PushSync`), e2e na **Task 13**.
2. **Aviso sobre algo que a pessoa não pode mais ver** — a conta foi paga entre o enfileirar e o envio; a pessoa saiu da família; o lembrete foi desligado um minuto antes; uma linha da fila aponta para a conta de outra pessoa. Expectativa: nada é enviado. → **Task 5** (`conta paga antes do envio não gera aviso`, `quem saiu da família não recebe`, `linha forjada com a conta de outra pessoa não devolve nada`, `desligar antes do envio cancela`).
3. **Endereço de push malicioso** — alguém grava como "endereço de push" um endereço interno (`http://169.254.169.254/…`, `https://localhost/…`) para fazer o servidor chamá-lo. Expectativa: recusado ao salvar e de novo antes de enviar. → **Task 6** (`isAllowedPushEndpoint`), **Task 9** (`savePushSubscription recusa endereço fora da lista`), **Task 2** (banco só aceita `https://`).
4. **Nome com HTML ou quebra de linha** — família ou pessoa chamada `<img src=x onerror=…>` ou com `\r\nBcc:` vai parar no e-mail de convite. Expectativa: aparece como texto; o assunto não ganha cabeçalho novo. → **Task 6** (`inviteEmail escapa nomes`, `assunto sem quebra de linha`).
5. **Tarefa chamada por quem não devia, ou duas vezes** — alguém descobre a rota e chama do navegador com a sessão aberta; o agendador dispara duas vezes; o envio falha no meio. Expectativa: sem o segredo, 404 e nada acontece; a mesma conta gera um aviso só; falha tenta de novo até 3 vezes e para. → **Task 7** (`sem segredo: 404`, `sessão não autoriza`, `falha não marca como enviado`), **Task 5** (`rodar duas vezes não duplica`, `depois de 3 tentativas a linha não volta`), **Task 3** (`cria as contas de quem não abriu o app, e rodar de novo não duplica`).

---

## Estrutura de arquivos

```
supabase/migrations/20261002000001_notificacoes.sql   NOVO (4 seções): preferências, inscrições e fila; geração diária; convite por e-mail; enfileirar, entregar e agendar
supabase/config.toml                                  MOD: porta SMTP local; modelo do e-mail de recuperação de senha
supabase/templates/recovery.html                      NOVO: e-mail "Crie uma nova senha na Íris"
tests/db/notify-helpers.ts                            NOVO: subscribe, logRows, pendingBill, today/addDays
tests/db/plano8-preferencias.test.ts                  NOVO: prefs, inscrições (LGPD), fila sem acesso, queue_own_notification
tests/db/plano8-ocorrencias.test.ts                   NOVO: tarefa diária, generated_through
tests/db/plano8-convite.test.ts                       NOVO: convite por e-mail, limite, limpeza
tests/db/plano8-fila.test.ts                          NOVO: enfileirar, entregar o lote, avisos da família, agenda
tests/db/plano3.test.ts                               MOD: o preparo que mexe em generated_through passa a usar o cliente administrativo
tests/e2e/plano8.spec.ts                              NOVO
tests/e2e/plano2.spec.ts                              MOD: o onboarding ganha o passo "Instalar a Íris"
scripts/gerar-icones.mjs                              NOVO: gera os PNG a partir do logo provisório (sharp)
scripts/rodar-tarefa.mjs                              NOVO: chama a rota da tarefa local com o segredo de .env.local
public/sw.js                                          NOVO: service worker (sem cache de páginas)
public/sem-conexao.html                               NOVO: página estática "Sem conexão"
public/icons/{icon-192,icon-512,maskable-192,maskable-512,badge-96}.png   NOVO
src/app/manifest.ts, icon.png, apple-icon.png         NOVO (remove src/app/favicon.ico do modelo do Next)
src/app/layout.tsx, next.config.ts, src/proxy.ts (+ proxy.test.ts)   MOD
src/app/api/jobs/notificacoes/route.ts (+ route.test.ts)             NOVO
src/app/(onboarding)/boas-vindas/instalar/page.tsx    NOVO
src/app/(app)/configuracoes/page.tsx                  MOD: seções "Lembretes" e "App"
src/app/(app)/configuracoes/instalar/page.tsx         NOVO
src/app/(app)/contas/page.tsx, familia/contas/page.tsx, layout.tsx   MOD: ?pagar=, cartão de lembretes, PushSync
src/domain/notifications.ts (+ .test.ts)              NOVO: tipos, preferências, padrões, isAllowedTarget
src/lib/server-env.ts (+ .test.ts)                    NOVO: variáveis só do servidor, tolerantes à ausência
src/lib/supabase/admin.ts                             NOVO: cliente com a chave de serviço (server-only)
src/features/notificacoes/
  messages.ts (+ .test.ts)                            NOVO: notificationMessage (texto + destino de cada aviso)
  endpoint.ts (+ .test.ts)                            NOVO: isAllowedPushEndpoint
  push-sender.ts (+ .test.ts), mailer.ts (+ .test.ts) NOVO: interfaces e implementações (web-push, SMTP, memória)
  emails.ts (+ .test.ts)                              NOVO: inviteEmail, monthSummaryEmail
  job-auth.ts (+ .test.ts), deliver.ts (+ .test.ts)   NOVO: segredo em tempo constante; entrega do lote
  admin-import.test.ts                                NOVO: só a rota da tarefa importa o cliente de serviço
  queries.ts, actions.ts (+ .test.ts), schemas.ts     NOVO: loadNotificationPrefs; setNotificationPref, savePushSubscription, syncPushSubscription, removePushSubscription
  alerts.ts (+ .test.ts)                              NOVO: queueBudgetAlert, queueGoalAlert
  push-client.ts (+ .test.ts)                         NOVO: estado do aparelho, ativar, desativar
  reminders-section.tsx, push-device.tsx, push-sync.tsx, bills-reminder-card.tsx, pay-from-notification.tsx (+ testes)   NOVO
src/features/pwa/
  register-sw.tsx, install-prompt.ts, install-card.tsx (+ testes), sw.test.ts, assets.test.ts   NOVO
src/features/shell/offline-banner.tsx (+ .test.tsx)   NOVO
src/features/shell/sign-out-button.tsx                MOD: desativa o aparelho antes de sair
src/features/familia/actions.ts, invite-state.ts, invite-panel.tsx, view-model.ts, queries.ts, familia-page.tsx (+ testes)   MOD: convite por e-mail, "Reenviar"
src/features/registro/actions.ts, contas/actions.ts, familia/money-actions.ts, metas/movement-actions.ts, metas/family-goal-actions.ts (+ testes)   MOD: avisos depois do registro
src/features/perfil/actions.ts (+ .test.ts)           MOD: depois do saldo inicial vai para "Instalar a Íris"
src/ui/switch-row.tsx (+ .test.tsx)                   NOVO
package.json, .env.example, README.md, docs/progresso.md, docs/decisoes-para-revisao.md   MOD
```

---

### Task 1: Tipos de aviso, preferências, textos e destinos

**Files:**
- Create: `src/domain/notifications.ts`, `src/domain/notifications.test.ts`
- Create: `src/features/notificacoes/messages.ts`, `src/features/notificacoes/messages.test.ts`

**Interfaces:**
- Consumes: `formatBRL` (`@/domain/money`), `monthOf` (`@/domain/dates`), `monthName` (`@/domain/recurrence`), `eventText` e `FamilyEventRow` (`@/features/familia/view-model`, `@/features/familia/types`).
- Produces (`@/domain/notifications`):
  - `NOTIFICATION_KINDS = ['bill_tomorrow','bill_today','income_today','budget_near','goal_near','month_summary','daily_reminder','comeback','family_event'] as const`; `type NotificationKind`
  - `PREF_KINDS = ['bills','income','budget','goal','summary','daily','comeback','family'] as const`; `type PrefKind`
  - `prefOf(kind: NotificationKind): PrefKind` — `bill_tomorrow`/`bill_today` → `bills`; `income_today` → `income`; `budget_near` → `budget`; `goal_near` → `goal`; `month_summary` → `summary`; `daily_reminder` → `daily`; `comeback` → `comeback`; `family_event` → `family`
  - `PREF_DEFAULTS: Record<PrefKind, boolean>` — tudo `true`, menos `daily: false` (RF-47)
  - `PREF_LABELS: Record<PrefKind, string>` — `bills: 'Contas perto do vencimento'`, `income: 'Entradas a receber'`, `budget: 'Planejado quase no limite'`, `goal: 'Meta perto de ser concluída'`, `summary: 'Resumo do mês'`, `daily: 'Lembrete para anotar'`, `comeback: 'Depois de alguns dias sem registro'`, `family: 'Avisos da família'`
  - `PREF_ORDER: PrefKind[] = ['bills','income','budget','goal','summary','comeback','family','daily']`
  - `resolvePrefs(rows: { kind: string; enabled: boolean }[]): Record<PrefKind, boolean>`
  - `isPrefKind(v: unknown): v is PrefKind`
  - `isAllowedTarget(path: string): boolean`
  - `COMEBACK_DAYS = 5`, `GOAL_NEAR_TENTHS = 1` (falta ≤ 1/10 do valor), `REMINDER_HOUR = 9`, `DAILY_REMINDER_HOUR = 21`
- Produces (`@/features/notificacoes/messages`):
  - `type PushMessage = { body: string; url: string; tag: string; pay: boolean }`
  - `notificationMessage(kind: NotificationKind, params: unknown): PushMessage | null` — `null` quando os dados não servem (nunca lança)
  - `PUSH_TITLE = 'Íris'`

- [ ] **Step 1: Escrever os testes que falham**

`src/domain/notifications.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NOTIFICATION_KINDS, PREF_DEFAULTS, PREF_KINDS, PREF_LABELS, PREF_ORDER, isAllowedTarget, isPrefKind, prefOf, resolvePrefs } from './notifications'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

describe('preferências', () => {
  test('tudo ligado por padrão, menos o lembrete para anotar (RF-47)', () => {
    expect(PREF_DEFAULTS).toEqual({ bills: true, income: true, budget: true, goal: true, summary: true, daily: false, comeback: true, family: true })
  })
  test('cada tipo de aviso tem uma chave de preferência, e cada chave tem rótulo e posição', () => {
    for (const k of NOTIFICATION_KINDS) expect(PREF_KINDS).toContain(prefOf(k))
    expect(prefOf('bill_tomorrow')).toBe('bills')
    expect(prefOf('bill_today')).toBe('bills')
    expect([...PREF_ORDER].sort()).toEqual([...PREF_KINDS].sort())
    for (const k of PREF_KINDS) expect(PREF_LABELS[k].length).toBeGreaterThan(0)
    expect(PREF_LABELS.bills).toBe('Contas perto do vencimento')
    expect(PREF_LABELS.daily).toBe('Lembrete para anotar')
  })
  test('resolvePrefs: linha gravada vence o padrão; tipo desconhecido é ignorado', () => {
    expect(resolvePrefs([])).toEqual(PREF_DEFAULTS)
    expect(resolvePrefs([{ kind: 'daily', enabled: true }, { kind: 'bills', enabled: false }, { kind: 'x', enabled: false }]))
      .toEqual({ ...PREF_DEFAULTS, daily: true, bills: false })
  })
  test('isPrefKind', () => {
    expect(isPrefKind('goal')).toBe(true)
    expect(isPrefKind('bill_today')).toBe(false)
    expect(isPrefKind(null)).toBe(false)
  })
})

describe('isAllowedTarget: só caminhos internos de uma lista fixa', () => {
  test.each([
    '/inicio', '/anotar', '/planejamento', '/familia', '/relatorios?periodo=mes-passado',
    '/contas?mes=2026-10', `/contas?mes=2026-10&pagar=${ID}`, `/familia/contas?pagar=${ID}`, `/metas/${ID}`,
  ])('aceita %s', (p) => expect(isAllowedTarget(p)).toBe(true))
  test.each([
    '', '/', '//evil.com', 'https://evil.com', '/\\evil.com', '/inicio?next=//evil.com', '/contas?pagar=abc',
    '/contas?mes=2026-13&pagar=' + ID, '/metas/abc', '/metas/' + ID + '/usar', '/configuracoes', '/entrar', '/inicio\n', ' /inicio',
  ])('recusa %j', (p) => expect(isAllowedTarget(p)).toBe(false))
})
```

`src/features/notificacoes/messages.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { isAllowedTarget, NOTIFICATION_KINDS } from '@/domain/notifications'
import { notificationMessage, PUSH_TITLE } from './messages'

const NBSP = String.fromCharCode(0xa0)
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

const SAMPLES = {
  bill_tomorrow: { name: 'Luz', id: ID, due_on: '2026-10-02', family: false },
  bill_today: { name: 'Luz', id: ID, due_on: '2026-10-01', family: false },
  income_today: { name: 'Salário', id: ID, due_on: '2026-10-01', family: false },
  budget_near: { name: 'Mercado' },
  goal_near: { name: 'Viagem', id: ID, remaining_cents: 40000 },
  month_summary: { month: '2026-09' },
  daily_reminder: {},
  comeback: {},
  family_event: { event_kind: 'member_left', member_name: 'Alex', goal_name: 'Viagem', amount_cents: 30000 },
} as const

describe('notificationMessage', () => {
  test('título fixo', () => expect(PUSH_TITLE).toBe('Íris'))

  test('conta que vence amanhã: frase da copy, abre Contas com a confirmação, tem o botão de pagar', () => {
    expect(notificationMessage('bill_tomorrow', SAMPLES.bill_tomorrow)).toEqual({
      body: 'Luz vence amanhã. Quer marcar como paga?', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true,
    })
  })
  test('conta de hoje', () => {
    expect(notificationMessage('bill_today', SAMPLES.bill_today)).toEqual({
      body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true,
    })
  })
  test('conta da família abre Família → Contas', () => {
    expect(notificationMessage('bill_today', { ...SAMPLES.bill_today, family: true })?.url).toBe(`/familia/contas?pagar=${ID}`)
  })
  test('entrada a receber abre Contas no mês, sem botão de pagar', () => {
    expect(notificationMessage('income_today', SAMPLES.income_today)).toEqual({
      body: 'Hoje é o dia de receber Salário.', url: '/contas?mes=2026-10', tag: `income-${ID}`, pay: false,
    })
  })
  test('planejado, meta, resumo, lembrete e retomada usam a copy', () => {
    expect(notificationMessage('budget_near', SAMPLES.budget_near)).toMatchObject({ body: 'Você já usou boa parte do que planejou para Mercado.', url: '/planejamento', pay: false })
    expect(notificationMessage('goal_near', SAMPLES.goal_near)).toMatchObject({ body: `Faltam só R$${NBSP}400,00 para Viagem.`, url: `/metas/${ID}` })
    expect(notificationMessage('month_summary', SAMPLES.month_summary)).toMatchObject({ body: 'Seu mês de setembro está fechado. Quer ver como foi?', url: '/relatorios?periodo=mes-passado' })
    expect(notificationMessage('daily_reminder', SAMPLES.daily_reminder)).toMatchObject({ body: 'Teve algum gasto hoje? Leva só alguns segundos.', url: '/anotar' })
    expect(notificationMessage('comeback', SAMPLES.comeback)).toMatchObject({ body: 'Seu mês continua aqui. Quer atualizar?', url: '/inicio' })
  })
  test('avisos da família usam as frases da decisão 108', () => {
    expect(notificationMessage('family_event', SAMPLES.family_event)).toMatchObject({
      body: `Alex saiu da família, e R$${NBSP}300,00 da meta Viagem voltaram para Alex.`, url: '/familia',
    })
    expect(notificationMessage('family_event', { event_kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null })?.body)
      .toBe('Um membro saiu da família.')
  })
  test('todo aviso: destino da lista fixa, sem exclamação, sem "baix"', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const m = notificationMessage(kind, SAMPLES[kind])
      expect(m, kind).not.toBeNull()
      expect(isAllowedTarget(m!.url), kind).toBe(true)
      expect(m!.body).not.toContain('!')
      expect(m!.body.toLowerCase()).not.toContain('baix')
    }
  })
  test('dados que não servem: nada (nunca lança)', () => {
    expect(notificationMessage('bill_today', { name: '', id: ID, due_on: '2026-10-01', family: false })).toBeNull()
    expect(notificationMessage('bill_today', { name: 'Luz', id: 'x', due_on: '2026-10-01', family: false })).toBeNull()
    expect(notificationMessage('bill_today', null)).toBeNull()
    expect(notificationMessage('goal_near', { name: 'Viagem', id: ID, remaining_cents: 0 })).toBeNull()
    expect(notificationMessage('goal_near', { name: 'Viagem', id: ID, remaining_cents: 1.5 })).toBeNull()
    expect(notificationMessage('month_summary', { month: '2026-13' })).toBeNull()
    expect(notificationMessage('family_event', { event_kind: 'outro' })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/notifications.test.ts src/features/notificacoes/messages.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `src/domain/notifications.ts`**

Sem dependência de banco ou tela. `isAllowedTarget(path)` devolve `true` só quando `path` casa **inteiro** com uma destas expressões (e não tem caractere de controle nem `\`):

```ts
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MONTH = '20\\d{2}-(0[1-9]|1[0-2])'
const TARGETS = [
  /^\/(inicio|anotar|planejamento|familia)$/,
  /^\/relatorios\?periodo=mes-passado$/,
  new RegExp(`^/contas\\?mes=${MONTH}(&pagar=${UUID})?$`),
  new RegExp(`^/familia/contas\\?pagar=${UUID}$`),
  new RegExp(`^/metas/${UUID}$`),
]
```

- [ ] **Step 4: Implementar `src/features/notificacoes/messages.ts`**

`notificationMessage` valida `params` com Zod (um esquema por tipo; `name` de 1 a 60 caracteres depois de `trim`, `id` uuid, `due_on` data ISO, `remaining_cents` inteiro de 1 a `MAX_CENTS`, `month` `AAAA-MM` válido) e devolve `null` se não passar. Textos e destinos exatamente como nos testes; `tag`: `bill-{id}`, `income-{id}`, `budget-{name}`, `goal-{id}`, `summary-{month}`, `daily`, `comeback`, `family`. O mês do resumo é `monthName(Number(month.slice(5)))`. O aviso da família reaproveita `eventText` (mesmas frases do Plano 7), convertendo `{ event_kind, member_name, goal_name, amount_cents }` para `FamilyEventRow`. Antes de devolver, confere `isAllowedTarget(url)`; se não passar, `null`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/domain/notifications.test.ts src/features/notificacoes/messages.test.ts && npx tsc --noEmit`
Expected: PASS; tipos sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/domain/notifications.ts src/domain/notifications.test.ts src/features/notificacoes/messages.ts src/features/notificacoes/messages.test.ts
git commit -m "feat(notificacoes): tipos de aviso, preferências, textos e destinos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Banco — preferências, inscrições de push e fila de avisos

**Files:**
- Create: `supabase/migrations/20261002000001_notificacoes.sql` (seção 1)
- Create: `tests/db/notify-helpers.ts`, `tests/db/plano8-preferencias.test.ts`

**Interfaces:**
- Consumes: `public.my_family_id()`, `public.family_members`, `public.goals`, `public.goal_movements`, `public.budgets` (Planos 5–7); `admin`, `newUser`, `removeUsers`, `categoryId` (`tests/db/helpers.ts`); `createFamily`, `joinFamily`, `todaySP` (`tests/db/family-helpers.ts`).
- Produces (banco):
  - `public.notification_prefs (user_id, kind, enabled)` — leitura e gravação só do dono (RLS)
  - `public.push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)` — sem nenhum acesso pela API
  - `public.notification_log (id, user_id, kind, ref, created_at, claimed_at, attempts, sent_at)` — sem nenhum acesso pela API; `unique (user_id, kind, ref)`
  - `public.notification_enabled(p_user uuid, p_kind text) returns boolean` — interna
  - `public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void`
  - `public.sync_push_subscription(p_endpoint text) returns boolean`
  - `public.delete_push_subscription(p_endpoint text) returns void`
  - `public.queue_own_notification(p_kind text, p_id uuid) returns integer` — `p_kind` ∈ `budget_near`, `goal_near`
- Produces (`tests/db/notify-helpers.ts`): `endpoint(tag)`, `P256DH`, `AUTH`, `subscribe(user, ep?)`, `logRows(userId)`, `subscriptionsOf(userId)`, `pendingBill(user, { name, dueOn, familyId?, kind? })`, `addDaysISO(d, n)`, `monthStart(d)`

- [ ] **Step 1: Escrever os ajudantes e os testes que falham**

`tests/db/notify-helpers.ts`:

```ts
import { admin, categoryId, type TestUser } from './helpers'

export const P256DH = `B${'A'.repeat(86)}`
export const AUTH = 'A'.repeat(22)
export const endpoint = (tag: string) => `https://fcm.googleapis.com/fcm/send/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const addDaysISO = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`

export async function subscribe(user: TestUser, ep: string = endpoint('t')): Promise<string> {
  const { error } = await user.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: P256DH, p_auth: AUTH })
  if (error) throw error
  return ep
}

export async function subscriptionsOf(userId: string): Promise<{ id: string; endpoint: string }[]> {
  const { data, error } = await admin.from('push_subscriptions').select('id, endpoint').eq('user_id', userId).order('created_at')
  if (error) throw error
  return data
}

export async function logRows(userId: string): Promise<{ id: string; kind: string; ref: string; sent_at: string | null; attempts: number }[]> {
  const { data, error } = await admin.from('notification_log').select('id, kind, ref, sent_at, attempts').eq('user_id', userId).order('created_at')
  if (error) throw error
  return data
}

// Molde + ocorrência a pagar (ou a receber), gravados pelo cliente administrativo (as guardas do banco valem).
export async function pendingBill(
  user: TestUser,
  opts: { name: string; dueOn: string; familyId?: string; kind?: 'expense' | 'income' },
): Promise<string> {
  const kind = opts.kind ?? 'expense'
  const category = kind === 'expense' ? await categoryId(user, 'casa') : null
  const period = monthStart(opts.dueOn)
  const rec = await admin.from('recurrences').insert({
    user_id: user.id, kind, name: opts.name, amount_cents: 10000, category_id: category, source: kind === 'income' ? opts.name : null,
    frequency: 'monthly', due_day: Number(opts.dueOn.slice(8)), starts_on: period, generated_through: period,
    ...(opts.familyId ? { family_id: opts.familyId } : {}),
  }).select('id').single()
  if (rec.error) throw rec.error
  const tx = await admin.from('transactions').insert({
    user_id: user.id, kind, amount_cents: 10000, category_id: category, source: kind === 'income' ? opts.name : null,
    occurred_on: opts.dueOn, status: 'pending', due_on: opts.dueOn, recurrence_id: rec.data.id, recurrence_period: period,
    ...(opts.familyId ? { family_id: opts.familyId } : {}),
  }).select('id').single()
  if (tx.error) throw tx.error
  return tx.data.id as string
}
```

`tests/db/plano8-preferencias.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { AUTH, P256DH, endpoint, logRows, monthStart, subscribe, subscriptionsOf } from './notify-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const month = today.slice(0, 7)

describe('preferências de aviso (RF-50)', () => {
  let a: TestUser, b: TestUser
  beforeAll(async () => { a = await newUser('Ana'); b = await newUser('Bia') })
  afterAll(async () => { await removeUsers(a, b) })

  test('cada pessoa grava e lê só as próprias', async () => {
    const up = await a.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'daily', enabled: true })
    expect(up.error).toBeNull()
    expect((await a.client.from('notification_prefs').select('kind, enabled')).data).toEqual([{ kind: 'daily', enabled: true }])
    expect((await b.client.from('notification_prefs').select('kind')).data).toEqual([])
    expect((await anon.from('notification_prefs').select('kind')).data ?? []).toEqual([])
  })
  test('ninguém grava a preferência de outra pessoa nem um tipo que não existe', async () => {
    const forOther = await b.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'bills', enabled: false })
    expect(forOther.error).not.toBeNull()
    const change = await b.client.from('notification_prefs').update({ enabled: false }).eq('user_id', a.id).select('kind')
    expect(change.data ?? []).toEqual([])
    const bad = await a.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'tudo', enabled: true })
    expect(bad.error).not.toBeNull()
    expect((await admin.from('notification_prefs').select('kind, enabled').eq('user_id', a.id)).data).toEqual([{ kind: 'daily', enabled: true }])
  })
  test('notification_enabled é interna: ninguém pergunta pela preferência de outra pessoa', async () => {
    const r = await b.client.rpc('notification_enabled', { p_user: a.id, p_kind: 'daily_reminder' })
    expect(r.error?.code).toBe('42501')
  })
})

describe('inscrições de push (LGPD)', () => {
  let a: TestUser, b: TestUser, gone: TestUser
  beforeAll(async () => { a = await newUser('Ana'); b = await newUser('Bia'); gone = await newUser('Gil') })
  afterAll(async () => { await removeUsers(a, b) })

  test('a tabela não é lida nem gravada pela API, nem pela própria pessoa', async () => {
    const ep = await subscribe(a)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).toEqual([ep])
    for (const c of [a.client, b.client, anon]) {
      const read = await c.from('push_subscriptions').select('endpoint')
      expect(read.error?.code).toBe('42501')
      const write = await c.from('push_subscriptions').insert({ user_id: a.id, endpoint: endpoint('x'), p256dh: P256DH, auth: AUTH })
      expect(write.error?.code).toBe('42501')
      const del = await c.from('push_subscriptions').delete().eq('endpoint', ep)
      expect(del.error?.code).toBe('42501')
    }
    expect((await subscriptionsOf(a.id)).length).toBe(1)
  })
  test('sem sessão ninguém se inscreve; endereço e chaves têm forma certa', async () => {
    const noSession = await anon.rpc('save_push_subscription', { p_endpoint: endpoint('n'), p_p256dh: P256DH, p_auth: AUTH })
    expect(noSession.error).not.toBeNull()
    for (const bad of ['http://fcm.googleapis.com/fcm/send/abcdefgh', 'ftp://exemplo.com/abcdefghij', 'https://a b.exemplo.com/abcdef', '', `https://x/${'a'.repeat(2100)}`]) {
      const r = await b.client.rpc('save_push_subscription', { p_endpoint: bad, p_p256dh: P256DH, p_auth: AUTH })
      expect(r.error?.message, bad).toContain('Inscrição inválida.')
    }
    const badKey = await b.client.rpc('save_push_subscription', { p_endpoint: endpoint('k'), p_p256dh: 'curta', p_auth: AUTH })
    expect(badKey.error?.message).toContain('Inscrição inválida.')
    const badAuth = await b.client.rpc('save_push_subscription', { p_endpoint: endpoint('k'), p_p256dh: P256DH, p_auth: 'a b' })
    expect(badAuth.error?.message).toContain('Inscrição inválida.')
    expect(await subscriptionsOf(b.id)).toEqual([])
  })
  test('a mesma inscrição passa para quem ativou por último (aparelho compartilhado)', async () => {
    const ep = await subscribe(a, endpoint('shared'))
    await subscribe(b, ep)
    expect((await subscriptionsOf(b.id)).map((s) => s.endpoint)).toContain(ep)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
  })
  test('quem abre o app num aparelho com a inscrição de outra pessoa: ela é apagada e a resposta é "não é sua"', async () => {
    const ep = await subscribe(a, endpoint('sync'))
    expect((await a.client.rpc('sync_push_subscription', { p_endpoint: ep })).data).toBe(true)
    expect((await b.client.rpc('sync_push_subscription', { p_endpoint: ep })).data).toBe(false)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
    expect((await b.client.rpc('sync_push_subscription', { p_endpoint: endpoint('nunca') })).data).toBe(false)
  })
  test('desativar apaga só a própria inscrição', async () => {
    const ep = await subscribe(a, endpoint('del'))
    await b.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).toContain(ep)
    await a.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
  })
  test('no máximo 10 aparelhos por pessoa: o mais antigo sai', async () => {
    const before = (await subscriptionsOf(b.id)).map((s) => s.endpoint)
    const eps: string[] = []
    for (let i = 0; i < 11; i++) eps.push(await subscribe(b, endpoint(`d${i}`)))
    const kept = (await subscriptionsOf(b.id)).map((s) => s.endpoint)
    expect(kept.length).toBe(10)
    for (const old of before) expect(kept).not.toContain(old)
    expect(kept).not.toContain(eps[0])
    expect(kept).toContain(eps[10])
  })
  test('excluir o cadastro apaga inscrições, preferências e avisos da pessoa', async () => {
    await subscribe(gone)
    await gone.client.from('notification_prefs').upsert({ user_id: gone.id, kind: 'daily', enabled: true })
    const { error } = await admin.from('notification_log').insert({ user_id: gone.id, kind: 'comeback', ref: today })
    expect(error).toBeNull()
    await removeUsers(gone)
    expect(await subscriptionsOf(gone.id)).toEqual([])
    expect(await logRows(gone.id)).toEqual([])
    expect((await admin.from('notification_prefs').select('kind').eq('user_id', gone.id)).data).toEqual([])
  })
})

describe('fila de avisos', () => {
  let a: TestUser, b: TestUser, c: TestUser, out: TestUser
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio'); out = await newUser('Eli')
    await createFamily(a, 'Família Fila')
    await joinFamily(b, a)
    await joinFamily(c, a)
    await subscribe(a); await subscribe(b); await subscribe(out)
  })
  afterAll(async () => { await removeUsers(b, c, out, a) })

  test('a fila não é lida nem gravada pela API', async () => {
    await admin.from('notification_log').insert({ user_id: a.id, kind: 'comeback', ref: 'x' })
    for (const cl of [a.client, b.client, anon]) {
      expect((await cl.from('notification_log').select('id')).error?.code).toBe('42501')
      expect((await cl.from('notification_log').insert({ user_id: a.id, kind: 'comeback', ref: 'y' })).error?.code).toBe('42501')
    }
  })

  test('planejado: só categoria própria, com planejado neste mês, uma vez por mês, com aparelho e com a chave ligada', async () => {
    const mine = await categoryId(a, 'mercado')
    const others = await categoryId(b, 'mercado')
    const q = (u: TestUser, id: string) => u.client.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: id })
    expect((await q(a, others)).data).toBe(0)
    expect((await q(a, mine)).data).toBe(0) // sem planejado
    const { error } = await admin.from('budgets').insert({ user_id: a.id, month: monthStart(today), category_id: mine, amount_cents: 100000 })
    expect(error).toBeNull()
    expect((await q(a, mine)).data).toBe(1)
    expect((await q(a, mine)).data).toBe(0) // já avisado neste mês
    expect((await logRows(a.id)).filter((r) => r.kind === 'budget_near').map((r) => r.ref)).toEqual([`${mine}:${month}`])

    const cCat = await categoryId(c, 'mercado')
    await admin.from('budgets').insert({ user_id: c.id, month: monthStart(today), category_id: cCat, amount_cents: 100000 })
    expect((await q(c, cCat)).data).toBe(0) // sem aparelho
    const bCat = await categoryId(b, 'lazer')
    await admin.from('budgets').insert({ user_id: b.id, month: monthStart(today), category_id: bCat, amount_cents: 100000 })
    await b.client.from('notification_prefs').upsert({ user_id: b.id, kind: 'budget', enabled: false })
    expect((await q(b, bCat)).data).toBe(0) // chave desligada
  })

  test('meta pessoal: só quando falta até um décimo, nunca completa, nunca a meta de outra pessoa', async () => {
    const goal = (await out.client.from('goals').insert({ user_id: out.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    const q = (u: TestUser) => u.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 50000 })
    expect((await q(out)).data).toBe(0)
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 40000 })
    expect((await q(a)).data).toBe(0) // não é dela
    expect((await q(out)).data).toBe(1)
    expect((await q(out)).data).toBe(0)
    expect((await logRows(out.id)).filter((r) => r.kind === 'goal_near').map((r) => r.ref)).toEqual([`${goal}:${month}`])
    const done = (await out.client.from('goals').insert({ user_id: out.id, name: 'Pronta', target_cents: 1000 }).select('id').single()).data!.id
    await out.client.rpc('deposit_to_goal', { p_goal_id: done, p_amount_cents: 1000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: done })).data).toBe(0)
  })

  test('meta da família: avisa quem participa e tem aparelho; quem é de fora não enfileira nada', async () => {
    const goal = (await a.client.rpc('create_family_goal', { p_name: 'Sofá', p_target_cents: 100000, p_deadline: null })).data as string
    await b.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 95000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(0)
    expect((await b.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(2) // Ana e Bia; Caio não tem aparelho
    for (const u of [a, b]) expect((await logRows(u.id)).some((r) => r.kind === 'goal_near' && r.ref === `${goal}:${month}`)).toBe(true)
    expect((await logRows(c.id)).some((r) => r.kind === 'goal_near')).toBe(false)
    expect((await logRows(out.id)).some((r) => r.ref.startsWith(goal))).toBe(false)
  })

  test('tipo desconhecido, id vazio e falta de sessão são recusados', async () => {
    const mine = await categoryId(a, 'mercado')
    expect((await a.client.rpc('queue_own_notification', { p_kind: 'bill_today', p_id: mine })).error?.message).toContain('Aviso inválido.')
    expect((await a.client.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: null })).error?.message).toContain('Aviso inválido.')
    expect((await anon.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: mine })).error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- plano8-preferencias`
Expected: FAIL (tabelas e funções não existem). Sem Docker: os testes falham por conexão; siga para o Step 3 e registre a execução como pendente (Task 13).

- [ ] **Step 3: Escrever a seção 1 da migração**

`supabase/migrations/20261002000001_notificacoes.sql`:

```sql
-- Plano 8: PWA e notificações (RF-16, RF-42 por e-mail, RF-46–50; A8).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regras de ouro:
-- 1. A fila (notification_log) guarda só o tipo e uma referência (id, mês ou
--    dia). O texto do aviso é montado na hora do envio, e o banco confere de
--    novo, nessa hora, se quem recebe ainda pode ver aquilo.
-- 2. Endereço de push é dado pessoal: ninguém lê pela API, nem a própria
--    pessoa. Só funções.
-- 3. As funções job_* são do agendador e da rota da tarefa (service_role).
--    Nunca são chamadas com a sessão de uma pessoa.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ============================================================================
-- Seção 1 — preferências, inscrições de push e fila de avisos
-- ============================================================================

-- 1. Preferências (RF-50). Só o que a pessoa mudou é gravado; sem linha vale o
--    padrão: tudo ligado, menos o lembrete para anotar (RF-47).
create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bills', 'income', 'budget', 'goal', 'summary', 'daily', 'comeback', 'family')),
  enabled boolean not null,
  primary key (user_id, kind)
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;

create policy notification_prefs_own on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Inscrições de push: uma por aparelho. Só o endereço e as duas chaves que
--    o navegador entrega; nenhum nome ou modelo de aparelho. Sem acesso pela
--    API: nem leitura (as chaves não saem do banco), nem gravação direta.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048 and endpoint ~ '^https://[^[:space:]]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 3. Fila e registro dos avisos. Uma linha por pessoa, tipo e referência: o
--    mesmo aviso nunca sai duas vezes. sent_at vazio = ainda por enviar.
--    Referência: id do registro (contas e entradas), "{id}:{AAAA-MM}"
--    (planejado e meta), "AAAA-MM" (resumo), "AAAA-MM-DD" (lembrete e
--    retomada) ou id do aviso da família. Nunca texto.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'bill_tomorrow', 'bill_today', 'income_today', 'budget_near', 'goal_near',
    'month_summary', 'daily_reminder', 'comeback', 'family_event'
  )),
  ref text not null check (char_length(ref) between 1 and 80),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  sent_at timestamptz,
  unique (user_id, kind, ref)
);

create index notification_log_pending_idx on public.notification_log (created_at) where sent_at is null;

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- 4. O aviso deste tipo está ligado para esta pessoa? Interna (sem grant):
--    só as funções abaixo a chamam.
create function public.notification_enabled(p_user uuid, p_kind text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(
    (select np.enabled from public.notification_prefs np
     where np.user_id = p_user
       and np.kind = case p_kind
         when 'bill_tomorrow' then 'bills' when 'bill_today' then 'bills'
         when 'income_today' then 'income' when 'budget_near' then 'budget'
         when 'goal_near' then 'goal' when 'month_summary' then 'summary'
         when 'daily_reminder' then 'daily' when 'comeback' then 'comeback'
         when 'family_event' then 'family' end),
    p_kind <> 'daily_reminder'
  )
$$;

-- 5. Ativar os lembretes neste aparelho. SECURITY DEFINER: a tabela não
--    aceita gravação direta, e num aparelho compartilhado a inscrição que era
--    de outra pessoa precisa sair (um aparelho = uma pessoa). No máximo 10
--    aparelhos por pessoa; o mais antigo sai.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 2048 or p_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'Inscrição inválida.';
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (v_uid, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions ps
    where ps.user_id = v_uid
      and ps.id not in (
        select k.id from public.push_subscriptions k
        where k.user_id = v_uid order by k.created_at desc, k.id desc limit 10
      );
end;
$$;

-- 6. Ao abrir o app: a inscrição deste navegador é minha? Se for de outra
--    pessoa (ela saiu sem desativar, ou a sessão venceu), é apagada: quem está
--    usando o aparelho agora não recebe o lembrete de outra pessoa.
--    SECURITY DEFINER: mesmo motivo do item 5. Só responde sim ou não.
create function public.sync_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 2048 then
    return false;
  end if;
  select ps.user_id into v_owner from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  if not found then
    return false;
  end if;
  if v_owner = v_uid then
    return true;
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  return false;
end;
$$;

-- 7. Desativar neste aparelho (e ao sair da Íris): apaga só a própria.
create function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint and ps.user_id = v_uid;
end;
$$;

-- 8. Avisos que nascem de um registro da própria pessoa (etapa-3 §5: "logo
--    após cada registro"), no máximo um por categoria ou meta por mês.
--    - budget_near: quem decide que a categoria está "perto do limite" é o
--      servidor, com a regra de src/domain/planning.ts (RNF-11). Aqui só se
--      confere que a categoria é de quem chama e tem planejado neste mês.
--    - goal_near: conferido aqui (falta até um décimo do valor e a meta não
--      está completa), porque na meta da família o aviso vai para os outros
--      membros: ninguém manda aviso à família sem ser verdade. Diz só o total
--      (A4 B).
--    SECURITY DEFINER: a fila não aceita gravação direta, e a meta da família
--    avisa outras pessoas. Devolve quantos avisos entraram na fila.
create function public.queue_own_notification(p_kind text, p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_ref text;
  v_goal record;
  v_saved bigint;
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_id is null or p_kind is null or p_kind not in ('budget_near', 'goal_near') then
    raise exception 'Aviso inválido.';
  end if;
  v_ref := p_id::text || ':' || to_char(v_today, 'YYYY-MM');

  if p_kind = 'budget_near' then
    if not exists (
      select 1 from public.budgets b
      where b.user_id = v_uid and b.category_id = p_id and b.month = v_month
    ) then
      return 0;
    end if;
    insert into public.notification_log (user_id, kind, ref)
    select v_uid, 'budget_near', v_ref
    where public.notification_enabled(v_uid, 'budget_near')
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = v_uid)
    on conflict (user_id, kind, ref) do nothing;
    get diagnostics v_rows = row_count;
    return v_rows;
  end if;

  select g.id, g.family_id, g.target_cents into v_goal
    from public.goals g
    where g.id = p_id and g.deleted_on is null and g.status = 'active'
      and (g.user_id = v_uid or (g.family_id is not null and g.family_id = public.my_family_id()));
  if not found then
    return 0;
  end if;
  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint into v_saved
    from public.goal_movements m
    where m.goal_id = v_goal.id and m.user_id is not null;
  if v_saved >= v_goal.target_cents or (v_goal.target_cents - v_saved) * 10 > v_goal.target_cents then
    return 0;
  end if;
  insert into public.notification_log (user_id, kind, ref)
  select x.user_id, 'goal_near', v_ref
  from (
    select v_uid as user_id where v_goal.family_id is null
    union all
    select fm.user_id from public.family_members fm
    where v_goal.family_id is not null and fm.family_id = v_goal.family_id
      and fm.left_at is null and fm.user_id is not null
  ) x
  where public.notification_enabled(x.user_id, 'goal_near')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = x.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.notification_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_enabled(uuid, text) to service_role;

revoke execute on function
  public.save_push_subscription(text, text, text),
  public.sync_push_subscription(text),
  public.delete_push_subscription(text),
  public.queue_own_notification(text, uuid)
from public, anon;

grant execute on function
  public.save_push_subscription(text, text, text),
  public.sync_push_subscription(text),
  public.delete_push_subscription(text),
  public.queue_own_notification(text, uuid)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db -- plano8-preferencias`
Expected: PASS (15 testes). Depois `npm run test:db` inteiro: os testes dos Planos 1–7 continuam passando.
Sem Docker: marcar como pendente em `docs/progresso.md` (Task 13) e seguir.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000001_notificacoes.sql tests/db/notify-helpers.ts tests/db/plano8-preferencias.test.ts
git commit -m "feat(db): preferências de aviso, inscrições de push e fila" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Banco — tarefa diária das contas e proteção de `generated_through`

**Files:**
- Modify: `supabase/migrations/20261002000001_notificacoes.sql` (anexar a seção 2)
- Create: `tests/db/plano8-ocorrencias.test.ts`
- Modify: `tests/db/plano3.test.ts` (linhas 127 e 228: o preparo que muda `generated_through` passa a usar `admin`)

**Interfaces:**
- Consumes: `public.recurrences`, `public.transactions`, `public.occurrence_due_on(date, integer)`, `public.generate_occurrences()` e `public.generate_family_occurrences()` (corpos da migração `20261001000001_familia.sql`, itens 17 e 18), `public.my_family_id()`.
- Produces (banco):
  - `public.generate_occurrences_for(p_user uuid) returns integer` — interna
  - `public.generate_family_occurrences_for(p_family uuid) returns integer` — interna
  - `public.generate_occurrences()` e `public.generate_family_occurrences()` — mesmas assinaturas e permissões de antes; passam a chamar as internas (o app não muda)
  - `public.job_generate_occurrences() returns integer` — só `service_role`
  - `recurrences.generated_through` deixa de aceitar `UPDATE` pela API; no `INSERT` só vazio ou o dia 1 do mês de `starts_on`

- [ ] **Step 1: Escrever os testes que falham**

`tests/db/plano8-ocorrencias.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { addMonths } from '@/domain/dates'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { monthStart } from './notify-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const month = today.slice(0, 7)
const first = monthStart(today)

async function rec(u: TestUser, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await u.client.from('recurrences').insert({
    user_id: u.id, kind: 'expense', name: 'Luz', amount_cents: 12000, category_id: await categoryId(u, 'casa'),
    frequency: 'monthly', due_day: 10, starts_on: first, ...extra,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function occ(recId: string) {
  const { data, error } = await admin.from('transactions')
    .select('user_id, status, due_on, family_id, recurrence_period').eq('recurrence_id', recId).order('recurrence_period')
  if (error) throw error
  return data
}

describe('tarefa diária das 00h05 (etapa-3 §5)', () => {
  let a: TestUser, b: TestUser, c: TestUser
  let family: string
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio')
    family = await createFamily(a, 'Família Tarefa')
    await joinFamily(b, a)
  })
  afterAll(async () => { await removeUsers(b, c, a) })

  test('cria as contas de quem não abriu o app, e rodar de novo não duplica', async () => {
    const id = await rec(c)
    expect(await occ(id)).toEqual([])
    const run = await admin.rpc('job_generate_occurrences')
    expect(run.error).toBeNull()
    expect(await occ(id)).toEqual([{ user_id: c.id, status: 'pending', due_on: `${month}-10`, family_id: null, recurrence_period: first }])
    expect((await admin.rpc('job_generate_occurrences')).error).toBeNull()
    expect((await occ(id)).length).toBe(1)
    expect((await c.client.rpc('generate_occurrences')).data).toBe(0)
  })

  test('conta da família: nasce em nome de quem criou, com a família', async () => {
    const id = await rec(b, { family_id: family, name: 'Internet' })
    await admin.rpc('job_generate_occurrences')
    expect(await occ(id)).toEqual([{ user_id: b.id, status: 'pending', due_on: `${month}-10`, family_id: family, recurrence_period: first }])
  })

  test('quem ficou meses sem abrir recebe no máximo 3 meses (decisão 29)', async () => {
    const id = await rec(c, { name: 'Antiga', starts_on: `${addMonths(month, -8)}-01` })
    const set = await admin.from('recurrences').update({ generated_through: `${addMonths(month, -6)}-01` }).eq('id', id)
    expect(set.error).toBeNull()
    await admin.rpc('job_generate_occurrences')
    expect((await occ(id)).map((o) => o.recurrence_period)).toEqual([`${addMonths(month, -2)}-01`, `${addMonths(month, -1)}-01`, first])
  })

  test('conta paga e depois excluída não volta (decisão 30)', async () => {
    const id = await rec(c, { name: 'Paga' })
    await admin.rpc('job_generate_occurrences')
    const paid = await c.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('recurrence_id', id).select('id')
    expect(paid.data?.length).toBe(1)
    await c.client.from('transactions').delete().eq('recurrence_id', id)
    await admin.rpc('job_generate_occurrences')
    expect(await occ(id)).toEqual([])
  })

  test('abrir o app continua gerando só as contas de quem abriu', async () => {
    const mine = await rec(a, { name: 'Da Ana' })
    const hers = await rec(b, { name: 'Da Bia' })
    expect((await a.client.rpc('generate_occurrences')).error).toBeNull()
    expect((await occ(mine)).length).toBe(1)
    expect(await occ(hers)).toEqual([])
  })

  test('as funções da tarefa não são chamadas por pessoa nem sem sessão', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['job_generate_occurrences', {}],
      ['generate_occurrences_for', { p_user: b.id }],
      ['generate_family_occurrences_for', { p_family: family }],
    ]
    for (const [fn, args] of calls) {
      expect((await a.client.rpc(fn, args)).error?.code, fn).toBe('42501')
      expect((await anon.rpc(fn, args)).error?.code, fn).toBe('42501')
    }
  })
})

describe('generated_through só muda pela geração', () => {
  let a: TestUser
  beforeAll(async () => { a = await newUser('Ana') })
  afterAll(async () => { await removeUsers(a) })

  test('a pessoa não altera pela API; o resto do molde continua alterável', async () => {
    const id = await rec(a)
    await a.client.rpc('generate_occurrences')
    const tamper = await a.client.from('recurrences').update({ generated_through: null }).eq('id', id).select('id')
    expect(tamper.error?.code).toBe('42501')
    const back = await a.client.from('recurrences').update({ generated_through: `${addMonths(month, -6)}-01` }).eq('id', id).select('id')
    expect(back.error?.code).toBe('42501')
    expect((await admin.from('recurrences').select('generated_through').eq('id', id).single()).data?.generated_through).toBe(first)
    const ok = await a.client.from('recurrences').update({ amount_cents: 15000 }).eq('id', id).select('amount_cents')
    expect(ok.data).toEqual([{ amount_cents: 15000 }])
  })

  test('ao criar: vazio ou o mês em que começa; qualquer outro mês é recusado', async () => {
    const base = {
      user_id: a.id, kind: 'expense', name: 'Água', amount_cents: 5000, category_id: await categoryId(a, 'casa'),
      frequency: 'monthly', due_day: 5, starts_on: first,
    }
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: '2099-12-01' })).error?.message).toContain('Recorrência inválida.')
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: `${addMonths(month, -1)}-01` })).error?.message).toContain('Recorrência inválida.')
    expect((await a.client.from('recurrences').insert({ ...base, generated_through: first })).error).toBeNull()
    expect((await a.client.from('recurrences').insert(base)).error).toBeNull()
  })

  test('anotar "conta que se repete" continua funcionando (a primeira já existe)', async () => {
    const { data, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9000, p_category_id: await categoryId(a, 'casa'), p_source: null, p_note: 'Gás',
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const tx = await a.client.from('transactions').select('recurrence_id').eq('id', data as string).single()
    expect((await admin.from('recurrences').select('generated_through').eq('id', tx.data!.recurrence_id).single()).data?.generated_through).toBe(first)
  })
})
```

- [ ] **Step 2: Ajustar o preparo de `tests/db/plano3.test.ts`**

Nas linhas 127 e 228, o teste prepara o cenário mudando `generated_through` com o cliente da pessoa — exatamente o que esta tarefa passa a proibir. Trocar **só o cliente do preparo** por `admin` e conferir o erro (as afirmações dos dois testes não mudam):

```ts
// linha 127
const set = await admin.from('recurrences').update({ generated_through: period(addMonths(current, -6)) }).eq('id', id)
if (set.error) throw set.error
// linha 228
const set = await admin.from('recurrences').update({ generated_through: period(next) }).eq('id', id)
if (set.error) throw set.error
```

Se `admin` ainda não for importado nesse arquivo, acrescentar ao import de `./helpers`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- plano8-ocorrencias`
Expected: FAIL (`job_generate_occurrences` não existe; a alteração direta de `generated_through` ainda passa).

- [ ] **Step 4: Anexar a seção 2 à migração**

```sql
-- ============================================================================
-- Seção 2 — tarefa diária das contas (etapa-3 §5) e generated_through
-- ============================================================================

-- 9. generated_through diz até que mês as contas já foram criadas. Enquanto a
--    geração rodava só "ao abrir o app", mexer nele só atrapalhava a própria
--    pessoa. Com a tarefa diária e as contas da família, voltar esse marcador
--    faria renascer contas que outro membro já pagou. Por isso:
--    a) pela API a coluna não aceita mais UPDATE (as demais colunas continuam
--       como estavam: as guardas dos Planos 3 e 7 seguem valendo);
--    b) no INSERT só vale vazio ou o dia 1 do mês em que a conta começa (é o
--       que create_recurring_transaction grava: a primeira já existe).
revoke update on public.recurrences from authenticated;
grant update (
  user_id, kind, name, amount_cents, category_id, source, payment_method, frequency,
  due_day, due_month, starts_on, ended_on, note, card_id, family_id
) on public.recurrences to authenticated;

create function public.recurrences_generated_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.generated_through is not null
     and new.generated_through <> date_trunc('month', new.starts_on)::date then
    raise exception 'Recorrência inválida.';
  end if;
  return new;
end;
$$;

create trigger recurrences_generated_guard before insert on public.recurrences
  for each row execute function public.recurrences_generated_guard();

-- 10. Gerar as contas e entradas pessoais de uma pessoa. Corpo igual ao de
--     generate_occurrences da migração 20261001000001 (item 17), com a pessoa
--     por parâmetro. Interna (sem grant) e SECURITY DEFINER: a tarefa diária
--     não tem sessão, e generated_through não aceita mais UPDATE de quem
--     chama. Só mexe em registros de p_user.
create function public.generate_occurrences_for(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.user_id = p_user
      and rc.family_id is null
      and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.id
    for update
  loop
    v_period := greatest(
      coalesce((r.generated_through + interval '1 month')::date, v_oldest),
      make_date(extract(year from r.starts_on)::int, extract(month from r.starts_on)::int, 1),
      v_oldest
    );
    while v_period <= v_current loop
      if r.frequency = 'monthly' or extract(month from v_period)::int = r.due_month then
        v_due := public.occurrence_due_on(v_period, r.due_day);
        insert into public.transactions (
          user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
          occurred_on, status, due_on, recurrence_id, recurrence_period
        ) values (
          p_user, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.user_id = p_user;
  end loop;

  return v_count;
end;
$$;

-- 11. Ao abrir o app: a mesma assinatura e as mesmas permissões de antes.
--     Agora SECURITY DEFINER (precisa gravar generated_through), sempre só
--     para quem chama.
create or replace function public.generate_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  return public.generate_occurrences_for(auth.uid());
end;
$$;

-- 12. Contas de uma família. Corpo igual ao de generate_family_occurrences da
--     migração 20261001000001 (item 18), com a família por parâmetro e a mesma
--     ordem de travas (a família primeiro, os moldes depois). Interna.
create function public.generate_family_occurrences_for(p_family uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_family is null then
    return 0;
  end if;
  perform 1 from public.families f where f.id = p_family and f.ended_at is null for share;
  if not found then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.family_id = p_family
      and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = p_family and fm.user_id = rc.user_id and fm.left_at is null
      )
    order by rc.id
    for update of rc
  loop
    v_period := greatest(
      coalesce((r.generated_through + interval '1 month')::date, v_oldest),
      make_date(extract(year from r.starts_on)::int, extract(month from r.starts_on)::int, 1),
      v_oldest
    );
    while v_period <= v_current loop
      if r.frequency = 'monthly' or extract(month from v_period)::int = r.due_month then
        v_due := public.occurrence_due_on(v_period, r.due_day);
        insert into public.transactions (
          user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
          occurred_on, status, due_on, recurrence_id, recurrence_period, family_id
        ) values (
          r.user_id, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period, r.family_id
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.family_id = p_family;
  end loop;

  return v_count;
end;
$$;

create or replace function public.generate_family_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    return 0;
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    return 0;
  end if;
  return public.generate_family_occurrences_for(v_family);
end;
$$;

-- 13. A tarefa diária: todas as pessoas e famílias com algo a gerar. O erro de
--     uma não impede as outras (vai para o log do banco só o código do erro,
--     nunca dado de pessoa). Só o agendador e a rota da tarefa chamam.
create function public.job_generate_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  r record;
  v_count integer := 0;
begin
  for r in
    select distinct rc.user_id from public.recurrences rc
    where rc.family_id is null and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.user_id
  loop
    begin
      v_count := v_count + public.generate_occurrences_for(r.user_id);
    exception when others then
      raise warning 'job_generate_occurrences (pessoa): %', sqlstate;
    end;
  end loop;

  for r in
    select distinct rc.family_id from public.recurrences rc
    where rc.family_id is not null and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.family_id
  loop
    begin
      v_count := v_count + public.generate_family_occurrences_for(r.family_id);
    exception when others then
      raise warning 'job_generate_occurrences (família): %', sqlstate;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.recurrences_generated_guard() from public, anon, authenticated;

revoke execute on function
  public.generate_occurrences_for(uuid),
  public.generate_family_occurrences_for(uuid),
  public.job_generate_occurrences()
from public, anon, authenticated;

grant execute on function
  public.generate_occurrences_for(uuid),
  public.generate_family_occurrences_for(uuid),
  public.job_generate_occurrences()
to service_role;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS — `plano8-ocorrencias` (9 testes) e **todos** os testes dos Planos 1–7 (em especial `plano3` com o preparo ajustado e `plano7-gastos`/`plano7-saida`, que alteram `family_id` e `ended_on` direto e continuam recebendo "Família não encontrada." da guarda).
Sem Docker: pendente.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261002000001_notificacoes.sql tests/db/plano8-ocorrencias.test.ts tests/db/plano3.test.ts
git commit -m "feat(db): tarefa diária das contas e generated_through só pela geração" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Banco — convite da família por e-mail

**Files:**
- Modify: `supabase/migrations/20261002000001_notificacoes.sql` (anexar a seção 3)
- Create: `tests/db/plano8-convite.test.ts`

**Interfaces:**
- Consumes: `public.family_invites`, `public.create_family_invite()`, `public.my_family_id()`, `public.my_family_role()`, `public.families` (Plano 7); `createFamily`, `joinFamily` (`tests/db/family-helpers.ts`).
- Produces (banco):
  - `family_invites.invited_email text` (só enquanto o convite está pendente; só o administrador lê) e `family_invites.sent_by_email boolean`
  - `public.create_family_email_invite(p_email text) returns table (invite_code text, invite_expires_at timestamptz)` — erros: `'Só quem administra a família pode fazer isso.'` (42501), `'E-mail inválido.'`, `'Limite de convites.'`, e os de `create_family_invite`
  - `public.job_cleanup() returns void` — só `service_role`

- [ ] **Step 1: Escrever os testes que falham**

`tests/db/plano8-convite.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily } from './family-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const invite = (u: TestUser, email: string) => u.client.rpc('create_family_email_invite', { p_email: email })
const code = (r: { data: unknown }) => (r.data as { invite_code: string }[])[0].invite_code
const pending = async (family: string) =>
  (await admin.from('family_invites').select('id, invited_email, sent_by_email').eq('family_id', family).is('accepted_at', null).is('revoked_at', null)).data!

describe('convite por e-mail (RF-42)', () => {
  let ana: TestUser, bia: TestUser, caio: TestUser, eli: TestUser
  let family: string
  beforeAll(async () => {
    ana = await newUser('Ana'); bia = await newUser('Bia'); caio = await newUser('Caio'); eli = await newUser('Eli')
    family = await createFamily(ana, 'Família Convite')
    await joinFamily(bia, ana)
  })
  afterAll(async () => { await removeUsers(bia, caio, eli, ana) })

  test('só quem administra convida; e-mail precisa ter forma de e-mail', async () => {
    expect((await invite(bia, 'x@teste.iris.dev')).error?.code).toBe('42501')
    expect((await invite(eli, 'x@teste.iris.dev')).error?.code).toBe('42501')
    expect((await anon.rpc('create_family_email_invite', { p_email: 'x@teste.iris.dev' })).error).not.toBeNull()
    for (const bad of ['', 'sem-arroba', 'a@b', 'a b@teste.dev', `${'a'.repeat(250)}@teste.dev`, 'a@teste.dev\nBcc: x@y.dev']) {
      expect((await invite(ana, bad)).error?.message, bad).toContain('E-mail inválido.')
    }
    expect(await pending(family)).toEqual([])
  })

  test('guarda o e-mail em minúsculas enquanto o convite está pendente; só o administrador lê', async () => {
    const r = await invite(ana, '  Caio@Teste.Iris.Dev ')
    expect(r.error).toBeNull()
    expect(code(r)).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect((await pending(family)).map((i) => [i.invited_email, i.sent_by_email])).toEqual([['caio@teste.iris.dev', true]])
    expect((await ana.client.from('family_invites').select('invited_email').is('accepted_at', null).is('revoked_at', null)).data)
      .toEqual([{ invited_email: 'caio@teste.iris.dev' }])
    expect((await bia.client.from('family_invites').select('invited_email')).data ?? []).toEqual([])
    expect((await ana.client.from('family_invites').select('token_hash')).error).not.toBeNull()
  })

  test('um convite por vez: o novo cancela o anterior e apaga o e-mail dele', async () => {
    const before = (await pending(family))[0].id
    expect((await invite(ana, 'outra@teste.iris.dev')).error).toBeNull()
    expect((await pending(family)).map((i) => i.invited_email)).toEqual(['outra@teste.iris.dev'])
    expect((await admin.from('family_invites').select('invited_email, revoked_at').eq('id', before).single()).data?.invited_email).toBeNull()
  })

  test('cancelar apaga o e-mail', async () => {
    const id = (await pending(family))[0].id
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error).toBeNull()
    expect((await admin.from('family_invites').select('invited_email').eq('id', id).single()).data?.invited_email).toBeNull()
  })

  test('o link do e-mail é um convite normal: quem aceita entra como membro, e o e-mail some', async () => {
    const r = await invite(ana, 'caio@teste.iris.dev')
    const accepted = await caio.client.rpc('accept_family_invite', { p_code: code(r) })
    expect(accepted.error).toBeNull()
    const row = await admin.from('family_invites').select('invited_email, accepted_by').eq('family_id', family).not('accepted_at', 'is', null).order('accepted_at', { ascending: false }).limit(1).single()
    expect(row.data).toEqual({ invited_email: null, accepted_by: caio.id })
    expect((await admin.from('family_members').select('role').eq('user_id', caio.id).is('left_at', null).single()).data?.role).toBe('member')
  })

  test('a resposta é a mesma para um e-mail que já tem cadastro e para um que não tem', async () => {
    const withAccount = await invite(ana, (await admin.auth.admin.getUserById(eli.id)).data.user!.email!)
    const without = await invite(ana, 'ninguem-ainda@teste.iris.dev')
    expect(withAccount.error).toBeNull()
    expect(without.error).toBeNull()
    expect(Object.keys((withAccount.data as object[])[0]).sort()).toEqual(Object.keys((without.data as object[])[0]).sort())
  })

  test('convite vencido perde o e-mail na limpeza diária; pessoa nenhuma chama a limpeza', async () => {
    // Usa o convite pendente do teste anterior (o limite da família é de 5 por dia).
    const [row] = await pending(family)
    expect(row.invited_email).toBe('ninguem-ainda@teste.iris.dev')
    const id = row.id
    const now = Date.now()
    const old = new Date(now - 8 * 86_400_000).toISOString()
    const exp = new Date(now - 86_400_000).toISOString()
    expect((await admin.from('family_invites').update({ created_at: old, expires_at: exp }).eq('id', id)).error).toBeNull()
    expect((await ana.client.rpc('job_cleanup')).error?.code).toBe('42501')
    expect((await anon.rpc('job_cleanup')).error?.code).toBe('42501')
    expect((await admin.rpc('job_cleanup')).error).toBeNull()
    expect((await admin.from('family_invites').select('invited_email').eq('id', id).single()).data?.invited_email).toBeNull()
  })
})

describe('limite de convites por e-mail', () => {
  let dan: TestUser
  let family: string
  beforeAll(async () => { dan = await newUser('Dan'); family = await createFamily(dan, 'Família Limite') })
  afterAll(async () => { await removeUsers(dan) })

  test('5 por família a cada 24 horas; o convite por link continua valendo', async () => {
    for (let i = 0; i < 5; i++) expect((await invite(dan, `p${i}@teste.iris.dev`)).error, String(i)).toBeNull()
    const sixth = await invite(dan, 'p6@teste.iris.dev')
    expect(sixth.error?.message).toContain('Limite de convites.')
    expect((await pending(family)).map((i) => i.invited_email)).toEqual(['p4@teste.iris.dev']) // o 6º não cancelou o 5º
    expect((await dan.client.rpc('create_family_invite')).error).toBeNull()
    // Passadas 24 horas, volta a valer.
    const now = Date.now()
    const old = new Date(now - 25 * 3_600_000).toISOString()
    const exp = new Date(now - 24 * 3_600_000).toISOString()
    await admin.from('family_invites').update({ created_at: old, expires_at: exp }).eq('family_id', family).eq('sent_by_email', true)
    expect((await invite(dan, 'p7@teste.iris.dev')).error).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- plano8-convite`
Expected: FAIL (`create_family_email_invite` não existe).

- [ ] **Step 3: Anexar a seção 3 à migração**

```sql
-- ============================================================================
-- Seção 3 — convite da família por e-mail (RF-42) e limpeza diária
-- ============================================================================

-- 14. O convite por e-mail é o convite por link do Plano 7 (7 dias, uma
--     pessoa, um por vez, só o resumo do código no banco) entregue por e-mail.
--     O endereço de quem foi convidado é dado de terceiro: fica só enquanto o
--     convite está pendente (para "Reenviar"), só o administrador lê, e some
--     quando o convite é aceito, cancelado ou vence. sent_by_email fica: é o
--     que conta para o limite por período.
alter table public.family_invites
  add column invited_email text check (
    invited_email is null
    or (char_length(invited_email) between 6 and 254
        and invited_email = lower(invited_email)
        and invited_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  add column sent_by_email boolean not null default false,
  add constraint family_invites_email_only_pending
    check (invited_email is null or (accepted_at is null and revoked_at is null));

-- A política do Plano 7 já limita a leitura ao administrador da família.
grant select (invited_email, sent_by_email) on public.family_invites to authenticated;

create function public.family_invites_clear_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.accepted_at is not null or new.revoked_at is not null then
    new.invited_email := null;
  end if;
  return new;
end;
$$;

create trigger family_invites_clear_email before update on public.family_invites
  for each row execute function public.family_invites_clear_email();

-- 15. Convidar por e-mail: só o administrador. No máximo 5 convites por
--     e-mail por família a cada 24 horas (ninguém usa a Íris para encher a
--     caixa de entrada de outra pessoa). Não consulta se o e-mail tem
--     cadastro: a resposta é sempre a mesma. Devolve o código só para quem
--     pediu (a Server Action monta o link e envia; o código não é guardado).
--     SECURITY DEFINER: family_invites não aceita gravação direta.
create function public.create_family_email_invite(p_email text)
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_email) not between 6 and 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido.';
  end if;
  -- Mesma ordem de travas de create_family_invite (família, depois convite).
  perform 1 from public.families f where f.id = v_family for update;
  if (select count(*) from public.family_invites i
      where i.family_id = v_family and i.sent_by_email and i.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Limite de convites.';
  end if;
  -- Confere de novo o papel depois da trava, cancela o convite anterior e cria o novo.
  select c.invite_code, c.invite_expires_at into v_code, v_expires from public.create_family_invite() c;
  update public.family_invites i
    set invited_email = v_email, sent_by_email = true
    where i.family_id = v_family and i.token_hash = extensions.digest(v_code, 'sha256');
  return query select v_code, v_expires;
end;
$$;

-- 16. Limpeza diária: e-mail de convite vencido e avisos antigos (a fila só
--     precisa lembrar do que já avisou por pouco tempo).
create function public.job_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.family_invites i set invited_email = null
    where i.invited_email is not null and i.expires_at <= now();
  delete from public.notification_log nl where nl.created_at < now() - interval '90 days';
end;
$$;

revoke execute on function public.family_invites_clear_email() from public, anon, authenticated;
revoke execute on function public.create_family_email_invite(text) from public, anon;
grant execute on function public.create_family_email_invite(text) to authenticated;
revoke execute on function public.job_cleanup() from public, anon, authenticated;
grant execute on function public.job_cleanup() to service_role;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db -- plano8-convite plano7-familia`
Expected: PASS (`plano8-convite`: 8 testes; os testes de convite do Plano 7 continuam passando).
Sem Docker: pendente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000001_notificacoes.sql tests/db/plano8-convite.test.ts
git commit -m "feat(db): convite da família por e-mail, limite por período e limpeza diária" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Banco — enfileirar, entregar o lote, avisos da família e agenda

**Files:**
- Modify: `supabase/migrations/20261002000001_notificacoes.sql` (anexar a seção 4)
- Create: `tests/db/plano8-fila.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 2–4; `public.family_events` (Plano 7); `subscribe`, `logRows`, `subscriptionsOf`, `pendingBill`, `addDaysISO` (`tests/db/notify-helpers.ts`).
- Produces (banco; todas só `service_role`):
  - `public.notification_params(p_user uuid, p_kind text, p_ref text) returns jsonb` — `null` quando quem recebe não pode (mais) ver aquilo. Formas: contas e entradas `{ name, id, due_on, family }`; planejado `{ name }`; meta `{ name, id, remaining_cents }`; resumo `{ month }`; lembrete e retomada `{}`; família `{ event_kind, member_name, goal_name, amount_cents }` (as mesmas de `SAMPLES` da Task 1)
  - `public.job_enqueue_morning_on(p_today date) returns integer`, `public.job_enqueue_morning() returns integer`
  - `public.job_enqueue_evening_on(p_today date) returns integer`, `public.job_enqueue_evening() returns integer`
  - `public.job_claim_notifications(p_limit integer) returns table (n_id uuid, n_user uuid, n_kind text, n_params jsonb, n_email text, n_subscriptions jsonb)` — `n_subscriptions`: lista de `{ id, endpoint, p256dh, auth }`; `n_email` só em `month_summary`
  - `public.job_finish_notifications(p_sent uuid[], p_dead uuid[]) returns void`
  - `public.job_dispatch() returns boolean`
  - `public.job_schedules() returns table (jobname text, schedule text)`
  - Agenda no `pg_cron`: `iris-ocorrencias` (`5 3 * * *`), `iris-manha` (`0 12 * * *`), `iris-noite` (`0 0 * * *`), `iris-entrega` (`*/10 * * * *`)
  - Segredos lidos do Vault: `iris_job_url`, `iris_job_secret` (sem eles, `job_dispatch` não faz nada)

- [ ] **Step 1: Escrever os testes que falham**

`tests/db/plano8-fila.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { addDaysISO, logRows, pendingBill, subscribe, subscriptionsOf } from './notify-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const tomorrow = addDaysISO(today, 1)

type Claimed = {
  n_id: string; n_user: string; n_kind: string; n_params: Record<string, unknown>
  n_email: string | null; n_subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
}

const morning = async (day = today) => {
  const r = await admin.rpc('job_enqueue_morning_on', { p_today: day })
  if (r.error) throw r.error
}
const claim = async (): Promise<Claimed[]> => {
  const r = await admin.rpc('job_claim_notifications', { p_limit: 100 })
  if (r.error) throw r.error
  return r.data as Claimed[]
}
const kinds = async (u: TestUser) => (await logRows(u.id)).map((r) => `${r.kind}:${r.ref}`).sort()
// Registro confirmado gravado pelo cliente administrativo, com data e horário escolhidos.
async function confirmed(u: TestUser, occurredOn: string, at?: string): Promise<string> {
  const { data, error } = await admin.from('transactions').insert({
    user_id: u.id, kind: 'expense', amount_cents: 1000, category_id: await categoryId(u, 'mercado'), occurred_on: occurredOn,
    ...(at ? { created_at: at, updated_at: at } : {}),
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

describe('enfileirar de manhã (9h de Brasília)', () => {
  let a: TestUser, b: TestUser, c: TestUser, d: TestUser, out: TestUser, e: TestUser
  let family: string
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio'); d = await newUser('Dan'); out = await newUser('Eli'); e = await newUser('Eva')
    family = await createFamily(a, 'Família Manhã')
    await joinFamily(c, a)
    await joinFamily(d, a)
    const left = await d.client.rpc('leave_family')
    if (left.error) throw left.error
    for (const u of [a, c, d, out, e]) await subscribe(u)
    // Os avisos de saída do Dan não interessam a estes testes.
    await admin.from('notification_log').delete().in('user_id', [a.id, c.id])
  })
  afterAll(async () => { await removeUsers(c, d, b, out, e, a) })

  test('conta pessoal: "vence amanhã" e "hoje é o dia"; vencida, paga e de quem não tem aparelho, nada; rodar duas vezes não duplica', async () => {
    const t1 = await pendingBill(a, { name: 'Luz', dueOn: tomorrow })
    const t2 = await pendingBill(a, { name: 'Água', dueOn: today })
    await pendingBill(a, { name: 'Vencida', dueOn: addDaysISO(today, -1) })
    const paid = await pendingBill(a, { name: 'Paga', dueOn: today })
    await admin.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', paid)
    await pendingBill(b, { name: 'Sem aparelho', dueOn: today })
    await morning()
    expect(await kinds(a)).toEqual([`bill_today:${t2}`, `bill_tomorrow:${t1}`].sort())
    expect(await kinds(b)).toEqual([])
    await morning()
    expect((await logRows(a.id)).length).toBe(2)
  })

  test('chave "Contas perto do vencimento" desligada: nenhum aviso de conta', async () => {
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: false })
    await pendingBill(out, { name: 'Gás', dueOn: today })
    await morning()
    expect(await kinds(out)).toEqual([])
  })

  test('conta da família: avisa quem participa e tem aparelho, e só eles', async () => {
    const bill = await pendingBill(c, { name: 'Internet', dueOn: today, familyId: family })
    await morning()
    expect(await kinds(c)).toContain(`bill_today:${bill}`)
    expect(await kinds(a)).toContain(`bill_today:${bill}`)
    expect(await kinds(d)).toEqual([]) // saiu da família
    expect(await kinds(out)).toEqual([])
  })

  test('entrada a receber hoje', async () => {
    const inc = await pendingBill(e, { name: 'Salário', dueOn: today, kind: 'income' })
    await pendingBill(e, { name: 'Freela', dueOn: tomorrow, kind: 'income' })
    await morning()
    expect(await kinds(e)).toEqual([`income_today:${inc}`])
  })

  test('retomada: depois de 5 dias sem registro, uma vez por intervalo; quem registrou há pouco não recebe', async () => {
    const last = addDaysISO(today, -6)
    await confirmed(d, last, `${last}T15:00:00Z`)
    await confirmed(out, today)
    await morning()
    expect(await kinds(d)).toEqual([`comeback:${last}`])
    expect((await kinds(out)).some((k) => k.startsWith('comeback'))).toBe(false)
    await morning(addDaysISO(today, 1))
    expect((await kinds(d)).filter((k) => k.startsWith('comeback'))).toEqual([`comeback:${last}`])
  })

  test('resumo do mês: só no dia 1, para quem teve registro no mês fechado, com ou sem aparelho', async () => {
    await confirmed(b, '2031-03-15')
    await morning('2031-04-02')
    expect((await kinds(b)).some((k) => k.startsWith('month_summary'))).toBe(false)
    await morning('2031-04-01')
    expect(await kinds(b)).toContain('month_summary:2031-03')
    expect((await kinds(e)).some((k) => k.startsWith('month_summary'))).toBe(false) // sem registro em março de 2031
    await morning('2031-04-01')
    expect((await kinds(b)).filter((k) => k.startsWith('month_summary')).length).toBe(1)
  })
})

describe('enfileirar à noite (21h): lembrete para anotar (RF-47)', () => {
  let on: TestUser, wrote: TestUser, standard: TestUser
  beforeAll(async () => {
    on = await newUser('Liz'); wrote = await newUser('Rui'); standard = await newUser('Sam')
    for (const u of [on, wrote, standard]) await subscribe(u)
    for (const u of [on, wrote]) await u.client.from('notification_prefs').upsert({ user_id: u.id, kind: 'daily', enabled: true })
    await confirmed(wrote, today)
  })
  afterAll(async () => { await removeUsers(on, wrote, standard) })

  test('só para quem ligou, e só se ainda não anotou nada hoje', async () => {
    const r = await admin.rpc('job_enqueue_evening_on', { p_today: today })
    expect(r.error).toBeNull()
    expect(await kinds(on)).toEqual([`daily_reminder:${today}`])
    expect(await kinds(wrote)).toEqual([])
    expect(await kinds(standard)).toEqual([]) // desligado por padrão
    await admin.rpc('job_enqueue_evening_on', { p_today: today })
    expect((await logRows(on.id)).length).toBe(1)
  })
})

describe('entregar o lote', () => {
  let a: TestUser, c: TestUser, out: TestUser, s: TestUser
  let family: string
  const mine = (rows: Claimed[], u: TestUser) => rows.filter((r) => r.n_user === u.id)
  beforeAll(async () => {
    a = await newUser('Ana'); c = await newUser('Caio'); out = await newUser('Eli'); s = await newUser('Sol')
    family = await createFamily(a, 'Família Lote')
    await joinFamily(c, a)
    for (const u of [a, c, out]) await subscribe(u)
  })
  afterAll(async () => { await removeUsers(c, out, s, a) })

  test('devolve os dados do aviso e as inscrições, e marca a tentativa; a mesma linha não sai duas vezes seguidas', async () => {
    const bill = await pendingBill(a, { name: 'Luz', dueOn: today })
    await morning()
    const got = mine(await claim(), a)
    expect(got.length).toBe(1)
    expect(got[0].n_kind).toBe('bill_today')
    expect(got[0].n_params).toEqual({ name: 'Luz', id: bill, due_on: today, family: false })
    expect(got[0].n_email).toBeNull()
    expect(got[0].n_subscriptions.map((x) => Object.keys(x).sort())).toEqual([['auth', 'endpoint', 'id', 'p256dh']])
    expect((await logRows(a.id))[0]).toMatchObject({ attempts: 1, sent_at: null })
    expect(mine(await claim(), a)).toEqual([])
  })

  test('finalizar: marca como enviado e apaga as inscrições que não valem mais', async () => {
    const row = (await logRows(a.id))[0]
    const sub = (await subscriptionsOf(a.id))[0]
    const done = await admin.rpc('job_finish_notifications', { p_sent: [row.id], p_dead: [sub.id] })
    expect(done.error).toBeNull()
    expect((await logRows(a.id))[0].sent_at).not.toBeNull()
    expect(await subscriptionsOf(a.id)).toEqual([])
    await subscribe(a)
  })

  test('conta paga antes do envio não gera aviso', async () => {
    const bill = await pendingBill(a, { name: 'Gás', dueOn: today })
    await morning()
    await admin.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', bill)
    expect(mine(await claim(), a)).toEqual([])
    expect((await logRows(a.id)).find((r) => r.ref === bill)?.sent_at).not.toBeNull()
  })

  test('desligar antes do envio cancela', async () => {
    const bill = await pendingBill(out, { name: 'Luz', dueOn: today })
    await morning()
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: false })
    expect(mine(await claim(), out)).toEqual([])
    expect((await logRows(out.id)).find((r) => r.ref === bill)?.sent_at).not.toBeNull()
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: true })
  })

  test('quem saiu da família não recebe o aviso da conta da família', async () => {
    const bill = await pendingBill(a, { name: 'Aluguel', dueOn: today, familyId: family })
    await morning()
    expect((await logRows(c.id)).some((r) => r.ref === bill)).toBe(true)
    const left = await c.client.rpc('leave_family')
    expect(left.error).toBeNull()
    const got = await claim()
    expect(mine(got, c).filter((r) => r.n_params.id === bill)).toEqual([])
    expect(mine(got, a).find((r) => r.n_params.id === bill)?.n_params).toEqual({ name: 'Aluguel', id: bill, due_on: today, family: true })
  })

  test('linha forjada com a conta de outra pessoa não devolve nada', async () => {
    const bill = await pendingBill(a, { name: 'Privada', dueOn: today })
    const forged = await admin.from('notification_log').insert({ user_id: out.id, kind: 'bill_today', ref: bill }).select('id').single()
    expect(forged.error).toBeNull()
    expect(mine(await claim(), out)).toEqual([])
    expect((await logRows(out.id)).find((r) => r.id === forged.data!.id)?.sent_at).not.toBeNull()
  })

  test('resumo do mês leva o e-mail de quem recebe, mesmo sem aparelho; os outros tipos nunca', async () => {
    await confirmed(s, '2031-05-10')
    await morning('2031-06-01')
    const got = mine(await claim(), s)
    expect(got.map((r) => [r.n_kind, r.n_params, r.n_subscriptions])).toEqual([['month_summary', { month: '2031-05' }, []]])
    expect(got[0].n_email).toBe((await admin.auth.admin.getUserById(s.id)).data.user!.email)
  })

  test('meta perto: o aviso leva só o nome e quanto falta', async () => {
    const goal = (await out.client.from('goals').insert({ user_id: out.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 95000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(1)
    const got = mine(await claim(), out).filter((r) => r.n_kind === 'goal_near')
    expect(got.map((r) => r.n_params)).toEqual([{ name: 'Viagem', id: goal, remaining_cents: 5000 }])
  })

  test('depois de 3 tentativas a linha não volta', async () => {
    const bill = await pendingBill(a, { name: 'Teimosa', dueOn: today })
    await morning()
    const past = new Date(Date.now() - 20 * 60_000).toISOString()
    for (let i = 1; i <= 3; i++) {
      expect(mine(await claim(), a).some((r) => r.n_params.id === bill), `tentativa ${i}`).toBe(true)
      await admin.from('notification_log').update({ claimed_at: past }).eq('user_id', a.id).eq('ref', bill)
    }
    expect(mine(await claim(), a).some((r) => r.n_params.id === bill)).toBe(false)
    expect((await logRows(a.id)).find((r) => r.ref === bill)).toMatchObject({ attempts: 3, sent_at: null })
  })
})

describe('avisos da família (decisão 108) por push', () => {
  let x: TestUser, y: TestUser, z: TestUser
  beforeAll(async () => {
    x = await newUser('Xica'); y = await newUser('Yuri'); z = await newUser('Zeca')
    await createFamily(x, 'Família Avisos')
    await joinFamily(y, x)
    await joinFamily(z, x)
    for (const u of [x, y, z]) await subscribe(u)
  })
  afterAll(async () => { await removeUsers(y, x) })

  test('quem sai: os que ficam são avisados com a frase da família; quem saiu, não', async () => {
    expect((await y.client.rpc('leave_family')).error).toBeNull()
    expect((await logRows(y.id)).filter((r) => r.kind === 'family_event')).toEqual([])
    for (const u of [x, z]) expect((await logRows(u.id)).filter((r) => r.kind === 'family_event').length).toBe(1)
    const got = (await claim()).filter((r) => r.n_user === x.id && r.n_kind === 'family_event')
    expect(got.map((r) => r.n_params)).toEqual([{ event_kind: 'member_left', member_name: 'Yuri', goal_name: null, amount_cents: null }])
  })

  test('excluir o cadastro nunca é barrado pelo aviso, e o aviso não leva nome', async () => {
    const del = await admin.auth.admin.deleteUser(z.id)
    expect(del.error).toBeNull()
    expect(await logRows(z.id)).toEqual([])
    const got = (await claim()).filter((r) => r.n_user === x.id && r.n_kind === 'family_event')
    expect(got.map((r) => r.n_params)).toEqual([{ event_kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null }])
  })
})

describe('agenda e permissões', () => {
  let a: TestUser
  beforeAll(async () => { a = await newUser('Ana') })
  afterAll(async () => { await removeUsers(a) })

  test('nenhuma função da tarefa é chamada por pessoa ou sem sessão', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['job_enqueue_morning', {}], ['job_enqueue_morning_on', { p_today: today }],
      ['job_enqueue_evening', {}], ['job_enqueue_evening_on', { p_today: today }],
      ['job_claim_notifications', { p_limit: 10 }], ['job_finish_notifications', { p_sent: [], p_dead: [] }],
      ['job_dispatch', {}], ['job_schedules', {}],
      ['notification_params', { p_user: a.id, p_kind: 'comeback', p_ref: today }],
    ]
    for (const [fn, args] of calls) {
      expect((await a.client.rpc(fn, args)).error?.code, fn).toBe('42501')
      expect((await anon.rpc(fn, args)).error?.code, fn).toBe('42501')
    }
  })

  test('a agenda tem as quatro tarefas nos horários de Brasília (em UTC)', async () => {
    const r = await admin.rpc('job_schedules')
    expect(r.error).toBeNull()
    expect(r.data).toEqual([
      { jobname: 'iris-entrega', schedule: '*/10 * * * *' },
      { jobname: 'iris-manha', schedule: '0 12 * * *' },
      { jobname: 'iris-noite', schedule: '0 0 * * *' },
      { jobname: 'iris-ocorrencias', schedule: '5 3 * * *' },
    ])
  })

  test('o disparo nunca dá erro: sem endereço e segredo no Vault, só não acontece', async () => {
    const r = await admin.rpc('job_dispatch')
    expect(r.error).toBeNull()
    expect(typeof r.data).toBe('boolean')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- plano8-fila`
Expected: FAIL (`job_enqueue_morning_on` não existe).

- [ ] **Step 3: Anexar a seção 4 à migração**

```sql
-- ============================================================================
-- Seção 4 — enfileirar, entregar o lote, avisos da família e agenda
-- ============================================================================

-- 17. Os dados de um aviso, conferidos na hora do envio. Devolve nulo quando
--     quem recebe não pode (mais) ver aquilo: conta já paga ou que mudou de
--     dia, pessoa que saiu da família, categoria ou meta excluída, meta já
--     completa. Só as colunas que as telas da própria pessoa (ou da família,
--     Plano 7) já mostram: nunca cartão, forma de pagamento, valor da conta,
--     entrada de outra pessoa nem a parte de outro numa meta.
--     Interna: chamada só por job_claim_notifications.
create function public.notification_params(p_user uuid, p_kind text, p_ref text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_out jsonb;
begin
  if p_user is null or p_kind is null or p_ref is null then
    return null;
  end if;

  if p_kind in ('bill_tomorrow', 'bill_today', 'income_today') then
    if p_ref !~ ('^' || v_uuid || '$') then
      return null;
    end if;
    select jsonb_build_object(
             'name', coalesce(r.name, t.note, t.source), 'id', t.id, 'due_on', t.due_on, 'family', t.family_id is not null)
      into v_out
    from public.transactions t
    left join public.recurrences r on r.id = t.recurrence_id
    where t.id = p_ref::uuid
      and t.status = 'pending'
      and t.kind = case when p_kind = 'income_today' then 'income' else 'expense' end
      and t.due_on = case when p_kind = 'bill_tomorrow' then v_today + 1 else v_today end
      and coalesce(r.name, t.note, t.source) is not null
      and (
        (t.family_id is null and t.user_id = p_user)
        or (t.family_id is not null
            and r.family_id = t.family_id
            and exists (select 1 from public.family_members fm
                        where fm.family_id = t.family_id and fm.user_id = p_user and fm.left_at is null)
            and exists (select 1 from public.family_members au
                        where au.family_id = t.family_id and au.user_id = t.user_id and au.left_at is null))
      );
    return v_out;
  end if;

  if p_kind = 'budget_near' then
    if p_ref !~ ('^' || v_uuid || ':20[0-9]{2}-(0[1-9]|1[0-2])$')
       or split_part(p_ref, ':', 2) <> to_char(v_today, 'YYYY-MM') then
      return null;
    end if;
    select jsonb_build_object('name', c.name) into v_out
    from public.categories c
    where c.id = split_part(p_ref, ':', 1)::uuid and c.user_id = p_user;
    return v_out;
  end if;

  if p_kind = 'goal_near' then
    if p_ref !~ ('^' || v_uuid || ':20[0-9]{2}-(0[1-9]|1[0-2])$') then
      return null;
    end if;
    select jsonb_build_object('name', g.name, 'id', g.id, 'remaining_cents', g.target_cents - s.saved) into v_out
    from public.goals g
    cross join lateral (
      select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint as saved
      from public.goal_movements m
      where m.goal_id = g.id and m.user_id is not null
    ) s
    where g.id = split_part(p_ref, ':', 1)::uuid
      and g.deleted_on is null and g.status = 'active'
      and g.target_cents - s.saved > 0
      and (g.user_id = p_user
           or (g.family_id is not null and exists (
                 select 1 from public.family_members fm
                 where fm.family_id = g.family_id and fm.user_id = p_user and fm.left_at is null)));
    return v_out;
  end if;

  if p_kind = 'month_summary' then
    return case when p_ref ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then jsonb_build_object('month', p_ref) end;
  end if;

  if p_kind = 'daily_reminder' then
    return case when p_ref = v_today::text then '{}'::jsonb end;
  end if;

  if p_kind = 'comeback' then
    return case when p_ref ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then '{}'::jsonb end;
  end if;

  if p_kind = 'family_event' then
    if p_ref !~ ('^' || v_uuid || '$') then
      return null;
    end if;
    select jsonb_build_object(
             'event_kind', e.kind, 'member_name', e.member_name, 'goal_name', e.goal_name, 'amount_cents', e.amount_cents)
      into v_out
    from public.family_events e
    where e.id = p_ref::uuid
      and exists (select 1 from public.family_members fm
                  where fm.family_id = e.family_id and fm.user_id = p_user and fm.left_at is null);
    return v_out;
  end if;

  return null;
end;
$$;

-- 18. Manhã (9h de Brasília, A8). p_today existe para os testes escolherem o
--     dia; a agenda chama job_enqueue_morning, que usa o dia de hoje.
--     - contas: a pagar que vencem amanhã ou hoje. Pessoal → quem criou; da
--       família → todos que participam (é o que Família → Contas mostra a
--       todos, RN-20). Vencida não gera aviso.
--     - entradas a receber de hoje.
--     - retomada: o último registro confirmado foi há 5 dias ou mais (até 30);
--       a referência é o dia desse registro, então o aviso sai uma vez por
--       intervalo.
--     - resumo: no dia 1, quem teve registro no mês que fechou. Não exige
--       aparelho (também vai por e-mail).
--     Só entra na fila quem tem a chave ligada (e, menos no resumo, aparelho).
create function public.job_enqueue_morning_on(p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_prev date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_today is null then
    return 0;
  end if;

  insert into public.notification_log (user_id, kind, ref)
  select t.user_id, case when t.due_on = p_today then 'bill_today' else 'bill_tomorrow' end, t.id::text
  from public.transactions t
  where t.kind = 'expense' and t.status = 'pending' and t.family_id is null and t.user_id is not null
    and t.due_on in (p_today, p_today + 1)
    and public.notification_enabled(t.user_id, 'bill_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = t.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select fm.user_id, case when t.due_on = p_today then 'bill_today' else 'bill_tomorrow' end, t.id::text
  from public.transactions t
  join public.recurrences r on r.id = t.recurrence_id and r.family_id = t.family_id
  join public.family_members au on au.family_id = t.family_id and au.user_id = t.user_id and au.left_at is null
  join public.family_members fm on fm.family_id = t.family_id and fm.left_at is null and fm.user_id is not null
  where t.kind = 'expense' and t.status = 'pending' and t.family_id is not null
    and t.due_on in (p_today, p_today + 1)
    and public.notification_enabled(fm.user_id, 'bill_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = fm.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select t.user_id, 'income_today', t.id::text
  from public.transactions t
  where t.kind = 'income' and t.status = 'pending' and t.user_id is not null and t.due_on = p_today
    and public.notification_enabled(t.user_id, 'income_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = t.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select x.user_id, 'comeback', x.last_on::text
  from (
    select t.user_id, max((t.updated_at at time zone 'America/Sao_Paulo')::date) as last_on
    from public.transactions t
    where t.user_id is not null and t.status = 'confirmed'
    group by t.user_id
  ) x
  where x.last_on between p_today - 30 and p_today - 5
    and public.notification_enabled(x.user_id, 'comeback')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = x.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  if extract(day from p_today)::int = 1 then
    v_prev := (p_today - interval '1 month')::date;
    insert into public.notification_log (user_id, kind, ref)
    select distinct t.user_id, 'month_summary', to_char(v_prev, 'YYYY-MM')
    from public.transactions t
    where t.user_id is not null and t.status = 'confirmed'
      and coalesce(t.paid_on, t.occurred_on) >= v_prev and coalesce(t.paid_on, t.occurred_on) < p_today
      and public.notification_enabled(t.user_id, 'month_summary')
    on conflict (user_id, kind, ref) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;

  return v_count;
end;
$$;

-- 19. Noite (21h de Brasília): lembrete para anotar, só para quem ligou
--     (RF-47) e ainda não anotou nada hoje.
create function public.job_enqueue_evening_on(p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer := 0;
begin
  if p_today is null then
    return 0;
  end if;
  insert into public.notification_log (user_id, kind, ref)
  select np.user_id, 'daily_reminder', p_today::text
  from public.notification_prefs np
  where np.kind = 'daily' and np.enabled
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = np.user_id)
    and not exists (
      select 1 from public.transactions t
      where t.user_id = np.user_id and t.status = 'confirmed'
        and (t.created_at at time zone 'America/Sao_Paulo')::date = p_today
    )
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- 20. Avisos da família (RN-22d, RN-22e; decisão 108): cada aviso gravado
--     pelo Plano 7 entra na fila de quem continua na família. Quem está saindo
--     ainda aparece como participante nesta hora, e é pulado pelo member_id;
--     quem está excluindo o cadastro perde a linha na cascata.
--     Nunca recusa: um problema com o aviso não pode impedir alguém de sair
--     da família nem de excluir o cadastro.
create function public.family_event_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.notification_log (user_id, kind, ref)
    select fm.user_id, 'family_event', new.id::text
    from public.family_members fm
    where fm.family_id = new.family_id and fm.left_at is null and fm.user_id is not null
      and (new.member_id is null or fm.id <> new.member_id)
      and public.notification_enabled(fm.user_id, 'family_event')
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = fm.user_id)
    on conflict (user_id, kind, ref) do nothing;
  exception when others then
    raise warning 'family_event_notify: %', sqlstate;
  end;
  return null;
end;
$$;

create trigger family_events_notify after insert on public.family_events
  for each row execute function public.family_event_notify();

-- 21. Pegar um lote para enviar. Para cada linha ainda não enviada (até 3
--     tentativas, com 15 minutos entre elas, e só as dos últimos 2 dias):
--     confere de novo a chave e monta os dados (item 17). Sem dados, a linha
--     é encerrada sem envio. Devolve as inscrições de push de quem recebe e,
--     só no resumo do mês, o e-mail confirmado. É o único lugar de onde
--     endereços de push e e-mails saem do banco, e só para a rota da tarefa.
create function public.job_claim_notifications(p_limit integer)
returns table (n_id uuid, n_user uuid, n_kind text, n_params jsonb, n_email text, n_subscriptions jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_params jsonb;
begin
  for r in
    select nl.id, nl.user_id, nl.kind, nl.ref
    from public.notification_log nl
    where nl.sent_at is null and nl.attempts < 3
      and (nl.claimed_at is null or nl.claimed_at < now() - interval '15 minutes')
      and nl.created_at > now() - interval '2 days'
    order by nl.created_at, nl.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  loop
    v_params := case when public.notification_enabled(r.user_id, r.kind)
                     then public.notification_params(r.user_id, r.kind, r.ref) end;
    if v_params is null then
      update public.notification_log nl set sent_at = now() where nl.id = r.id;
      continue;
    end if;
    update public.notification_log nl
      set claimed_at = now(), attempts = nl.attempts + 1
      where nl.id = r.id;
    n_id := r.id;
    n_user := r.user_id;
    n_kind := r.kind;
    n_params := v_params;
    n_email := case when r.kind = 'month_summary' then (
      select u.email::text from auth.users u where u.id = r.user_id and u.email_confirmed_at is not null
    ) end;
    n_subscriptions := coalesce((
      select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
                       order by ps.created_at)
      from public.push_subscriptions ps where ps.user_id = r.user_id
    ), '[]'::jsonb);
    return next;
  end loop;
end;
$$;

-- 22. Depois do envio: o que saiu é marcado, e as inscrições que o serviço de
--     push disse que não valem mais são apagadas. O que falhou fica para a
--     próxima tentativa.
create function public.job_finish_notifications(p_sent uuid[], p_dead uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_log nl set sent_at = now()
    where nl.id = any (coalesce(p_sent, '{}'::uuid[])) and nl.sent_at is null;
  delete from public.push_subscriptions ps where ps.id = any (coalesce(p_dead, '{}'::uuid[]));
end;
$$;

-- 23. Disparo: se há algo a enviar, chama a rota da tarefa (pg_net). O
--     endereço e o segredo ficam no Vault do Supabase, nunca no repositório:
--       select vault.create_secret('https://…/api/jobs/notificacoes', 'iris_job_url');
--       select vault.create_secret('<o mesmo valor de JOB_SECRET>', 'iris_job_secret');
--     Sem os dois, não faz nada. Nunca lança erro (o agendador não para).
create function public.job_dispatch() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.notification_log nl
    where nl.sent_at is null and nl.attempts < 3
      and (nl.claimed_at is null or nl.claimed_at < now() - interval '15 minutes')
      and nl.created_at > now() - interval '2 days'
  ) then
    return false;
  end if;
  begin
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'iris_job_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'iris_job_secret';
    if v_url is null or v_secret is null or v_url !~ '^https?://' or char_length(v_secret) < 32 then
      return false;
    end if;
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('content-type', 'application/json', 'x-iris-job-secret', v_secret),
      timeout_milliseconds := 20000
    );
    return true;
  exception when others then
    raise warning 'job_dispatch: %', sqlstate;
    return false;
  end;
end;
$$;

-- 24. As tarefas que a agenda chama.
create function public.job_enqueue_morning() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  -- Rede de segurança: se a tarefa das 00h05 falhou, as contas de hoje nascem aqui.
  perform public.job_generate_occurrences();
  v_count := public.job_enqueue_morning_on((now() at time zone 'America/Sao_Paulo')::date);
  perform public.job_dispatch();
  return v_count;
end;
$$;

create function public.job_enqueue_evening() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  v_count := public.job_enqueue_evening_on((now() at time zone 'America/Sao_Paulo')::date);
  perform public.job_dispatch();
  return v_count;
end;
$$;

create function public.job_schedules() returns table (jobname text, schedule text)
language sql stable security definer set search_path = '' as $$
  select j.jobname::text, j.schedule::text from cron.job j where j.jobname like 'iris-%' order by j.jobname
$$;

revoke execute on function public.family_event_notify() from public, anon, authenticated;

revoke execute on function
  public.notification_params(uuid, text, text),
  public.job_enqueue_morning_on(date),
  public.job_enqueue_morning(),
  public.job_enqueue_evening_on(date),
  public.job_enqueue_evening(),
  public.job_claim_notifications(integer),
  public.job_finish_notifications(uuid[], uuid[]),
  public.job_dispatch(),
  public.job_schedules()
from public, anon, authenticated;

grant execute on function
  public.notification_params(uuid, text, text),
  public.job_enqueue_morning_on(date),
  public.job_enqueue_morning(),
  public.job_enqueue_evening_on(date),
  public.job_enqueue_evening(),
  public.job_claim_notifications(integer),
  public.job_finish_notifications(uuid[], uuid[]),
  public.job_dispatch(),
  public.job_schedules()
to service_role;

-- 25. Agenda (pg_cron roda em UTC; Brasília = UTC−3, sem horário de verão).
--     cron.schedule com nome substitui a tarefa de mesmo nome.
select cron.schedule('iris-ocorrencias', '5 3 * * *', $$select public.job_generate_occurrences(); select public.job_cleanup();$$);
select cron.schedule('iris-manha', '0 12 * * *', $$select public.job_enqueue_morning();$$);
select cron.schedule('iris-noite', '0 0 * * *', $$select public.job_enqueue_evening();$$);
select cron.schedule('iris-entrega', '*/10 * * * *', $$select public.job_dispatch();$$);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS — `plano8-fila` (21 testes), os outros três arquivos do Plano 8 e todos os dos Planos 1–7 (em especial `plano7-saida`: sair, remover e excluir o cadastro continuam funcionando com o gatilho novo em `family_events`).
Sem Docker: pendente. **Ao rodar pela primeira vez**, conferir os pontos listados em "Ao rodar o banco pela primeira vez" (Task 13).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000001_notificacoes.sql tests/db/plano8-fila.test.ts
git commit -m "feat(db): fila de avisos, lote de envio, avisos da família e agenda no pg_cron" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Servidor — variáveis, envio de push, envio de e-mail e modelos de e-mail

**Files:**
- Modify: `package.json` (dependências `web-push`, `nodemailer`; desenvolvimento `@types/web-push`, `@types/nodemailer`, `sharp`)
- Create: `src/lib/server-env.ts`, `src/lib/server-env.test.ts`
- Create: `src/features/notificacoes/endpoint.ts`, `endpoint.test.ts`, `push-sender.ts`, `push-sender.test.ts`, `mailer.ts`, `mailer.test.ts`, `emails.ts`, `emails.test.ts`
- Create: `supabase/templates/recovery.html`; Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `PushMessage` (Task 1); `dayMonthLabel` (`@/domain/dates`), `monthName` (`@/domain/recurrence`).
- Produces (`@/lib/server-env`, `import 'server-only'`):
  - `type PushConfig = { publicKey: string; privateKey: string; subject: string }`
  - `type MailConfig = { host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string }`
  - `type JobConfig = { secret: string; serviceKey: string }`
  - `readPushConfig(e?: Record<string, string | undefined>): PushConfig | null`
  - `readMailConfig(e?): MailConfig | null`
  - `readJobConfig(e?): JobConfig | null` — o parâmetro tem padrão `process.env`; qualquer valor ausente ou malformado devolve `null` (recurso desligado), nunca lança
- Produces (`@/features/notificacoes/endpoint`): `isAllowedPushEndpoint(url: unknown): boolean`
- Produces (`@/features/notificacoes/push-sender`):
  - `type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string }`
  - `type PushResult = 'sent' | 'gone' | 'failed'`
  - `interface PushSender { send(target: PushTarget, message: PushMessage): Promise<PushResult> }`
  - `webPushSender(config: PushConfig, lib?: { sendNotification: (sub: unknown, payload: string, options: unknown) => Promise<unknown> }): PushSender`
  - `getPushSender(): PushSender | null`
- Produces (`@/features/notificacoes/mailer`):
  - `type Mail = { to: string; subject: string; text: string; html: string }`
  - `interface Mailer { send(mail: Mail): Promise<void> }`
  - `smtpMailer(config: MailConfig, createTransport?: (options: unknown) => { sendMail(m: unknown): Promise<unknown> }): Mailer`
  - `memoryMailer(): Mailer & { sent: Mail[] }`
  - `getMailer(): Mailer | null`
- Produces (`@/features/notificacoes/emails`):
  - `type EmailContent = { subject: string; text: string; html: string }`
  - `inviteEmail(input: { inviterName: string | null; familyName: string; link: string; expiresOn: ISODate }): EmailContent`
  - `monthSummaryEmail(input: { month: MonthKey; link: string }): EmailContent`
  - `escapeHtml(s: string): string`

- [ ] **Step 1: Instalar as dependências**

```bash
npm install web-push nodemailer
npm install -D @types/web-push @types/nodemailer sharp
```

As três são gratuitas e de código aberto. `web-push` e `nodemailer` rodam só no servidor.

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/server-env.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { readJobConfig, readMailConfig, readPushConfig } = await import('./server-env')

const PUB = `B${'A'.repeat(86)}`
const PRIV = 'A'.repeat(43)

describe('variáveis só do servidor: ausente ou malformado desliga o recurso, nunca derruba o app', () => {
  test('push', () => {
    expect(readPushConfig({})).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'contato' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'curta', VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev' })).toBeNull()
    expect(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.dev' }))
      .toEqual({ publicKey: PUB, privateKey: PRIV, subject: 'mailto:a@b.dev' })
  })
  test('e-mail', () => {
    expect(readMailConfig({})).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1' })).toBeNull() // falta o remetente
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', MAIL_FROM: 'Íris <oi@iris.dev>\nBcc: x@y.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '99999', MAIL_FROM: 'oi@iris.dev' })).toBeNull()
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_USER: 'u', MAIL_FROM: 'oi@iris.dev' })).toBeNull() // usuário sem senha
    expect(readMailConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '54325', MAIL_FROM: 'Íris <oi@iris.dev>' }))
      .toEqual({ host: '127.0.0.1', port: 54325, secure: false, user: null, pass: null, from: 'Íris <oi@iris.dev>' })
    expect(readMailConfig({ SMTP_HOST: 'smtp.x.dev', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'oi@iris.dev' }))
      .toEqual({ host: 'smtp.x.dev', port: 587, secure: true, user: 'u', pass: 'p', from: 'oi@iris.dev' })
  })
  test('tarefa: segredo com pelo menos 32 caracteres e a chave de serviço', () => {
    expect(readJobConfig({})).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 'curto', SUPABASE_SECRET_KEY: 'sb_secret_' + 'x'.repeat(20) })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 's'.repeat(32) })).toBeNull()
    expect(readJobConfig({ JOB_SECRET: 's'.repeat(32), SUPABASE_SECRET_KEY: 'sb_secret_' + 'x'.repeat(20) }))
      .toEqual({ secret: 's'.repeat(32), serviceKey: 'sb_secret_' + 'x'.repeat(20) })
  })
})
```

`src/features/notificacoes/endpoint.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { isAllowedPushEndpoint } from './endpoint'

describe('isAllowedPushEndpoint: o servidor só chama serviços de push conhecidos', () => {
  test.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://db5p.notify.windows.com/w/?token=abc',
  ])('aceita %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(true))
  test.each([
    'http://fcm.googleapis.com/fcm/send/abc', 'https://localhost/x', 'https://169.254.169.254/latest/meta-data',
    'https://127.0.0.1:54321/rest/v1/', 'https://fcm.googleapis.com.evil.dev/x', 'https://evil.dev/fcm.googleapis.com',
    'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://notify.windows.com.evil.dev/',
    'javascript:alert(1)', '', 'não é endereço', `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
  ])('recusa %j', (u) => expect(isAllowedPushEndpoint(u)).toBe(false))
  test('recusa o que não é texto', () => {
    expect(isAllowedPushEndpoint(null)).toBe(false)
    expect(isAllowedPushEndpoint({})).toBe(false)
  })
})
```

`src/features/notificacoes/push-sender.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { webPushSender } = await import('./push-sender')

const config = { publicKey: `B${'A'.repeat(86)}`, privateKey: 'A'.repeat(43), subject: 'mailto:oi@iris.dev' }
const target = { id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
const message = { body: 'Luz vence amanhã. Quer marcar como paga?', url: '/contas?mes=2026-10', tag: 'bill-1', pay: true }

describe('webPushSender', () => {
  test('envia o aviso cifrado com as chaves VAPID e validade de 12 horas', async () => {
    const lib = { sendNotification: vi.fn(async () => ({ statusCode: 201 })) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('sent')
    expect(lib.sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 43200, urgency: 'normal' },
    )
  })
  test.each([404, 410])('resposta %i: a inscrição não vale mais', async (statusCode) => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode }) }) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('gone')
  })
  test('outra falha: tentar de novo depois', async () => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode: 500 }) }) }
    expect(await webPushSender(config, lib).send(target, message)).toBe('failed')
    const net = { sendNotification: vi.fn(async () => { throw new Error('ECONNRESET') }) }
    expect(await webPushSender(config, net).send(target, message)).toBe('failed')
  })
  test('endereço fora da lista nunca é chamado e é tratado como inscrição que não vale mais', async () => {
    const lib = { sendNotification: vi.fn() }
    expect(await webPushSender(config, lib).send({ ...target, endpoint: 'https://169.254.169.254/x' }, message)).toBe('gone')
    expect(lib.sendNotification).not.toHaveBeenCalled()
  })
})
```

`src/features/notificacoes/mailer.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { memoryMailer, smtpMailer } = await import('./mailer')

const config = { host: '127.0.0.1', port: 54325, secure: false, user: null, pass: null, from: 'Íris <oi@iris.dev>' }
const mail = { to: 'ana@teste.iris.dev', subject: 'Assunto', text: 'Texto', html: '<p>Texto</p>' }

describe('mailer', () => {
  test('SMTP: usa a configuração e envia texto e HTML', async () => {
    const sendMail = vi.fn(async () => ({}))
    const createTransport = vi.fn(() => ({ sendMail }))
    await smtpMailer(config, createTransport).send(mail)
    expect(createTransport).toHaveBeenCalledWith({ host: '127.0.0.1', port: 54325, secure: false, auth: undefined })
    expect(sendMail).toHaveBeenCalledWith({ from: config.from, ...mail })
  })
  test('SMTP com usuário e senha', async () => {
    const createTransport = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))
    await smtpMailer({ ...config, user: 'u', pass: 'p' }, createTransport).send(mail)
    expect(createTransport).toHaveBeenCalledWith({ host: '127.0.0.1', port: 54325, secure: false, auth: { user: 'u', pass: 'p' } })
  })
  test('destinatário ou assunto com quebra de linha é recusado antes de enviar', async () => {
    const sendMail = vi.fn(async () => ({}))
    const mailer = smtpMailer(config, () => ({ sendMail }))
    await expect(mailer.send({ ...mail, to: 'a@b.dev\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, subject: 'Oi\r\nBcc: x@y.dev' })).rejects.toThrow()
    await expect(mailer.send({ ...mail, to: 'a@b.dev, x@y.dev' })).rejects.toThrow()
    expect(sendMail).not.toHaveBeenCalled()
  })
  test('memória (testes): guarda o que foi enviado', async () => {
    const m = memoryMailer()
    await m.send(mail)
    expect(m.sent).toEqual([mail])
  })
})
```

`src/features/notificacoes/emails.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { escapeHtml, inviteEmail, monthSummaryEmail } from './emails'

const LINK = 'https://iris.app/convite/AbCdEfGhIjKlMnOpQrStUvWxYz012345'

describe('e-mail de convite', () => {
  const m = inviteEmail({ inviterName: 'Camila', familyName: 'Família Souza', link: LINK, expiresOn: '2026-10-08' })
  test('assunto e texto', () => {
    expect(m.subject).toBe('Camila convidou você para a família Família Souza na Íris')
    expect(m.text).toContain('Camila convidou você para participar da família Família Souza na Íris.')
    expect(m.text).toContain('A família vê só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O que é seu continua privado.')
    expect(m.text).toContain('O convite vale até 8 de outubro e serve para uma pessoa.')
    expect(m.text).toContain(LINK)
    expect(m.text).toContain('Se você não esperava este convite, é só ignorar este e-mail.')
  })
  test('HTML simples e acessível: idioma, um título, link com texto claro e o endereço por extenso, sem imagem nem script', () => {
    expect(m.html).toContain('<html lang="pt-BR">')
    expect(m.html.match(/<h1/g)?.length).toBe(1)
    expect(m.html).toContain('Você recebeu um convite')
    expect(m.html).toContain(`<a href="${LINK}">Ver o convite</a>`)
    expect(m.html).toContain('Se o link não abrir, copie este endereço no navegador:')
    expect(m.html).not.toMatch(/<img|<script|<style|<iframe/)
  })
  test('sem nome de quem convidou', () => {
    const anon = inviteEmail({ inviterName: null, familyName: 'Família Souza', link: LINK, expiresOn: '2026-10-08' })
    expect(anon.subject).toBe('Há um convite para você na família Família Souza, na Íris')
    expect(anon.text).toContain('Há um convite para você participar da família Família Souza na Íris.')
  })
  test('escapa nomes no HTML; assunto sem quebra de linha', () => {
    const x = inviteEmail({ inviterName: '<img src=x onerror=alert(1)>', familyName: 'A & B\r\nBcc: x@y.dev', link: LINK, expiresOn: '2026-10-08' })
    expect(x.html).not.toContain('<img')
    expect(x.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(x.html).toContain('A &amp; B')
    expect(x.subject).not.toMatch(/[\r\n]/)
  })
  test('link que não é http(s) é recusado', () => {
    expect(() => inviteEmail({ inviterName: 'A', familyName: 'B', link: 'javascript:alert(1)', expiresOn: '2026-10-08' })).toThrow()
  })
  test('escapeHtml', () => expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'))
})

describe('e-mail do resumo do mês', () => {
  const m = monthSummaryEmail({ month: '2026-09', link: 'https://iris.app/relatorios?periodo=mes-passado' })
  test('texto da copy, sem valores, com o caminho para desligar', () => {
    expect(m.subject).toBe('Seu mês de setembro está fechado')
    expect(m.text).toContain('Seu mês de setembro está fechado. Quer ver como foi?')
    expect(m.text).toContain('https://iris.app/relatorios?periodo=mes-passado')
    expect(m.text).toContain('Você recebe este e-mail porque o resumo do mês está ligado. Para desligar, abra Configurações na Íris.')
    expect(m.html).toContain('<a href="https://iris.app/relatorios?periodo=mes-passado">Ver meu mês</a>')
    expect(m.text).not.toContain('R$')
  })
  test('nenhum e-mail tem exclamação nem "baix"', () => {
    const all = [m, inviteEmail({ inviterName: 'Camila', familyName: 'Família Souza', link: LINK, expiresOn: '2026-10-08' })]
    for (const e of all) for (const part of [e.subject, e.text, e.html.replace(/^<!doctype html>/i, '')]) {
      expect(part).not.toContain('!')
      expect(part.toLowerCase()).not.toContain('baix')
    }
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/server-env.test.ts src/features/notificacoes`
Expected: FAIL (módulos não existem).

- [ ] **Step 4: Implementar**

- `src/lib/server-env.ts`: três leitores com Zod `safeParse`. Push: chave pública `^[A-Za-z0-9_-]{80,100}$`, privada `^[A-Za-z0-9_-]{40,50}$`, `VAPID_SUBJECT` começando por `mailto:` ou `https://`. E-mail: `SMTP_HOST` não vazio; `SMTP_PORT` inteiro de 1 a 65535 (padrão 587); `SMTP_SECURE === 'true'`; `SMTP_USER` e `SMTP_PASS` os dois ou nenhum; `MAIL_FROM` com `@` e sem `\r`/`\n`. Tarefa: `JOB_SECRET` ≥ 32 caracteres; `SUPABASE_SECRET_KEY` ≥ 20.
- `endpoint.ts`: `new URL` dentro de `try`; exige `protocol === 'https:'`, sem `username`/`password`, `port === ''`, tamanho ≤ 2048 e `hostname` igual a `fcm.googleapis.com` ou terminando em `.push.services.mozilla.com`, `.notify.windows.com` ou `.push.apple.com`.
- `push-sender.ts` (`import 'server-only'`): `webPushSender` confere `isAllowedPushEndpoint` antes de chamar `lib.sendNotification` (padrão: `web-push`); `getPushSender()` = `readPushConfig()` → `webPushSender(config)` ou `null`. O conteúdo vai cifrado para o navegador (padrão do Web Push): o serviço de push não lê o texto.
- `mailer.ts` (`import 'server-only'`): `smtpMailer` valida `to` (um endereço só, sem vírgula, espaço, `\r`, `\n`) e `subject` (sem `\r`/`\n`) e chama `createTransport` (padrão: `nodemailer.createTransport`) a cada envio; `getMailer()` = `readMailConfig()` → `smtpMailer(config)` ou `null`.
- `emails.ts`: sem dependência de servidor. Um ajudante `layout(title: string, blocks: string[])` monta `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>…</title></head><body>` com `<h1>`, `<p>` e, no fim, `<p>Íris — Veja para onde seu dinheiro vai</p>`; sem CSS externo, sem imagem. Todo valor vindo de fora passa por `escapeHtml`; no assunto, `\r`, `\n` e espaços repetidos viram um espaço. `link` precisa casar com `^https?://[^\s"<>]+$`, senão `throw`. Textos exatamente como nos testes e na seção "Textos novos".

- [ ] **Step 5: E-mail de recuperação de senha (Supabase Auth)**

`supabase/templates/recovery.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Crie uma nova senha na Íris</title>
  </head>
  <body>
    <h1>Crie uma nova senha.</h1>
    <p>Recebemos um pedido para criar uma nova senha para o seu cadastro na Íris.</p>
    <p><a href="{{ .ConfirmationURL }}">Criar nova senha</a></p>
    <p>Se o link não abrir, copie este endereço no navegador:</p>
    <p>{{ .ConfirmationURL }}</p>
    <p>Se não foi você, é só ignorar este e-mail. Sua senha continua a mesma.</p>
    <p>Íris — Veja para onde seu dinheiro vai</p>
  </body>
</html>
```

Em `supabase/config.toml`: na seção `[local_smtp]`, descomentar `smtp_port = 54325` (é por ela que o app envia para a caixa de e-mail local); depois do bloco comentado `[auth.email.template.invite]`, acrescentar:

```toml
[auth.email.template.recovery]
subject = "Crie uma nova senha na Íris"
content_path = "./supabase/templates/recovery.html"
```

Acrescentar a `emails.test.ts` um teste que lê o arquivo: contém `{{ .ConfirmationURL }}` duas vezes, `lang="pt-BR"`, um `<h1`, não contém `!`, `<img`, `<script` nem a palavra `conta` (o acesso é "cadastro").

```ts
import { readFileSync } from 'node:fs'

test('modelo de recuperação de senha do Supabase', () => {
  const html = readFileSync('supabase/templates/recovery.html', 'utf8')
  expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBe(2)
  expect(html).toContain('<html lang="pt-BR">')
  expect(html.match(/<h1/g)?.length).toBe(1)
  expect(html).not.toMatch(/!(?!doctype)|<img|<script/i)
  expect(html.toLowerCase()).not.toMatch(/\bconta\b/)
})
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/server-env.test.ts src/features/notificacoes && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/server-env.ts src/lib/server-env.test.ts src/features/notificacoes supabase/templates/recovery.html supabase/config.toml
git commit -m "feat(notificacoes): envio de push e de e-mail por interfaces, modelos de e-mail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rota protegida da tarefa e entrega do lote

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/features/notificacoes/job-auth.ts`, `job-auth.test.ts`, `deliver.ts`, `deliver.test.ts`, `admin-import.test.ts`
- Create: `src/app/api/jobs/notificacoes/route.ts`, `route.test.ts`
- Modify: `src/proxy.ts`; Create: `src/proxy.test.ts`
- Create: `scripts/rodar-tarefa.mjs`; Modify: `package.json` (script `job:notificacoes`)

**Interfaces:**
- Consumes: `readJobConfig` (Task 6); `PushSender`, `PushTarget`, `Mailer`, `getPushSender`, `getMailer`, `monthSummaryEmail` (Task 6); `notificationMessage` (Task 1); `NOTIFICATION_KINDS` (Task 1); `job_claim_notifications`, `job_finish_notifications` (Task 5); `env.siteUrl`.
- Produces:
  - `createAdminClient(config: JobConfig): SupabaseClient` (`@/lib/supabase/admin`, `import 'server-only'`; `auth: { persistSession: false, autoRefreshToken: false }`)
  - `secretMatches(given: string | null, expected: string): boolean` (`job-auth.ts`)
  - `type DeliverDeps = { db: { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }; push: PushSender | null; mailer: Mailer | null; siteUrl: string; limit?: number }`
  - `type DeliverResult = { claimed: number; sent: number; failed: number; removed: number }`
  - `deliverBatch(deps: DeliverDeps): Promise<DeliverResult>` (`deliver.ts`)
  - `POST /api/jobs/notificacoes` → `200` com `DeliverResult` em JSON; `404` sem segredo válido ou com o recurso desligado; `500` sem corpo se a entrega falhar

- [ ] **Step 1: Escrever os testes que falham**

`src/features/notificacoes/job-auth.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { secretMatches } from './job-auth'

describe('secretMatches', () => {
  const secret = 's'.repeat(40)
  test('igual', () => expect(secretMatches(secret, secret)).toBe(true))
  test.each([null, '', 'x', 's'.repeat(39), 's'.repeat(41), `${'s'.repeat(39)}S`])('recusa %j sem lançar', (given) => {
    expect(secretMatches(given, secret)).toBe(false)
  })
  test('segredo esperado vazio nunca casa', () => expect(secretMatches('', '')).toBe(false))
})
```

`src/features/notificacoes/deliver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { deliverBatch } = await import('./deliver')
const { memoryMailer } = await import('./mailer')

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const sub = (id: string) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) })
const bill = (over: Record<string, unknown> = {}) => ({
  n_id: 'n1', n_user: 'u1', n_kind: 'bill_today', n_params: { name: 'Luz', id: ID, due_on: '2026-10-01', family: false },
  n_email: null, n_subscriptions: [sub('s1')], ...over,
})

function fakeDb(rows: unknown[], claimError: unknown = null) {
  const calls: { fn: string; args: unknown }[] = []
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'job_claim_notifications') return { data: claimError ? null : rows, error: claimError }
      return { data: null, error: null }
    },
  }
}
const finished = (db: ReturnType<typeof fakeDb>) => db.calls.find((c) => c.fn === 'job_finish_notifications')?.args
const pushWith = (results: Record<string, 'sent' | 'gone' | 'failed'>) => ({
  send: vi.fn(async (target: { id: string }) => results[target.id] ?? 'sent'),
})

let logs: { mock: { calls: unknown[][] } }[] = []
beforeEach(() => { logs = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})) })
afterEach(() => { vi.restoreAllMocks() })

describe('deliverBatch', () => {
  test('envia o push com o texto e o destino do aviso; marca como enviado; remove a inscrição que não vale mais', async () => {
    const db = fakeDb([bill({ n_subscriptions: [sub('s1'), sub('s2')] })])
    const push = pushWith({ s1: 'sent', s2: 'gone' })
    const result = await deliverBatch({ db, push, mailer: null, siteUrl: 'https://iris.app' })
    expect(db.calls[0]).toEqual({ fn: 'job_claim_notifications', args: { p_limit: 50 } })
    expect(push.send).toHaveBeenCalledWith(sub('s1'), { body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true })
    expect(finished(db)).toEqual({ p_sent: ['n1'], p_dead: ['s2'] })
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, removed: 1 })
  })

  test('falha não marca como enviado (fica para a próxima tentativa)', async () => {
    const db = fakeDb([bill()])
    const result = await deliverBatch({ db, push: pushWith({ s1: 'failed' }), mailer: null, siteUrl: 'https://iris.app' })
    expect(finished(db)).toEqual({ p_sent: [], p_dead: [] })
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, removed: 0 })
  })

  test('envio que lança erro conta como falha e não derruba o lote', async () => {
    const db = fakeDb([bill(), bill({ n_id: 'n2', n_subscriptions: [sub('s9')] })])
    const push = { send: vi.fn(async (t: { id: string }) => { if (t.id === 's1') throw new Error('rede'); return 'sent' as const }) }
    const result = await deliverBatch({ db, push, mailer: null, siteUrl: 'https://iris.app' })
    expect(finished(db)).toEqual({ p_sent: ['n2'], p_dead: [] })
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, removed: 0 })
  })

  test('todas as inscrições deixaram de valer: encerra o aviso e remove as inscrições', async () => {
    const db = fakeDb([bill()])
    await deliverBatch({ db, push: pushWith({ s1: 'gone' }), mailer: null, siteUrl: 'https://iris.app' })
    expect(finished(db)).toEqual({ p_sent: ['n1'], p_dead: ['s1'] })
  })

  test('push desligado (sem chaves): encerra sem enviar, em vez de tentar para sempre', async () => {
    const db = fakeDb([bill()])
    const result = await deliverBatch({ db, push: null, mailer: null, siteUrl: 'https://iris.app' })
    expect(finished(db)).toEqual({ p_sent: ['n1'], p_dead: [] })
    expect(result.failed).toBe(0)
  })

  test('resumo do mês: push e e-mail; o link aponta para Relatórios → Mês passado', async () => {
    const db = fakeDb([bill({ n_kind: 'month_summary', n_params: { month: '2026-09' }, n_email: 'ana@teste.iris.dev', n_subscriptions: [] })])
    const mailer = memoryMailer()
    await deliverBatch({ db, push: pushWith({}), mailer, siteUrl: 'https://iris.app' })
    expect(mailer.sent.length).toBe(1)
    expect(mailer.sent[0].to).toBe('ana@teste.iris.dev')
    expect(mailer.sent[0].subject).toBe('Seu mês de setembro está fechado')
    expect(mailer.sent[0].text).toContain('https://iris.app/relatorios?periodo=mes-passado')
    expect(finished(db)).toEqual({ p_sent: ['n1'], p_dead: [] })
  })

  test('só o resumo do mês vai por e-mail, mesmo que a linha traga um endereço', async () => {
    const db = fakeDb([bill({ n_email: 'ana@teste.iris.dev' })])
    const mailer = memoryMailer()
    await deliverBatch({ db, push: pushWith({}), mailer, siteUrl: 'https://iris.app' })
    expect(mailer.sent).toEqual([])
  })

  test('e-mail que falha, sem push que tenha saído: fica para a próxima tentativa', async () => {
    const db = fakeDb([bill({ n_kind: 'month_summary', n_params: { month: '2026-09' }, n_email: 'ana@teste.iris.dev', n_subscriptions: [] })])
    const mailer = { send: vi.fn(async () => { throw new Error('smtp') }) }
    const result = await deliverBatch({ db, push: null, mailer, siteUrl: 'https://iris.app' })
    expect(finished(db)).toEqual({ p_sent: [], p_dead: [] })
    expect(result.failed).toBe(1)
  })

  test('dados que não servem (ou tipo desconhecido): encerra sem enviar', async () => {
    const db = fakeDb([bill({ n_params: { name: '', id: 'x' } }), bill({ n_id: 'n2', n_kind: 'outro' }), { lixo: true }])
    const push = pushWith({})
    const result = await deliverBatch({ db, push, mailer: null, siteUrl: 'https://iris.app' })
    expect(push.send).not.toHaveBeenCalled()
    expect(finished(db)).toEqual({ p_sent: ['n1', 'n2'], p_dead: [] })
    expect(result.claimed).toBe(3)
  })

  test('lote vazio: não chama o encerramento', async () => {
    const db = fakeDb([])
    expect(await deliverBatch({ db, push: null, mailer: null, siteUrl: 'https://iris.app' })).toEqual({ claimed: 0, sent: 0, failed: 0, removed: 0 })
    expect(finished(db)).toBeUndefined()
  })

  test('erro ao pegar o lote: lança, e nada é encerrado', async () => {
    const db = fakeDb([], { message: 'x' })
    await expect(deliverBatch({ db, push: null, mailer: null, siteUrl: 'https://iris.app' })).rejects.toThrow()
    expect(finished(db)).toBeUndefined()
  })

  test('nada pessoal vai para o log: nem endereço de push, nem e-mail, nem o nome da conta', async () => {
    const db = fakeDb([bill({ n_email: 'ana@teste.iris.dev' })])
    await deliverBatch({ db, push: pushWith({ s1: 'failed' }), mailer: null, siteUrl: 'https://iris.app' })
    const printed = logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join('\n')
    for (const secret of ['fcm.googleapis.com', 'ana@teste.iris.dev', 'Luz', 'AAAA']) expect(printed).not.toContain(secret)
  })
})
```

`src/app/api/jobs/notificacoes/route.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  config: null as { secret: string; serviceKey: string } | null,
  deliver: vi.fn(async () => ({ claimed: 2, sent: 2, failed: 0, removed: 0 })),
  admin: vi.fn(() => ({ rpc: vi.fn() })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-env', () => ({ readJobConfig: () => h.config }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: h.admin }))
vi.mock('@/lib/env', () => ({ env: { siteUrl: 'https://iris.app' } }))
vi.mock('@/features/notificacoes/deliver', () => ({ deliverBatch: h.deliver }))
vi.mock('@/features/notificacoes/push-sender', () => ({ getPushSender: () => null }))
vi.mock('@/features/notificacoes/mailer', () => ({ getMailer: () => null }))

const route = await import('./route')
const SECRET = 's'.repeat(40)
const call = (headers: Record<string, string> = {}) =>
  route.POST(new Request('https://iris.app/api/jobs/notificacoes', { method: 'POST', headers, body: '{}' }))

beforeEach(() => {
  h.config = { secret: SECRET, serviceKey: 'sb_secret_' + 'x'.repeat(20) }
  h.deliver.mockClear()
  h.admin.mockClear()
})

describe('POST /api/jobs/notificacoes', () => {
  test('sem segredo: 404, sem corpo, e nada roda', async () => {
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
    expect(h.deliver).not.toHaveBeenCalled()
    expect(h.admin).not.toHaveBeenCalled()
  })
  test('segredo errado: 404', async () => {
    expect((await call({ 'x-iris-job-secret': 'x'.repeat(40) })).status).toBe(404)
    expect(h.deliver).not.toHaveBeenCalled()
  })
  test('sessão não autoriza: cookie de quem entrou, sem o segredo, dá 404', async () => {
    const res = await call({ cookie: 'sb-access-token=qualquer; sb-refresh-token=qualquer', authorization: 'Bearer qualquer' })
    expect(res.status).toBe(404)
    expect(h.deliver).not.toHaveBeenCalled()
  })
  test('recurso desligado (sem JOB_SECRET ou sem a chave de serviço): 404 mesmo com o cabeçalho', async () => {
    h.config = null
    expect((await call({ 'x-iris-job-secret': SECRET })).status).toBe(404)
  })
  test('segredo certo: entrega o lote e responde só números', async () => {
    const res = await call({ 'x-iris-job-secret': SECRET })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ claimed: 2, sent: 2, failed: 0, removed: 0 })
    expect(h.admin).toHaveBeenCalledWith(h.config)
    expect(h.deliver).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: 'https://iris.app', push: null, mailer: null }))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  test('falha na entrega: 500 sem detalhes', async () => {
    h.deliver.mockRejectedValueOnce(new Error('segredo interno'))
    const res = await call({ 'x-iris-job-secret': SECRET })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
  })
  test('só POST existe', () => {
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic'])
    expect(route.dynamic).toBe('force-dynamic')
  })
})
```

`src/features/notificacoes/admin-import.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
const norm = (p: string) => p.replace(/\\/g, '/')
const sources = files('src').map(norm).filter((p) => !/\.test\.tsx?$/.test(p))

test('a chave de serviço só é lida em server-env e só chega ao cliente administrativo', () => {
  const readers = sources.filter((p) => readFileSync(p, 'utf8').includes('SUPABASE_SECRET_KEY'))
  expect(readers).toEqual(['src/lib/server-env.ts'])
})

test('só a rota da tarefa importa o cliente administrativo', () => {
  const importers = sources.filter((p) => /from ['"](@\/lib\/supabase\/admin|.*\/supabase\/admin)['"]/.test(readFileSync(p, 'utf8')))
  expect(importers).toEqual(['src/app/api/jobs/notificacoes/route.ts'])
})

test('nenhum componente de navegador importa módulos só do servidor', () => {
  const serverOnly = /from ['"]@\/(lib\/server-env|lib\/supabase\/admin|features\/notificacoes\/(deliver|push-sender|mailer))['"]/
  const offenders = sources.filter((p) => {
    const text = readFileSync(p, 'utf8')
    return /^['"]use client['"]/m.test(text) && serverOnly.test(text)
  })
  expect(offenders).toEqual([])
})
```

`src/proxy.test.ts`:

```ts
import { expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: vi.fn() }))
const { config } = await import('./proxy')
const matcher = new RegExp(`^${config.matcher[0]}$`)

test('a sessão não passa pela rota da tarefa nem pelos arquivos do PWA', () => {
  for (const path of ['/api/jobs/notificacoes', '/sw.js', '/sem-conexao.html', '/manifest.webmanifest', '/icons/icon-192.png']) {
    expect(matcher.test(path), path).toBe(false)
  }
})
test('as páginas do app continuam passando', () => {
  for (const path of ['/inicio', '/contas', '/configuracoes/instalar', '/api/outra', '/swx', '/boas-vindas/instalar']) {
    expect(matcher.test(path), path).toBe(true)
  }
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/notificacoes src/app/api src/proxy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `job-auth.ts`: `secretMatches` devolve `false` se `given` não for texto ou `expected` for vazio; senão compara `createHash('sha256')` dos dois com `timingSafeEqual` (os resumos têm sempre 32 bytes: a comparação não depende do tamanho do que foi enviado).
- `src/lib/supabase/admin.ts`: `import 'server-only'`; `createAdminClient(config)` = `createClient(env.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })`.
- `deliver.ts` (`import 'server-only'`), regras na ordem:
  1. `db.rpc('job_claim_notifications', { p_limit: deps.limit ?? 50 })`; erro → `throw new Error('claim')`.
  2. Cada linha é validada com Zod (`n_id` texto, `n_kind` ∈ `NOTIFICATION_KINDS`, `n_subscriptions` lista de `PushTarget`, `n_email` texto ou nulo). Linha com `n_id` mas sem o resto, ou com `notificationMessage(kind, params) === null`: **encerrada sem envio**. Linha sem `n_id`: ignorada (conta em `claimed`).
  3. Push: com `deps.push` e inscrições, envia para cada uma dentro de `try` (erro lançado = `'failed'`). `'gone'` → id em `p_dead`.
  4. E-mail: só se `n_kind === 'month_summary'`, há `n_email` e há `deps.mailer` → `monthSummaryEmail({ month, link: \`${siteUrl}/relatorios?periodo=mes-passado\` })`, dentro de `try`.
  5. A linha **falhou** só se houve pelo menos uma falha (`'failed'` ou e-mail com erro) **e** nenhum canal teve sucesso; em qualquer outro caso é encerrada (inclusive sem canal disponível e com todas as inscrições `'gone'`).
  6. Se houve linhas com `n_id`: `db.rpc('job_finish_notifications', { p_sent, p_dead })`.
  7. Log: no máximo uma linha por lote, com os números e os tipos (`console.info('notificacoes', result)`); nunca endereço, e-mail, nome ou texto.
- `route.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { readJobConfig } from '@/lib/server-env'
import { deliverBatch } from '@/features/notificacoes/deliver'
import { secretMatches } from '@/features/notificacoes/job-auth'
import { getMailer } from '@/features/notificacoes/mailer'
import { getPushSender } from '@/features/notificacoes/push-sender'

export const dynamic = 'force-dynamic'

// Chamada só pelo agendador (pg_cron + pg_net) ou por scripts/rodar-tarefa.mjs.
// Não lê cookie nem sessão: só o segredo autoriza.
export async function POST(request: Request): Promise<Response> {
  const config = readJobConfig()
  if (!config || !secretMatches(request.headers.get('x-iris-job-secret'), config.secret)) {
    return new Response(null, { status: 404 })
  }
  try {
    const result = await deliverBatch({
      db: createAdminClient(config), push: getPushSender(), mailer: getMailer(), siteUrl: env.siteUrl,
    })
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return new Response(null, { status: 500 })
  }
}
```

- `src/proxy.ts`: o `matcher` passa a ser

```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/jobs/|sw\\.js$|sem-conexao\\.html$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
```

- `scripts/rodar-tarefa.mjs`: carrega `.env.local` com `dotenv`; argumento opcional `manha` ou `noite` chama antes, com `@supabase/supabase-js` e `SUPABASE_SECRET_KEY`, `job_enqueue_morning` ou `job_enqueue_evening`; depois faz `POST` em `${NEXT_PUBLIC_SITE_URL}/api/jobs/notificacoes` com `x-iris-job-secret: JOB_SECRET` e imprime o status e os números. Sem `JOB_SECRET`, imprime "Defina JOB_SECRET em .env.local." e sai com código 1. Em `package.json`: `"job:notificacoes": "node scripts/rodar-tarefa.mjs"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/notificacoes src/app/api src/proxy.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/admin.ts src/features/notificacoes src/app/api src/proxy.ts src/proxy.test.ts scripts/rodar-tarefa.mjs package.json
git commit -m "feat(notificacoes): rota protegida da tarefa e entrega do lote" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: PWA — manifest, ícones, service worker, "Sem conexão"

**Files:**
- Create: `scripts/gerar-icones.mjs`; `public/icons/icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, `badge-96.png`; `src/app/icon.png`, `src/app/apple-icon.png`
- Delete: `src/app/favicon.ico` (é o ícone do modelo do Next), `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (arquivos do modelo, sem uso — conferir com `grep -rn "vercel.svg\|next.svg\|globe.svg\|file.svg\|window.svg" src` antes de apagar)
- Create: `src/app/manifest.ts`, `public/sw.js`, `public/sem-conexao.html`
- Create: `src/features/pwa/register-sw.tsx`, `register-sw.test.tsx`, `install-prompt.ts`, `sw.test.ts`, `assets.test.ts`
- Create: `src/features/shell/offline-banner.tsx`, `offline-banner.test.tsx`
- Modify: `src/app/layout.tsx`, `next.config.ts`, `package.json` (script `icons`)

**Interfaces:**
- Consumes: logo provisório (`src/ui/logo.tsx`: círculo `#a0e870`, anel e pupila `#122801`, brilho `#ffffff`); tokens (`canvas #f8f8f8`).
- Produces:
  - `/manifest.webmanifest`, `/sw.js`, `/sem-conexao.html`, `/icons/*.png`
  - `RegisterServiceWorker()` (`@/features/pwa/register-sw`, cliente) — registra `/sw.js` com `{ scope: '/', updateViaCache: 'none' }` e chama `captureInstallPrompt()`
  - `captureInstallPrompt(): void`, `takeInstallPrompt(): InstallPromptEvent | null`, `onInstallable(listener: () => void): () => void`, `type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }` (`@/features/pwa/install-prompt`)
  - `OfflineBanner()` (`@/features/shell/offline-banner`, cliente)
  - Mensagem de push que o service worker entende: `{ body: string; url: string; tag: string; pay: boolean }` (= `PushMessage`)

- [ ] **Step 1: Escrever os testes que falham**

`src/features/pwa/sw.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, test, vi } from 'vitest'

const source = readFileSync('public/sw.js', 'utf8')
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

type Handler = (event: Record<string, unknown>) => void

function load() {
  const handlers: Record<string, Handler> = {}
  const cache = { addAll: vi.fn(async (_urls: string[]) => {}), put: vi.fn(), add: vi.fn() }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['iris-estatico-v0', 'outro', 'iris-estatico-v1']),
    delete: vi.fn(async (_key: string) => true),
    match: vi.fn(async (u: string) => `em-cache:${u}`),
  }
  const self = {
    addEventListener: (type: string, h: Handler) => { handlers[type] = h },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), openWindow: vi.fn(async (_url: string) => null) },
    registration: { showNotification: vi.fn(async (_title: string, _options: Record<string, unknown>) => {}) },
    location: { origin: 'https://iris.app' },
  }
  const fetch = vi.fn<(request: unknown) => Promise<unknown>>()
  vm.runInNewContext(source, { self, caches, fetch, URL })
  const run = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: unknown[] = []
    let response: unknown
    handlers[type]({ ...event, waitUntil: (p: unknown) => waits.push(p), respondWith: (p: unknown) => { response = p } })
    await Promise.all(waits)
    return response
  }
  return { handlers, cache, caches, self, fetch, run }
}

const pushEvent = (data: unknown) => ({ data: { json: () => { if (data === 'quebrado') throw new Error('json'); return data } } })
const click = (url: unknown, action = '') => ({ action, notification: { close: vi.fn(), data: { url } } })

describe('service worker: nada do app fica guardado', () => {
  test('instalar guarda só a página "Sem conexão" e um ícone', async () => {
    const sw = load()
    await sw.run('install')
    expect(sw.caches.open).toHaveBeenCalledWith('iris-estatico-v1')
    expect(sw.cache.addAll).toHaveBeenCalledWith(['/sem-conexao.html', '/icons/icon-192.png'])
    expect(sw.self.skipWaiting).toHaveBeenCalled()
  })
  test('ativar apaga caches antigos e assume as abas abertas', async () => {
    const sw = load()
    await sw.run('activate')
    expect(sw.caches.delete.mock.calls.map((c) => c[0])).toEqual(['iris-estatico-v0', 'outro'])
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })
  test('o que não é navegação não é tocado (dados, ações, arquivos do Next)', async () => {
    const sw = load()
    for (const mode of ['cors', 'same-origin', 'no-cors']) {
      expect(await sw.run('fetch', { request: { mode, url: 'https://iris.app/inicio' } })).toBeUndefined()
    }
    expect(sw.fetch).not.toHaveBeenCalled()
  })
  test('navegação com rede: a resposta vem da rede e não é guardada', async () => {
    const sw = load()
    sw.fetch.mockResolvedValueOnce('da-rede')
    expect(await sw.run('fetch', { request: { mode: 'navigate', url: 'https://iris.app/extrato' } })).toBe('da-rede')
    expect(sw.cache.put).not.toHaveBeenCalled()
    expect(sw.cache.add).not.toHaveBeenCalled()
    expect(sw.caches.match).not.toHaveBeenCalled()
  })
  test('navegação sem rede: a página "Sem conexão"', async () => {
    const sw = load()
    sw.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await sw.run('fetch', { request: { mode: 'navigate', url: 'https://iris.app/extrato' } })).toBe('em-cache:/sem-conexao.html')
  })
  test('o arquivo não guarda respostas nem cita rotas do app', () => {
    expect(source).not.toMatch(/cache\.put|\.add\(|_next|\/api\//)
  })
})

describe('service worker: aviso', () => {
  test('mostra o aviso com o título "Íris", o texto recebido e o destino', async () => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true }))
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Íris', {
      body: 'Hoje é o dia de Luz.', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'pt-BR', tag: `bill-${ID}`,
      data: { url: `/contas?mes=2026-10&pagar=${ID}` },
      actions: [{ action: 'pay', title: 'Marcar como paga' }, { action: 'later', title: 'Agora não' }],
    })
  })
  test('aviso sem pagamento não tem botões', async () => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Seu mês continua aqui. Quer atualizar?', url: '/inicio', tag: 'comeback', pay: false }))
    expect(sw.self.registration.showNotification.mock.calls[0][1].actions).toEqual([])
  })
  test.each(['quebrado', null, {}, { body: '' }, { body: 12 }, { body: 'x'.repeat(301) }])('conteúdo que não serve (%j): não mostra nada e não lança', async (data) => {
    const sw = load()
    await sw.run('push', pushEvent(data))
    expect(sw.self.registration.showNotification).not.toHaveBeenCalled()
  })
  test.each([
    '//evil.dev', 'https://evil.dev/inicio', '/\\evil.dev', 'javascript:alert(1)', '/configuracoes', '/entrar', '/inicio\n/x', 12, undefined,
  ])('destino que não é do app (%j) vira /inicio já ao receber', async (url) => {
    const sw = load()
    await sw.run('push', pushEvent({ body: 'Oi', url, tag: 't', pay: false }))
    expect(sw.self.registration.showNotification.mock.calls[0][1].data).toEqual({ url: '/inicio' })
  })
  test('tocar no aviso (ou em "Marcar como paga") abre o destino; "Agora não" só fecha', async () => {
    const sw = load()
    const body = click(`/contas?mes=2026-10&pagar=${ID}`)
    await sw.run('notificationclick', body)
    expect(body.notification.close).toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith(`/contas?mes=2026-10&pagar=${ID}`)
    await sw.run('notificationclick', click(`/familia/contas?pagar=${ID}`, 'pay'))
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith(`/familia/contas?pagar=${ID}`)
    const later = click('/inicio', 'later')
    await sw.run('notificationclick', later)
    expect(later.notification.close).toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenCalledTimes(2)
  })
  test('destino adulterado no aviso guardado também vira /inicio ao tocar', async () => {
    const sw = load()
    await sw.run('notificationclick', click('https://evil.dev'))
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith('/inicio')
  })
})
```

`src/features/pwa/assets.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import manifest from '@/app/manifest'
import nextConfig from '../../../next.config'

const size = (path: string) => {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString('latin1'), path).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('manifest (RNF-03)', () => {
  const m = manifest()
  test('nome, início, modo e cores dos tokens', () => {
    expect(m).toMatchObject({
      name: 'Íris', short_name: 'Íris', start_url: '/inicio', scope: '/', display: 'standalone', lang: 'pt-BR',
      background_color: '#f8f8f8', theme_color: '#f8f8f8',
    })
    expect(JSON.stringify(m).toLowerCase()).not.toMatch(/baix|loja|store/)
  })
  test('ícones do logo provisório, inclusive os adaptáveis', () => {
    expect(m.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })
  test('os arquivos existem com o tamanho declarado', () => {
    expect(size('public/icons/icon-192.png')).toEqual([192, 192])
    expect(size('public/icons/icon-512.png')).toEqual([512, 512])
    expect(size('public/icons/maskable-192.png')).toEqual([192, 192])
    expect(size('public/icons/maskable-512.png')).toEqual([512, 512])
    expect(size('public/icons/badge-96.png')).toEqual([96, 96])
    expect(size('src/app/icon.png')).toEqual([192, 192])
    expect(size('src/app/apple-icon.png')).toEqual([180, 180])
  })
})

describe('página "Sem conexão"', () => {
  const html = readFileSync('public/sem-conexao.html', 'utf8')
  test('texto da copy, idioma, e um caminho de volta', () => {
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('Sem conexão no momento. Assim que voltar, a gente tenta de novo.')
    expect(html).toContain('<a href="/inicio">Tentar de novo</a>')
    expect(html.match(/<h1/g)?.length).toBe(1)
  })
  test('é estática e sozinha: sem script, sem arquivo de fora, sem dado de ninguém', () => {
    expect(html).not.toMatch(/<script|<link|src=|https?:\/\/|@import|url\(/i)
    expect(html.toLowerCase()).not.toMatch(/baix|r\$/)
    expect(html).not.toContain('!important')
  })
})

describe('cabeçalhos', () => {
  test('o service worker nunca fica em cache e só roda código da própria Íris', async () => {
    const all = await nextConfig.headers!()
    const sw = all.find((h) => h.source === '/sw.js')!.headers
    expect(sw).toEqual(expect.arrayContaining([
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
    ]))
    const every = all.find((h) => h.source === '/(.*)')!.headers
    expect(every).toEqual(expect.arrayContaining([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]))
    expect(all.find((h) => h.source === '/sem-conexao.html')!.headers).toEqual([{ key: 'Cache-Control', value: 'no-cache' }])
  })
})
```

`src/features/shell/offline-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { OfflineBanner } from './offline-banner'

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
  act(() => { window.dispatchEvent(new Event(value ? 'online' : 'offline')) })
}

afterEach(() => { cleanup(); setOnline(true) })

describe('OfflineBanner', () => {
  test('com conexão, nada aparece', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
  })
  test('sem conexão, o aviso da copy; quando volta, some', () => {
    render(<OfflineBanner />)
    setOnline(false)
    expect(screen.getByRole('status').textContent).toBe('Sem conexão no momento. Assim que voltar, a gente tenta de novo.')
    setOnline(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
```

`src/features/pwa/register-sw.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { RegisterServiceWorker } from './register-sw'
import { takeInstallPrompt } from './install-prompt'

afterEach(() => cleanup())

test('registra o service worker na raiz, sem cache do arquivo, e não quebra se o registro falhar', async () => {
  const register = vi.fn(async () => { throw new Error('bloqueado') })
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { register } })
  render(<RegisterServiceWorker />)
  await Promise.resolve()
  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
})

test('guarda o convite de instalação do navegador para a tela "Instalar a Íris"', () => {
  render(<RegisterServiceWorker />)
  expect(takeInstallPrompt()).toBeNull()
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(takeInstallPrompt()).toBe(event)
  expect(takeInstallPrompt()).toBeNull() // o navegador só deixa usar uma vez
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/pwa src/features/shell/offline-banner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Gerar os ícones**

`scripts/gerar-icones.mjs` (com `sharp`): desenha o logo de `src/ui/logo.tsx` em SVG e grava os PNG.

| Arquivo | Tamanho | Desenho |
|---|---|---|
| `public/icons/icon-192.png`, `icon-512.png`, `src/app/icon.png` (192) | 192, 512 | fundo transparente; o logo (círculo verde com a íris) ocupando 94% do quadro |
| `public/icons/maskable-192.png`, `maskable-512.png` | 192, 512 | fundo `#a0e870` de ponta a ponta (sem transparência); anel, pupila e brilho no centro, dentro de 60% do quadro (zona segura) |
| `src/app/apple-icon.png` | 180 | igual ao adaptável (o iPhone não aceita transparência) |
| `public/icons/badge-96.png` | 96 | só o anel e a pupila em branco, fundo transparente (ícone pequeno da barra do Android) |

Em `package.json`: `"icons": "node scripts/gerar-icones.mjs"`. Rodar `npm run icons` e commitar os PNG (o script fica para quando o logo definitivo chegar — decisão 11).

- [ ] **Step 4: Escrever `public/sw.js`**

```js
// Íris — service worker.
// Não guarda nenhuma página, resposta ou arquivo do app: só a página estática
// "Sem conexão" e um ícone. Dado financeiro nunca é servido velho, nem para
// outra pessoa no mesmo aparelho. Por isso a atualização é direta (não há
// versão antiga do app guardada para conflitar).
const CACHE = 'iris-estatico-v1'
const OFFLINE_URL = '/sem-conexao.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']
// Destinos que um aviso pode abrir. A lista exata é conferida no servidor
// (isAllowedTarget); aqui fica a segunda barreira.
const SAFE_PREFIXES = ['/inicio', '/anotar', '/contas', '/familia', '/planejamento', '/metas', '/relatorios']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return '/inicio'
  let url
  try {
    url = new URL(raw, self.location.origin)
  } catch {
    return '/inicio'
  }
  if (url.origin !== self.location.origin) return '/inicio'
  const ok = SAFE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + '/'))
  return ok ? url.pathname + url.search : '/inicio'
}

self.addEventListener('push', (event) => {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }
  if (!data || typeof data.body !== 'string' || data.body.length === 0 || data.body.length > 300) return
  event.waitUntil(
    self.registration.showNotification('Íris', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'pt-BR',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 64) : undefined,
      data: { url: safeUrl(data.url) },
      actions: data.pay === true
        ? [{ action: 'pay', title: 'Marcar como paga' }, { action: 'later', title: 'Agora não' }]
        : [],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'later') return
  event.waitUntil(self.clients.openWindow(safeUrl(event.notification.data && event.notification.data.url)))
})
```

"Marcar como paga" no aviso **abre a Íris na confirmação** ("Marcar {conta} como paga?", Task 11); nada é pago sem a pessoa confirmar na tela.

- [ ] **Step 5: Escrever `public/sem-conexao.html`**

Página estática, sem script e sem arquivo externo (CSS em `<style>` com os tokens: fundo `#f8f8f8`, texto `#171717`, link `#22500a`, fonte do sistema, alvo do link com 44 px):

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f8f8f8" />
    <title>Íris — Sem conexão</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8f8f8; color: #171717; font: 16px/1.5 system-ui, sans-serif; }
      main { max-width: 360px; padding: 24px; }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { margin: 0 0 20px; color: #3a3a3a; }
      a { display: inline-flex; min-height: 44px; align-items: center; color: #22500a; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sem conexão</h1>
      <p>Sem conexão no momento. Assim que voltar, a gente tenta de novo.</p>
      <a href="/inicio">Tentar de novo</a>
    </main>
  </body>
</html>
```

- [ ] **Step 6: Implementar o restante**

- `src/app/manifest.ts`: `export default function manifest(): MetadataRoute.Manifest` com os valores do teste e `description: 'Anote seus gastos em segundos e entenda seu mês de um jeito simples.'` (trecho da descrição que já está em `layout.tsx`).
- `next.config.ts`: `async headers()` com as três entradas do teste (`/(.*)`, `/sw.js`, `/sem-conexao.html`), como no guia `progressive-web-apps.md` §8.
- `install-prompt.ts`: guarda o evento `beforeinstallprompt` num módulo (com `preventDefault()`), avisa quem se inscreveu em `onInstallable`, e `takeInstallPrompt()` devolve o evento e o esquece.
- `register-sw.tsx` (`'use client'`): num `useEffect`, `captureInstallPrompt()` e, se `'serviceWorker' in navigator`, `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})`. Não renderiza nada.
- `offline-banner.tsx` (`'use client'`): `useSyncExternalStore` com os eventos `online`/`offline` e `navigator.onLine` (no servidor: `true`). Sem conexão, `<p role="status">` fixo no topo (`z-50`, fundo `bg-ink`, texto branco, 15 px) com o texto da copy.
- `src/app/layout.tsx`: dentro de `<body>`, antes de `{children}`, `<OfflineBanner />` e `<RegisterServiceWorker />`; em `metadata`, acrescentar `appleWebApp: { capable: true, title: 'Íris', statusBarStyle: 'default' }`. O `<link rel="manifest">` e os ícones entram sozinhos pelas convenções de arquivo.

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run src/features/pwa src/features/shell && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS; build sem erros; `.next` lista `/manifest.webmanifest`.
Conferência manual (sem Docker): `npm run dev`, abrir `http://localhost:3000/manifest.webmanifest`, `/sw.js` e `/sem-conexao.html` sem entrar — os três respondem 200 sem redirecionar para `/entrar`.

- [ ] **Step 8: Commit**

```bash
git add scripts/gerar-icones.mjs public src/app src/features/pwa src/features/shell/offline-banner.tsx src/features/shell/offline-banner.test.tsx next.config.ts package.json
git commit -m "feat(pwa): manifest, ícones, service worker sem cache de páginas e aviso Sem conexão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Lembretes em Configurações — chaves por tipo e ativar neste aparelho

**Files:**
- Modify: `src/lib/env.ts` (chave pública VAPID, opcional)
- Create: `src/features/notificacoes/schemas.ts`, `queries.ts`, `actions.ts`, `actions.test.ts`
- Create: `src/features/notificacoes/push-client.ts`, `push-client.test.ts`, `push-device.tsx`, `push-device.test.tsx`, `push-sync.tsx`, `reminders-section.tsx`, `reminders-section.test.tsx`, `bills-reminder-card.tsx`
- Create: `src/ui/switch-row.tsx`, `src/ui/switch-row.test.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/contas/page.tsx`, `src/features/shell/sign-out-button.tsx`

**Interfaces:**
- Consumes: `PREF_KINDS`, `PREF_LABELS`, `PREF_ORDER`, `resolvePrefs`, `isPrefKind`, `PrefKind` (Task 1); `isAllowedPushEndpoint` (Task 6); `save_push_subscription`, `sync_push_subscription`, `delete_push_subscription`, tabela `notification_prefs` (Task 2); `loadFamilySummaryOrNull` (`@/features/familia/queries`); `signOut` (`@/features/auth/actions`); `ListSection`, `ListCard`, `ListRow` (`@/ui/list`).
- Produces:
  - `env.vapidPublicKey: string | null` (`@/lib/env`; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` com forma `^[A-Za-z0-9_-]{80,100}$`, senão `null` — nunca derruba o app)
  - `pushSubscriptionSchema` (`schemas.ts`): `{ endpoint, keys: { p256dh, auth } }` → `{ endpoint, p256dh, auth }`; `endpoint` precisa passar em `isAllowedPushEndpoint`
  - `loadNotificationPrefs(): Promise<Record<PrefKind, boolean>>` (`queries.ts`, `server-only`; filtra `user_id` de `requireUser()`)
  - `actions.ts` (`'use server'`): `setNotificationPref(fd: FormData): Promise<void>`; `savePushSubscription(input: unknown): Promise<{ ok: boolean }>`; `syncPushSubscription(endpoint: unknown): Promise<{ mine: boolean }>`; `removePushSubscription(endpoint: unknown): Promise<void>`
  - `push-client.ts` (só navegador): `type DeviceState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'`; `deviceState(): Promise<DeviceState>`; `enablePush(vapidPublicKey: string): Promise<'on' | 'blocked' | 'failed'>`; `disablePush(): Promise<void>`; `isStandalone(): boolean`; `isIOS(): boolean`
  - `PushDevice({ vapidPublicKey }: { vapidPublicKey: string | null })`, `PushSync()`, `BillsReminderCard({ vapidPublicKey }: { vapidPublicKey: string })` (clientes)
  - `RemindersSection({ prefs, hasFamily, vapidPublicKey })` (servidor)
  - `SwitchRow({ label, caption?, checked, action, fields })` (`@/ui/switch-row`) — `<button type="submit" role="switch" aria-checked>` com o nome acessível igual a `label`

- [ ] **Step 1: Escrever os testes que falham**

`src/features/notificacoes/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), revalidatePath: vi.fn() }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const KEYS = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
let upserts: { table: string; row: unknown; options: unknown }[] = []
let rpcCalls: { fn: string; args: unknown }[] = []
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
let upsertError: unknown = null

beforeEach(() => {
  upserts = []
  rpcCalls = []
  rpcResult = { data: null, error: null }
  upsertError = null
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
  h.supabase = {
    from: (table: string) => ({
      upsert: async (row: unknown, options: unknown) => {
        upserts.push({ table, row, options })
        return { error: upsertError }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
  }
})

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const redirected = async (p: Promise<unknown>): Promise<string | null> => {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  return null
}

describe('setNotificationPref', () => {
  test('grava a chave da própria pessoa (o id vem da sessão, nunca do formulário)', async () => {
    const f = form({ kind: 'daily', enabled: 'true', user_id: 'outra-pessoa' })
    expect(await redirected(actions.setNotificationPref(f))).toBe('/configuracoes')
    expect(upserts).toEqual([{ table: 'notification_prefs', row: { user_id: 'u1', kind: 'daily', enabled: true }, options: { onConflict: 'user_id,kind' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/configuracoes')
  })
  test('desligar', async () => {
    await redirected(actions.setNotificationPref(form({ kind: 'bills', enabled: 'false' })))
    expect(upserts[0].row).toEqual({ user_id: 'u1', kind: 'bills', enabled: false })
  })
  test.each([{ kind: 'tudo', enabled: 'true' }, { kind: 'bill_today', enabled: 'true' }, { kind: 'daily', enabled: 'sim' }, {}])('entrada que não serve (%j): nada é gravado', async (o) => {
    expect(await redirected(actions.setNotificationPref(form(o as Record<string, string>)))).toBe('/configuracoes')
    expect(upserts).toEqual([])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
  test('erro do banco: volta com o aviso de erro, sem "Alterações salvas."', async () => {
    upsertError = { message: 'x' }
    expect(await redirected(actions.setNotificationPref(form({ kind: 'daily', enabled: 'true' })))).toBe('/configuracoes?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('inscrição deste aparelho', () => {
  test('savePushSubscription grava pelo banco, com endereço e chaves conferidos', async () => {
    expect(await actions.savePushSubscription({ endpoint: ENDPOINT, keys: KEYS, expirationTime: null })).toEqual({ ok: true })
    expect(rpcCalls).toEqual([{ fn: 'save_push_subscription', args: { p_endpoint: ENDPOINT, p_p256dh: KEYS.p256dh, p_auth: KEYS.auth } }])
  })
  test.each([
    { endpoint: 'https://169.254.169.254/latest', keys: KEYS },
    { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys: KEYS },
    { endpoint: ENDPOINT, keys: { p256dh: 'curta', auth: KEYS.auth } },
    { endpoint: ENDPOINT },
    null,
    'texto',
  ])('savePushSubscription recusa endereço fora da lista e chaves malformadas (%j)', async (input) => {
    expect(await actions.savePushSubscription(input)).toEqual({ ok: false })
    expect(rpcCalls).toEqual([])
  })
  test('erro do banco ao salvar', async () => {
    rpcResult = { data: null, error: { message: 'x' } }
    expect(await actions.savePushSubscription({ endpoint: ENDPOINT, keys: KEYS })).toEqual({ ok: false })
  })
  test('syncPushSubscription: responde se a inscrição do navegador é de quem está usando', async () => {
    rpcResult = { data: true, error: null }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: true })
    expect(rpcCalls).toEqual([{ fn: 'sync_push_subscription', args: { p_endpoint: ENDPOINT } }])
    rpcResult = { data: false, error: null }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: false })
    rpcResult = { data: null, error: { message: 'x' } }
    expect(await actions.syncPushSubscription(ENDPOINT)).toEqual({ mine: false })
    rpcCalls = []
    expect(await actions.syncPushSubscription(12)).toEqual({ mine: false })
    expect(await actions.syncPushSubscription('x'.repeat(3000))).toEqual({ mine: false })
    expect(rpcCalls).toEqual([])
  })
  test('removePushSubscription apaga pelo banco (que só apaga a da própria pessoa)', async () => {
    await actions.removePushSubscription(ENDPOINT)
    expect(rpcCalls).toEqual([{ fn: 'delete_push_subscription', args: { p_endpoint: ENDPOINT } }])
    rpcCalls = []
    await actions.removePushSubscription(null)
    expect(rpcCalls).toEqual([])
  })
})

test('o módulo "use server" exporta só funções async', () => {
  for (const [name, value] of Object.entries(actions)) {
    expect(typeof value, name).toBe('function')
    expect((value as { constructor: { name: string } }).constructor.name, name).toBe('AsyncFunction')
  }
})
```

`src/features/notificacoes/push-client.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(async (_i: unknown) => ({ ok: true })),
  sync: vi.fn(async (_e: unknown) => ({ mine: true })),
  remove: vi.fn(async (_e: unknown) => {}),
}))
vi.mock('./actions', () => ({ savePushSubscription: h.save, syncPushSubscription: h.sync, removePushSubscription: h.remove }))

const { deviceState, disablePush, enablePush } = await import('./push-client')

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const subscription = () => ({
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
})
type Sub = ReturnType<typeof subscription>

function browser(opts: { permission?: string; current?: Sub | null; created?: Sub; subscribeFails?: boolean; ua?: string; standalone?: boolean; push?: boolean }) {
  const manager = {
    getSubscription: vi.fn(async () => opts.current ?? null),
    subscribe: vi.fn(async (_o: unknown) => {
      if (opts.subscribeFails) throw new Error('x')
      return opts.created ?? subscription()
    }),
  }
  const define = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { configurable: true, value })
  define(window.navigator, 'userAgent', opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130')
  define(window, 'matchMedia', (q: string) => ({ matches: q.includes('standalone') && opts.standalone === true }))
  if (opts.push === false) {
    Reflect.deleteProperty(window, 'PushManager')
    Reflect.deleteProperty(window, 'Notification')
    Reflect.deleteProperty(window.navigator, 'serviceWorker')
  } else {
    define(window, 'PushManager', function PushManager() {})
    define(window, 'Notification', { permission: opts.permission ?? 'default', requestPermission: vi.fn(async () => opts.permission ?? 'granted') })
    define(window.navigator, 'serviceWorker', { ready: Promise.resolve({ pushManager: manager }) })
  }
  return manager
}

beforeEach(() => { h.save.mockClear(); h.sync.mockClear(); h.remove.mockClear(); h.save.mockResolvedValue({ ok: true }); h.sync.mockResolvedValue({ mine: true }) })
afterEach(() => { vi.restoreAllMocks() })

describe('deviceState', () => {
  test('navegador sem push', async () => {
    browser({ push: false })
    expect(await deviceState()).toBe('unsupported')
  })
  test('iPhone fora da tela de início: primeiro adicionar', async () => {
    browser({ push: false, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' })
    expect(await deviceState()).toBe('needs-install')
  })
  test('permissão negada', async () => {
    browser({ permission: 'denied' })
    expect(await deviceState()).toBe('blocked')
  })
  test('sem inscrição: desligado', async () => {
    browser({ permission: 'granted', current: null })
    expect(await deviceState()).toBe('off')
    expect(h.sync).not.toHaveBeenCalled()
  })
  test('com inscrição que é desta pessoa: ligado', async () => {
    browser({ permission: 'granted', current: subscription() })
    expect(await deviceState()).toBe('on')
    expect(h.sync).toHaveBeenCalledWith(ENDPOINT)
  })
  test('com inscrição de outra pessoa: cancela no navegador e fica desligado', async () => {
    const current = subscription()
    browser({ permission: 'granted', current })
    h.sync.mockResolvedValue({ mine: false })
    expect(await deviceState()).toBe('off')
    expect(current.unsubscribe).toHaveBeenCalled()
  })
})

describe('enablePush / disablePush', () => {
  const KEY = `B${'A'.repeat(86)}`
  test('pede a permissão, inscreve com a chave pública e grava no servidor', async () => {
    const manager = browser({ permission: 'granted' })
    expect(await enablePush(KEY)).toBe('on')
    expect(manager.subscribe.mock.calls[0][0]).toMatchObject({ userVisibleOnly: true })
    expect(h.save).toHaveBeenCalledWith({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } })
  })
  test('permissão recusada: não inscreve', async () => {
    const manager = browser({ permission: 'denied' })
    expect(await enablePush(KEY)).toBe('blocked')
    expect(manager.subscribe).not.toHaveBeenCalled()
  })
  test('servidor recusou: desfaz a inscrição no navegador', async () => {
    const created = subscription()
    browser({ permission: 'granted', created })
    h.save.mockResolvedValue({ ok: false })
    expect(await enablePush(KEY)).toBe('failed')
    expect(created.unsubscribe).toHaveBeenCalled()
  })
  test('navegador não conseguiu inscrever', async () => {
    browser({ permission: 'granted', subscribeFails: true })
    expect(await enablePush(KEY)).toBe('failed')
    expect(h.save).not.toHaveBeenCalled()
  })
  test('desativar: apaga no servidor e cancela no navegador; sem inscrição não faz nada', async () => {
    const current = subscription()
    browser({ permission: 'granted', current })
    await disablePush()
    expect(h.remove).toHaveBeenCalledWith(ENDPOINT)
    expect(current.unsubscribe).toHaveBeenCalled()
    h.remove.mockClear()
    browser({ permission: 'granted', current: null })
    await disablePush()
    expect(h.remove).not.toHaveBeenCalled()
  })
})
```

`src/features/notificacoes/push-device.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: 'off' as string,
  enable: vi.fn(async (_k: string) => 'on' as 'on' | 'blocked' | 'failed'),
  disable: vi.fn(async () => {}),
}))
vi.mock('./push-client', () => ({ deviceState: async () => h.state, enablePush: h.enable, disablePush: h.disable }))

const { PushDevice } = await import('./push-device')
const KEY = `B${'A'.repeat(86)}`

beforeEach(() => { h.state = 'off'; h.enable.mockClear(); h.disable.mockClear(); h.enable.mockResolvedValue('on') })
afterEach(() => cleanup())

describe('PushDevice (RF-08: a permissão só é pedida por um toque)', () => {
  test('desligado: botão "Ativar lembretes"; nada é pedido ao abrir a tela', async () => {
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByRole('button', { name: 'Ativar lembretes' })
    expect(h.enable).not.toHaveBeenCalled()
  })
  test('ativar: pede, confirma e passa a oferecer "Desativar neste aparelho"', async () => {
    render(<PushDevice vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar lembretes' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Lembretes ativados.'))
    expect(h.enable).toHaveBeenCalledWith(KEY)
    expect(screen.getByRole('button', { name: 'Desativar neste aparelho' })).toBeTruthy()
  })
  test('ligado: diz que está ativo e desativa', async () => {
    h.state = 'on'
    render(<PushDevice vapidPublicKey={KEY} />)
    expect((await screen.findByText('Os lembretes estão ativos neste aparelho.'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desativar neste aparelho' }))
    await screen.findByRole('button', { name: 'Ativar lembretes' })
    expect(h.disable).toHaveBeenCalled()
  })
  test('bloqueado no navegador', async () => {
    h.state = 'blocked'
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('Os lembretes estão bloqueados neste navegador. Para receber, libere as notificações da Íris nas configurações do navegador.')
    expect(screen.queryByRole('button')).toBeNull()
  })
  test('iPhone fora da tela de início', async () => {
    h.state = 'needs-install'
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('No iPhone, os lembretes funcionam depois de adicionar a Íris à tela de início.')
    expect(screen.getByRole('link', { name: 'Adicionar à tela de início' }).getAttribute('href')).toBe('/configuracoes/instalar')
  })
  test.each(['unsupported'])('sem suporte (%s) ou sem chave configurada', async (state) => {
    h.state = state
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('Este navegador não recebe lembretes.')
    cleanup()
    h.state = 'off'
    render(<PushDevice vapidPublicKey={null} />)
    await screen.findByText('Este navegador não recebe lembretes.')
  })
  test('não conseguiu ativar: mensagem calma, botão continua', async () => {
    h.enable.mockResolvedValue('failed')
    render(<PushDevice vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar lembretes' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não conseguimos ativar os lembretes agora. Tente de novo em instantes.'))
    expect(screen.getByRole('button', { name: 'Ativar lembretes' })).toBeTruthy()
  })
})
```

`src/ui/switch-row.test.tsx` e `src/features/notificacoes/reminders-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SwitchRow } from './switch-row'

afterEach(() => cleanup())

test('SwitchRow: papel de chave, estado, alvo de toque e o próximo valor no formulário', () => {
  const { container } = render(<SwitchRow label="Resumo do mês" caption="Todo dia 1" checked action={async () => {}} fields={{ kind: 'summary' }} />)
  const sw = screen.getByRole('switch', { name: 'Resumo do mês' })
  expect(sw.getAttribute('aria-checked')).toBe('true')
  expect(sw.getAttribute('type')).toBe('submit')
  expect(sw.className).toContain('min-h-11')
  expect(container.querySelector('input[name="kind"]')?.getAttribute('value')).toBe('summary')
  expect(container.querySelector('input[name="enabled"]')?.getAttribute('value')).toBe('false') // tocar desliga
  expect(container.textContent).toContain('Todo dia 1')
  cleanup()
  const off = render(<SwitchRow label="Lembrete para anotar" checked={false} action={async () => {}} fields={{ kind: 'daily' }} />)
  expect(screen.getByRole('switch', { name: 'Lembrete para anotar' }).getAttribute('aria-checked')).toBe('false')
  expect(off.container.querySelector('input[name="enabled"]')?.getAttribute('value')).toBe('true')
})
```

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PREF_DEFAULTS } from '@/domain/notifications'

vi.mock('./actions', () => ({ setNotificationPref: async () => {} }))
vi.mock('./push-device', () => ({ PushDevice: () => <p>aparelho</p> }))
const { RemindersSection } = await import('./reminders-section')

afterEach(() => cleanup())
const names = () => screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label') ?? s.textContent)

describe('RemindersSection', () => {
  test('uma chave por tipo, na ordem do protótipo, com o padrão (RF-47, RF-50)', () => {
    render(<RemindersSection prefs={PREF_DEFAULTS} hasFamily={false} vapidPublicKey={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Lembretes' })).toBeTruthy()
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'true', 'true', 'true', 'false'])
    for (const label of ['Contas perto do vencimento', 'Entradas a receber', 'Planejado quase no limite', 'Meta perto de ser concluída', 'Resumo do mês', 'Depois de alguns dias sem registro', 'Lembrete para anotar']) {
      expect(screen.getByRole('switch', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('switch', { name: 'Avisos da família' })).toBeNull()
    expect(screen.getByText('Todo dia às 21h')).toBeTruthy()
    expect(screen.getByText('aparelho')).toBeTruthy()
    expect(names().length).toBe(7)
  })
  test('"Avisos da família" só para quem tem família', () => {
    render(<RemindersSection prefs={{ ...PREF_DEFAULTS, family: false }} hasFamily vapidPublicKey={null} />)
    expect(screen.getByRole('switch', { name: 'Avisos da família' }).getAttribute('aria-checked')).toBe('false')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/notificacoes src/ui/switch-row.test.tsx`
Expected: FAIL nos arquivos novos.

- [ ] **Step 3: Implementar**

- `env.ts`: acrescentar `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ao esquema como `z.string().regex(/^[A-Za-z0-9_-]{80,100}$/).optional().catch(undefined)` e `vapidPublicKey: parsed.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null`.
- `schemas.ts`: `pushSubscriptionSchema` (Zod) com `endpoint` refinado por `isAllowedPushEndpoint`, `keys.p256dh` `^[A-Za-z0-9_-]{80,100}$`, `keys.auth` `^[A-Za-z0-9_-]{16,32}$`; campos extras ignorados.
- `actions.ts`: toda função começa com `await requireUser()`. `setNotificationPref`: `kind` por `isPrefKind`, `enabled` só `'true'`/`'false'`; `upsert({ user_id: user.id, kind, enabled }, { onConflict: 'user_id,kind' })`; sucesso → `setFlash('Alterações salvas.')`, `revalidatePath('/configuracoes')`, `redirect('/configuracoes')`; erro → `redirect('/configuracoes?erro=1')`; entrada inválida → `redirect('/configuracoes')`. As três de inscrição nunca lançam nem redirecionam (são chamadas pelo navegador, não por formulário); `endpoint` de `sync`/`remove` precisa ser texto de até 2048 caracteres.
- `push-client.ts`: `deviceState()` na ordem dos testes — sem `serviceWorker`/`PushManager`/`Notification`: `isIOS() && !isStandalone()` → `'needs-install'`, senão `'unsupported'`; `Notification.permission === 'denied'` → `'blocked'`; `getSubscription()` vazio → `'off'`; `syncPushSubscription(endpoint)`: `mine` → `'on'`, senão `unsubscribe()` e `'off'`. `enablePush` chama `Notification.requestPermission()` (só existe por toque), `subscribe({ userVisibleOnly: true, applicationServerKey })` (conversão base64url → `Uint8Array` do guia `progressive-web-apps.md`) e `savePushSubscription(sub.toJSON())`. Nenhuma função lança.
- `push-device.tsx` (`'use client'`): estado inicial "carregando" (nada visível além do título da linha "Lembretes neste aparelho"), depois os textos e botões dos testes; `role="status"` para "Lembretes ativados." e `role="alert"` para a falha.
- `push-sync.tsx` (`'use client'`, não renderiza): num `useEffect`, chama `deviceState()` uma vez (é ela que cancela a inscrição de outra pessoa). Entra em `src/app/(app)/layout.tsx` ao lado de `<Toast />`.
- `switch-row.tsx`: `<form action={action}>` com os `fields` e `enabled` = o contrário de `checked` em `input type="hidden"`; o botão ocupa a linha inteira (`min-h-11`), com o rótulo, a legenda e um trilho visual (`aria-hidden`): verde (`bg-brand`) com o botão à direita quando ligado, cinza (`bg-sunken`) com o botão à esquerda quando desligado. O estado não depende da cor: é dito por `aria-checked` e pela posição do botão.
- `reminders-section.tsx`: `ListSection title="Lembretes"`; uma `SwitchRow` por `PREF_ORDER` (pulando `family` sem família), `fields={{ kind }}`, `action={setNotificationPref}`, legenda "Todo dia às 21h" em `daily`; depois uma linha "Lembretes neste aparelho" com `<PushDevice />`.
- `bills-reminder-card.tsx` (`'use client'`): mostra o cartão só quando `deviceState()` é `'off'` e `localStorage['iris:lembretes:depois']` não existe: "Quer um lembrete antes de cada conta vencer?" com "Ativar lembretes" (chama `enablePush`; depois mostra "Lembretes ativados.") e "Agora não" (grava a marca e some). Em `contas/page.tsx`, renderizado só se `env.vapidPublicKey` existe e a pessoa tem alguma conta (`v.bills.length > 0 || v.recurringBills.length > 0`), logo abaixo do resumo.
- `configuracoes/page.tsx`: depois de "Seu dinheiro", `<RemindersSection prefs={await loadNotificationPrefs()} hasFamily={(await loadFamilySummaryOrNull()) !== null} vapidPublicKey={env.vapidPublicKey} />` e a seção "App" (Task 10); com `?erro=1`, o `FormAlert` de erro inesperado no topo. Atualizar o comentário do arquivo.
- `sign-out-button.tsx`: `action={async () => { await disablePush().catch(() => {}); await signOut() }}` — quem sai deixa de receber lembretes neste aparelho.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/notificacoes src/ui src/features/shell && npx tsc --noEmit && npm run lint`
Expected: PASS (inclusive `admin-import.test.ts`: nenhum componente de navegador importa módulo só do servidor).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/features/notificacoes src/ui/switch-row.tsx src/ui/switch-row.test.tsx "src/app/(app)/configuracoes/page.tsx" "src/app/(app)/layout.tsx" "src/app/(app)/contas/page.tsx" src/features/shell/sign-out-button.tsx
git commit -m "feat(notificacoes): lembretes em Configurações e ativar neste aparelho" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Instalar a Íris — onboarding e Configurações

**Files:**
- Create: `src/features/pwa/install-card.tsx`, `install-card.test.tsx`
- Create: `src/app/(onboarding)/boas-vindas/instalar/page.tsx`, `src/app/(app)/configuracoes/instalar/page.tsx`
- Modify: `src/features/perfil/actions.ts` (linhas 23 e 31) e `src/features/perfil/actions.test.ts`
- Modify: `tests/e2e/plano2.spec.ts` (os dois testes de onboarding ganham o passo novo)
- Modify: `src/app/(app)/configuracoes/page.tsx` (seção "App")

**Interfaces:**
- Consumes: `takeInstallPrompt`, `onInstallable`, `InstallPromptEvent` (Task 8); `isStandalone`, `isIOS` (Task 9); `Button` (`@/ui/button`).
- Produces: `InstallCard({ nextHref, skipWhenInstalled }: { nextHref: string; skipWhenInstalled?: boolean })` (cliente); `peekInstallPrompt(): boolean` (`@/features/pwa/install-prompt`).

Fluxo: `/boas-vindas/saldo` (salvar ou pular) → **`/boas-vindas/instalar`** → `/boas-vindas/primeiro-gasto` (etapa-3 §6: "3 telas, saldo inicial, instalar, primeiro gasto"). O onboarding já conta como concluído no saldo (decisão 14); a tela de instalar nunca prende ninguém.

- [ ] **Step 1: Escrever os testes que falham**

`src/features/pwa/install-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  standalone: false,
  ios: false,
  event: null as null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> },
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: h.replace }) }))
vi.mock('@/features/notificacoes/push-client', () => ({ isStandalone: () => h.standalone, isIOS: () => h.ios }))
vi.mock('./install-prompt', () => ({
  takeInstallPrompt: () => { const e = h.event; h.event = null; return e },
  peekInstallPrompt: () => h.event !== null,
  onInstallable: () => () => {},
}))

const { InstallCard } = await import('./install-card')
const TEXT = 'Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.'

beforeEach(() => { h.standalone = false; h.ios = false; h.event = null; h.push.mockClear(); h.replace.mockClear() })
afterEach(() => cleanup())

describe('InstallCard (RF-07)', () => {
  test('título e frase aprovados; "Agora não" leva adiante; nunca "baixe"', () => {
    const { container } = render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeTruthy()
    expect(screen.getByText(TEXT)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Agora não' }).getAttribute('href')).toBe('/boas-vindas/primeiro-gasto')
    expect(container.textContent?.toLowerCase()).not.toMatch(/baix|loja|store/)
    expect(container.textContent).not.toContain('!')
  })
  test('navegador que oferece a instalação: o botão abre o convite do navegador e, aceito, segue', async () => {
    const prompt = vi.fn(async () => {})
    h.event = { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }
    render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à tela de início' }))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/boas-vindas/primeiro-gasto'))
    expect(prompt).toHaveBeenCalled()
  })
  test('convite recusado: fica na tela, sem insistir', async () => {
    h.event = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
    render(<InstallCard nextHref="/x" />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à tela de início' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull())
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Agora não' })).toBeTruthy()
  })
  test('iPhone: a instrução do protótipo, sem botão que não funciona', () => {
    h.ios = true
    render(<InstallCard nextHref="/x" />)
    expect(screen.getByText('No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull()
  })
  test('outros navegadores: instrução pelo menu', () => {
    render(<InstallCard nextHref="/x" />)
    expect(screen.getByText('No menu do navegador, escolha "Instalar" ou "Adicionar à tela de início".')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Adicionar à tela de início' })).toBeNull()
  })
  test('já instalada: no onboarding pula a tela; em Configurações diz que já está', async () => {
    h.standalone = true
    render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" skipWhenInstalled />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/boas-vindas/primeiro-gasto'))
    cleanup()
    render(<InstallCard nextHref="/configuracoes" />)
    expect(screen.getByText('A Íris já está na sua tela de início.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/configuracoes')
    expect(screen.queryByRole('link', { name: 'Agora não' })).toBeNull()
  })
})
```

Em `src/features/perfil/actions.test.ts`, trocar o destino esperado depois de salvar ou pular o saldo inicial no onboarding, de `/boas-vindas/primeiro-gasto` para `/boas-vindas/instalar` (só nos dois testes de `completeOnboardingBalance` e `skipOnboardingBalance`; os demais não mudam).

Em `tests/e2e/plano2.spec.ts`, o caminho do onboarding ganhou uma tela. Nos testes `onboarding: quem parou no meio volta a ele…` (depois de `Salvar e continuar`) e `onboarding pulável…` (depois do segundo `Pular`), acrescentar **antes** da afirmação do título "Que tal anotar seu primeiro gasto?" (nenhuma afirmação existente é removida):

```ts
await expect(page.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeVisible()
await page.getByRole('link', { name: 'Agora não', exact: true }).click()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/pwa/install-card.test.tsx src/features/perfil/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `install-prompt.ts`: acrescentar `peekInstallPrompt(): boolean` (há convite guardado?).
- `install-card.tsx` (`'use client'`): estado calculado depois de montar (`useEffect`), para não divergir do servidor: `'installed'` se `isStandalone()`; `'ready'` se `peekInstallPrompt()` (e reavalia em `onInstallable`); `'ios'` se `isIOS()`; senão `'manual'`. Layout do protótipo `Instalar` (ícone do logo num círculo `bg-brand-wash`, título 28 px, texto 17 px, botão de 52 px, "Agora não" como `Button variant="ghost"` com `href`). No toque: `const e = takeInstallPrompt(); await e.prompt(); const { outcome } = await e.userChoice` — `accepted` → `router.push(nextHref)`; senão o estado vira `'manual'`. Em `'installed'`: com `skipWhenInstalled`, `router.replace(nextHref)` e nada na tela; sem ele, o título, "A Íris já está na sua tela de início." e o link "Voltar" para `nextHref` (sem "Agora não").
- `/boas-vindas/instalar/page.tsx`: `<InstallCard nextHref="/boas-vindas/primeiro-gasto" skipWhenInstalled />` dentro do layout do onboarding (mesma moldura de `primeiro-gasto/page.tsx`).
- `/configuracoes/instalar/page.tsx`: `<InstallCard nextHref="/configuracoes" />` dentro de `<main className="mx-auto flex max-w-[480px] flex-col px-4 pt-4 md:px-9 md:pt-7">`. O título da página é o `h1` do próprio cartão (sem `PageHeader`, para não haver dois títulos); "Agora não" e "Voltar" levam a Configurações.
- `perfil/actions.ts`: os dois `redirect('/boas-vindas/primeiro-gasto')` do onboarding viram `redirect('/boas-vindas/instalar')`.
- `configuracoes/page.tsx`: seção `ListSection title="App"` com `RowLink href="/configuracoes/instalar" title="Adicionar à tela de início"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/pwa src/features/perfil && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/pwa src/features/perfil "src/app/(onboarding)/boas-vindas/instalar" "src/app/(app)/configuracoes" tests/e2e/plano2.spec.ts
git commit -m "feat(pwa): convite para instalar no onboarding e em Configurações" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Avisos depois de um registro e "marcar como paga" pela notificação

**Files:**
- Create: `src/features/notificacoes/alerts.ts`, `alerts.test.ts`
- Create: `src/features/contas/pay-target.ts`, `pay-target.test.ts`
- Create: `src/features/notificacoes/pay-from-notification.tsx`, `pay-from-notification.test.tsx`
- Modify: `src/features/registro/actions.ts`, `src/features/contas/actions.ts`, `src/features/familia/money-actions.ts`, `src/features/metas/movement-actions.ts`, `src/features/metas/family-goal-actions.ts` (e os respectivos `*.test.ts`)
- Modify: `src/app/(app)/contas/page.tsx`, `src/app/(app)/familia/contas/page.tsx`

**Interfaces:**
- Consumes: `queue_own_notification` (Task 2); `loadLedger` (`@/features/registro/queries`), `loadBudgets` (`@/features/planejamento/queries`), `buildPlanejamento` (`@/features/planejamento/view-model`: `lines[].categoryId`, `lines[].state`); `after` (`next/server`); `ConfirmPanel` (`@/ui/confirm`); `markBillPaid` (`@/features/contas/actions`), `payFamilyBill` (`@/features/familia/money-actions`); `contasHref` (`@/features/contas/contas-sections`).
- Produces:
  - `queueBudgetAlerts(): Promise<void>` e `queueGoalAlert(goalId: string): Promise<void>` (`alerts.ts`, `server-only`) — nunca lançam
  - `payTarget(raw: string | string[] | undefined, bills: { id: string; name: string }[]): { id: string; name: string } | null` (`pay-target.ts`)
  - `PayFromNotification({ id, name, back, action }: { id: string; name: string; back: string; action: (fd: FormData) => Promise<void> })` (cliente)

- [ ] **Step 1: Escrever os testes que falham**

`src/features/notificacoes/alerts.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  lines: [] as { categoryId: string; state: 'within' | 'near' | 'over' }[],
  rpc: vi.fn(async (_fn: string, _args: unknown) => ({ data: 1, error: null as unknown })),
  ledgerFails: false,
  build: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: h.rpc }), requireUser: async () => ({ id: 'u1', email: '' }) }))
vi.mock('@/features/registro/queries', () => ({
  loadLedger: async () => {
    if (h.ledgerFails) throw new Error('x')
    return { categories: ['c'], transactions: ['t'] }
  },
}))
vi.mock('@/features/planejamento/queries', () => ({ loadBudgets: async (months: string[]) => months.map((m) => ({ month: m })) }))
vi.mock('@/features/planejamento/view-model', () => ({
  buildPlanejamento: (input: unknown) => {
    h.build(input)
    return { lines: h.lines }
  },
}))

const { queueBudgetAlerts, queueGoalAlert } = await import('./alerts')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
  h.lines = []
  h.ledgerFails = false
  h.rpc.mockClear()
  h.build.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('queueBudgetAlerts', () => {
  test('usa a mesma regra do Planejamento, no mês atual, e avisa só as categorias "perto do limite"', async () => {
    h.lines = [{ categoryId: 'c1', state: 'near' }, { categoryId: 'c2', state: 'within' }, { categoryId: 'c3', state: 'over' }, { categoryId: 'c4', state: 'near' }]
    await queueBudgetAlerts()
    expect(h.build.mock.calls[0][0]).toMatchObject({ month: '2026-09', today: '2026-09-28', categories: ['c'], transactions: ['t'], budgets: [{ month: '2026-09' }] })
    expect(h.rpc.mock.calls).toEqual([
      ['queue_own_notification', { p_kind: 'budget_near', p_id: 'c1' }],
      ['queue_own_notification', { p_kind: 'budget_near', p_id: 'c4' }],
    ])
  })
  test('nada perto do limite: nenhuma chamada', async () => {
    h.lines = [{ categoryId: 'c2', state: 'within' }]
    await queueBudgetAlerts()
    expect(h.rpc).not.toHaveBeenCalled()
  })
  test('qualquer erro é engolido: o aviso nunca atrapalha o registro', async () => {
    h.ledgerFails = true
    await expect(queueBudgetAlerts()).resolves.toBeUndefined()
    h.ledgerFails = false
    h.lines = [{ categoryId: 'c1', state: 'near' }]
    h.rpc.mockRejectedValueOnce(new Error('rede'))
    await expect(queueBudgetAlerts()).resolves.toBeUndefined()
  })
})

describe('queueGoalAlert', () => {
  test('pede ao banco para conferir a meta (é ele que decide se falta pouco)', async () => {
    await queueGoalAlert('g1')
    expect(h.rpc.mock.calls).toEqual([['queue_own_notification', { p_kind: 'goal_near', p_id: 'g1' }]])
  })
  test('erro engolido', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(queueGoalAlert('g1')).resolves.toBeUndefined()
  })
})
```

`src/features/contas/pay-target.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { payTarget } from './pay-target'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const bills = [{ id: ID, name: 'Luz' }, { id: '11111111-1111-4111-8111-111111111111', name: 'Água' }]

describe('payTarget: só uma conta a pagar que a própria tela já mostra', () => {
  test('acha a conta', () => expect(payTarget(ID, bills)).toEqual({ id: ID, name: 'Luz' }))
  test.each([undefined, '', 'abc', [ID, ID], '22222222-2222-4222-8222-222222222222', `${ID}\n`, ID.toUpperCase() + 'x'])('sem alvo para %j', (raw) => {
    expect(payTarget(raw as string | string[] | undefined, bills)).toBeNull()
  })
  test('conta já paga (não está na lista): nada', () => expect(payTarget(ID, [])).toBeNull())
})
```

`src/features/notificacoes/pay-from-notification.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace }) }))
const { PayFromNotification } = await import('./pay-from-notification')

afterEach(() => cleanup())

test('abre a confirmação da copy; nada é pago sem confirmar; "Agora não" volta para a lista', () => {
  render(<PayFromNotification id="b1" name="Luz" back="/contas?mes=2026-10" action={async () => {}} />)
  const dialog = screen.getByRole('alertdialog')
  expect(dialog.textContent).toContain('Marcar Luz como paga?')
  expect(screen.getByRole('button', { name: 'Marcar como paga' }).getAttribute('type')).toBe('submit')
  expect(document.querySelector('input[name="id"]')?.getAttribute('value')).toBe('b1')
  expect(document.querySelector('input[name="volta"]')?.getAttribute('value')).toBe('/contas?mes=2026-10')
  fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
  expect(h.replace).toHaveBeenCalledWith('/contas?mes=2026-10')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
```

Nos testes de ações existentes, acrescentar o mock `vi.mock('next/server', () => ({ after: (fn: () => unknown) => { h.after.push(fn) } }))` (com `after: [] as (() => unknown)[]` no `vi.hoisted`) e `vi.mock('@/features/notificacoes/alerts', () => ({ queueBudgetAlerts: h.budgetAlerts, queueGoalAlert: h.goalAlert }))`, e um teste por ação:

```ts
// registro/actions.test.ts — repetir para updateTransaction (gasto)
test('depois de salvar um gasto, confere os avisos do planejado fora do caminho da resposta', async () => {
  await submitExpense() // o ajudante que o arquivo já usa para um gasto simples válido
  expect(h.after.length).toBe(1)
  expect(h.budgetAlerts).not.toHaveBeenCalled()
  await h.after[0]()
  expect(h.budgetAlerts).toHaveBeenCalledTimes(1)
})
test('entrada não confere avisos do planejado; erro de validação também não', async () => {
  await submitIncome()
  await submitInvalidExpense()
  expect(h.after).toEqual([])
})
// contas/actions.test.ts (markBillPaid) e familia/money-actions.test.ts (payFamilyBill): mesmo par de afirmações depois de pagar com sucesso; nenhuma chamada quando a conta não foi encontrada.
// metas/movement-actions.test.ts (depositToGoal) e metas/family-goal-actions.test.ts (depositToFamilyGoal):
test('depois de guardar, pede ao banco para conferir se falta pouco para a meta', async () => {
  await deposit() // ajudante já usado no arquivo
  await h.after[0]()
  expect(h.goalAlert).toHaveBeenCalledWith(UUID)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/notificacoes src/features/contas src/features/registro src/features/metas src/features/familia`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

- `alerts.ts`: `queueBudgetAlerts` = `try { const today = todayInSaoPaulo(); const month = monthOf(today); const [{ categories, transactions }, budgets] = await Promise.all([loadLedger(), loadBudgets([month])]); const v = buildPlanejamento({ month, today, categories, transactions, budgets }); for (const line of v.lines) if (line.state === 'near') await supabase.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: line.categoryId }) } catch (e) { console.error('queueBudgetAlerts', code(e)) }` — `code(e)` devolve só o código do erro, nunca a mensagem. `queueGoalAlert` igual, com uma chamada.
- Ações: logo antes do `redirect()` de sucesso (fora de `try`), `after(() => queueBudgetAlerts())` em `createTransaction` e `updateTransaction` (só gasto), `markBillPaid` e `payFamilyBill`; `after(() => queueGoalAlert(id))` em `depositToGoal` e `depositToFamilyGoal`. `after` vem de `next/server` e roda depois da resposta (guia `after.md`): a pessoa não espera pelo aviso.
- `pay-target.ts`: `raw` precisa ser um texto que casa com `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`; devolve o item de `bills` com esse `id`, ou `null`.
- `pay-from-notification.tsx` (`'use client'`): começa aberto; `<ConfirmPanel title={\`Marcar ${name} como paga?\`} cancelLabel="Agora não" onCancel={() => { setOpen(false); router.replace(back) }}>` com `<form action={action}>`, os campos ocultos `id` e `volta` e o botão `Marcar como paga` (desativado enquanto envia, como em `ConfirmAction`).
- `contas/page.tsx`: `searchParams` ganha `pagar`; `const target = payTarget(pagar, contasAPagar)`, onde `contasAPagar` são as contas ainda a pagar que a própria tela lista naquele mês (as mesmas que ganham o botão de pagar em `BillsList`); com alvo, `<PayFromNotification id={target.id} name={target.name} back={back} action={markBillPaid} />`. Sem alvo (conta já paga, de outra pessoa ou id estranho) a tela abre normal, sem aviso de erro.
- `familia/contas/page.tsx`: o mesmo com as contas a pagar de `view`, `action={payFamilyBill}` e `back="/familia/contas"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (todos os testes unitários, inclusive os dos Planos 1–7).

- [ ] **Step 5: Commit**

```bash
git add src/features "src/app/(app)/contas/page.tsx" "src/app/(app)/familia/contas/page.tsx"
git commit -m "feat(notificacoes): avisos depois do registro e marcar como paga pela notificação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Convite da família por e-mail e "Reenviar"

**Files:**
- Modify: `src/features/familia/schemas.ts`, `invite-state.ts`, `actions.ts`, `actions.test.ts`, `queries.ts`, `types.ts`, `view-model.ts`, `view-model.test.ts`, `invite-panel.tsx`, `invite-panel.test.tsx`, `familia-page.tsx`, `familia-page.test.tsx`
- Create: `src/features/familia/resend-invite.tsx`

**Interfaces:**
- Consumes: `create_family_email_invite`, `family_invites.invited_email` (Task 4); `getMailer`, `Mailer` (Task 6); `inviteEmail` (Task 6); `inviteLink`, `INVITE_CODE` (`./schemas`); `myFamilyId` (`./queries`); `env.siteUrl`.
- Produces:
  - `inviteEmailSchema` (`schemas.ts`): texto → e-mail em minúsculas, sem espaços nas pontas, de 6 a 254 caracteres; erro: "Confira o e-mail. Parece que falta alguma coisa." (copy)
  - `InviteState` ganha `| { status: 'sent'; email: string; expiresOn: ISODate }` e, em `ready`, `notice?: string`
  - `inviteByEmail(_: InviteState, fd: FormData): Promise<InviteState>` e `resendInvite(_: InviteState, fd: FormData): Promise<InviteState>` (`actions.ts`)
  - `FamiliaPageView.invite` passa a ser `{ id: string; caption: string; email: string | null } | null`
  - `ResendInvite({ id }: { id: string })` (cliente)

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/features/familia/actions.test.ts` (o arquivo já tem o Supabase simulado com `rpcData`, `rpcError`, `queue`, `calls`, `rpcCalls`; acrescentar aos mocks do topo `vi.mock('@/features/notificacoes/mailer', () => ({ getMailer: () => h.mailer }))` com `mailer: null as null | { send: (m: unknown) => Promise<void> }` no `vi.hoisted`):

```ts
const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const EXPIRES = '2026-10-05T15:00:00Z'
const emailForm = (email: string) => {
  const f = new FormData()
  f.set('email', email)
  return f
}
const sentMail = () => (h.mailer!.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as { to: string; subject: string; text: string; html: string })

describe('inviteByEmail', () => {
  beforeEach(() => {
    h.mailer = { send: vi.fn(async () => {}) }
    rpcData('create_family_email_invite', [{ invite_code: CODE, invite_expires_at: EXPIRES }])
    queue({ family_members: [{ family_id: 'f1', role: 'admin' }], families: [{ id: 'f1', name: 'Família Souza' }], profiles: [{ display_name: 'Camila' }] })
  })

  test('cria o convite pelo banco e envia o link por e-mail; o código não vai para aviso nem log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = await actions.inviteByEmail(idle, emailForm('  Jordan@Email.com '))
    expect(rpcCalls).toContainEqual({ fn: 'create_family_email_invite', args: { p_email: 'jordan@email.com' } })
    const [mail] = sentMail()
    expect(mail.to).toBe('jordan@email.com')
    expect(mail.subject).toBe('Camila convidou você para a família Família Souza na Íris')
    expect(mail.text).toContain(`https://iris.app/convite/${CODE}`)
    expect(state).toEqual({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
    expect(JSON.stringify(h.setFlash.mock.calls)).not.toContain(CODE)
    expect(JSON.stringify(log.mock.calls)).not.toContain(CODE)
    expect(h.revalidatePath).toHaveBeenCalledWith('/familia')
  })

  test.each(['', 'sem-arroba', 'a@b', 'a b@c.dev'])('e-mail que não serve (%j): mensagem da copy, nada é criado nem enviado', async (email) => {
    const state = await actions.inviteByEmail(idle, emailForm(email))
    expect(state).toEqual({ status: 'error', message: 'Confira o e-mail. Parece que falta alguma coisa.' })
    expect(rpcCalls).toEqual([])
    expect(sentMail()).toEqual([])
  })

  test('limite de convites: mensagem calma, sem enviar', async () => {
    rpcError('create_family_email_invite', 'Limite de convites.')
    const state = await actions.inviteByEmail(idle, emailForm('jordan@email.com'))
    expect(state).toEqual({ status: 'error', message: 'Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link.' })
    expect(sentMail()).toEqual([])
  })

  test('família completa e quem não administra', async () => {
    rpcError('create_family_email_invite', 'A família já está completa.')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: 'A família já está completa.' })
    rpcError('create_family_email_invite', 'Só quem administra a família pode fazer isso.', '42501')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: 'Só quem administra a família pode fazer isso.' })
  })

  test('e-mail desligado ou com falha: o convite existe, e a pessoa recebe o link para enviar por conta própria', async () => {
    const notice = 'Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.'
    h.mailer = null
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com')))
      .toEqual({ status: 'ready', link: `https://iris.app/convite/${CODE}`, expiresOn: '2026-10-05', notice })
    h.mailer = { send: vi.fn(async () => { throw new Error('smtp') }) }
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com')))
      .toEqual({ status: 'ready', link: `https://iris.app/convite/${CODE}`, expiresOn: '2026-10-05', notice })
  })
})

describe('resendInvite', () => {
  beforeEach(() => {
    h.mailer = { send: vi.fn(async () => {}) }
    rpcData('create_family_email_invite', [{ invite_code: CODE, invite_expires_at: EXPIRES }])
  })
  const idForm = (id: string) => {
    const f = new FormData()
    f.set('id', id)
    return f
  }

  test('lê o e-mail do convite pendente (só o administrador enxerga) e envia um convite novo', async () => {
    queue({ family_invites: [{ invited_email: 'jordan@email.com' }], family_members: [{ family_id: 'f1', role: 'admin' }], families: [{ id: 'f1', name: 'Família Souza' }], profiles: [{ display_name: 'Camila' }] })
    const state = await actions.resendInvite(idle, idForm(UUID))
    const read = calls.find((c) => c.table === 'family_invites')!
    expect(read.filters).toMatchObject({ 'eq:id': UUID, 'is:accepted_at': null, 'is:revoked_at': null })
    expect(rpcCalls).toContainEqual({ fn: 'create_family_email_invite', args: { p_email: 'jordan@email.com' } })
    expect(state).toEqual({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
  })
  test('convite que não existe mais, sem e-mail, ou id estranho: nada é enviado', async () => {
    queue({ family_invites: [] })
    expect(await actions.resendInvite(idle, idForm(UUID))).toEqual({ status: 'error', message: SAVE_FAILED })
    queue({ family_invites: [{ invited_email: null }] })
    expect(await actions.resendInvite(idle, idForm(UUID))).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(await actions.resendInvite(idle, idForm('abc'))).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(rpcCalls).toEqual([])
  })
})
```

Acrescentar a `invite-panel.test.tsx` (seguindo o padrão do arquivo para `useActionState`):

```tsx
test('convite por e-mail: campo com rótulo, botão com verbo e objeto', () => {
  render(<InvitePanel />)
  const field = screen.getByLabelText('E-mail de quem vai participar')
  expect(field.getAttribute('type')).toBe('email')
  expect(field.getAttribute('name')).toBe('email')
  expect(field.getAttribute('autocomplete')).toBe('off')
  expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Convidar pessoa' })).toBeTruthy() // o link continua existindo
})
test('enviado: confirma para quem e até quando', async () => {
  mockAction({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' }) // ajudante do arquivo que fixa o estado devolvido
  render(<InvitePanel />)
  expect((await screen.findByRole('status')).textContent).toBe('Convite enviado para jordan@email.com. Vale até 5 de outubro.')
})
test('e-mail não saiu: o aviso e o link para copiar', async () => {
  mockAction({ status: 'ready', link: 'https://iris.app/convite/x', expiresOn: '2026-10-05', notice: 'Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.' })
  render(<InvitePanel />)
  expect((await screen.findByRole('alert')).textContent).toBe('Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.')
  expect(screen.getByLabelText('Link do convite')).toBeTruthy()
})
```

Acrescentar a `view-model.test.ts` e `familia-page.test.tsx`:

```ts
test('convite pendente enviado por e-mail mostra o e-mail e "Convite enviado · aguardando"', () => {
  const view = buildFamiliaPage({ ...baseInput, family: { ...baseFamily, role: 'admin', invites: [{ id: 'i1', expiresAt: '2026-10-05T15:00:00Z', invitedEmail: 'jordan@email.com' }] } })
  expect(view.kind === 'member' && view.invite).toEqual({ id: 'i1', caption: 'Convite enviado · aguardando', email: 'jordan@email.com' })
})
test('convite por link continua como antes, sem e-mail', () => {
  const view = buildFamiliaPage({ ...baseInput, family: { ...baseFamily, role: 'admin', invites: [{ id: 'i1', expiresAt: '2026-10-05T15:00:00Z', invitedEmail: null }] } })
  expect(view.kind === 'member' && view.invite).toMatchObject({ id: 'i1', email: null })
  expect(view.kind === 'member' && view.invite?.caption).toContain('Convite pendente')
})
```

```tsx
test('administrador vê o e-mail convidado, "Reenviar" e "Cancelar convite"; membro não vê nada disso', () => {
  render(<FamiliaPage view={{ ...adminView, invite: { id: 'i1', caption: 'Convite enviado · aguardando', email: 'jordan@email.com' } }} />)
  expect(screen.getByText('jordan@email.com')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reenviar' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeTruthy()
  cleanup()
  render(<FamiliaPage view={{ ...memberView, invite: null }} />)
  expect(screen.queryByText('jordan@email.com')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull()
})
```

(`baseInput`, `baseFamily`, `adminView`, `memberView`: os objetos que esses arquivos de teste já montam; reaproveitar.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

- `schemas.ts`: `inviteEmailSchema = z.string().trim().toLowerCase().pipe(z.email().min(6).max(254))` com a mensagem da copy.
- `queries.ts`/`types.ts`: a leitura dos convites pendentes passa a pedir `invited_email` (a política do banco já limita ao administrador) e o tipo ganha `invitedEmail: string | null`.
- `actions.ts`: uma função interna `sendEmailInvite(supabase, userId, email): Promise<InviteState>` usada pelas duas ações:
  1. `rpc('create_family_email_invite', { p_email: email })`; erros: `Limite de convites.` → "Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link."; `completa` → `FULL`; código `42501` → "Só quem administra a família pode fazer isso."; impasse → `UNEXPECTED`; resto → `SAVE_FAILED`.
  2. Validar a resposta como em `createInvite` (`INVITE_CODE`, data).
  3. Ler o nome da família (`myFamilyId(supabase, userId)` e depois `from('families').select('name').eq('id', familyId).maybeSingle()`) e o nome de quem convida (`from('profiles').select('display_name').eq('id', userId).maybeSingle()`); sem nome de quem convida → `inviterName: null`; sem nome da família → `SAVE_FAILED`.
  4. `const mailer = getMailer()`; sem `mailer`, ou se `mailer.send(...)` lançar (dentro de `try`): `{ status: 'ready', link, expiresOn, notice }`. Com sucesso: `{ status: 'sent', email, expiresOn }`.
  5. `revalidatePath('/familia')` nos dois casos. Nunca `console.*` com o e-mail ou o código.
  `inviteByEmail`: `requireUser()`, `inviteEmailSchema`, `sendEmailInvite`. `resendInvite`: `requireUser()`, id uuid, `from('family_invites').select('invited_email').eq('id', id).is('accepted_at', null).is('revoked_at', null).maybeSingle()`; sem e-mail → `SAVE_FAILED`; senão `sendEmailInvite`.
- `view-model.ts`: `invite` com `email`; legenda "Convite enviado · aguardando" quando há e-mail, a atual quando não há.
- `invite-panel.tsx`: abaixo do botão "Convidar pessoa", um segundo formulário (`useActionState(inviteByEmail, INVITE_IDLE)`) com o rótulo "E-mail de quem vai participar", `input type="email" name="email" autoComplete="off"` e o botão "Enviar convite"; `sent` → `<p role="status">`; `ready` com `notice` → `<FormAlert>` (papel `alert`) e o mesmo bloco de link do convite por link.
- `resend-invite.tsx` (`'use client'`): formulário com `useActionState(resendInvite, INVITE_IDLE)`, campo oculto `id`, botão "Reenviar" (desativado enquanto envia); `sent` → `<p role="status">Convite reenviado.</p>`; erro → `FormAlert`.
- `familia-page.tsx`: no bloco do convite pendente, quando `view.invite.email` existe, mostrar o e-mail (15 px, `text-ink`), a legenda e `<ResendInvite id={view.invite.id} />` ao lado de "Cancelar convite".

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/familia
git commit -m "feat(familia): convite por e-mail e reenviar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ponta a ponta, verificação completa, variáveis e registro

**Files:**
- Create: `tests/e2e/plano8.spec.ts`
- Modify: `.env.example`, `README.md`, `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–12.

- [ ] **Step 1: Escrever o teste de ponta a ponta**

`tests/e2e/plano8.spec.ts`:

```ts
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { monthOf, todayInSaoPaulo } from '../../src/domain/dates'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
// Prefixo único por worker e por execução: a limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p8-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const OFFLINE = 'Sem conexão no momento. Assim que voltar, a gente tenta de novo.'
const INSTALL = 'Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.'
const P256DH = `B${'A'.repeat(86)}`
const AUTH = 'A'.repeat(22)
const JOB = '/api/jobs/notificacoes'

async function makeUser(name: string, opts: { onboarded?: boolean } = {}): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  if (opts.onboarded !== false) {
    const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
    if (e2) throw e2
  }
  return { id: data.user.id, email }
}

async function category(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

async function seedExpense(userId: string, key: string, cents: number, note: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, note,
  })
  if (error) throw error
}

// Conta que vence hoje: o molde começa no dia 1 e a tarefa do banco cria a ocorrência; devolve o id da conta a pagar.
async function seedBillDueToday(userId: string, name: string): Promise<string> {
  const rec = await admin.from('recurrences').insert({
    user_id: userId, kind: 'expense', name, amount_cents: 18000, category_id: await category(userId, 'casa'),
    frequency: 'monthly', due_day: Number(today.slice(8)), starts_on: `${current}-01`,
  }).select('id').single()
  if (rec.error) throw rec.error
  const gen = await admin.rpc('generate_occurrences_for', { p_user: userId })
  if (gen.error) throw gen.error
  const tx = await admin.from('transactions').select('id').eq('recurrence_id', rec.data.id).eq('status', 'pending').single()
  if (tx.error) throw tx.error
  return tx.data.id as string
}

async function seedFamily(adminId: string, name: string): Promise<void> {
  const { data: fam, error } = await admin.from('families').insert({ name, created_by: adminId }).select('id').single()
  if (error) throw error
  const { data: profile, error: e1 } = await admin.from('profiles').select('display_name').eq('id', adminId).single()
  if (e1) throw e1
  const { error: e2 } = await admin.from('family_members').insert({ family_id: fam.id, user_id: adminId, role: 'admin', display_name: profile.display_name })
  if (e2) throw e2
}

async function entrar(page: Page, email: string, landing: RegExp = /\/inicio/): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(landing)
}

const statusOf = async (id: string) => (await admin.from('transactions').select('status').eq('id', id).single()).data?.status
const subscriptions = async (userId: string) => (await admin.from('push_subscriptions').select('endpoint').eq('user_id', userId)).data

test.afterAll(async () => {
  const remove = async (id: string) => {
    const first = await admin.auth.admin.deleteUser(id)
    if (first.error) {
      const second = await admin.auth.admin.deleteUser(id)
      if (second.error) throw second.error
    }
  }
  for (const id of created) await remove(id)
  const known = new Set(created)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith(RUN_PREFIX) && !known.has(u.id)) await remove(u.id)
    }
    if (data.users.length < 1000) break
    page += 1
  }
})

test('celular: manifest, service worker e página "Sem conexão" são públicos e válidos; nada de "baixe"', async ({ request }, info) => {
  test.skip(info.project.name !== 'celular')
  const manifest = await request.get('/manifest.webmanifest', { maxRedirects: 0 })
  expect(manifest.status()).toBe(200)
  const m = await manifest.json()
  expect(m).toMatchObject({
    name: 'Íris', short_name: 'Íris', start_url: '/inicio', scope: '/', display: 'standalone', theme_color: '#f8f8f8', background_color: '#f8f8f8',
  })
  expect(m.icons.map((i: { purpose: string }) => i.purpose).sort()).toEqual(['any', 'any', 'maskable', 'maskable'])
  for (const icon of m.icons as { src: string }[]) {
    const r = await request.get(icon.src, { maxRedirects: 0 })
    expect(r.status(), icon.src).toBe(200)
    expect(r.headers()['content-type']).toBe('image/png')
  }
  const sw = await request.get('/sw.js', { maxRedirects: 0 })
  expect(sw.status()).toBe(200)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect(sw.headers()['cache-control']).toContain('no-cache')
  const offline = await request.get('/sem-conexao.html', { maxRedirects: 0 })
  expect(offline.status()).toBe(200)
  const offlineText = await offline.text()
  expect(offlineText).toContain(OFFLINE)
  for (const body of [JSON.stringify(m), offlineText, await sw.text()]) expect(body.toLowerCase()).not.toMatch(/baix/)
})

test('celular: sem rede aparece "Sem conexão"; o service worker não guarda nenhuma tela do app', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 14230, 'feira')
  await entrar(page, u.email)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await page.goto('/extrato')
  await expect(page.getByText('feira')).toBeVisible()

  const cached = await page.evaluate(async () => {
    const out: string[] = []
    for (const key of await caches.keys()) {
      for (const req of await (await caches.open(key)).keys()) out.push(new URL(req.url).pathname)
    }
    return out.sort()
  })
  expect(cached).toEqual(['/icons/icon-192.png', '/sem-conexao.html'])

  await context.setOffline(true)
  // Na tela já aberta: o aviso; o que estava na tela continua lá.
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible()
  // Ao navegar sem rede: a página estática, sem nenhum dado.
  await page.goto('/extrato').catch(() => {})
  await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible()
  await expect(page.getByText(OFFLINE)).toBeVisible()
  await expect(page.getByText('feira')).toHaveCount(0)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Tentar de novo', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toHaveCount(0)
})

test('celular: depois do saldo inicial vem "Instalar a Íris"; "Agora não" segue para o primeiro gasto; Configurações tem o mesmo convite', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Eva', { onboarded: false })
  await entrar(page, u.email, /\/boas-vindas$/)
  await page.getByRole('link', { name: 'Pular', exact: true }).click()
  await page.getByRole('button', { name: 'Pular', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeVisible()
  await expect(page.getByText(INSTALL)).toBeVisible()
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(/baix|loja/)
  await page.getByRole('link', { name: 'Agora não', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Adicionar à tela de início', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeVisible()
  await expect(page.getByText(INSTALL)).toBeVisible()
})

test('celular: Lembretes — cada tipo liga e desliga; ativar, desativar e sair gravam e apagam a inscrição deste aparelho', async ({ browser }, info) => {
  test.skip(info.project.name !== 'celular')
  test.skip(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 'defina as chaves VAPID locais em .env.local (README)')
  const u = await makeUser('Camila')
  const endpoint = `https://fcm.googleapis.com/fcm/send/${RUN_PREFIX}aparelho`
  const context = await browser.newContext({ ...(info.project.use as BrowserContextOptions), permissions: ['notifications'] })
  // O navegador de teste não fala com um serviço de push de verdade: só a inscrição do navegador é simulada.
  // A tela, a ação do servidor e o banco são os reais.
  await context.addInitScript(({ endpoint, p256dh, auth }) => {
    const FLAG = 'e2e-push'
    const sub = {
      endpoint, expirationTime: null,
      toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
      unsubscribe: async () => { localStorage.removeItem(FLAG); return true },
    }
    PushManager.prototype.subscribe = async () => { localStorage.setItem(FLAG, '1'); return sub as unknown as PushSubscription }
    PushManager.prototype.getSubscription = async () => (localStorage.getItem(FLAG) ? (sub as unknown as PushSubscription) : null)
  }, { endpoint, p256dh: P256DH, auth: AUTH })
  const page = await context.newPage()
  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await expect(page.getByRole('heading', { level: 2, name: 'Lembretes' })).toBeVisible()

  const daily = () => page.getByRole('switch', { name: 'Lembrete para anotar', exact: true })
  const bills = () => page.getByRole('switch', { name: 'Contas perto do vencimento', exact: true })
  await expect(daily()).toHaveAttribute('aria-checked', 'false')
  await expect(bills()).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Avisos da família', exact: true })).toHaveCount(0)
  await daily().click()
  await expect(daily()).toHaveAttribute('aria-checked', 'true')
  await bills().click()
  await expect(bills()).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await expect(daily()).toHaveAttribute('aria-checked', 'true')
  await expect(bills()).toHaveAttribute('aria-checked', 'false')
  const prefs = await admin.from('notification_prefs').select('kind, enabled').eq('user_id', u.id).order('kind')
  expect(prefs.data).toEqual([{ kind: 'bills', enabled: false }, { kind: 'daily', enabled: true }])

  await page.getByRole('button', { name: 'Ativar lembretes', exact: true }).click()
  await expect(page.getByText('Os lembretes estão ativos neste aparelho.')).toBeVisible()
  await expect.poll(() => subscriptions(u.id)).toEqual([{ endpoint }])
  await page.getByRole('button', { name: 'Desativar neste aparelho', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ativar lembretes', exact: true })).toBeVisible()
  await expect.poll(() => subscriptions(u.id)).toEqual([])

  // Sair da Íris desativa os lembretes neste aparelho (aparelho compartilhado).
  await page.getByRole('button', { name: 'Ativar lembretes', exact: true }).click()
  await expect.poll(() => subscriptions(u.id)).toEqual([{ endpoint }])
  await page.goto('/mais')
  await page.getByRole('button', { name: 'Sair da Íris', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/entrar/)
  await expect.poll(() => subscriptions(u.id)).toEqual([])
  await context.close()
})

test('desktop: o destino do aviso abre Contas na confirmação; nada é pago sem confirmar; a conta de outra pessoa não abre nada', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const mine = await seedBillDueToday(camila.id, 'Luz')
  const theirs = await seedBillDueToday(alex.id, 'Aluguel')
  await entrar(page, camila.email)

  await page.goto(`/contas?mes=${current}&pagar=${theirs}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Contas' })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByText('Aluguel')).toHaveCount(0)

  await page.goto(`/contas?mes=${current}&pagar=${mine}`)
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Marcar Luz como paga?')
  await dialog.getByRole('button', { name: 'Agora não', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await statusOf(mine)).toBe('pending')

  await page.goto(`/contas?mes=${current}&pagar=${mine}`)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Conta marcada como paga.' })).toBeVisible()
  expect(await statusOf(mine)).toBe('confirmed')
  expect(await statusOf(theirs)).toBe('pending')
})

test('desktop: a rota da tarefa não abre sem o segredo, nem com a sessão de quem entrou', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Camila')
  expect((await request.post(JOB, { data: {} })).status()).toBe(404)
  expect((await request.post(JOB, { data: {}, headers: { 'x-iris-job-secret': 'x'.repeat(40) } })).status()).toBe(404)
  expect((await request.get(JOB)).status()).toBe(405)
  await entrar(page, u.email)
  const withSession = await page.request.post(JOB, { data: {} })
  expect(withSession.status()).toBe(404)
  expect(await withSession.text()).toBe('')
  const fromPage = await page.evaluate(async (path) => (await fetch(path, { method: 'POST', body: '{}' })).status, JOB)
  expect(fromPage).toBe(404)
})

test('desktop: com o segredo, a tarefa pega o lote e responde só números', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop')
  test.skip(!process.env.JOB_SECRET, 'defina JOB_SECRET em .env.local (README)')
  const u = await makeUser('Camila')
  await seedBillDueToday(u.id, 'Luz')
  const sub = await admin.from('push_subscriptions').insert({
    user_id: u.id, endpoint: `https://fcm.googleapis.com/fcm/send/${RUN_PREFIX}tarefa`, p256dh: P256DH, auth: AUTH,
  })
  if (sub.error) throw sub.error
  const queued = await admin.rpc('job_enqueue_morning_on', { p_today: today })
  if (queued.error) throw queued.error

  const res = await request.post(JOB, { data: {}, headers: { 'x-iris-job-secret': process.env.JOB_SECRET! } })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Object.keys(body).sort()).toEqual(['claimed', 'failed', 'removed', 'sent'])
  for (const value of Object.values(body)) expect(typeof value).toBe('number')
  expect(body.claimed).toBeGreaterThanOrEqual(1)
  // A linha foi pega pelo lote: enviada, ou guardada para nova tentativa se o serviço de push recusar o endereço de teste.
  const row = await admin.from('notification_log').select('attempts').eq('user_id', u.id).eq('kind', 'bill_today').single()
  expect(row.data?.attempts).toBe(1)
})

test('desktop: convite por e-mail chega à caixa local; o link abre o convite; o administrador vê o e-mail e "Reenviar"', async ({ page, browser, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  test.skip(!process.env.SMTP_HOST, 'defina SMTP_HOST, SMTP_PORT e MAIL_FROM em .env.local (README)')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  await seedFamily(camila.id, 'Família Souza')
  await entrar(page, camila.email)
  await page.getByRole('link', { name: 'Família', exact: true }).click()
  await page.getByLabel('E-mail de quem vai participar').fill(alex.email)
  await page.getByRole('button', { name: 'Enviar convite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Convite enviado para ${alex.email}.` })).toBeVisible()

  // Caixa de e-mail do Supabase local (interface em http://127.0.0.1:54324).
  const MAILBOX = process.env.E2E_MAILBOX_URL ?? 'http://127.0.0.1:54324'
  let text = ''
  await expect.poll(async () => {
    const list = await (await request.get(`${MAILBOX}/api/v1/search`, { params: { query: `to:${alex.email}` } })).json()
    const first = list.messages?.[0]
    if (!first) return ''
    expect(first.Subject).toBe('Camila convidou você para a família Família Souza na Íris')
    text = (await (await request.get(`${MAILBOX}/api/v1/message/${first.ID}`)).json()).Text as string
    return text
  }).toContain('/convite/')
  const link = text.match(/https?:\/\/\S+\/convite\/[A-Za-z0-9_-]{32}/)?.[0]
  expect(link).toBeTruthy()

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await entrar(alexPage, alex.email)
  await alexPage.goto(new URL(link!).pathname)
  await expect(alexPage.getByRole('heading', { level: 1, name: 'Entrar na família Família Souza?' })).toBeVisible()
  await other.close()

  await page.reload()
  await expect(page.getByText(alex.email, { exact: true })).toBeVisible()
  await expect(page.getByText('Convite enviado · aguardando')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reenviar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar convite', exact: true })).toBeVisible()
})
```

- [ ] **Step 2: Atualizar `.env.example`**

Conteúdo completo (nenhum valor de verdade):

```bash
# Local: rode "npx supabase start" e copie os valores de "npx supabase status -o env" (API_URL, PUBLISHABLE_KEY/ANON_KEY, SECRET_KEY/SERVICE_ROLE_KEY)
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Chave de serviço. Só no servidor: rota da tarefa agendada (/api/jobs/notificacoes), testes de banco e E2E.
# Nunca no navegador nem em ação feita por uma pessoa.
SUPABASE_SECRET_KEY=sb_secret_xxx

# --- PWA e notificações (Plano 8). Sem valor = recurso desligado; o app funciona igual. ---

# Push (Web Push). Gere um par gratuito, sem cadastro: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
# Contato do responsável, exigido pelo padrão. Formato: mailto:voce@exemplo.com
VAPID_SUBJECT=

# Segredo da rota da tarefa. 32 caracteres ou mais. Gere com: openssl rand -base64 48
JOB_SECRET=

# E-mail (SMTP). Local: caixa do Supabase (SMTP_HOST=127.0.0.1, SMTP_PORT=54325, sem usuário e senha; veja em http://127.0.0.1:54324).
SMTP_HOST=
SMTP_PORT=
# "true" só para porta 465.
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
# Remetente. Formato: Íris <oi@seu-dominio.com>
MAIL_FROM=
```

- [ ] **Step 3: Atualizar `README.md`**

Em "Rodar localmente", trocar o parágrafo sobre `SUPABASE_SECRET_KEY` por: "`SUPABASE_SECRET_KEY` é usada pelos testes de banco e end-to-end e, no app, **só** pela rota da tarefa agendada (`/api/jobs/notificacoes`), no servidor. Nunca chega ao navegador." Depois da seção "Testes", acrescentar:

````markdown
## PWA e notificações (local)

Tudo funciona sem conta em serviço nenhum. Cada parte liga com variáveis em `.env.local` (lista em `.env.example`); sem elas, a parte fica desligada.

- **Instalar e "Sem conexão":** já funcionam em `npm run dev` (em `localhost` o navegador aceita o service worker sem HTTPS). O service worker não guarda nenhuma tela do app.
- **Push:** `npx web-push generate-vapid-keys` e copie as duas chaves para `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`; defina `VAPID_SUBJECT=mailto:seu-email`. Em Configurações → Lembretes, "Ativar lembretes".
- **E-mail:** `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, `MAIL_FROM=Íris <oi@iris.local>`. Os e-mails (convite da família, resumo do mês, recuperação de senha) aparecem em http://127.0.0.1:54324 e não saem do computador.
- **Tarefas agendadas:** o banco local agenda sozinho (pg_cron): 00h05 cria as contas do mês, 9h e 21h (Brasília) enfileiram os lembretes, e a cada 10 minutos a fila é entregue. Para a entrega, defina `JOB_SECRET` (`openssl rand -base64 48`) e conte ao banco onde fica a rota (uma vez, no SQL Editor em http://127.0.0.1:54323):

  ```sql
  select vault.create_secret('http://host.docker.internal:3000/api/jobs/notificacoes', 'iris_job_url');
  select vault.create_secret('<o valor de JOB_SECRET>', 'iris_job_secret');
  ```

  Sem esperar o relógio: `npm run job:notificacoes -- manha` (enfileira os lembretes da manhã e entrega), `-- noite`, ou sem argumento (só entrega o que está na fila).
- **Ícones:** `npm run icons` gera os PNG a partir do logo provisório.

Em produção, o que só você pode criar está em "O que depende de você", no fim de `docs/superpowers/plans/2026-10-01-iris-plano-8-pwa-notificacoes.md`.
````

Em "Testes", acrescentar à linha do `test:e2e`: "os testes de push, da tarefa e do convite por e-mail do Plano 8 rodam quando `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `JOB_SECRET` e `SMTP_HOST` estão em `.env.local`; sem eles ficam marcados como pulados".

- [ ] **Step 4: Verificação completa**

Run:
```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
npx playwright test --list
npx supabase db reset && npm run test:db && npm run test:e2e
```
Expected: unitários, tipos, lint e build sem erros; `--list` mostra 16 entradas de `plano8.spec.ts` (8 testes × 2 projetos; 4 rodam no celular e 4 no desktop) e as dos Planos 1–7; banco e e2e passando. Sem Docker, a terceira linha fica **pendente** — registrar em `docs/progresso.md`; nunca enfraquecer um teste.

Conferir também: `git grep -n -i "baixe\|baixar o app\|app store\|play store" -- src public supabase/templates` não devolve nada (o único "Baixar" permitido é "Baixar meus dados", do Plano 9, que ainda não existe); `git grep -n "sb_secret_\|BEGIN PRIVATE KEY" -- . ':!.env.example'` não devolve nada.

- [ ] **Step 5: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 8 — PWA e notificações · concluído em {data}

**Entregue**
- A Íris pode ir para a tela de início: manifest, ícones do logo provisório (inclusive adaptáveis), service worker que não guarda nenhuma tela do app, convite "Instalar a Íris" no onboarding (depois do saldo inicial) e em Configurações → App, com a instrução do iPhone. Nunca "baixe o app".
- "Sem conexão": aviso nas telas quando a rede cai e página estática quando a navegação falha. Nada funciona offline (fora da v1).
- Lembretes por push, cada tipo com sua chave em Configurações → Lembretes: conta vence amanhã e hoje (com "Marcar como paga", que abre a confirmação), entrada a receber, planejado quase no limite, meta perto, mês fechado, avisos da família, retomada depois de 5 dias e lembrete para anotar (desligado por padrão, às 21h). Os demais às 9h de Brasília.
- E-mails: convite da família (com "Reenviar" e limite de 5 por dia), resumo do mês (sem valores) e recuperação de senha com texto da Íris.
- Tarefa diária das 00h05 cria as contas do mês de quem não abre o app; abrir o app continua criando também.
- Agendador: pg_cron do Supabase; a entrega passa por uma rota do app protegida por segredo.

**Segurança e privacidade**
- Endereços de push sem leitura pela API, um aparelho = uma pessoa, apagados ao desativar, ao sair, quando deixam de valer e na exclusão do cadastro. O servidor só chama serviços de push conhecidos.
- A fila guarda só tipo e referência; o texto é montado no envio, depois de o banco conferir de novo se quem recebe ainda pode ver aquilo. Aviso da família só com o que as telas da família já mostram.
- Rota da tarefa: só com o segredo (comparado em tempo constante); sessão de navegador não autoriza; chave de serviço só nela (teste confere os imports).
- `generated_through` deixou de ser alterável pela API (pendência do Plano 3).

**Testes**
- Unitários e de componentes: {n} passando ({n} arquivos). Tipos, lint e build sem erros.
- Banco (`plano8-preferencias`, `plano8-ocorrencias`, `plano8-convite`, `plano8-fila`: 53 testes) e ponta a ponta (`plano8.spec.ts`: 8 testes — celular: 4, desktop: 4; 16 entradas em `--list`): {rodados | pendentes do Docker}.

**Ao rodar o banco pela primeira vez (Docker)**
- `create extension pg_cron` e `pg_net` na migração: confirmar que o `db reset` local aceita (a imagem do Supabase traz as duas). Se o `pg_cron` reclamar do banco, conferir `cron.database_name`.
- `vault.decrypted_secrets` existe no banco local (extensão `supabase_vault`); sem ela, `job_dispatch` só devolve falso.
- Do banco em Docker para o app: `http://host.docker.internal:3000` (README). Conferir em `net._http_response` que a chamada chegou.
- A caixa de e-mail local: confirmar a porta SMTP 54325 (`[local_smtp] smtp_port`) e a API usada pelo e2e (`/api/v1/search`, `/api/v1/message/{ID}`); ajustar `E2E_MAILBOX_URL` se a versão local for outra.
- O gatilho novo em `family_events` roda dentro de sair, remover e excluir o cadastro: rodar `plano7-saida` junto.

**Pendências levadas a outros planos**
- Plano 9: tela de excluir cadastro (as inscrições, preferências e avisos já saem na cascata); exportar no CSV não inclui endereços de push; política de privacidade precisa citar push e e-mail; e-mail de confirmação de cadastro (se a confirmação por e-mail for ligada no Supabase hospedado) e de troca de e-mail precisam de texto.
- Plano 9 (lançamento): tudo de "O que depende de você".
- Plano 10: Configurações → Lembretes e "Instalar a Íris" no desktop com layout próprio.
- Depois da v1, se fizer falta: tela de avisos dentro do app; escolher o horário do lembrete; aviso de conta que vence no dia 1 já na véspera.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 8` com a tabela "Decisões tomadas neste plano" abaixo (112–136) e a lista "Para você confirmar (interpretações)": 119 (lembrete para anotar às 21h), 121 (aviso de entrada a receber, texto novo), 126 (e-mail do resumo sem valores), 135 (sem tela de avisos). Ao fim da seção de textos novos, a linha: `Plano 8: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-10-01-iris-plano-8-pwa-notificacoes.md\` (38 textos, para aprovação).` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/plano8.spec.ts .env.example README.md docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): PWA, lembretes, tarefa e convite por e-mail; progresso e decisões do Plano 8" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## O que depende de você

Nada disto é necessário para desenvolver e testar localmente. São contas e chaves que só você pode criar, todas em planos gratuitos, para quando a Íris for publicada (Plano 9):

| # | O quê | Onde entra | Observação |
|---|---|---|---|
| 1 | **Provedor de e-mail (SMTP)** com plano gratuito (ex.: Resend, Brevo) e um domínio seu verificado nele | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` na Netlify; **e** as mesmas credenciais em Supabase → Authentication → SMTP | Sem isso, convites e resumo por e-mail ficam desligados (o convite por link continua). O e-mail de recuperação de senha do Supabase hospedado sem SMTP próprio tem limite baixo de envios. |
| 2 | **Modelo do e-mail de recuperação** no Supabase hospedado | Authentication → Email Templates → Reset Password: colar `supabase/templates/recovery.html` e o assunto "Crie uma nova senha na Íris" | O arquivo do repositório só vale no ambiente local. |
| 3 | **Chaves VAPID de produção** (comando gratuito, sem cadastro: `npx web-push generate-vapid-keys`) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` na Netlify | Use um par diferente do local. Trocar as chaves depois desliga os lembretes de quem já ativou (a pessoa ativa de novo). |
| 4 | **Segredo da tarefa** (`openssl rand -base64 48`) | `JOB_SECRET` na Netlify **e** no Vault do Supabase (SQL Editor): `select vault.create_secret('https://SEU-DOMINIO/api/jobs/notificacoes', 'iris_job_url'); select vault.create_secret('<segredo>', 'iris_job_secret');` | Os dois lados precisam do mesmo valor. |
| 5 | **Chave de serviço do Supabase** | `SUPABASE_SECRET_KEY` na Netlify (variável de servidor) | Nunca com o prefixo `NEXT_PUBLIC_`. |
| 6 | **Extensões no Supabase hospedado** | Database → Extensions: `pg_cron` e `pg_net` ligadas antes de aplicar a migração | Existem no plano gratuito. Projeto gratuito pausa por inatividade (já previsto: Supabase Pro no lançamento, etapa-2 §5). |
| 7 | **Docker Desktop** no seu computador | — | Mesma pendência dos Planos 1–7: sem ele, os testes de banco e de ponta a ponta continuam escritos e não executados. |
| 8 | **Teste em aparelho de verdade** | iPhone (iOS 16.4 ou mais novo, com a Íris na tela de início) e Android | Push só se confirma de verdade num endereço HTTPS; a instrução do iPhone e o botão do Android precisam ser vistos no aparelho. |
| 9 | **Logo definitivo** | `scripts/gerar-icones.mjs` + `npm run icons` | Hoje os ícones usam o logo provisório (decisão 11). |
| 10 | **Sua aprovação** | — | Os 38 "Textos novos" e as interpretações marcadas (decisões 119, 121, 126, 135). |

---

## Rodar localmente

1. Docker em execução; `npx supabase start`; `.env.local` preenchido (ver `.env.example`; as variáveis do Plano 8 são opcionais).
2. `npx supabase db reset` — aplica as nove migrações (`…_nucleo` … `…_familia`, `…_notificacoes`) e agenda as quatro tarefas.
3. `npm run dev` → http://localhost:3000. E-mails em http://127.0.0.1:54324. Tarefas sem esperar o relógio: `npm run job:notificacoes -- manha`.

## Testes

- `npm test` — tipos de aviso, textos e destinos; envio de push e de e-mail (simulados); rota da tarefa; service worker, manifest e página "Sem conexão"; telas de Lembretes, instalar e convite por e-mail
- `npm run test:db` — privacidade das preferências, das inscrições e da fila; tarefa diária; convite por e-mail; o que entra na fila e o que o lote devolve; todos os testes dos Planos 1–7 continuam passando
- `npm run test:e2e` — manifest e service worker servidos, "Sem conexão", instalar, Lembretes, pagar pelo destino do aviso, rota da tarefa, convite por e-mail

---

## Autorrevisão do plano

**1. Cobertura do escopo**

| Requisito | Onde |
|---|---|
| RF-07 convite para instalar, com instrução do iPhone | Task 10 (onboarding e Configurações), e2e Task 13 |
| RF-08 permissão só depois de instalar ou de uma ação com contexto | Task 9 (`PushDevice`: só por toque; cartão em Contas; iPhone pede a instalação antes) |
| RNF-03 PWA instalável (manifest, service worker, ícones) | Task 8, e2e Task 13 |
| RNF-09 "sem conexão" (só o aviso; offline fora) | Task 8 (`OfflineBanner`, `sem-conexao.html`) |
| RF-46 push: vence amanhã, vence hoje, planejado, meta, entrada a receber, mês fechado | Tasks 1, 2, 5, 7, 11 |
| RF-47 lembrete diário desligado por padrão | Tasks 1, 2 (`notification_enabled`), 5 (noite), 9 |
| RF-48 retomada sem culpa | Tasks 1, 5 (manhã) |
| RF-49 e-mail: recuperação de senha, convites, resumo mensal | Task 6 (modelos, `recovery.html`), Task 12 (convite), Tasks 5 e 7 (resumo) |
| RF-50 cada tipo liga e desliga | Tasks 2, 9 |
| A8 lembretes às 9h de Brasília | Task 5 (agenda `0 12 * * *` UTC) |
| RF-16 marcar como paga pela notificação | Tasks 8 (botão do aviso), 11 (`PayFromNotification`), e2e |
| Pendência do Plano 3: tarefa diária das 00h05 | Task 3, agenda na Task 5 |
| Pendência do Plano 3: concessão de `generated_through` | Task 3 |
| Pendências dos Planos 5 e 6: "Faltam só…" e "Você já usou boa parte…" | Tasks 2, 11 |
| Pendência do Plano 7: convite por e-mail, "Reenviar", limite, avisos da família por push | Tasks 4, 5, 12 |
| RN-22d/e avisos "A família recebe" | Task 5 (`family_event_notify`), Task 1 (texto) |
| Só planos gratuitos, tudo local, por variável de ambiente | Tasks 6, 7, 13; "O que depende de você" |

Lacunas conhecidas, registradas: aviso "vence amanhã" não existe para conta do dia 1 (a ocorrência nasce no próprio dia 1 — decisões 27 e 120); sem tela de avisos dentro do app (decisão 135); push de verdade não é exercitado no e2e (inscrição simulada; entrega com endereço de teste).

**2. Passos:** cada passo de teste traz o código; cada passo de código traz assinatura, arquivo, regras e os textos exatos; SQL completo nas Tasks 2–5; `public/sw.js`, `sem-conexao.html`, `recovery.html` e a rota da tarefa completos, porque a forma exata deles é a decisão de segurança.

**3. Nomes e tipos conferidos entre tarefas:** `NotificationKind`/`PrefKind`/`PushMessage` (Task 1) usados em 6, 7, 9; formas de `n_params` (Task 5) = `SAMPLES` (Task 1) = entrada de `notificationMessage` (Task 7); `PushTarget` = itens de `n_subscriptions`; `queue_own_notification(p_kind, p_id)` (Task 2) = chamadas de `alerts.ts` (Task 11); `create_family_email_invite(p_email)` (Task 4) = `sendEmailInvite` (Task 12); `save/sync/delete_push_subscription` (Task 2) = `actions.ts` (Task 9); `job_claim_notifications`/`job_finish_notifications` (Task 5) = `deliverBatch` (Task 7); `takeInstallPrompt`/`peekInstallPrompt`/`onInstallable` (Tasks 8 e 10); `isStandalone`/`isIOS` (Task 9) usados na Task 10; cabeçalho `x-iris-job-secret` igual no banco (`job_dispatch`), na rota, no script e no e2e; segredos `iris_job_url`/`iris_job_secret` iguais no SQL, no README e em "O que depende de você".

**4. Review Focus:** os cinco itens têm teste na tarefa dona (lista no topo).

**5. Proporção:** o plano é longo porque carrega o SQL e os testes completos (pedido do projeto, como nos Planos 6 e 7); as implementações em TypeScript estão como assinatura e regras, não como corpo.

## Conflitos encontrados na especificação

1. **A copy oficial não tem texto de instalação nem de e-mail** (o pedido deste plano supunha que tinha). A frase de instalar é a do RF-07 e do protótipo `Instalar` (aprovados); os e-mails são todos "Textos novos".
2. **A8 "lembretes às 9h" × protótipo "Lembrete para anotar — Todo dia às 21h" × copy "Teve algum gasto hoje?".** Às 9h a pergunta não faz sentido. Decisão 119: tudo às 9h, menos o lembrete para anotar, às 21h (como no protótipo). **Confirme.**
3. **RF-46 lista "entrada a receber", mas a copy não tem a frase.** Texto novo (decisão 121).
4. **RF-50 "cada tipo" × protótipo com 5 chaves.** Entradas a receber, retomada e avisos da família também precisam de chave: 8 chaves, 3 rótulos novos (decisão 118).
5. **Etapa-3 §5 "avisos de planejado e meta logo após cada registro" × RNF-11.** O "perto do limite" é calculado no servidor com a regra do domínio, depois da resposta; a entrega acontece na próxima passada da fila (até 10 minutos). Não chega enquanto a pessoa ainda está digitando, o que também é mais calmo.
6. **Etapa-3 §5 "Resumo: push + e-mail" × copy "Mês fechado. Entrou {valor}, saiu {valor}."** O e-mail não leva valores (decisão 126): e-mail é canal menos privado, e recalcular o mês fora da sessão da pessoa abriria uma segunda porta para os números. **Confirme.**
7. **Etapa-3 §9 `supabase/functions/` (tarefas agendadas em funções do Supabase) × este plano.** As tarefas são funções SQL chamadas pelo `pg_cron` e uma rota do Next: uma linguagem só, testável localmente sem outro ambiente de execução, e o envio usa bibliotecas de Node (`web-push`, `nodemailer`). A pasta `supabase/functions/` não é criada.
8. **Etapa-3 §3.1 `push_subscriptions(… aparelho)` × mínimo de dados (LGPD).** Não se guarda nome do aparelho (decisão 117).
9. **Copy: estado vazio "Notificações — Tudo tranquilo por aqui."** supõe uma tela de avisos que não está na etapa 3 §6 nem no protótipo. Não construída (decisão 135).
10. **RF-16 "marcar como paga pela notificação" × nunca mudar dinheiro sem confirmação na tela.** O botão do aviso abre a Íris na confirmação "Marcar {conta} como paga?" (decisão 127).
11. **Guia do Next (não recomenda botão próprio de instalar) × protótipo aprovado (botão "Adicionar à tela de início").** O botão aparece só onde o navegador oferece a instalação; nos outros, a instrução (decisão 115).
12. **Decisões 27/29 (contas nascem só até o mês atual) × "vence amanhã".** Conta do dia 1 não tem aviso na véspera (decisão 120).
13. **Decisão 95 (convite só por link até o Plano 8) × protótipo `Familia` (e-mail e "Reenviar").** Resolvido aqui; o link continua existindo (decisão 129).
14. **Copy "Nunca 'Enviar'" × botão "Enviar convite".** A regra é contra o verbo genérico sozinho; a própria copy usa "Enviar link". Mantido verbo + objeto.
15. **`README`/`.env.example` ("`SUPABASE_SECRET_KEY` nunca no código do app") × tarefa que precisa ler dados de todas as pessoas.** A chave passa a ser usada no servidor por um único módulo, só na rota da tarefa, com teste que confere (decisão 133).
16. **e2e do Plano 2 (saldo → primeiro gasto) × etapa-3 §6 (saldo → instalar → primeiro gasto).** Os dois testes ganham o passo "Agora não" (Task 10); nenhuma afirmação é removida.

## Decisões tomadas neste plano

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
| 122 | Planejado quase no limite: quando, depois de um gasto, uma categoria fica "perto do limite" (de 90% a 100%, decisão 77) no mês atual; uma vez por categoria por mês. Passar do planejado não gera push. | Etapa-3 §5; RNF-11; copy (sem alarme). |
| 123 | Meta perto: quando, depois de guardar, falta até um décimo do valor (e a meta não está completa); uma vez por meta por mês. Na meta da família avisa todos, só com o total. | Etapa-3 §5; A4 B. |
| 124 | Retomada: quando o último registro foi há 5 dias (até 30), uma vez por intervalo; quem nunca registrou não recebe. | RF-48; etapa-3 §5 (quantidade de dias em aberto). |
| 125 | Lembrete para anotar: só para quem ligou, e só nos dias em que ainda não anotou nada. | RF-47; não lembrar quem já fez. |
| 126 | Resumo do mês: dia 1 às 9h, para quem teve algum registro no mês que fechou; push e e-mail com "Seu mês de {mês} está fechado. Quer ver como foi?" e o caminho para Relatórios → Mês passado. O e-mail não traz valores. (interpretação — confirme) | RF-46, RF-49; conflito 6. |
| 127 | Tocar num aviso abre só destinos de uma lista fixa (Seu mês, Anotar, Contas, Família, Planejamento, a meta, Relatórios). "Marcar como paga" no aviso abre a confirmação na Íris; nada é pago sem confirmar. | RF-16; pedido de segurança; conflito 10. |
| 128 | Avisos da família (alguém saiu; cadastro excluído) também chegam por push a quem continua, com as mesmas frases da decisão 108. Sem e-mail. | RN-22d, RN-22e; pendência do Plano 7. |
| 129 | Convite por e-mail: o administrador digita o e-mail e a Íris envia o link (mesmas regras do link: 7 dias, uma pessoa, um por vez). O pendente mostra o e-mail, "Convite enviado · aguardando", "Reenviar" e "Cancelar convite". O e-mail fica guardado só enquanto o convite está pendente e só o administrador vê. Até 5 convites por e-mail por família a cada 24 horas. A Íris não diz se o e-mail já tem cadastro. Se o e-mail não sair, a pessoa recebe o link para enviar. O convite por link continua. | RF-42; protótipo `Familia`; LGPD; decisão 95. |
| 130 | Agendador: `pg_cron` do Supabase (gratuito), com quatro tarefas: 00h05 (contas e limpeza), 9h, 21h e a entrega a cada 10 minutos (só chama o app quando há algo na fila). Escolhido em vez das funções agendadas da Netlify porque roda e é testado localmente, sem publicar nada; a tarefa das contas é SQL puro e não depende de rede; e há um agendador só. A rota do app é neutra: outro agendador pode chamá-la no futuro. | Pedido do projeto (gratuito, local, sem deploy); etapa-2 §5. |
| 131 | As contas do mês nascem pela tarefa das 00h05 e, como antes, ao abrir o app. O marcador "até que mês já gerou" deixa de ser alterável pela API. | Etapa-3 §5; pendências do Plano 3. |
| 132 | E-mail por SMTP, atrás de uma interface: local = caixa de e-mail do Supabase local; produção = qualquer provedor SMTP. O e-mail de recuperação de senha continua sendo enviado pelo Supabase, com modelo próprio da Íris. E-mails em HTML simples e em texto. | Pedido do projeto; RF-49. |
| 133 | A chave de serviço é usada no app só pela rota da tarefa (um módulo, com teste que confere). A rota exige um segredo comparado em tempo constante, ignora sessão e cookies e responde só números. | Pedido de segurança; conflito 15. |
| 134 | A fila guarda só o tipo e uma referência; o texto é montado no envio, depois de o banco conferir de novo a chave e se quem recebe ainda pode ver aquilo. Até 3 tentativas, com 15 minutos entre elas; o que não saiu em 2 dias é abandonado; linhas com mais de 90 dias são apagadas. | LGPD; Review Focus 2 e 5. |
| 135 | Não há tela de avisos dentro do app nesta versão. (interpretação — confirme) | Etapa-3 §6 e protótipo não têm; conflito 9. |
| 136 | O servidor só envia push para serviços conhecidos (Google, Mozilla, Apple, Microsoft), por HTTPS; o aviso viaja cifrado até o navegador; o título é sempre "Íris". | Review Focus 3; protótipo "Notificação no celular". |

## Textos novos

Fora da copy oficial, para aprovação. Todos em tom calmo, sem exclamação, sem urgência.

**Instalar e sem conexão**
1. "No menu do navegador, escolha "Instalar" ou "Adicionar à tela de início"." (navegador sem botão de instalar)
2. "A Íris já está na sua tela de início." (Configurações → Instalar, já instalada)
3. "Sem conexão" (título da página estática; rótulo do protótipo `Estados`) e "Íris — Sem conexão" (título da aba)

**Lembretes (Configurações e Contas)**
4. "Entradas a receber" (chave)
5. "Depois de alguns dias sem registro" (chave)
6. "Avisos da família" (chave)
7. "Lembretes neste aparelho" (linha)
8. "Ativar lembretes" (botão)
9. "Desativar neste aparelho" (botão)
10. "Os lembretes estão ativos neste aparelho."
11. "Lembretes ativados."
12. "No iPhone, os lembretes funcionam depois de adicionar a Íris à tela de início."
13. "Os lembretes estão bloqueados neste navegador. Para receber, libere as notificações da Íris nas configurações do navegador."
14. "Este navegador não recebe lembretes."
15. "Não conseguimos ativar os lembretes agora. Tente de novo em instantes."
16. "Quer um lembrete antes de cada conta vencer?" (cartão em Contas)

**Aviso (push)**
17. "Hoje é o dia de receber {entrada}."

**E-mail de convite**
18. Assunto: "{nome} convidou você para a família {família} na Íris"
19. Assunto sem o nome de quem convidou: "Há um convite para você na família {família}, na Íris"
20. "{nome} convidou você para participar da família {família} na Íris."
21. "Há um convite para você participar da família {família} na Íris."
22. "A família vê só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O que é seu continua privado."
23. "Ver o convite" (link)
24. "O convite vale até {dia} e serve para uma pessoa."
25. "Se o link não abrir, copie este endereço no navegador:" (também nos outros e-mails)
26. "Se você não esperava este convite, é só ignorar este e-mail."

**E-mail do resumo do mês**
27. Assunto: "Seu mês de {mês} está fechado"
28. "Você recebe este e-mail porque o resumo do mês está ligado. Para desligar, abra Configurações na Íris."

**E-mail de recuperação de senha**
29. Assunto: "Crie uma nova senha na Íris"
30. "Recebemos um pedido para criar uma nova senha para o seu cadastro na Íris."
31. "Criar nova senha" (link)
32. "Se não foi você, é só ignorar este e-mail. Sua senha continua a mesma."

**Convite por e-mail (tela Família)**
33. "E-mail de quem vai participar" (rótulo do campo)
34. "Enviar convite" (botão)
35. "Convite enviado para {e-mail}. Vale até {dia}."
36. "Convite reenviado."
37. "Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link."
38. "Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo."

**Reaproveitados (já aprovados; não contam como novos):** "Instalar a Íris", "Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.", "No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".", "Adicionar à tela de início", "Agora não", "Lembretes", "App", "Contas perto do vencimento", "Planejado quase no limite", "Meta perto de ser concluída", "Resumo do mês", "Lembrete para anotar", "Todo dia às 21h", "Tentar de novo", "Convite enviado · aguardando", "Reenviar" (protótipo e RF-07); as sete frases de "Notificações", "Sem conexão no momento…", "Marcar {conta} como paga?", "Marcar como paga", "Conta marcada como paga.", "Alterações salvas.", "Confira o e-mail. Parece que falta alguma coisa.", "Ver meu mês" (copy); "Você recebeu um convite", "Crie uma nova senha.", "Voltar", "A família já está completa.", "Só quem administra a família pode fazer isso.", as frases da decisão 108 e "Íris — Veja para onde seu dinheiro vai" (já em uso).
