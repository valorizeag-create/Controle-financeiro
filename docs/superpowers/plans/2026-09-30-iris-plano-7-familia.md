# Íris — Plano 7: Família — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma pessoa cria uma família (vira administradora), convida outras por um link que vale 7 dias e serve para uma pessoa, e a família passa a ver — e só isso — os gastos marcados "da família", as contas da casa (qualquer membro marca como paga; sai do Disponível de quem pagou) e as metas da família (cada um vê o total e só a própria parte; só o administrador usa e exclui). Membros saem, o administrador remove e passa a administração; quem sai recebe de volta a própria parte das metas; quem exclui o cadastro vira "Ex-membro" no histórico da família. Tudo garantido pelo banco (RLS e funções que conferem a participação), com testes contra o banco real.

**Architecture:** Mesma base dos Planos 1–6. **As tabelas pessoais continuam "só o dono"** (`transactions`, `categories`, `cards`, `goal_movements`, `budgets`, `recurrences`, `installment_plans`, metas individuais): nenhuma política delas é afrouxada para a família. O que é da família chega aos outros membros por **funções `security definer` de escopo mínimo** que (a) descobrem a família só por `auth.uid()` (`my_family_id()`), nunca por parâmetro, (b) projetam só colunas seguras (nunca cartão, forma de pagamento, parcela, entrada, saldo) e (c) conferem o papel (administrador) quando a operação é dele. Quatro tabelas novas (`families`, `family_members`, `family_invites`, `family_events`) são só leitura pela API (RLS por `my_family_id()`); toda gravação passa por funções. `transactions`, `recurrences` e `goals` ganham `family_id`; metas da família não têm dono (`user_id` nulo, `family_id` preenchido) e seus movimentos continuam de cada pessoa (`goal_movements.user_id` = quem guardou, RLS "só o dono" — A4 B). As guardas antigas (metas, movimentos, vínculo gasto-uso, parcelas, recorrências) são reescritas para aceitar a família sem abrir brecha. Regras de dinheiro novas ficam em `src/domain/family.ts` (RNF-11); o Seu mês continua pessoal: o que eu paguei (inclusive da família) sai do meu Disponível (RN-18, RN-20, RN-22b).

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Postgres (Supabase local; `pgcrypto` no schema `extensions`), Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-25 "individual ou da família", RF-35, RF-41–45, RN-17–26, RN-31, RF-53 texto de exclusão, §1.1 terminologia, §6 fora da v1: entradas da família, planejamento da família, papéis além de administrador e membro, mais de uma família por pessoa), `docs/etapa-3-arquitetura.md` (§2 princípios, §3.1 `families`/`family_members`/`family_invites`/`goals` "dono _ou_ família"/`goal_movements` "pessoa", §4 tabela de privacidade e permissões, §6 `/familia` e `/convite/{código}`, §7 seletor Eu · Família; decisões A3 A, A4 B, A6 A), `docs/etapa-5-ui.md` (tokens; textos aprovados "Aqui aparecem só os gastos marcados como da família.", "O Disponível e as entradas de cada pessoa nunca aparecem aqui.", "Para onde vai o dinheiro da casa"), `docs/etapa-7-roteiro.md` (escopo do Plano 7; e-mails de convite no Plano 8), `docs/decisoes-para-revisao.md` (decisões 1–93, obrigatórias, com as substituições registradas lá), `docs/progresso.md` (pendências marcadas "Plano 7": família em `recurrences` e RN-20; parcelado da família e cartão em gasto da família — RN-31; metas da família — RN-22 a RN-22e, "Sua parte", `return_on_exit`), protótipo aprovado (`Familia`, `Mobile-Familia`, `Main`/`Desktop` seletor Eu · Família e menu lateral, `Mais`, `Metas` seção "Da família", `Desktop-Anotar` "Gasto da família", `Extrato` etiqueta "da família", `ExcluirCadastro`), copy oficial (Claude Doc "Íris — Documento-base de comunicação" — **não tem seção de família**: todo texto de família que não está nos requisitos, na Etapa 5 ou no protótipo está em "Textos novos").

## Global Constraints

- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`): `01-app/02-guides/forms.md`, `01-app/02-guides/server-actions.md`, `01-app/03-api-reference/03-file-conventions` (page, route groups). `params`/`searchParams` de página são `Promise` e precisam de `await`.
- Idioma pt-BR, moeda somente R$. Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor e de `(now() at time zone 'America/Sao_Paulo')::date` no banco; nunca do navegador. Meses são `MonthKey` (`AAAA-MM`) de `2000-01` a `2099-12`.
- Dinheiro sempre em **centavos inteiros**, de 1 a `MAX_CENTS = 9_999_999_999`. Texto → centavos só por `parseBRL`; centavos → texto por `formatBRL`/`formatCompactBRL` (NBSP entre `R$` e o número). Divisão proporcional (RN-22c) sem ponto flutuante: `BigInt` no domínio, `numeric` no banco.
- **Uma regra de dinheiro, um lugar (RNF-11):** o Seu mês, o Extrato, Contas, Planejamento e Relatórios continuam lendo só `loadLedger()` (os registros **da própria pessoa**), agora passando por `personalLedger()` (Task 1): conta da família ainda não paga não é de ninguém. O espaço da família usa `familyMonth()` (Task 1). A divisão do uso da meta da família é `splitFamilyUse()` (Task 1), espelhada em SQL.
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar; "família", "administrador"/"administra a família", "membro", "Ex-membro" (RN-24); "Guardado", "Sua parte"; sem exclamação; tom calmo, sem julgamento, a culpa nunca é da pessoa.
- Todo texto visível vem da copy oficial, do protótipo aprovado, dos requisitos aprovados, dos textos já aprovados em `docs/decisoes-para-revisao.md`/`docs/etapa-5-ui.md`, ou da seção "Textos novos" no fim deste plano. Prioridade: decisões aprovadas > copy > manual visual > protótipo; para texto, a copy vence o protótipo.
- Alvos de toque ≥ 44 px (`min-h-11`/`size-11`); texto 15–16 px no celular; contraste WCAG AA; nada depende só de cor.
- **Banco:** nunca editar migrações já aplicadas (`20260922000001_nucleo.sql` … `20260930000001_planejamento.sql`); tudo deste plano vai em **`supabase/migrations/20261001000001_familia.sql`**, escrita em quatro seções (Tasks 2–5, anexadas nessa ordem ao mesmo arquivo novo). RLS ligada em toda tabela nova. FKs compostas `(x_id, user_id)` onde a linha é de uma pessoa; onde uma FK composta antiga impede a família, ela é **trocada** (drop + add) nesta migração e uma guarda (gatilho) passa a conferir o que ela conferia.
- **Funções SQL:** `security invoker` por padrão; `set search_path = ''`; todo nome com `public.`/`extensions.`; `auth.uid()` conferido no começo; todas as entradas limitadas (texto com tamanho e forma; valor entre 1 e `9999999999`; datas entre 2000-01-01 e 2099-12-31; ids nulos recusados); `revoke execute … from public, anon` + `grant execute … to authenticated`. **`security definer` só onde o plano diz, cada uma com o motivo no comentário**, e sempre: família descoberta por `public.my_family_id()` (nunca recebida), papel conferido por `public.my_family_role()`, filtro explícito por família em toda leitura/gravação (a RLS não vale dentro delas), colunas projetadas uma a uma. Funções de gatilho: `revoke execute … from public, anon, authenticated`.
- **Guardas:** toda regra que uma gravação direta pela API poderia furar tem gatilho no banco (família de um registro, dono de uma ocorrência, movimento de meta, vínculo gasto-uso, exclusão de meta). Os testes de banco tentam furar cada uma por gravação direta.
- Servidor: o id da pessoa vem **só** de `requireUser()`, chamado no começo de toda Server Action e loader; nunca do formulário. Leituras e alterações por id filtram o id **e** a condição de dono (`user_id`) ou de família (`family_id`); `myFamilyId()` filtra `user_id` e `left_at is null`. Zod/`parseBRL` no servidor; formulários usam `FormState` (`errorState`, `readFields`) e mantêm o que foi digitado. `redirect()` nunca dentro de `try`.
- **Defesa em profundidade:** os testes de Server Action usam fakes encadeáveis do Supabase que registram cada `.eq`/`.is`/`.in`/`.rpc` e **afirmam os filtros e os parâmetros**. **Nunca remover** um filtro de segurança existente para um teste passar.
- Módulos `'use server'` exportam **somente funções async** (tipos e constantes em outros arquivos: `invite-state.ts`, `schemas.ts`).
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Textos com NBSP (valores em R$) são conferidos por `textContent`, nunca por `getByText`. Componentes com `useActionState` seguem `src/features/metas/goal-form.test.tsx`. Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `@/lib/refresh` e `next/navigation`; relógio falso em `2026-09-28T15:00:00Z`.
- Fora do escopo (etapa-2 §6): entradas da família, planejamento da família, papéis além de administrador e membro, mais de uma família por pessoa. E-mail de convite e avisos por push/e-mail: Plano 8 (o convite por link funciona sem e-mail; a tabela de convites aceita ganhar e-mail depois). Tela de excluir cadastro: Plano 9 (o comportamento no banco entra aqui, Task 5).
- Nenhuma dependência nova. Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`. O código do convite nunca vai para log, flash ou banco em texto (só o resumo SHA-256).
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como **pendente** em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem machucar alguém e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Um membro enxergar o privado de outro** — ler direto a tabela `transactions`/`categories`/`cards`/`goals`/`goal_movements`/`budgets` de outra pessoa da mesma família, ver o cartão ou a forma de pagamento de um gasto da família, ou a parte de outro numa meta. A pessoa espera que a família veja só o que foi marcado da família, e nada do cartão (RN-31, A4 B). → **Task 3** (`a família nunca lê as tabelas pessoais dos outros…`, `a família vê só as colunas seguras…`), **Task 4** (`cada um só a própria parte…`), e2e na **Task 14**.
2. **Convite usado por quem não devia** — link vencido, cancelado, já usado, adivinhado, com formato estranho, aberto por quem já tem família, ou usado para virar administrador. Expectativa: a mesma mensagem calma, nada acontece, o convite não se gasta à toa. → **Task 2** (`convite vencido, cancelado, errado…`, `quem já participa…`, `o convite serve uma vez`), **Task 7** (erro volta ao convite), **Task 10** (tela), e2e na **Task 14**.
3. **Ex-membro que ainda tem a tela aberta** — depois de sair ou ser removido, tentar guardar na meta da família, pagar a conta da casa, marcar um gasto como da família, ou recarregar o espaço da família. Expectativa: perde tudo na hora; os próprios registros continuam dele. → **Task 5** (`sair: … perde todo acesso na hora`, `ex-membro não guarda, não paga…`, `ex-membro não marca nada novo…`), **Task 6** (`myFamilyId` só com `left_at` vazio), **Task 11** (página sem família redireciona).
4. **Dinheiro contado duas vezes ou em ninguém** — conta da família paga por outro membro, uso da meta da família dividido com centavos, meta da família excluída, parte devolvida na saída, cadastro excluído com parte usada numa compra. Expectativa: cada centavo sai de exatamente um Disponível; o Saldo total de cada um cai só pela própria parte. → **Task 1** (`personalLedger…`, `splitFamilyUse…`), **Task 3** (`quem paga vira dono`), **Task 4** (`usar: divide na proporção…`, `excluir: cada parte volta…`), **Task 5** (`excluir o cadastro…`), e2e na **Task 14**.
5. **Administrador saindo, sendo removido ou excluindo o cadastro** — a família nunca pode ficar sem administrador nem com dois; o único membro que sai encerra a família; quem é removido não é o próprio administrador. → **Task 2** (`transferir…`), **Task 5** (`administrador com outras pessoas não sai…`, `remover…`, `administrador que exclui o cadastro…`), **Task 10** (aviso na tela), e2e na **Task 14**.

---

## Estrutura de arquivos

```
supabase/migrations/20261001000001_familia.sql     NOVO (4 seções): família e convites; gastos e contas da família; metas da família; saída e exclusão de cadastro
tests/db/family-helpers.ts                          NOVO: createFamily, inviteCode, joinFamily, expense
tests/db/plano7-familia.test.ts                     NOVO: criar, convites, aceitar, transferir, privacidade das tabelas da família
tests/db/plano7-gastos.test.ts                      NOVO: gastos e contas da família, colunas seguras, privacidade das tabelas pessoais, guardas antigas
tests/db/plano7-metas.test.ts                       NOVO: metas da família (A4 B, RN-22a–c, A6 A)
tests/db/plano7-saida.test.ts                       NOVO: sair, remover, encerrar, excluir cadastro (RN-22d/e, RN-23–25)
tests/e2e/plano7.spec.ts                            NOVO: dois usuários (administrador e membro) no mesmo teste
src/
  domain/family.ts (+ family.test.ts)               NOVO: FAMILY_LIMITS, DEFAULT_CATEGORY_NAMES, EX_MEMBER, personalLedger, familyCategoryGroup, authorLabel, familyMonth, splitFamilyUse
  features/registro/tx-row.ts (+ .test.ts), queries.ts (+ .test.ts)   MOD: familyId; loadLedger só da pessoa + personalLedger
  features/contas/occurrences.ts (+ .test.ts)       MOD: gera também as contas da família
  features/contas/queries.ts                        MOD: contas que se repetem pessoais (family_id vazio)
  features/metas/queries.ts                         MOD: loadGoalLabel com meta da família
  features/familia/
    types.ts (+ .test.ts)                           NOVO: tipos e conversores
    queries.ts (+ .test.ts)                         NOVO: myFamilyId, loadMyFamily, loadFamilyExpenses, loadFamilyExpense, loadFamilyBills, loadFamilyRecurrences, loadFamilyGoals, loadFamilyGoal
    schemas.ts (+ .test.ts)                         NOVO: familyNameSchema, inviteCodeSchema, memberIdSchema, makeFamilyExpenseSchema, familyBillSchema
    invite-state.ts                                 NOVO: InviteState
    actions.ts (+ .test.ts)                         NOVO: createFamily, createInvite, revokeInvite, acceptInvite, leaveFamily, removeMember, transferAdmin
    money-actions.ts (+ .test.ts)                   NOVO: payFamilyBill, updateFamilyExpense, deleteFamilyExpense, updateFamilyBill, endFamilyBill
    view-model.ts (+ .test.ts)                      NOVO: buildFamiliaPage, buildFamilyMonth, buildFamilyBills, eventText
    familia-page.tsx, invite-panel.tsx, member-actions.tsx, leave-family.tsx (+ testes)   NOVO
    family-month.tsx, view-switch.tsx, family-bills.tsx, family-expense-form.tsx, family-bill-form.tsx (+ testes)   NOVO
  features/metas/family-goal-actions.ts (+ .test.ts)   NOVO: createFamilyGoal, updateFamilyGoal, deleteFamilyGoal, depositToFamilyGoal, withdrawFromFamilyGoal, spendFromFamilyGoal, deleteFamilyGoalUse
  features/metas/view-model.ts, metas-list.tsx, goal-form.tsx, family-goal-detail.tsx (+ testes)   MOD/NOVO
  features/registro/actions.ts, anotar-form.tsx, schemas.ts (+ testes)   MOD: "Gasto da família"
  features/contas/actions.ts, recurrence-form.tsx (+ testes)             MOD: "Conta da família"
  features/extrato/view-model.ts, extrato-list.tsx (+ testes)            MOD: etiqueta "da família"
  features/auth/actions.ts, forms.tsx, routes.ts (+ testes)              MOD: volta ao convite depois de entrar/criar cadastro
  features/shell/nav-items.ts (+ testes), lib/refresh.ts                  MOD: Família
  app/
    (auth)/convite/[codigo]/page.tsx                NOVO
    (auth)/entrar/page.tsx, (auth)/criar-cadastro/page.tsx   MOD: ?next=
    (app)/familia/page.tsx                          NOVO
    (app)/familia/contas/page.tsx, (app)/familia/contas/[id]/page.tsx, (app)/familia/gastos/[id]/page.tsx   NOVO
    (app)/inicio/page.tsx, (app)/inicio/familia/page.tsx     MOD/NOVO: seletor Eu · Família
    (app)/metas/page.tsx, metas/nova, metas/[id]/(page|editar|guardar|tirar|usar)   MOD: meta da família
    (app)/anotar/page.tsx, (app)/contas/nova/page.tsx, (app)/extrato/[id]/page.tsx, (app)/mais/page.tsx   MOD
docs/progresso.md, docs/decisoes-para-revisao.md    MOD no fim
```

**Rotas:** `/familia` (criar, participantes, convites, avisos, sair), `/familia/contas` (contas da família), `/familia/contas/{recorrência}` (alterar conta da família), `/familia/gastos/{id}` (administrador edita gasto da família de outra pessoa), `/inicio/familia?mes=AAAA-MM` (Seu mês → Família), `/convite/{código}` (pública). Nenhuma é painel (`isSheetRoute` não muda).

**Modelo (etapa-3 §3.1 → banco):**
- `families` = id, nome (`name`), criada_em, `created_by`, encerrada (`ended_at`; uma família sem ninguém fica encerrada, nunca apagada — o histórico de Ex-membro fica nela).
- `family_members` = uma linha por participação: família, pessoa (`user_id`, nulo depois da exclusão do cadastro), papel `admin|member`, nome que a família vê (`display_name`, acompanha o perfil enquanto participa; guardado ao sair — RN-23; apagado ao excluir o cadastro — RN-24), `joined_at`, `left_at`. Participação ativa = `left_at is null`.
- `family_invites` = família, **resumo SHA-256 do código** (`token_hash`; o código nunca é guardado), `created_by`, `expires_at` (7 dias), `accepted_by`/`accepted_at`, `revoked_at`. Coluna de e-mail: Plano 8.
- `family_events` = avisos da família (RN-22d/e): tipo, nome de quem saiu (nulo na exclusão de cadastro), meta, valor.
- `transactions.family_id` (gasto da família), `ex_category_key`/`ex_category_name` (categoria guardada quando o registro fica sem dono, RN-24); `transactions.user_id` passa a aceitar nulo **só** em gasto confirmado da família (Ex-membro).
- `recurrences.family_id` (conta da família).
- `goals.family_id` + `goals.created_by`; meta da família tem `user_id` nulo (`(user_id is null) <> (family_id is null)`); `goal_movements.user_id` continua "quem guardou" (nulo só no "use" de quem excluiu o cadastro, RN-22e).

---

### Task 1: Regras da família (domínio)

**Files:**
- Create: `src/domain/family.ts`
- Test: `src/domain/family.test.ts`

**Interfaces:**
- Consumes: `Cents` (`./money`); `ISODate`, `MonthKey`, `isInMonth` (`./dates`); `TxStatus` (`./summary`).
- Produces (usados pelas Tasks 6, 9, 11, 12):
  - `FAMILY_LIMITS = { maxMembers: 10, inviteDays: 7, nameMax: 40 } as const`.
  - `DEFAULT_CATEGORY_NAMES: Readonly<Record<string, string>>` — as 10 chaves padrão → nome da copy (`casa: 'Casa'`, `mercado: 'Mercado'`, `transporte: 'Transporte'`, `comer_fora: 'Comer fora'`, `saude: 'Saúde'`, `lazer: 'Lazer'`, `assinaturas: 'Assinaturas'`, `educacao: 'Educação'`, `compras: 'Compras'`, `outros: 'Outros'`).
  - `EX_MEMBER = 'Ex-membro'`.
  - `personalLedger<T extends { status: TxStatus; familyId: string | null }>(txs: T[]): T[]` — tira as contas da família ainda não pagas (`status === 'pending' && familyId !== null`); mantém a ordem.
  - `familyCategoryGroup(key: string | null, name: string): { groupKey: string; label: string }` — A3: com chave padrão conhecida → `{ groupKey: 'd:' + key, label: DEFAULT_CATEGORY_NAMES[key] }`; senão → `{ groupKey: 'n:' + name.trim().toLocaleLowerCase('pt-BR'), label: name.trim() }`.
  - `interface FamilyExpense { id: string; effectiveOn: ISODate; amountCents: Cents; categoryKey: string | null; categoryName: string; note: string | null; authorId: string | null; authorName: string | null }`.
  - `authorLabel(authorId: string | null, authorName: string | null, meId: string): string` — `'Você'` se `authorId === meId`; `EX_MEMBER` se `authorId === null` ou `authorName === null`; senão `authorName`.
  - `interface FamilyMonth { totalCents: Cents; byMember: { authorId: string | null; label: string; cents: Cents }[]; byCategory: { groupKey: string; label: string; cents: Cents }[]; recent: FamilyExpense[] }`.
  - `familyMonth(input: { month: MonthKey; expenses: FamilyExpense[]; meId: string; recentLimit?: number }): FamilyMonth` — só `effectiveOn` no mês; valor inteiro de cada compra (RN-22c "uma compra só"); `byMember`: "Você" primeiro, depois por valor desc e rótulo; todos os sem dono somados numa linha `EX_MEMBER` (`authorId: null`); `byCategory` por `familyCategoryGroup`, valor desc e rótulo; `recent`: os `recentLimit` (padrão 5) mais recentes por `effectiveOn` desc, mantendo a ordem de entrada nos empates.
  - `splitFamilyUse(fundedCents: Cents, parts: { userId: string; cents: Cents }[]): { userId: string; cents: Cents }[]` — RN-22c: só partes > 0; `share = floor(funded × parte ÷ total)` em `BigInt`; os centavos que sobram vão, um a um, para os maiores restos da divisão (empate: maior parte, depois `userId` crescente); sem linhas de 0; saída por `userId` crescente; `[]` quando `funded <= 0` ou o total é 0; lança `RangeError` se `funded > total`.

- [ ] **Step 1: Testes que falham** — criar `src/domain/family.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_CATEGORY_NAMES, EX_MEMBER, FAMILY_LIMITS, authorLabel, familyCategoryGroup, familyMonth,
  personalLedger, splitFamilyUse, type FamilyExpense,
} from './family'

const exp = (p: Partial<FamilyExpense>): FamilyExpense => ({
  id: 'x', effectiveOn: '2026-09-10', amountCents: 0, categoryKey: 'mercado', categoryName: 'Mercado',
  note: null, authorId: 'me', authorName: 'Camila', ...p,
})

test('limites e nomes padrão', () => {
  expect(FAMILY_LIMITS).toEqual({ maxMembers: 10, inviteDays: 7, nameMax: 40 })
  expect(Object.keys(DEFAULT_CATEGORY_NAMES)).toHaveLength(10)
  expect(DEFAULT_CATEGORY_NAMES.comer_fora).toBe('Comer fora')
  expect(EX_MEMBER).toBe('Ex-membro')
})

describe('personalLedger (conta da família a pagar não é de ninguém — Review Focus 4)', () => {
  test('tira só a conta da família ainda não paga', () => {
    const rows = [
      { id: 'a', status: 'pending' as const, familyId: 'f' },
      { id: 'b', status: 'confirmed' as const, familyId: 'f' },
      { id: 'c', status: 'pending' as const, familyId: null },
      { id: 'd', status: 'confirmed' as const, familyId: null },
    ]
    expect(personalLedger(rows).map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })
})

describe('categorias na família (A3)', () => {
  test('padrão pela chave, com o nome da copy, mesmo renomeada; própria pelo nome, sem maiúsculas', () => {
    expect(familyCategoryGroup('mercado', 'Supermercado')).toEqual({ groupKey: 'd:mercado', label: 'Mercado' })
    expect(familyCategoryGroup(null, ' Pet ')).toEqual({ groupKey: 'n:pet', label: 'Pet' })
    expect(familyCategoryGroup(null, 'PET').groupKey).toBe(familyCategoryGroup(null, 'pet').groupKey)
    expect(familyCategoryGroup('desconhecida', 'Casa nova')).toEqual({ groupKey: 'n:casa nova', label: 'Casa nova' })
  })
})

test('quem registrou: Você, o nome, ou Ex-membro (RN-23, RN-24)', () => {
  expect(authorLabel('me', 'Camila', 'me')).toBe('Você')
  expect(authorLabel('u2', 'Alex', 'me')).toBe('Alex')
  expect(authorLabel(null, null, 'me')).toBe('Ex-membro')
  expect(authorLabel('u3', null, 'me')).toBe('Ex-membro')
})

describe('mês da família', () => {
  test('protótipo Mobile-Familia: total, por pessoa (Você primeiro), por categoria e últimos', () => {
    const expenses = [
      exp({ id: '1', effectiveOn: '2026-09-28', amountCents: 31240, authorId: 'u2', authorName: 'Alex' }),
      exp({ id: '2', effectiveOn: '2026-09-27', amountCents: 8990, categoryKey: 'casa', categoryName: 'Casa' }),
      exp({ id: '3', effectiveOn: '2026-09-05', amountCents: 121010, authorId: 'me', categoryKey: 'casa', categoryName: 'Aluguel e casa' }),
      exp({ id: '4', effectiveOn: '2026-09-03', amountCents: 52760, authorId: 'u2', authorName: 'Alex', categoryKey: 'mercado', categoryName: 'Supermercado' }),
      exp({ id: '5', effectiveOn: '2026-08-31', amountCents: 99999 }),
      exp({ id: '6', effectiveOn: '2026-09-02', amountCents: 40000, authorId: null, authorName: null, categoryKey: null, categoryName: 'Comer fora' }),
    ]
    const m = familyMonth({ month: '2026-09', expenses, meId: 'me', recentLimit: 2 })
    expect(m.totalCents).toBe(31240 + 8990 + 121010 + 52760 + 40000)
    expect(m.byMember).toEqual([
      { authorId: 'me', label: 'Você', cents: 130000 },
      { authorId: 'u2', label: 'Alex', cents: 84000 },
      { authorId: null, label: 'Ex-membro', cents: 40000 },
    ])
    expect(m.byCategory).toEqual([
      { groupKey: 'd:casa', label: 'Casa', cents: 130000 },
      { groupKey: 'd:mercado', label: 'Mercado', cents: 84000 },
      { groupKey: 'n:comer fora', label: 'Comer fora', cents: 40000 },
    ])
    expect(m.recent.map((e) => e.id)).toEqual(['1', '2'])
  })

  test('mês sem gastos da família: tudo zerado e listas vazias', () => {
    expect(familyMonth({ month: '2026-10', expenses: [exp({ amountCents: 100 })], meId: 'me' })).toEqual({
      totalCents: 0, byMember: [], byCategory: [], recent: [],
    })
  })
})

describe('divisão do uso da meta da família (RN-22c, Review Focus 4)', () => {
  const sum = (xs: { cents: number }[]) => xs.reduce((a, b) => a + b.cents, 0)

  test('proporcional ao guardado; exato quando dá', () => {
    expect(splitFamilyUse(300000, [{ userId: 'a', cents: 100000 }, { userId: 'b', cents: 200000 }])).toEqual([
      { userId: 'a', cents: 100000 }, { userId: 'b', cents: 200000 },
    ])
    expect(splitFamilyUse(150000, [{ userId: 'b', cents: 200000 }, { userId: 'a', cents: 100000 }])).toEqual([
      { userId: 'a', cents: 50000 }, { userId: 'b', cents: 100000 },
    ])
  })

  test('centavos que sobram vão para os maiores restos; nunca mais do que a parte', () => {
    expect(splitFamilyUse(2, [{ userId: 'a', cents: 1 }, { userId: 'b', cents: 2 }])).toEqual([
      { userId: 'a', cents: 1 }, { userId: 'b', cents: 1 },
    ])
    const three = splitFamilyUse(100, [{ userId: 'a', cents: 3333 }, { userId: 'b', cents: 3333 }, { userId: 'c', cents: 3334 }])
    expect(three).toEqual([{ userId: 'a', cents: 33 }, { userId: 'b', cents: 33 }, { userId: 'c', cents: 34 }])
    expect(sum(three)).toBe(100)
  })

  test('valores no limite do app não perdem centavos; empate total pelo id', () => {
    const big = splitFamilyUse(9_999_999_999, [{ userId: 'b', cents: 9_999_999_999 }, { userId: 'a', cents: 9_999_999_999 }])
    expect(big).toEqual([{ userId: 'a', cents: 5_000_000_000 }, { userId: 'b', cents: 4_999_999_999 }])
  })

  test('partes zeradas ficam de fora; nada a dividir; mais do que o guardado é erro', () => {
    expect(splitFamilyUse(100, [{ userId: 'a', cents: 0 }, { userId: 'b', cents: 500 }])).toEqual([{ userId: 'b', cents: 100 }])
    expect(splitFamilyUse(0, [{ userId: 'a', cents: 500 }])).toEqual([])
    expect(splitFamilyUse(100, [])).toEqual([])
    expect(() => splitFamilyUse(501, [{ userId: 'a', cents: 500 }])).toThrow(RangeError)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/family.test.ts`
Expected: FAIL — `Failed to resolve import "./family"`.

- [ ] **Step 3: Implementação** — seguir Interfaces. `splitFamilyUse` em `BigInt` (valor × parte chega a 10^20); converter para `Number` só no fim (cada parte cabe em `MAX_CENTS`). É o mesmo algoritmo de `use_family_goal` (Task 4) — os comentários dos dois apontam um para o outro.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/family.ts src/domain/family.test.ts
git commit -m "feat(domain): regras da família (livro pessoal, categorias, mês da família, divisão do uso)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Banco — família, participantes, convites e administração

**Files:**
- Create: `supabase/migrations/20261001000001_familia.sql` (seção 1)
- Create: `tests/db/family-helpers.ts`
- Test: `tests/db/plano7-familia.test.ts`

**Interfaces:**
- Consumes: `public.profiles`, `auth.users`; `tests/db/helpers.ts` (`newUser`, `removeUsers`, `categoryId`, `admin`, `url`, `publishable`, `TestUser`).
- Produces (usados pelas Tasks 3–7, 10, 14):
  - Tabelas `public.families`, `public.family_members`, `public.family_invites`, `public.family_events` (colunas no SQL abaixo). Só leitura pela API: `families`/`family_members`/`family_events` para quem participa agora; `family_invites` (sem `token_hash`) só para o administrador.
  - `my_family_id() returns uuid` e `my_family_role() returns text` — família e papel de quem chama (nulo sem família ativa). **Únicas funções `security definer` usadas em políticas.**
  - `create_family(p_name text) returns uuid`.
  - `create_family_invite() returns table (invite_code text, invite_expires_at timestamptz)` — código de 32 caracteres `[A-Za-z0-9_-]`, 192 bits aleatórios; cancela o convite anterior ainda não usado.
  - `revoke_family_invite(p_id uuid) returns void`.
  - `invite_preview(p_code text) returns table (family_name text, invited_by text)` — vazio se o convite não vale ou se quem chama não entrou.
  - `accept_family_invite(p_code text) returns uuid` (família) — sempre como `member`.
  - `transfer_family_admin(p_user uuid) returns void`.
  - Gatilho `profiles_sync_family_name`.
  - Mensagens: `'Nome inválido.'`, `'Você já participa de uma família.'`, `'Só quem administra a família pode fazer isso.'` (errcode `42501`), `'A família já está completa.'`, `'Convite inválido.'` (a mesma para vencido, cancelado, usado, errado ou mal formado), `'Convite não encontrado.'`, `'Pessoa não encontrada.'`.
  - `tests/db/family-helpers.ts`: `createFamily(user: TestUser, name?: string): Promise<string>`, `inviteCode(adminUser: TestUser): Promise<string>`, `joinFamily(user: TestUser, adminUser: TestUser): Promise<void>`, `expense(user: TestUser, key: string, cents: number, extra?: Record<string, unknown>): Promise<string>` (insere um gasto confirmado de hoje com a categoria padrão `key` e devolve o id), `todaySP(): string`.

- [ ] **Step 1: Ajudantes e testes de banco que falham** — criar `tests/db/family-helpers.ts`:

```ts
import { expect } from 'vitest'
import { categoryId, type TestUser } from './helpers'

export const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export async function createFamily(user: TestUser, name = 'Família Teste'): Promise<string> {
  const { data, error } = await user.client.rpc('create_family', { p_name: name })
  if (error) throw error
  return data as string
}

export async function inviteCode(adminUser: TestUser): Promise<string> {
  const { data, error } = await adminUser.client.rpc('create_family_invite')
  if (error) throw error
  const code = (data as { invite_code: string }[])[0].invite_code
  expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/)
  return code
}

export async function joinFamily(user: TestUser, adminUser: TestUser): Promise<void> {
  const { error } = await user.client.rpc('accept_family_invite', { p_code: await inviteCode(adminUser) })
  if (error) throw error
}

export async function expense(user: TestUser, key: string, cents: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('transactions')
    .insert({ user_id: user.id, kind: 'expense', amount_cents: cents, category_id: await categoryId(user, key), occurred_on: todaySP(), ...extra })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
```

Criar `tests/db/plano7-familia.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, inviteCode, joinFamily } from './family-helpers'

let ana: TestUser // administra
let bia: TestUser // membro
let caio: TestUser // de fora
let dani: TestUser // tem outra família
let famAna: string
const extra: TestUser[] = []

beforeAll(async () => {
  ;[ana, bia, caio, dani] = await Promise.all(['Ana', 'Bia', 'Caio', 'Dani'].map((n) => newUser(n)))
  famAna = await createFamily(ana, '  Família   Souza ')
  await joinFamily(bia, ana)
  await createFamily(dani, 'Família Dani')
})

afterAll(async () => {
  await removeUsers(ana, bia, caio, dani, ...extra)
})

async function members(user: TestUser) {
  const { data, error } = await user.client.from('family_members').select('user_id, role, display_name, left_at').order('joined_at')
  if (error) throw error
  return data
}

const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0

describe('criar a família (RF-41)', () => {
  test('quem cria vira administrador; o nome fica limpo', async () => {
    const { data } = await ana.client.from('families').select('id, name, ended_at').single()
    expect(data).toEqual({ id: famAna, name: 'Família Souza', ended_at: null })
    expect(await members(ana)).toEqual([
      { user_id: ana.id, role: 'admin', display_name: 'Ana', left_at: null },
      { user_id: bia.id, role: 'member', display_name: 'Bia', left_at: null },
    ])
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
    expect((await bia.client.rpc('my_family_role')).data).toBe('member')
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('nome vazio, só espaços ou longo demais é recusado', async () => {
    for (const p_name of ['', '   ', 'x'.repeat(41), null]) {
      const { error } = await caio.client.rpc('create_family', { p_name })
      expect(error?.message).toContain('Nome inválido.')
    }
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('uma família por pessoa (RN-26)', async () => {
    const { error } = await bia.client.rpc('create_family', { p_name: 'Outra' })
    expect(error?.message).toContain('Você já participa de uma família.')
  })
})

describe('privacidade das tabelas da família (Review Focus 1)', () => {
  test('quem é de fora não vê família, participantes, convites nem avisos', async () => {
    await inviteCode(ana)
    for (const table of ['families', 'family_members', 'family_invites', 'family_events']) {
      const { data } = await caio.client.from(table).select('id')
      expect(data ?? []).toEqual([])
    }
    const { data } = await dani.client.from('family_members').select('user_id')
    expect(data?.map((r) => r.user_id)).toEqual([dani.id])
  })

  test('membro não vê convites; administrador vê, mas nunca o resumo do código', async () => {
    expect((await bia.client.from('family_invites').select('id')).data).toEqual([])
    const listed = await ana.client.from('family_invites').select('id, expires_at, accepted_at, revoked_at')
    expect(listed.error).toBeNull()
    expect(listed.data!.length).toBeGreaterThan(0)
    expect((await ana.client.from('family_invites').select('token_hash')).error).not.toBeNull()
  })

  test('ninguém grava direto nas tabelas da família — nem o administrador (Review Focus 2)', async () => {
    const tries = await Promise.all([
      caio.client.from('family_members').insert({ family_id: famAna, user_id: caio.id, role: 'admin' }),
      caio.client.from('families').insert({ name: 'Invasão' }),
      bia.client.from('family_invites').insert({ family_id: famAna, token_hash: '\\x00', expires_at: new Date().toISOString() }),
      bia.client.from('family_events').insert({ family_id: famAna, kind: 'member_left' }),
    ])
    for (const r of tries) expect(r.error).not.toBeNull()
    expect(refused(await bia.client.from('family_members').update({ role: 'admin' }).eq('user_id', bia.id).select())).toBe(true)
    expect(refused(await ana.client.from('families').update({ name: 'Outro nome' }).eq('id', famAna).select())).toBe(true)
    expect(refused(await ana.client.from('family_members').delete().eq('user_id', bia.id).select())).toBe(true)
    expect((await members(ana)).map((m) => [m.user_id, m.role])).toEqual([[ana.id, 'admin'], [bia.id, 'member']])
  })

  test('quem não entrou não usa nenhuma função da família', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    expect((await anon.rpc('create_family', { p_name: 'X' })).error).not.toBeNull()
    expect((await anon.rpc('create_family_invite')).error).not.toBeNull()
    expect((await anon.rpc('accept_family_invite', { p_code: 'a'.repeat(32) })).error).not.toBeNull()
    expect(refused(await anon.rpc('invite_preview', { p_code: 'a'.repeat(32) }))).toBe(true)
    expect((await anon.rpc('my_family_id')).error).not.toBeNull()
  })
})

describe('convites (RF-42, Review Focus 2)', () => {
  test('só o administrador convida; cada código é novo e o anterior é cancelado', async () => {
    const byMember = await bia.client.rpc('create_family_invite')
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    const first = await inviteCode(ana)
    const second = await inviteCode(ana)
    expect(second).not.toBe(first)
    const { data } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null)
    expect(data).toHaveLength(1)
    expect((await caio.client.rpc('accept_family_invite', { p_code: first })).error?.message).toContain('Convite inválido.')
  })

  test('prévia: nome da família e de quem convidou, só com convite válido', async () => {
    const code = await inviteCode(ana)
    expect((await caio.client.rpc('invite_preview', { p_code: code })).data).toEqual([{ family_name: 'Família Souza', invited_by: 'Ana' }])
    expect((await caio.client.rpc('invite_preview', { p_code: 'b'.repeat(32) })).data).toEqual([])
    expect((await caio.client.rpc('invite_preview', { p_code: "' or 1=1 --" })).data).toEqual([])
  })

  test('aceitar: entra como membro, nunca administrador; o convite serve uma vez', async () => {
    const [eva, fabio] = await Promise.all([newUser('Eva'), newUser('Fábio')])
    extra.push(eva, fabio)
    const code = await inviteCode(ana)
    const { data, error } = await eva.client.rpc('accept_family_invite', { p_code: code })
    expect(error).toBeNull()
    expect(data).toBe(famAna)
    expect((await eva.client.rpc('my_family_role')).data).toBe('member')
    expect((await fabio.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Convite inválido.')
    expect((await fabio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('convite vencido, cancelado, errado ou de formato estranho: mesma mensagem, nada muda', async () => {
    const expired = await inviteCode(ana)
    await admin.from('family_invites').update({
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }).eq('family_id', famAna).is('accepted_at', null).is('revoked_at', null)
    const revoked = await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    expect((await ana.client.rpc('revoke_family_invite', { p_id: pending![0].id })).error).toBeNull()
    for (const p_code of [expired, revoked, 'c'.repeat(32), 'abc', '', 'a'.repeat(33), "' or 1=1 --", `${'a'.repeat(31)}!`, null]) {
      const { error } = await caio.client.rpc('accept_family_invite', { p_code })
      expect(error?.message).toContain('Convite inválido.')
    }
    expect((await caio.client.rpc('my_family_id')).data).toBeNull()
  })

  test('cancelar: só o administrador, só convite da própria família e ainda pendente', async () => {
    await inviteCode(ana)
    const { data: pending } = await ana.client.from('family_invites').select('id').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    const id = pending![0].id
    expect((await bia.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    expect((await dani.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Convite não encontrado.')
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error).toBeNull()
    expect((await ana.client.rpc('revoke_family_invite', { p_id: id })).error?.message).toContain('Convite não encontrado.')
  })

  test('quem já participa de uma família não entra em outra, e o convite não se gasta (RN-26)', async () => {
    const code = await inviteCode(ana)
    expect((await dani.client.rpc('accept_family_invite', { p_code: code })).error?.message).toContain('Você já participa de uma família.')
    expect((await dani.client.rpc('my_family_role')).data).toBe('admin')
    const gil = await newUser('Gil')
    extra.push(gil)
    expect((await gil.client.rpc('accept_family_invite', { p_code: code })).error).toBeNull()
  })

  test('família completa: no máximo 10 participantes', async () => {
    const hugo = await newUser('Hugo')
    extra.push(hugo)
    const famHugo = await createFamily(hugo, 'Família Cheia')
    const guests = await Promise.all(Array.from({ length: 9 }, (_, i) => newUser(`Convidado ${i}`)))
    extra.push(...guests)
    for (const g of guests) await joinFamily(g, hugo)
    expect((await hugo.client.rpc('create_family_invite')).error?.message).toContain('A família já está completa.')
    const { count } = await admin.from('family_members').select('id', { count: 'exact', head: true }).eq('family_id', famHugo).is('left_at', null)
    expect(count).toBe(10)
  })
})

describe('administração (RF-45, Review Focus 5)', () => {
  test('transferir: só o administrador, só para quem participa; sempre um administrador', async () => {
    expect((await bia.client.rpc('transfer_family_admin', { p_user: bia.id })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    for (const p_user of [ana.id, caio.id, dani.id, null]) {
      expect((await ana.client.rpc('transfer_family_admin', { p_user })).error?.message).toContain('Pessoa não encontrada.')
    }
    expect((await ana.client.rpc('transfer_family_admin', { p_user: bia.id })).error).toBeNull()
    expect((await bia.client.rpc('my_family_role')).data).toBe('admin')
    expect((await ana.client.rpc('my_family_role')).data).toBe('member')
    expect((await members(bia)).filter((m) => m.role === 'admin' && m.left_at === null).map((m) => m.user_id)).toEqual([bia.id])
    expect((await bia.client.rpc('transfer_family_admin', { p_user: ana.id })).error).toBeNull()
  })

  test('o nome que a família vê acompanha o perfil', async () => {
    await bia.client.from('profiles').update({ display_name: 'Beatriz' }).eq('id', bia.id)
    expect((await members(ana)).find((m) => m.user_id === bia.id)?.display_name).toBe('Beatriz')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-familia.test.ts`
Expected: FAIL — `Could not find the function public.create_family` (sem Docker: `fetch failed`; registrar como pendente e seguir; `npx tsc --noEmit` precisa passar).

- [ ] **Step 3: Implementação** — criar `supabase/migrations/20261001000001_familia.sql` com a seção 1:

```sql
-- Plano 7: família (RF-41–45, RN-17–26, RN-31, A3 A, A4 B, A6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regra de ouro: a família só enxerga o que é "da família". As tabelas
-- pessoais (transactions, categories, cards, goal_movements, budgets,
-- recurrences, installment_plans e as metas individuais) continuam com RLS
-- "só o dono": nenhuma política delas é afrouxada. O que é da família chega
-- aos outros membros por funções SECURITY DEFINER de escopo mínimo, que
-- descobrem a família só por auth.uid() (my_family_id), conferem o papel e
-- devolvem colunas escolhidas uma a uma (nunca cartão, forma de pagamento,
-- parcela, entrada ou saldo). Dentro delas a RLS não vale: cada leitura e
-- gravação filtra a família explicitamente.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- Seção 1 — família, participantes, convites e administração
-- ============================================================================

-- 1. Família. Nunca é apagada: sem ninguém, fica encerrada (o histórico de
--    Ex-membro fica nela, RN-24).
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(regexp_replace(name, '\s+', ' ', 'g'))),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 2. Participações. Ativa = left_at vazio. A linha fica depois da saída para
--    a família continuar vendo o nome no histórico (RN-23); na exclusão do
--    cadastro perde a pessoa e o nome (RN-24).
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('admin', 'member')),
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint family_members_active_has_user check (left_at is not null or user_id is not null)
);

-- RN-26: no máximo uma família ativa por pessoa.
create unique index family_members_one_family_uidx on public.family_members (user_id) where left_at is null;
-- No máximo um administrador ativo por família (o "pelo menos um" é das funções).
create unique index family_members_one_admin_uidx on public.family_members (family_id) where role = 'admin' and left_at is null;
create index family_members_family_idx on public.family_members (family_id);

-- 3. Convites por link (RF-42). O código nunca é guardado: só o resumo
--    SHA-256. 7 dias, uma pessoa. E-mail do convidado: Plano 8.
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint family_invites_expiry check (expires_at > created_at and expires_at <= created_at + interval '7 days'),
  constraint family_invites_one_outcome check (accepted_at is null or revoked_at is null)
);

create index family_invites_family_idx on public.family_invites (family_id);

-- 4. Avisos para a família (RN-22d, RN-22e). Push e e-mail: Plano 8.
create table public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  kind text not null check (kind in ('member_left', 'member_deleted')),
  member_name text check (member_name is null or char_length(member_name) between 1 and 60),
  goal_name text check (goal_name is null or char_length(goal_name) between 1 and 40),
  amount_cents bigint check (amount_cents is null or (amount_cents > 0 and amount_cents <= 9999999999)),
  created_at timestamptz not null default now()
);

create index family_events_family_idx on public.family_events (family_id, created_at desc);

-- 5. Quem sou eu na família. SECURITY DEFINER de propósito e com escopo
--    mínimo: uma política de family_members que consultasse family_members
--    entraria em recursão infinita. Sem parâmetro; só devolvem fatos sobre
--    quem chama (auth.uid()), nunca linhas de outra pessoa.
create function public.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select fm.family_id from public.family_members fm
  where fm.user_id = (select auth.uid()) and fm.left_at is null
$$;

create function public.my_family_role() returns text
language sql stable security definer set search_path = '' as $$
  select fm.role from public.family_members fm
  where fm.user_id = (select auth.uid()) and fm.left_at is null
$$;

-- 6. Só leitura pela API. Toda gravação passa pelas funções abaixo.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.family_events enable row level security;

revoke all on public.families, public.family_members, public.family_invites, public.family_events from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.families, public.family_members, public.family_invites, public.family_events from authenticated;
-- O resumo do código nunca sai do banco.
revoke select on public.family_invites from authenticated;
grant select (id, family_id, created_at, expires_at, accepted_at, revoked_at) on public.family_invites to authenticated;

-- Ex-membro perde tudo na hora: my_family_id() só vê participação ativa.
create policy families_select on public.families
  for select to authenticated using (id = (select public.my_family_id()));
create policy family_members_select on public.family_members
  for select to authenticated using (family_id = (select public.my_family_id()));
create policy family_invites_select on public.family_invites
  for select to authenticated
  using (family_id = (select public.my_family_id()) and (select public.my_family_role()) = 'admin');
create policy family_events_select on public.family_events
  for select to authenticated using (family_id = (select public.my_family_id()));

-- 7. O nome que a família vê acompanha o perfil enquanto a pessoa participa.
--    SECURITY DEFINER: family_members não tem política de gravação.
create function public.sync_family_display_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.family_members fm set display_name = new.display_name
      where fm.user_id = new.id and fm.left_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_family_name after update of display_name on public.profiles
  for each row execute function public.sync_family_display_name();

-- 8. Criar a família (RF-41): quem cria vira administrador.
--    SECURITY DEFINER: grava em families e family_members, que não aceitam
--    gravação direta (senão qualquer um se colocaria como administrador de
--    qualquer família).
create function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_display text;
  v_family uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if public.my_family_id() is not null then
    raise exception 'Você já participa de uma família.';
  end if;
  select p.display_name into v_display from public.profiles p where p.id = v_uid;
  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family;
  -- Duas chamadas ao mesmo tempo: o índice único de uma família por pessoa barra a segunda.
  insert into public.family_members (family_id, user_id, role, display_name)
    values (v_family, v_uid, 'admin', v_display);
  return v_family;
end;
$$;

-- 9. Convidar (RF-42): só o administrador. 24 bytes aleatórios em base64url
--    (32 caracteres, 192 bits): impossível de adivinhar. O banco guarda só o
--    SHA-256. Um link por vez: o anterior ainda não usado é cancelado.
--    SECURITY DEFINER: family_invites não aceita gravação direta.
create function public.create_family_invite()
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  -- Mesma ordem de travas do aceitar (família, depois convite): sem impasse.
  perform 1 from public.families f where f.id = v_family for update;
  if (select count(*) from public.family_members fm where fm.family_id = v_family and fm.left_at is null) >= 10 then
    raise exception 'A família já está completa.';
  end if;
  update public.family_invites i set revoked_at = now()
    where i.family_id = v_family and i.accepted_at is null and i.revoked_at is null;
  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.family_invites (family_id, token_hash, created_by, expires_at)
    values (v_family, extensions.digest(v_code, 'sha256'), v_uid, v_expires);
  return query select v_code, v_expires;
end;
$$;

-- 10. Cancelar um convite pendente: só o administrador da própria família.
create function public.revoke_family_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  update public.family_invites i set revoked_at = now()
    where i.id = p_id and i.family_id = v_family and i.accepted_at is null and i.revoked_at is null;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;
end;
$$;

-- 11. Prévia do convite: só o nome da família e de quem convidou, só para
--     quem entrou, só com convite válido. Convite que não vale: nada.
create function public.invite_preview(p_code text)
returns table (family_name text, invited_by text)
language sql stable security definer set search_path = '' as $$
  select f.name, fm.display_name
  from public.family_invites i
  join public.families f on f.id = i.family_id and f.ended_at is null
  left join public.family_members fm
    on fm.family_id = i.family_id and fm.user_id = i.created_by and fm.left_at is null
  where (select auth.uid()) is not null
    and p_code ~ '^[A-Za-z0-9_-]{32}$'
    and i.token_hash = extensions.digest(p_code, 'sha256')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- 12. Aceitar (RF-42): sempre como membro (não há parâmetro de papel). Uma
--     mensagem só para todo convite que não vale (não revela se existiu).
--     Quem já participa de uma família não entra, e o convite não se gasta.
create function public.accept_family_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_invite uuid;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{32}$' then
    raise exception 'Convite inválido.';
  end if;
  select i.family_id into v_family from public.family_invites i
    where i.token_hash = extensions.digest(p_code, 'sha256');
  if v_family is null then
    raise exception 'Convite inválido.';
  end if;
  perform 1 from public.families f where f.id = v_family and f.ended_at is null for update;
  if not found then
    raise exception 'Convite inválido.';
  end if;
  select i.id into v_invite from public.family_invites i
    where i.token_hash = extensions.digest(p_code, 'sha256')
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    for update;
  if v_invite is null then
    raise exception 'Convite inválido.';
  end if;
  if public.my_family_id() is not null then
    raise exception 'Você já participa de uma família.';
  end if;
  if (select count(*) from public.family_members fm where fm.family_id = v_family and fm.left_at is null) >= 10 then
    raise exception 'A família já está completa.';
  end if;
  select p.display_name into v_display from public.profiles p where p.id = v_uid;
  insert into public.family_members (family_id, user_id, role, display_name)
    values (v_family, v_uid, 'member', v_display);
  update public.family_invites i set accepted_by = v_uid, accepted_at = now() where i.id = v_invite;
  return v_family;
end;
$$;

-- 13. Passar a administração (RN-25): quem administra vira membro, a outra
--     pessoa vira administradora. Rebaixa antes de promover (índice único).
create function public.transfer_family_admin(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for update;
  if p_user is null or p_user = v_uid or not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family and fm.user_id = p_user and fm.left_at is null
  ) then
    raise exception 'Pessoa não encontrada.';
  end if;
  update public.family_members fm set role = 'member'
    where fm.family_id = v_family and fm.user_id = v_uid and fm.left_at is null;
  update public.family_members fm set role = 'admin'
    where fm.family_id = v_family and fm.user_id = p_user and fm.left_at is null;
end;
$$;

revoke execute on function public.sync_family_display_name() from public, anon, authenticated;

revoke execute on function
  public.my_family_id(),
  public.my_family_role(),
  public.create_family(text),
  public.create_family_invite(),
  public.revoke_family_invite(uuid),
  public.invite_preview(text),
  public.accept_family_invite(text),
  public.transfer_family_admin(uuid)
from public, anon;

grant execute on function
  public.my_family_id(),
  public.my_family_role(),
  public.create_family(text),
  public.create_family_invite(),
  public.revoke_family_invite(uuid),
  public.invite_preview(text),
  public.accept_family_invite(text),
  public.transfer_family_admin(uuid)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-familia.test.ts`
Expected: PASS (sem Docker: pendente; `npx tsc --noEmit` passa).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000001_familia.sql tests/db/family-helpers.ts tests/db/plano7-familia.test.ts
git commit -m "feat(db): família, participantes, convites por link e administração" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Banco — gastos da família, contas da família e privacidade entre membros

**Files:**
- Modify: `supabase/migrations/20261001000001_familia.sql` (anexar a seção 2)
- Test: `tests/db/plano7-gastos.test.ts`

**Interfaces:**
- Consumes: seção 1 (`my_family_id`, `my_family_role`, `families`, `family_members`); `public.occurrence_due_on`, `public.installment_schedule`, `public.touch_updated_at` (planos anteriores); `tests/db/family-helpers.ts`.
- Produces (usados pelas Tasks 5, 6, 8, 11, 14):
  - `transactions.family_id`, `transactions.ex_category_key`, `transactions.ex_category_name`; `transactions.user_id` aceita nulo só em gasto confirmado da família. `recurrences.family_id`.
  - Gatilhos `transactions_family_guard` e `recurrences_family_guard` (a FK composta `(recurrence_id, user_id)` do Plano 3 **não muda**: quem paga a conta de outro membro ganha um registro novo, sem molde).
  - `generate_occurrences()` (substituída: pula os moldes da família) e `generate_family_occurrences() returns integer`.
  - Leituras da família (colunas exatas): `family_expenses(p_from date, p_to date) returns table (id uuid, effective_on date, amount_cents bigint, category_key text, category_name text, note text, author_id uuid, author_name text, created_at timestamptz)`; `family_expense(p_id uuid)` (mesmas colunas, uma linha); `family_bills() returns table (id uuid, name text, amount_cents bigint, due_on date, author_id uuid)`; `family_recurrences() returns table (id uuid, name text, amount_cents bigint, frequency text, due_day smallint, due_month smallint, author_id uuid)`.
  - Gravações: `pay_family_bill(p_id uuid) returns uuid` (o registro pago: o mesmo, se quem paga criou a conta; um novo, de quem paga, se não); `admin_update_family_expense(p_id uuid, p_amount_cents bigint, p_on date, p_note text) returns date`; `admin_delete_family_expense(p_id uuid) returns date` (data efetiva do excluído); `update_family_recurrence(p_id uuid, p_name text, p_amount_cents bigint, p_due_day integer) returns void`; `end_family_recurrence(p_id uuid) returns void`.
  - Substituídas com `p_family boolean default false` no fim: `create_recurring_transaction(…, p_card_id uuid default null, p_family boolean default false)`, `create_installment_purchase(…, p_purchased_on date, p_family boolean default false)`; `settle_installments` leva a família da compra (se quem quita ainda participa dela).
  - Mensagens novas: `'Família não encontrada.'`, `'Conta não encontrada.'`, `'Gasto não encontrado.'`, `'Período inválido.'`, `'Data inválida.'`, `'Nota inválida.'`, `'Dia inválido.'`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano7-gastos.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { categoryId, newUser, removeUsers, type TestUser } from './helpers'
import { createFamily, expense, joinFamily, todaySP } from './family-helpers'

type FamilyExpenseRow = {
  id: string; effective_on: string; amount_cents: number; category_key: string | null; category_name: string
  note: string | null; author_id: string | null; author_name: string | null; created_at: string
}

let ana: TestUser // administra
let bia: TestUser // membro
let caio: TestUser // administra outra família
let eli: TestUser // sem família
let famAna: string
let famCaio: string
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

beforeAll(async () => {
  ;[ana, bia, caio, eli] = await Promise.all(['Ana', 'Bia', 'Caio', 'Eli'].map((n) => newUser(n)))
  famAna = await createFamily(ana, 'Família Souza')
  await joinFamily(bia, ana)
  famCaio = await createFamily(caio, 'Família Caio')
})

afterAll(async () => {
  await removeUsers(ana, bia, caio, eli)
})

async function familyRows(user: TestUser, from = monthStart, to = today): Promise<FamilyExpenseRow[]> {
  const { data, error } = await user.client.rpc('family_expenses', { p_from: from, p_to: to })
  if (error) throw error
  return data as FamilyExpenseRow[]
}

async function familyBill(owner: TestUser, family: string, key: string, cents: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await owner.client.from('recurrences').insert({
    user_id: owner.id, kind: 'expense', name: 'Aluguel', amount_cents: cents, category_id: await categoryId(owner, key),
    frequency: 'monthly', due_day: 28, starts_on: monthStart, family_id: family, ...extra,
  }).select('id').single()
  if (error) throw error
  const gen = await owner.client.rpc('generate_family_occurrences')
  if (gen.error) throw gen.error
  return data.id as string
}

async function billId(user: TestUser, recurrence: string): Promise<string> {
  const { data } = await user.client.rpc('family_bills')
  const owned = await user.client.from('transactions').select('id').eq('recurrence_id', recurrence).eq('status', 'pending')
  const fromOwner = owned.data?.[0]?.id as string | undefined
  return fromOwner ?? (data as { id: string }[])[0].id
}

const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0

describe('gasto da família (RN-18, RN-19)', () => {
  test('só quem participa marca um gasto como da família; entrada nunca', async () => {
    expect(await expense(bia, 'mercado', 31240, { family_id: famAna })).toBeTruthy()
    for (const u of [eli, caio]) {
      const { error } = await u.client.from('transactions').insert({
        user_id: u.id, kind: 'expense', amount_cents: 100, category_id: await categoryId(u, 'casa'), occurred_on: today, family_id: famAna,
      })
      expect(error?.message).toContain('Família não encontrada.')
    }
    const income = await bia.client.from('transactions').insert({ user_id: bia.id, kind: 'income', amount_cents: 100, source: 'Salário', occurred_on: today, family_id: famAna })
    expect(income.error?.code).toBe('23514')
  })

  test('um registro só entra na família de quem participa dela', async () => {
    const id = await expense(bia, 'lazer', 5000)
    const other = await bia.client.from('transactions').update({ family_id: famCaio }).eq('id', id).select('id')
    expect(other.error?.message).toContain('Família não encontrada.')
    expect((await bia.client.from('transactions').update({ family_id: famAna }).eq('id', id).select('id')).data).toHaveLength(1)
    expect((await bia.client.from('transactions').update({ family_id: null }).eq('id', id).select('id')).data).toHaveLength(1)
  })
})

describe('privacidade entre membros (Review Focus 1)', () => {
  let biaFamily: string
  let biaPersonal: string
  let biaCard: string
  let biaGoal: string
  let biaPet: string

  beforeAll(async () => {
    biaCard = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Nubank', kind: 'credit', color: 'purple' }).select('id').single()).data!.id
    biaFamily = await expense(bia, 'casa', 8990, { family_id: famAna, card_id: biaCard, note: 'lâmpadas' })
    biaPersonal = await expense(bia, 'lazer', 12000, { note: 'cinema' })
    biaGoal = (await bia.client.from('goals').insert({ user_id: bia.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    biaPet = (await bia.client.from('categories').insert({ user_id: bia.id, name: 'Pet' }).select('id').single()).data!.id
    await bia.client.rpc('deposit_to_goal', { p_goal_id: biaGoal, p_amount_cents: 1000 })
    await bia.client.from('budgets').insert({ user_id: bia.id, month: monthStart, category_id: biaPet, amount_cents: 5000 })
  })

  test('a família nunca lê as tabelas pessoais dos outros — nem os gastos da família direto', async () => {
    expect((await ana.client.from('transactions').select('id').eq('id', biaFamily)).data).toEqual([])
    const all = await ana.client.from('transactions').select('user_id')
    expect((all.data ?? []).every((r) => r.user_id === ana.id)).toBe(true)
    for (const table of ['categories', 'cards', 'goals', 'goal_movements', 'budgets', 'recurrences', 'installment_plans']) {
      const { data } = await ana.client.from(table).select('id').eq('user_id', bia.id)
      expect(data ?? []).toEqual([])
    }
  })

  test('ninguém altera ou apaga registro, categoria, cartão ou meta de outra pessoa', async () => {
    expect(refused(await ana.client.from('transactions').update({ amount_cents: 1 }).eq('id', biaFamily).select())).toBe(true)
    expect(refused(await ana.client.from('transactions').delete().eq('id', biaPersonal).select())).toBe(true)
    expect(refused(await ana.client.from('categories').update({ name: 'Invadida' }).eq('id', biaPet).select())).toBe(true)
    expect(refused(await ana.client.from('cards').delete().eq('id', biaCard).select())).toBe(true)
    expect(refused(await ana.client.from('goals').update({ name: 'Invadida' }).eq('id', biaGoal).select())).toBe(true)
    expect((await ana.client.rpc('delete_category', { p_category_id: biaPet })).error?.message).toContain('Categoria não encontrada.')
    expect((await ana.client.rpc('delete_card', { p_card_id: biaCard })).error?.message).toContain('Cartão não encontrado.')
    expect((await ana.client.rpc('deposit_to_goal', { p_goal_id: biaGoal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    const own = await bia.client.from('transactions').select('amount_cents, card_id').eq('id', biaFamily).single()
    expect(own.data).toEqual({ amount_cents: 8990, card_id: biaCard })
    expect((await bia.client.from('categories').select('name').eq('id', biaPet).single()).data?.name).toBe('Pet')
  })

  test('a família vê só as colunas seguras dos gastos da família (RN-31: nada de cartão)', async () => {
    const rows = await familyRows(ana)
    const row = rows.find((r) => r.id === biaFamily)!
    expect(Object.keys(row).sort()).toEqual(['amount_cents', 'author_id', 'author_name', 'category_key', 'category_name', 'created_at', 'effective_on', 'id', 'note'])
    expect(row).toMatchObject({ amount_cents: 8990, category_key: 'casa', note: 'lâmpadas', author_id: bia.id, author_name: 'Bia', effective_on: today })
    expect(rows.some((r) => r.id === biaPersonal)).toBe(false)
    expect(await familyRows(eli)).toEqual([])
    expect((await familyRows(caio)).some((r) => r.id === biaFamily)).toBe(false)
    expect((await ana.client.rpc('family_expense', { p_id: biaFamily })).data).toHaveLength(1)
    expect((await caio.client.rpc('family_expense', { p_id: biaFamily })).data).toEqual([])
    expect((await ana.client.rpc('family_expense', { p_id: biaPersonal })).data).toEqual([])
  })

  test('categorias na família (A3): a padrão vem pela chave mesmo renomeada; a própria pelo nome', async () => {
    await bia.client.from('categories').update({ name: 'Supermercado' }).eq('id', await categoryId(bia, 'mercado'))
    const renamed = await expense(bia, 'mercado', 1000, { family_id: famAna })
    const { data: pet } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 2000, category_id: biaPet, occurred_on: today, family_id: famAna,
    }).select('id').single()
    const rows = await familyRows(ana)
    expect(rows.find((r) => r.id === renamed)).toMatchObject({ category_key: 'mercado', category_name: 'Supermercado' })
    expect(rows.find((r) => r.id === pet!.id)).toMatchObject({ category_key: null, category_name: 'Pet' })
  })

  test('período inválido é recusado', async () => {
    for (const [from, to] of [[today, monthStart === today ? plusDays(today, -1) : monthStart], ['2024-01-01', '2026-01-01'], ['1999-12-31', '2000-01-31'], [null, today]]) {
      const { error } = await ana.client.rpc('family_expenses', { p_from: from, p_to: to })
      expect(error?.message).toContain('Período inválido.')
    }
  })
})

describe('administrador e gastos da família (RN-21, RF-44)', () => {
  test('membro não edita gasto de outra pessoa; administrador edita valor, data e nota', async () => {
    const mine = await expense(ana, 'casa', 5000, { family_id: famAna })
    const theirs = await expense(bia, 'casa', 8990, { family_id: famAna })
    const byMember = await bia.client.rpc('admin_update_family_expense', { p_id: mine, p_amount_cents: 1, p_on: today, p_note: null })
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    const { data, error } = await ana.client.rpc('admin_update_family_expense', { p_id: theirs, p_amount_cents: 9990, p_on: today, p_note: '  lâmpadas  ' })
    expect(error).toBeNull()
    expect(data).toBe(today)
    expect((await bia.client.from('transactions').select('amount_cents, note').eq('id', theirs).single()).data).toEqual({ amount_cents: 9990, note: 'lâmpadas' })
  })

  test('limites da edição do administrador', async () => {
    const theirs = await expense(bia, 'casa', 1000, { family_id: famAna })
    const personal = await expense(bia, 'casa', 1000)
    const other = await expense(caio, 'casa', 1000, { family_id: famCaio })
    const plan = (await bia.client.rpc('create_installment_purchase', {
      p_amount_cents: 3000, p_count: 3, p_category_id: await categoryId(bia, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
    })).data as string
    const installment = (await bia.client.from('transactions').select('id').eq('installment_plan_id', plan).limit(1).single()).data!.id
    const cases: [string, number | null, string | null, string | null, string][] = [
      [theirs, 0, today, null, 'Valor inválido.'],
      [theirs, -1, today, null, 'Valor inválido.'],
      [theirs, 10_000_000_000, today, null, 'Valor inválido.'],
      [theirs, null, today, null, 'Valor inválido.'],
      [theirs, 100, '1999-12-31', null, 'Data inválida.'],
      [theirs, 100, plusDays(today, 366), null, 'Data inválida.'],
      [theirs, 100, null, null, 'Data inválida.'],
      [theirs, 100, today, 'x'.repeat(141), 'Nota inválida.'],
      [personal, 100, today, null, 'Gasto não encontrado.'],
      [other, 100, today, null, 'Gasto não encontrado.'],
      [installment, 100, today, null, 'Gasto não encontrado.'],
    ]
    for (const [p_id, p_amount_cents, p_on, p_note, message] of cases) {
      const { error } = await ana.client.rpc('admin_update_family_expense', { p_id, p_amount_cents, p_on, p_note })
      expect(error?.message).toContain(message)
    }
    expect((await bia.client.from('transactions').select('amount_cents').eq('id', theirs).single()).data?.amount_cents).toBe(1000)
  })

  test('administrador exclui gasto da família de outra pessoa; membro não', async () => {
    const theirs = await expense(bia, 'casa', 700, { family_id: famAna })
    const mine = await expense(ana, 'casa', 700, { family_id: famAna })
    expect((await bia.client.rpc('admin_delete_family_expense', { p_id: mine })).error?.message).toContain('Só quem administra a família pode fazer isso.')
    const { data, error } = await ana.client.rpc('admin_delete_family_expense', { p_id: theirs })
    expect(error).toBeNull()
    expect(data).toBe(today)
    expect((await bia.client.from('transactions').select('id').eq('id', theirs)).data).toEqual([])
  })
})

describe('contas da família (RN-20)', () => {
  test('qualquer membro gera e vê as contas da família; quem é de fora, não', async () => {
    const rec = await familyBill(ana, famAna, 'casa', 180000)
    await bia.client.rpc('generate_family_occurrences')
    await ana.client.rpc('generate_occurrences')
    const bills = (await bia.client.rpc('family_bills')).data as { id: string; name: string; amount_cents: number; author_id: string }[]
    const mine = bills.filter((b) => b.name === 'Aluguel' && b.amount_cents === 180000)
    expect(mine).toHaveLength(1)
    expect(mine[0].author_id).toBe(ana.id)
    expect((await ana.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toHaveLength(1)
    expect((await bia.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toEqual([])
    expect((await eli.client.rpc('family_bills')).data).toEqual([])
    expect(((await caio.client.rpc('family_bills')).data as unknown[]).length).toBe(0)
    const recs = (await bia.client.rpc('family_recurrences')).data as { id: string; author_id: string }[]
    expect(recs.find((r) => r.id === rec)?.author_id).toBe(ana.id)
    expect((await eli.client.rpc('family_recurrences')).data).toEqual([])
  })

  test('quem paga fica com o gasto: sai do Disponível dele, na categoria dele, sem cartão (Review Focus 4)', async () => {
    const card = (await ana.client.from('cards').insert({ user_id: ana.id, nickname: 'Inter', kind: 'debit', color: 'orange' }).select('id').single()).data!.id
    const rec = await familyBill(ana, famAna, 'casa', 50000, { card_id: card, name: 'Luz' })
    const id = await billId(ana, rec)
    const { data: paidId, error } = await bia.client.rpc('pay_family_bill', { p_id: id })
    expect(error).toBeNull()
    expect(paidId).not.toBe(id)
    const paid = await bia.client.from('transactions')
      .select('status, paid_on, category_id, card_id, payment_method, family_id, amount_cents, note, recurrence_id')
      .eq('id', paidId).single()
    expect(paid.data).toEqual({
      status: 'confirmed', paid_on: today, category_id: await categoryId(bia, 'casa'), card_id: null, payment_method: null,
      family_id: famAna, amount_cents: 50000, note: 'Luz', recurrence_id: null,
    })
    expect((await ana.client.from('transactions').select('id').eq('id', id)).data).toEqual([])
    expect(((await ana.client.rpc('family_bills')).data as { id: string }[]).some((b) => b.id === id)).toBe(false)
    expect((await familyRows(ana)).find((r) => r.id === paidId)).toMatchObject({ author_id: bia.id, amount_cents: 50000 })
    // A conta paga não volta a ser gerada (decisão 30).
    await ana.client.rpc('generate_family_occurrences')
    expect((await ana.client.from('transactions').select('id').eq('recurrence_id', rec)).data).toEqual([])
  })

  test('quem criou e paga continua dono, com o cartão', async () => {
    const card = (await ana.client.from('cards').insert({ user_id: ana.id, nickname: 'C6', kind: 'credit', color: 'graphite' }).select('id').single()).data!.id
    const rec = await familyBill(ana, famAna, 'assinaturas', 3990, { card_id: card, name: 'Streaming' })
    const id = await billId(ana, rec)
    const { data } = await ana.client.rpc('pay_family_bill', { p_id: id })
    expect(data).toBe(id)
    expect((await ana.client.from('transactions').select('status, card_id, paid_on').eq('id', id).single()).data).toEqual({ status: 'confirmed', card_id: card, paid_on: today })
  })

  test('pagar duas vezes, conta de outra família ou por quem é de fora não vale', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Água' })
    const recCaio = await familyBill(caio, famCaio, 'casa', 1000, { name: 'Gás' })
    const idAna = await billId(ana, recAna)
    const idCaio = await billId(caio, recCaio)
    expect((await bia.client.rpc('pay_family_bill', { p_id: idCaio })).error?.message).toContain('Conta não encontrada.')
    expect((await eli.client.rpc('pay_family_bill', { p_id: idAna })).error?.message).toContain('Conta não encontrada.')
    const both = await Promise.all([bia.client.rpc('pay_family_bill', { p_id: idAna }), ana.client.rpc('pay_family_bill', { p_id: idAna })])
    expect(both.filter((r) => r.error === null)).toHaveLength(1)
    expect(both.find((r) => r.error !== null)?.error?.message).toContain('Conta não encontrada.')
  })

  test('categoria própria vai para a de mesmo nome de quem paga; sem ela, para Outros', async () => {
    const condo = (await ana.client.from('categories').insert({ user_id: ana.id, name: 'Condomínio' }).select('id').single()).data!.id
    const rec1 = await familyBill(ana, famAna, 'casa', 1000, { category_id: condo, name: 'Condomínio' })
    const id1 = await billId(ana, rec1)
    const paid1 = (await bia.client.rpc('pay_family_bill', { p_id: id1 })).data as string
    expect((await bia.client.from('transactions').select('category_id').eq('id', paid1).single()).data?.category_id).toBe(await categoryId(bia, 'outros'))
    const anaPet = (await ana.client.from('categories').insert({ user_id: ana.id, name: 'PET' }).select('id').single()).data!.id
    const biaPet = (await bia.client.from('categories').select('id').eq('name', 'Pet').single()).data!.id
    const rec2 = await familyBill(ana, famAna, 'casa', 1000, { category_id: anaPet, name: 'Ração' })
    const id2 = await billId(ana, rec2)
    const paid2 = (await bia.client.rpc('pay_family_bill', { p_id: id2 })).data as string
    expect((await bia.client.from('transactions').select('category_id').eq('id', paid2).single()).data?.category_id).toBe(biaPet)
  })

  test('alterar e encerrar: quem criou e o administrador; membro que não criou, não', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Internet' })
    const byMember = await bia.client.rpc('update_family_recurrence', { p_id: recAna, p_name: 'X', p_amount_cents: 1, p_due_day: 1 })
    expect(byMember.error?.message).toContain('Só quem administra a família pode fazer isso.')
    expect((await ana.client.rpc('update_family_recurrence', { p_id: recAna, p_name: 'Internet nova', p_amount_cents: 12000, p_due_day: 28 })).error).toBeNull()
    const listed = ((await bia.client.rpc('family_recurrences')).data as { id: string; name: string; amount_cents: number }[]).find((r) => r.id === recAna)
    expect(listed).toMatchObject({ name: 'Internet nova', amount_cents: 12000 })
    for (const [p_name, p_amount_cents, p_due_day, message] of [['', 1, 1, 'Nome inválido.'], ['x'.repeat(41), 1, 1, 'Nome inválido.'], ['Ok', 0, 1, 'Valor inválido.'], ['Ok', 1, 0, 'Dia inválido.'], ['Ok', 1, 32, 'Dia inválido.']] as const) {
      expect((await ana.client.rpc('update_family_recurrence', { p_id: recAna, p_name, p_amount_cents, p_due_day })).error?.message).toContain(message)
    }
    const recBia = await familyBill(bia, famAna, 'casa', 1000, { name: 'Faxina' })
    expect((await caio.client.rpc('end_family_recurrence', { p_id: recBia })).error?.message).toContain('Conta não encontrada.')
    expect((await ana.client.rpc('end_family_recurrence', { p_id: recBia })).error).toBeNull()
    expect(((await bia.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === recBia)).toBe(false)
    expect((await bia.client.rpc('update_family_recurrence', { p_id: recBia, p_name: 'Faxina', p_amount_cents: 1, p_due_day: 1 })).error?.message).toContain('Conta não encontrada.')
  })

  test('ocorrência só de molde próprio, também na família; o dono não troca direto', async () => {
    const recAna = await familyBill(ana, famAna, 'casa', 1000, { name: 'Seguro' })
    const next = `${plusDays(`${today.slice(0, 7)}-15`, 31).slice(0, 7)}-01`
    const squat = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 1, category_id: await categoryId(bia, 'casa'), occurred_on: next,
      status: 'pending', due_on: next, recurrence_id: recAna, recurrence_period: next, family_id: famAna,
    })
    expect(squat.error?.code).toBe('23503')
    const id = await billId(ana, recAna)
    expect(refused(await ana.client.from('transactions').update({ user_id: bia.id }).eq('id', id).select())).toBe(true)
    expect(refused(await bia.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', id).select())).toBe(true)
  })
})

describe('parcelado, conta pelo Anotar e cartão na família (RN-31, decisão 50)', () => {
  test('parcelado da família: todas as parcelas; o cartão continua só de quem pagou; quitar leva a família', async () => {
    const card = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Visa', kind: 'credit', color: 'blue' }).select('id').single()).data!.id
    const { data: plan, error } = await bia.client.rpc('create_installment_purchase', {
      p_amount_cents: 30000, p_count: 3, p_category_id: await categoryId(bia, 'compras'), p_note: 'Geladeira',
      p_card_id: card, p_payment_method: null, p_purchased_on: today, p_family: true,
    })
    expect(error).toBeNull()
    const rows = (await bia.client.from('transactions').select('family_id, card_id').eq('installment_plan_id', plan)).data!
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.family_id === famAna && r.card_id === card)).toBe(true)
    const settled = await bia.client.rpc('settle_installments', { p_plan_id: plan, p_amount_cents: 18000 })
    expect(settled.error).toBeNull()
    expect((await bia.client.from('transactions').select('family_id').eq('id', settled.data).single()).data?.family_id).toBe(famAna)
    const noFamily = await eli.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(eli, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today, p_family: true,
    })
    expect(noFamily.error?.message).toContain('Família não encontrada.')
  })

  test('conta que se repete da família pelo Anotar; entrada da família não existe', async () => {
    const { data: tx, error } = await bia.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9900, p_category_id: await categoryId(bia, 'assinaturas'), p_source: null, p_note: 'Streaming',
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly', p_card_id: null, p_family: true,
    })
    expect(error).toBeNull()
    const row = (await bia.client.from('transactions').select('family_id, recurrence_id').eq('id', tx).single()).data!
    expect(row.family_id).toBe(famAna)
    expect((await bia.client.from('recurrences').select('family_id').eq('id', row.recurrence_id).single()).data?.family_id).toBe(famAna)
    const income = await bia.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 100, p_category_id: null, p_source: 'Salário', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly', p_card_id: null, p_family: true,
    })
    expect(income.error?.message).toContain('Família não encontrada.')
  })
})

describe('guardas antigas continuam valendo com a família', () => {
  test('excluir a categoria leva o gasto da família para Outros; a família vê Outros', async () => {
    const gifts = (await bia.client.from('categories').insert({ user_id: bia.id, name: 'Presentes' }).select('id').single()).data!.id
    const { data } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 4500, category_id: gifts, occurred_on: today, family_id: famAna,
    }).select('id').single()
    expect((await bia.client.rpc('delete_category', { p_category_id: gifts })).error).toBeNull()
    expect((await familyRows(ana)).find((r) => r.id === data!.id)).toMatchObject({ category_key: 'outros' })
  })

  test('excluir o cartão mantém o gasto da família com o mesmo valor', async () => {
    const card = (await bia.client.from('cards').insert({ user_id: bia.id, nickname: 'Débito', kind: 'debit', color: 'green' }).select('id').single()).data!.id
    const id = await expense(bia, 'mercado', 6000, { family_id: famAna, card_id: card })
    expect((await bia.client.rpc('delete_card', { p_card_id: card })).error).toBeNull()
    expect((await bia.client.from('transactions').select('amount_cents, card_id, card_deleted, family_id').eq('id', id).single()).data)
      .toEqual({ amount_cents: 6000, card_id: null, card_deleted: true, family_id: famAna })
  })
})
```

Nota: `billId` lê a ocorrência pendente pelo dono (é dele até alguém pagar). A conta vence no dia 28: se hoje já passou do dia 28, ela aparece como vencida — os testes não dependem disso.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-gastos.test.ts`
Expected: FAIL — `column "family_id" of relation "transactions" does not exist` (sem Docker: pendente).

- [ ] **Step 3: Implementação** — anexar a seção 2 a `supabase/migrations/20261001000001_familia.sql`:

```sql
-- ============================================================================
-- Seção 2 — gastos da família e contas da família
-- ============================================================================

-- 14. Gasto da família (RN-18, RN-19): continua de quem registrou (sai do
--     Disponível dele) e ganha a família. Sem dono, só o histórico de quem
--     excluiu o cadastro (RN-24): sempre confirmado e da família, com a
--     categoria guardada em ex_category_* (a dele é apagada junto).
alter table public.transactions
  alter column user_id drop not null,
  add column family_id uuid references public.families (id) on delete no action,
  add column ex_category_key text check (ex_category_key is null or char_length(ex_category_key) <= 40),
  add column ex_category_name text check (ex_category_name is null or char_length(ex_category_name) between 1 and 40),
  add constraint family_only_expense check (family_id is null or kind = 'expense'),
  add constraint ownerless_only_family_history check (user_id is not null or (family_id is not null and status = 'confirmed'));

create index transactions_family_idx on public.transactions (family_id, occurred_on) where family_id is not null;

-- 15. Conta da família (RN-20): o molde é de quem criou.
alter table public.recurrences
  add column family_id uuid references public.families (id) on delete no action,
  add constraint recurrence_family_only_expense check (family_id is null or kind = 'expense');

create index recurrences_family_idx on public.recurrences (family_id) where family_id is not null;

-- 16. Guarda da família nos registros (vale também para gravação direta).
--     Entrar na família, ou trocar de dono dentro dela: o dono precisa
--     participar dela agora. Tirar da família ou ficar sem dono (RN-24):
--     livre. SECURITY DEFINER: consulta a participação sem depender da RLS de
--     quem grava. Não devolve nada; só recusa. A FK composta
--     (recurrence_id, user_id) do Plano 3 continua valendo: uma ocorrência só
--     nasce de um molde da própria pessoa (quem paga a conta de outro membro
--     ganha um registro novo, sem molde — item 21).
create function public.transactions_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is not null and new.user_id is not null
     and (tg_op = 'INSERT' or new.family_id is distinct from old.family_id or new.user_id is distinct from old.user_id)
     and not exists (
       select 1 from public.family_members fm
       where fm.family_id = new.family_id and fm.user_id = new.user_id and fm.left_at is null
     ) then
    raise exception 'Família não encontrada.';
  end if;
  return new;
end;
$$;

create trigger transactions_family_guard before insert or update on public.transactions
  for each row execute function public.transactions_family_guard();

create function public.recurrences_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is not null
     and (tg_op = 'INSERT' or new.family_id is distinct from old.family_id)
     and not exists (
       select 1 from public.family_members fm
       where fm.family_id = new.family_id and fm.user_id = new.user_id and fm.left_at is null
     ) then
    raise exception 'Família não encontrada.';
  end if;
  return new;
end;
$$;

create trigger recurrences_family_guard before insert or update on public.recurrences
  for each row execute function public.recurrences_family_guard();

-- 17. As contas pessoais continuam sendo geradas por quem as criou; as da
--     família passam para generate_family_occurrences (item 18). Corpo igual
--     ao da migração 20260928000001, mais "rc.family_id is null".
create or replace function public.generate_occurrences() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.user_id = v_uid
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
          v_uid, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences set generated_through = v_current where id = r.id and user_id = v_uid;
  end loop;

  return v_count;
end;
$$;

-- 18. Contas da família aparecem quando qualquer membro abre o app (não só
--     quem criou). SECURITY DEFINER: grava ocorrências em nome de quem criou o
--     molde (a conta é dele até alguém pagar). Só moldes da família de quem
--     chama; mesma regra de datas de generate_occurrences.
create function public.generate_family_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.family_id = v_family
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
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.family_id = v_family;
  end loop;

  return v_count;
end;
$$;

-- 19. Gastos da família para a família (RF-43). SECURITY DEFINER: lê
--     registros de outros membros, que a RLS de transactions não mostra (e
--     não deve mostrar: lá estão cartão, forma de pagamento e parcela).
--     Devolve só estas colunas, só da família de quem chama, só gastos
--     confirmados; categoria pela chave padrão ou pelo nome (A3); o nome de
--     quem registrou vem da participação (guardado ao sair, RN-23; nulo depois
--     da exclusão do cadastro, RN-24). No máximo 367 dias por chamada.
create function public.family_expenses(p_from date, p_to date)
returns table (id uuid, effective_on date, amount_cents bigint, category_key text, category_name text,
               note text, author_id uuid, author_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366
     or p_from < date '2000-01-01' or p_to > date '2099-12-31' then
    raise exception 'Período inválido.';
  end if;
  if v_family is null then
    return;
  end if;
  return query
    select t.id, coalesce(t.paid_on, t.occurred_on), t.amount_cents,
           coalesce(c.default_key, t.ex_category_key), coalesce(c.name, t.ex_category_name, 'Outros'),
           t.note, t.user_id,
           (select fm.display_name from public.family_members fm
              where fm.family_id = t.family_id and fm.user_id = t.user_id
              order by fm.joined_at desc limit 1),
           t.created_at
    from public.transactions t
    left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
    where t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and coalesce(t.paid_on, t.occurred_on) between p_from and p_to
    order by coalesce(t.paid_on, t.occurred_on) desc, t.created_at desc, t.id;
end;
$$;

-- Um gasto da família (tela de edição do administrador). Mesmas colunas.
create function public.family_expense(p_id uuid)
returns table (id uuid, effective_on date, amount_cents bigint, category_key text, category_name text,
               note text, author_id uuid, author_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, coalesce(t.paid_on, t.occurred_on), t.amount_cents,
         coalesce(c.default_key, t.ex_category_key), coalesce(c.name, t.ex_category_name, 'Outros'),
         t.note, t.user_id,
         (select fm.display_name from public.family_members fm
            where fm.family_id = t.family_id and fm.user_id = t.user_id
            order by fm.joined_at desc limit 1),
         t.created_at
  from public.transactions t
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.id = p_id and t.family_id = public.my_family_id()
    and t.kind = 'expense' and t.status = 'confirmed'
$$;

-- 20. Contas da família a pagar (RN-20) e os moldes ativos. Mesmo motivo do
--     item 19; nada de cartão nem forma de pagamento.
create function public.family_bills()
returns table (id uuid, name text, amount_cents bigint, due_on date, author_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, coalesce(r.name, c.name), t.amount_cents, t.due_on, t.user_id
  from public.transactions t
  left join public.recurrences r on r.id = t.recurrence_id
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.family_id = public.my_family_id() and t.kind = 'expense' and t.status = 'pending'
  order by t.due_on, t.created_at, t.id
$$;

create function public.family_recurrences()
returns table (id uuid, name text, amount_cents bigint, frequency text, due_day smallint, due_month smallint, author_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, r.amount_cents, r.frequency, r.due_day, r.due_month, r.user_id
  from public.recurrences r
  where r.family_id = public.my_family_id() and r.ended_on is null
  order by r.due_day, r.name, r.id
$$;

-- 21. Marcar a conta da família como paga (RN-20): qualquer membro. O valor
--     sai do Disponível de quem pagou (A1: no dia de hoje).
--     - Quem criou a conta paga: o registro dele vira pago, como em Contas.
--     - Outro membro paga: a ocorrência de quem criou sai e nasce um registro
--       de quem pagou, confirmado, na categoria dele de mesma chave padrão (ou
--       de mesmo nome; senão Outros), sem cartão e sem forma de pagamento (quem
--       paga não disse como), com o nome da conta na nota, sem molde. A conta
--       não volta a ser gerada (decisão 30: a geração só olha meses depois de
--       generated_through).
--     SECURITY DEFINER: a ocorrência é de outra pessoa. Dois pagamentos ao
--     mesmo tempo: o segundo espera a trava e não encontra mais a conta.
create function public.pay_family_bill(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tx record;
  v_key text;
  v_name text;
  v_mine uuid;
  v_new uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Conta não encontrada.';
  end if;
  select t.user_id, t.category_id, t.amount_cents, t.due_on, t.note, r.name as bill_name into v_tx
    from public.transactions t
    left join public.recurrences r on r.id = t.recurrence_id
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'pending'
    for update of t;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if v_tx.user_id = v_uid then
    update public.transactions t set status = 'confirmed', paid_on = v_today where t.id = p_id;
    return p_id;
  end if;

  select c.default_key, c.name into v_key, v_name
    from public.categories c where c.id = v_tx.category_id and c.user_id = v_tx.user_id;
  select c.id into v_mine from public.categories c
    where c.user_id = v_uid
      and ((v_key is not null and c.default_key = v_key) or (v_key is null and lower(c.name) = lower(v_name)));
  if v_mine is null then
    select c.id into v_mine from public.categories c where c.user_id = v_uid and c.default_key = 'outros';
  end if;

  delete from public.transactions t where t.id = p_id;
  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, occurred_on, status, due_on, paid_on, family_id
  ) values (
    v_uid, 'expense', v_tx.amount_cents, v_mine, coalesce(v_tx.note, v_tx.bill_name), v_tx.due_on,
    'confirmed', v_tx.due_on, v_today, v_family
  ) returning id into v_new;
  return v_new;
end;
$$;

-- 22. Administrador edita valor, data e nota de um gasto da família (RN-21,
--     RF-44); a categoria continua a de quem registrou. Parcelas e gastos
--     pagos com meta ficam de fora. Data como no Extrato (decisão 4): até 1 ano
--     à frente; conta paga: o dia do pagamento, até hoje.
--     SECURITY DEFINER: o registro pode ser de outra pessoa (ou de Ex-membro).
create function public.admin_update_family_expense(p_id uuid, p_amount_cents bigint, p_on date, p_note text)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_paid date;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if v_note is not null and char_length(v_note) > 140 then
    raise exception 'Nota inválida.';
  end if;
  select t.paid_on into v_paid from public.transactions t
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and t.installment_plan_id is null and t.goal_id is null
    for update;
  if not found then
    raise exception 'Gasto não encontrado.';
  end if;
  if p_on is null or p_on < date '2000-01-01' or p_on > v_today + 365 or (v_paid is not null and p_on > v_today) then
    raise exception 'Data inválida.';
  end if;
  update public.transactions t set
    amount_cents = p_amount_cents,
    note = v_note,
    occurred_on = case when v_paid is null then p_on else t.occurred_on end,
    paid_on = case when v_paid is null then null else p_on end
  where t.id = p_id;
  return p_on;
end;
$$;

create function public.admin_delete_family_expense(p_id uuid) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_on date;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  delete from public.transactions t
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and t.installment_plan_id is null and t.goal_id is null
    returning coalesce(t.paid_on, t.occurred_on) into v_on;
  if v_on is null then
    raise exception 'Gasto não encontrado.';
  end if;
  return v_on;
end;
$$;

-- 23. Alterar e encerrar a conta da família: quem criou e o administrador
--     (etapa-3 §4). Mesmas regras de update_recurrence/end_recurrence
--     (decisões 36 e 37), sem trocar a categoria (é de quem criou).
create function public.update_family_recurrence(p_id uuid, p_name text, p_amount_cents bigint, p_due_day integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select r.user_id into v_owner from public.recurrences r
    where r.id = p_id and v_family is not null and r.family_id = v_family and r.ended_on is null
    for update;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_owner <> v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_due_day is null or p_due_day not between 1 and 31 then
    raise exception 'Dia inválido.';
  end if;
  update public.recurrences r set name = v_name, amount_cents = p_amount_cents, due_day = p_due_day
    where r.id = p_id;
  update public.transactions t set
    amount_cents = p_amount_cents,
    due_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.due_on end,
    occurred_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.occurred_on end
  where t.recurrence_id = p_id and t.family_id = v_family and t.status = 'pending' and t.due_on >= v_today;
end;
$$;

create function public.end_family_recurrence(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select r.user_id into v_owner from public.recurrences r
    where r.id = p_id and v_family is not null and r.family_id = v_family and r.ended_on is null
    for update;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_owner <> v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  update public.recurrences r set ended_on = v_today where r.id = p_id;
  delete from public.transactions t
    where t.recurrence_id = p_id and t.family_id = v_family and t.status = 'pending' and t.due_on > v_today;
end;
$$;

-- 24. Anotar com "Gasto da família": conta que se repete e parcelado ganham
--     p_family (decisão 50 deixou o parcelado da família para este plano).
--     Corpos iguais aos da migração 20260928000001, mais a família. Entrada
--     nunca é da família (RN-19).
drop function public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid);

create function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text, p_card_id uuid default null,
  p_family boolean default false
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
  v_payment text := case when p_card_id is null then p_payment_method end;
  v_family uuid := case when coalesce(p_family, false) then public.my_family_id() end;
  v_name text;
  v_rec uuid;
  v_tx uuid;
  v_done boolean := p_occurred_on <= v_today;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if coalesce(p_family, false) and (v_family is null or p_kind is distinct from 'expense') then
    raise exception 'Família não encontrada.';
  end if;

  if p_kind = 'expense' then
    select c.name into v_name from public.categories c where c.id = p_category_id and c.user_id = v_uid;
    if v_name is null then
      raise exception 'Categoria não encontrada.';
    end if;
    v_name := coalesce(v_note, v_name);
  else
    if p_card_id is not null then
      raise exception 'Cartão não encontrado.';
    end if;
    v_name := coalesce(nullif(btrim(p_source), ''), 'Entrada');
  end if;

  insert into public.recurrences (
    user_id, kind, name, amount_cents, category_id, source, payment_method, card_id,
    frequency, due_day, due_month, starts_on, generated_through, note, family_id
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, v_payment, p_card_id,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period, nullif(left(v_note, 140), ''), v_family
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period, family_id
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, v_payment, p_card_id,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period, v_family
  ) returning id into v_tx;

  return v_tx;
end;
$$;

drop function public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date);

create function public.create_installment_purchase(
  p_amount_cents bigint, p_count integer, p_category_id uuid, p_note text,
  p_card_id uuid, p_payment_method text, p_purchased_on date, p_family boolean default false
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_family uuid := case when coalesce(p_family, false) then public.my_family_id() end;
  v_plan uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if coalesce(p_family, false) and v_family is null then
    raise exception 'Família não encontrada.';
  end if;
  if p_count is null or p_count < 2 or p_count > 48 or p_amount_cents is null or p_amount_cents < p_count then
    raise exception 'Parcelas inválidas.';
  end if;
  if p_purchased_on is null or p_purchased_on > v_today or p_purchased_on < date '2000-01-01' then
    raise exception 'Data inválida.';
  end if;
  if not exists (select 1 from public.categories c where c.id = p_category_id and c.user_id = v_uid) then
    raise exception 'Categoria não encontrada.';
  end if;
  if p_card_id is not null and not exists (select 1 from public.cards k where k.id = p_card_id and k.user_id = v_uid) then
    raise exception 'Cartão não encontrado.';
  end if;

  insert into public.installment_plans (user_id, total_cents, installment_count, purchased_on)
    values (v_uid, p_amount_cents, p_count, p_purchased_on)
    returning id into v_plan;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, payment_method, card_id,
    occurred_on, installment_plan_id, installment_number, installment_count, family_id
  )
  select
    v_uid, 'expense', s.cents, p_category_id, nullif(btrim(p_note), ''),
    case when p_card_id is null then p_payment_method end, p_card_id,
    s.on_date, v_plan, s.installment_no, p_count, v_family
  from public.installment_schedule(p_amount_cents, p_count, p_purchased_on) s;

  return v_plan;
end;
$$;

-- Quitar leva a família da compra, se quem quita ainda participa dela
-- (ex-membro quita como gasto pessoal). Corpo igual ao da migração
-- 20260928000001, mais family_id.
create or replace function public.settle_installments(p_plan_id uuid, p_amount_cents bigint) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_first record;
  v_count integer;
  v_tx uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.installment_plans p
    where p.id = p_plan_id and p.user_id = v_uid and p.status = 'active'
    for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;

  select t.category_id, t.note, t.payment_method, t.card_id, t.card_deleted, t.family_id into v_first
    from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid and t.installment_number is not null
    order by t.installment_number
    limit 1;

  delete from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid
      and t.installment_number is not null and t.occurred_on > v_today;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma parcela futura.';
  end if;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, payment_method, card_id, card_deleted,
    occurred_on, installment_plan_id, family_id
  ) values (
    v_uid, 'expense', p_amount_cents, v_first.category_id, v_first.note, v_first.payment_method,
    v_first.card_id, v_first.card_deleted, v_today, p_plan_id,
    case when v_first.family_id = public.my_family_id() then v_first.family_id end
  ) returning id into v_tx;

  update public.installment_plans p set status = 'settled', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;

  return v_tx;
end;
$$;

revoke execute on function public.transactions_family_guard(), public.recurrences_family_guard()
from public, anon, authenticated;

revoke execute on function
  public.generate_family_occurrences(),
  public.family_expenses(date, date),
  public.family_expense(uuid),
  public.family_bills(),
  public.family_recurrences(),
  public.pay_family_bill(uuid),
  public.admin_update_family_expense(uuid, bigint, date, text),
  public.admin_delete_family_expense(uuid),
  public.update_family_recurrence(uuid, text, bigint, integer),
  public.end_family_recurrence(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid, boolean),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date, boolean)
from public, anon;

grant execute on function
  public.generate_family_occurrences(),
  public.family_expenses(date, date),
  public.family_expense(uuid),
  public.family_bills(),
  public.family_recurrences(),
  public.pay_family_bill(uuid),
  public.admin_update_family_expense(uuid, bigint, date, text),
  public.admin_delete_family_expense(uuid),
  public.update_family_recurrence(uuid, text, bigint, integer),
  public.end_family_recurrence(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid, boolean),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date, boolean)
to authenticated;
```

Nota: `settle_installments` é `create or replace` (mesma assinatura): mantém dono e permissões. As chamadas antigas de `create_recurring_transaction`/`create_installment_purchase` sem `p_family` continuam valendo (padrão `false`) — `tests/db/plano3.test.ts` e `plano4.test.ts` rodam sem mudança.

- [ ] **Step 4: Rodar e ver passar (e nada antigo quebrou)**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-familia.test.ts tests/db/plano7-gastos.test.ts tests/db/plano3.test.ts tests/db/plano4.test.ts tests/db/rls.test.ts`
Expected: PASS (sem Docker: pendente).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000001_familia.sql tests/db/plano7-gastos.test.ts
git commit -m "feat(db): gastos e contas da família, colunas seguras e guardas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Banco — metas da família

**Files:**
- Modify: `supabase/migrations/20261001000001_familia.sql` (anexar a seção 3)
- Test: `tests/db/plano7-metas.test.ts`

**Interfaces:**
- Consumes: seções 1–2; `public.goals`, `public.goal_movements`, `public.goal_balance`, as guardas do Plano 5 (`goals_guard`, `goal_movements_guard`, `transactions_goal_link_guard`, `goal_movements_use_delete_guard`).
- Produces (usados pelas Tasks 5, 6, 9, 12, 14):
  - `goals.family_id`, `goals.created_by`; meta da família = `user_id` nulo + `family_id`. Política nova `goals_family_select` (quem participa vê as metas da família). As políticas antigas de `goals` (`user_id = auth.uid()`) nunca alcançam meta da família: **ninguém grava meta da família direto**.
  - `goal_movements.user_id` aceita nulo só em `use` (Task 5). FKs trocadas: `goal_movements (goal_id) → goals`, `goal_movements (transaction_id) → transactions`, `transactions (goal_id) → goals`; índice único `(transaction_id, user_id)` no lugar de `(transaction_id)`. Políticas `goal_movements_insert` e `goal_movements_delete_use` só em meta **pessoal** da própria pessoa.
  - Guardas reescritas (mesmos nomes e mensagens; as três de movimento passam a `security definer`).
  - `family_goal_totals() returns table (goal_id uuid, saved_cents bigint)` — só o total de cada meta da família de quem chama (A4 B).
  - `create_family_goal(p_name text, p_target_cents bigint, p_deadline date) returns uuid`; `update_family_goal(p_id uuid, p_name text, p_target_cents bigint, p_deadline date) returns void` (quem criou ou o administrador).
  - `deposit_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint` e `withdraw_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint` (devolvem a própria parte depois).
  - `use_family_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid) returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)` (só o administrador; divisão = `splitFamilyUse`); `delete_family_goal_use(p_transaction_id uuid) returns uuid` (só o administrador; devolve a meta); `delete_family_goal(p_goal_id uuid) returns void` (só o administrador; A6 A).
  - Mensagem nova: `'Prazo inválido.'`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano7-metas.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, categoryId, newUser, removeUsers, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'

let ana: TestUser // administra
let bia: TestUser // membro
let eva: TestUser // membro
let caio: TestUser // sem família
let dani: TestUser // administra outra família
let famAna: string
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`

beforeAll(async () => {
  ;[ana, bia, eva, caio, dani] = await Promise.all(['Ana', 'Bia', 'Eva', 'Caio', 'Dani'].map((n) => newUser(n)))
  famAna = await createFamily(ana, 'Família Souza')
  await joinFamily(bia, ana)
  await joinFamily(eva, ana)
  await createFamily(dani, 'Família Dani')
})

afterAll(async () => {
  await removeUsers(ana, bia, eva, caio, dani)
})

async function familyGoal(user: TestUser = bia, target = 1_000_000, name = 'Reforma da cozinha'): Promise<string> {
  const { data, error } = await user.client.rpc('create_family_goal', { p_name: name, p_target_cents: target, p_deadline: null })
  if (error) throw error
  return data as string
}
async function deposit(user: TestUser, goal: string, cents: number) {
  const { error } = await user.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: cents })
  if (error) throw error
}
async function part(user: TestUser, goal: string): Promise<number> {
  return Number((await user.client.rpc('goal_balance', { p_goal_id: goal })).data)
}
async function total(user: TestUser, goal: string): Promise<number | undefined> {
  const { data } = await user.client.rpc('family_goal_totals')
  const row = (data as { goal_id: string; saved_cents: number }[] | null)?.find((r) => r.goal_id === goal)
  return row === undefined ? undefined : Number(row.saved_cents)
}
async function uses(goal: string) {
  const { data } = await admin.from('goal_movements').select('user_id, amount_cents, transaction_id').eq('goal_id', goal).eq('kind', 'use').order('user_id')
  return (data ?? []).map((m) => ({ ...m, amount_cents: Number(m.amount_cents) }))
}
const refused = (r: { error: unknown; data: unknown }) => r.error !== null || ((r.data as unknown[] | null) ?? []).length === 0
const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'

describe('criar e editar a meta da família (RF-25)', () => {
  test('qualquer membro cria; todos veem; quem é de fora, não', async () => {
    const id = await familyGoal(bia)
    for (const u of [ana, bia, eva]) {
      const { data } = await u.client.from('goals').select('user_id, family_id, created_by, name, status').eq('id', id)
      expect(data).toEqual([{ user_id: null, family_id: famAna, created_by: bia.id, name: 'Reforma da cozinha', status: 'active' }])
    }
    expect((await caio.client.from('goals').select('id').eq('id', id)).data).toEqual([])
    expect((await dani.client.from('goals').select('id').eq('id', id)).data).toEqual([])
    expect((await caio.client.rpc('create_family_goal', { p_name: 'X', p_target_cents: 100, p_deadline: null })).error?.message).toContain('Família não encontrada.')
  })

  test('limites: nome, valor e prazo', async () => {
    const cases: [string | null, number | null, string | null, string][] = [
      ['', 100, null, 'Nome inválido.'],
      ['x'.repeat(41), 100, null, 'Nome inválido.'],
      ['Ok', 0, null, 'Valor inválido.'],
      ['Ok', 10_000_000_000, null, 'Valor inválido.'],
      ['Ok', 100, `${today.slice(0, 7)}-15`, 'Prazo inválido.'],
      ['Ok', 100, '2020-01-01', 'Prazo inválido.'],
      ['Ok', 100, '2100-01-01', 'Prazo inválido.'],
    ]
    for (const [p_name, p_target_cents, p_deadline, message] of cases) {
      expect((await bia.client.rpc('create_family_goal', { p_name, p_target_cents, p_deadline })).error?.message).toContain(message)
    }
    expect((await bia.client.rpc('create_family_goal', { p_name: 'Ok', p_target_cents: 100, p_deadline: monthStart })).error).toBeNull()
  })

  test('editar: quem criou e o administrador; outro membro, não', async () => {
    const id = await familyGoal(bia, 500000, 'Viagem')
    const args = { p_id: id, p_name: 'Viagem de férias', p_target_cents: 600000, p_deadline: null }
    expect((await eva.client.rpc('update_family_goal', args)).error?.message).toContain(ADMIN_ONLY)
    expect((await caio.client.rpc('update_family_goal', args)).error?.message).toContain('Meta não encontrada.')
    expect((await bia.client.rpc('update_family_goal', args)).error).toBeNull()
    expect((await ana.client.rpc('update_family_goal', { ...args, p_target_cents: 700000 })).error).toBeNull()
    expect((await eva.client.from('goals').select('name, target_cents').eq('id', id).single()).data).toEqual({ name: 'Viagem de férias', target_cents: 700000 })
  })

  test('meta da família não é criada, editada nem excluída direto — nem pelo administrador', async () => {
    const id = await familyGoal(bia)
    expect((await bia.client.from('goals').insert({ family_id: famAna, name: 'Direto', target_cents: 100 })).error).not.toBeNull()
    expect(refused(await bia.client.from('goals').update({ name: 'Invadida' }).eq('id', id).select())).toBe(true)
    expect(refused(await ana.client.from('goals').update({ deleted_on: today }).eq('id', id).select())).toBe(true)
    expect((await ana.client.from('goals').select('name, deleted_on').eq('id', id).single()).data).toEqual({ name: 'Reforma da cozinha', deleted_on: null })
  })
})

describe('guardar e tirar a própria parte (RN-22, RN-22a, A4 B)', () => {
  let goal: string
  beforeAll(async () => {
    goal = await familyGoal(bia)
    await deposit(ana, goal, 100000)
    await deposit(bia, goal, 300000)
  })

  test('todos veem o total; cada um vê só a própria parte (Review Focus 1)', async () => {
    expect(await total(ana, goal)).toBe(400000)
    expect(await total(eva, goal)).toBe(400000)
    expect(await part(ana, goal)).toBe(100000)
    expect(await part(bia, goal)).toBe(300000)
    expect(await part(eva, goal)).toBe(0)
    const seen = await ana.client.from('goal_movements').select('user_id').eq('goal_id', goal)
    expect((seen.data ?? []).every((m) => m.user_id === ana.id)).toBe(true)
    expect(await total(caio, goal)).toBeUndefined()
    expect(await total(dani, goal)).toBeUndefined()
  })

  test('tirar só até a própria parte', async () => {
    const tooMuch = await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 300001 })
    expect(tooMuch.error?.message).toContain('Valor maior que o guardado.')
    const { data, error } = await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 100000 })
    expect(error).toBeNull()
    expect(Number(data)).toBe(200000)
    expect(await part(ana, goal)).toBe(100000)
    expect(await total(ana, goal)).toBe(300000)
  })

  test('quem é de fora não guarda nem tira; as funções pessoais não servem para meta da família', async () => {
    for (const u of [caio, dani]) {
      expect((await u.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 100 })).error?.message).toContain('Meta não encontrada.')
      expect((await u.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 100 })).error?.message).toContain('Meta não encontrada.')
    }
    const personal: [string, Record<string, unknown>][] = [
      ['deposit_to_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: goal, p_amount_cents: 100 }],
      ['use_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: await categoryId(bia, 'casa') }],
      ['delete_goal', { p_goal_id: goal }],
    ]
    for (const [fn, args] of personal) expect((await bia.client.rpc(fn, args)).error?.message).toContain('Meta não encontrada.')
    expect(await total(ana, goal)).toBe(300000)
  })

  test('movimento gravado direto na meta da família é recusado', async () => {
    const direct = await bia.client.from('goal_movements').insert({ user_id: bia.id, goal_id: goal, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(direct.error).not.toBeNull()
    const asOther = await bia.client.from('goal_movements').insert({ user_id: ana.id, goal_id: goal, kind: 'withdraw', amount_cents: 100, occurred_on: today })
    expect(asOther.error).not.toBeNull()
    expect(await total(ana, goal)).toBe(300000)
  })

  test('o Guardado de cada pessoa inclui a parte dela na meta da família', async () => {
    const { data } = await bia.client.from('goal_movements').select('kind, amount_cents').eq('user_id', bia.id).eq('goal_id', goal)
    const saved = (data ?? []).reduce((s, m) => s + (m.kind === 'deposit' ? 1 : -1) * Number(m.amount_cents), 0)
    expect(saved).toBe(200000)
  })
})

describe('usar o dinheiro da meta da família (RN-22b, RN-22c, Review Focus 4)', () => {
  test('só o administrador usa', async () => {
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 1000)
    const r = await bia.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 1000, p_category_id: await categoryId(bia, 'casa') })
    expect(r.error?.message).toContain(ADMIN_ONLY)
  })

  test('divide na proporção do guardado; a diferença sai de quem usou; uma compra só na família', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 100000)
    await deposit(bia, goal, 200000)
    const { data, error } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 350000, p_category_id: await categoryId(ana, 'casa') })
    expect(error).toBeNull()
    const r = (data as { tx_id: string; funded_cents: number; leftover_cents: number }[])[0]
    expect([Number(r.funded_cents), Number(r.leftover_cents)]).toEqual([300000, 0])
    const tx = await ana.client.from('transactions').select('user_id, amount_cents, goal_funded_cents, family_id, goal_id, occurred_on').eq('id', r.tx_id).single()
    expect(tx.data).toEqual({ user_id: ana.id, amount_cents: 350000, goal_funded_cents: 300000, family_id: famAna, goal_id: goal, occurred_on: today })
    expect(await uses(goal)).toEqual(
      [{ user_id: ana.id, amount_cents: 100000, transaction_id: r.tx_id }, { user_id: bia.id, amount_cents: 200000, transaction_id: r.tx_id }]
        .sort((x, y) => x.user_id.localeCompare(y.user_id)),
    )
    const own = await bia.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', goal).eq('kind', 'use')
    expect(own.data?.map((m) => Number(m.amount_cents))).toEqual([200000])
    expect((await bia.client.from('goals').select('status, used_on').eq('id', goal).single()).data).toEqual({ status: 'used', used_on: today })
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    const { data: rows } = await eva.client.rpc('family_expenses', { p_from: monthStart, p_to: today })
    expect((rows as { id: string; amount_cents: number; author_id: string }[]).find((x) => x.id === r.tx_id)).toMatchObject({ amount_cents: 350000, author_id: ana.id })
  })

  test('centavos que sobram vão para os maiores restos (mesma regra de splitFamilyUse)', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1)
    await deposit(bia, goal, 2)
    const { data } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2, p_category_id: await categoryId(ana, 'casa') })
    const r = (data as { tx_id: string; leftover_cents: number }[])[0]
    expect(Number(r.leftover_cents)).toBe(1)
    const byUser = Object.fromEntries((await uses(goal)).map((m) => [m.user_id, m.amount_cents]))
    expect(byUser).toEqual({ [ana.id]: 1, [bia.id]: 1 })
    expect(await part(bia, goal)).toBe(1)
  })

  test('a sobra fica com cada um, na mesma proporção, e cada um tira a sua', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 1000)
    await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 1000, p_category_id: await categoryId(ana, 'casa') })
    expect([await part(ana, goal), await part(bia, goal), await total(eva, goal)]).toEqual([500, 500, 1000])
    expect((await bia.client.rpc('withdraw_family_goal', { p_goal_id: goal, p_amount_cents: 500 })).error).toBeNull()
    expect(await total(ana, goal)).toBe(500)
  })

  test('meta sem dinheiro, categoria de outra pessoa ou valor fora do limite', async () => {
    const empty = await familyGoal(bia)
    const casa = await categoryId(ana, 'casa')
    expect((await ana.client.rpc('use_family_goal', { p_goal_id: empty, p_amount_cents: 100, p_category_id: casa })).error?.message).toContain('Meta sem dinheiro guardado.')
    const goal = await familyGoal(bia)
    await deposit(bia, goal, 100)
    expect((await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 100, p_category_id: await categoryId(bia, 'casa') })).error?.message).toContain('Categoria não encontrada.')
    for (const cents of [0, -1, 10_000_000_000, null]) {
      expect((await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: cents, p_category_id: casa })).error?.message).toContain('Valor inválido.')
    }
  })

  test('um membro não apaga a própria parte do uso direto; o administrador desfaz o uso e o dinheiro volta', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 3000)
    const { data } = await ana.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2000, p_category_id: await categoryId(ana, 'casa') })
    const txId = (data as { tx_id: string }[])[0].tx_id
    const del = await bia.client.from('goal_movements').delete().eq('goal_id', goal).eq('kind', 'use').select()
    expect(refused(del)).toBe(true)
    expect(await uses(goal)).toHaveLength(2)
    expect((await bia.client.rpc('delete_family_goal_use', { p_transaction_id: txId })).error?.message).toContain(ADMIN_ONLY)
    const { data: back, error } = await ana.client.rpc('delete_family_goal_use', { p_transaction_id: txId })
    expect(error).toBeNull()
    expect(back).toBe(goal)
    expect([await part(ana, goal), await part(bia, goal)]).toEqual([1000, 3000])
    expect((await ana.client.from('transactions').select('id').eq('id', txId)).data).toEqual([])
    expect((await bia.client.from('goals').select('status').eq('id', goal).single()).data?.status).toBe('active')
  })
})

describe('excluir a meta da família (A6 A)', () => {
  test('só o administrador exclui; cada parte volta hoje para quem guardou', async () => {
    const goal = await familyGoal(bia)
    await deposit(ana, goal, 1000)
    await deposit(bia, goal, 2500)
    expect((await bia.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain(ADMIN_ONLY)
    expect((await caio.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain(ADMIN_ONLY)
    expect((await ana.client.rpc('delete_family_goal', { p_goal_id: goal })).error).toBeNull()
    const back = await bia.client.from('goal_movements').select('kind, amount_cents, occurred_on').eq('goal_id', goal).eq('kind', 'withdraw')
    expect(back.data).toEqual([{ kind: 'withdraw', amount_cents: 2500, occurred_on: today }])
    expect([await part(ana, goal), await part(bia, goal), await total(eva, goal)]).toEqual([0, 0, 0])
    expect((await eva.client.from('goals').select('deleted_on').eq('id', goal).single()).data?.deleted_on).toBe(today)
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    expect((await ana.client.rpc('delete_family_goal', { p_goal_id: goal })).error?.message).toContain('Meta não encontrada.')
  })
})

describe('metas individuais continuam privadas e com as mesmas regras', () => {
  test('a família não vê a meta individual; guardar, usar e desfazer seguem como no Plano 5', async () => {
    const { data: goal } = await bia.client.from('goals').insert({ user_id: bia.id, name: 'Só minha', target_cents: 10000 }).select('id').single()
    expect((await ana.client.from('goals').select('id').eq('id', goal!.id)).data).toEqual([])
    expect(await total(ana, goal!.id)).toBeUndefined()
    expect((await bia.client.rpc('deposit_to_goal', { p_goal_id: goal!.id, p_amount_cents: 1000 })).error).toBeNull()
    const used = await bia.client.rpc('use_goal', { p_goal_id: goal!.id, p_amount_cents: 500, p_category_id: await categoryId(bia, 'lazer') })
    expect(used.error).toBeNull()
    const txId = (used.data as { tx_id: string }[])[0].tx_id
    expect((await bia.client.from('transactions').select('family_id').eq('id', txId).single()).data?.family_id).toBeNull()
    expect((await bia.client.rpc('delete_goal_use', { p_transaction_id: txId })).error).toBeNull()
    expect(await part(bia, goal!.id)).toBe(1000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-metas.test.ts`
Expected: FAIL — `Could not find the function public.create_family_goal` (sem Docker: pendente).

- [ ] **Step 3: Implementação** — anexar a seção 3 a `supabase/migrations/20261001000001_familia.sql`:

```sql
-- ============================================================================
-- Seção 3 — metas da família (RF-25, RN-22 a RN-22c, A4 B, A6 A)
-- ============================================================================

-- 25. Meta da família: sem dono (user_id nulo) e com família. Cada parte é
--     dos movimentos de quem guardou (goal_movements.user_id). As políticas
--     do Plano 5 (user_id = auth.uid()) nunca alcançam meta da família, então
--     ninguém a cria, altera ou exclui direto: só pelas funções abaixo.
alter table public.goals
  alter column user_id drop not null,
  add column family_id uuid references public.families (id) on delete no action,
  add column created_by uuid references auth.users (id) on delete set null,
  add constraint goal_owner_or_family check ((user_id is null) <> (family_id is null));

create index goals_family_idx on public.goals (family_id) where family_id is not null;

create policy goals_family_select on public.goals
  for select to authenticated
  using (family_id is not null and family_id = (select public.my_family_id()));

-- A guarda só olha as colunas que ela confere: apagar quem criou (created_by,
-- na exclusão do cadastro) não pode esbarrar em "Meta excluída.".
drop trigger goals_guard on public.goals;
create trigger goals_guard
  before insert or update of user_id, family_id, name, target_cents, deadline, status, used_on, deleted_on
  on public.goals
  for each row execute function public.goals_guard();

-- 26. Movimentos: a FK composta (goal_id, user_id) do Plano 5 impediria o
--     movimento de um membro numa meta sem dono; vira FK simples, e o que ela
--     garantia (só na própria meta) passa para a política de inserção e para
--     goal_movements_guard (item 29). O uso da meta da família tem um
--     movimento por membro na mesma compra: o índice único vira
--     (transaction_id, user_id). user_id nulo só no "use" de quem excluiu o
--     cadastro (RN-22e, seção 4).
alter table public.goal_movements
  alter column user_id drop not null,
  add constraint goal_movement_ownerless_only_use check (user_id is not null or kind = 'use'),
  drop constraint goal_movements_goal_fk,
  add constraint goal_movements_goal_fk foreign key (goal_id)
    references public.goals (id) on delete no action,
  drop constraint goal_movements_transaction_fk,
  add constraint goal_movements_transaction_fk foreign key (transaction_id)
    references public.transactions (id) on delete no action;

drop index public.goal_movements_transaction_uidx;
create unique index goal_movements_transaction_user_uidx
  on public.goal_movements (transaction_id, user_id) where transaction_id is not null;

drop policy goal_movements_insert on public.goal_movements;
create policy goal_movements_insert on public.goal_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

drop policy goal_movements_delete_use on public.goal_movements;
create policy goal_movements_delete_use on public.goal_movements
  for delete to authenticated
  using (
    user_id = (select auth.uid()) and kind = 'use'
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

-- 27. O gasto do uso da meta da família é de quem usou (administrador) e a
--     meta não tem dono: a FK composta (goal_id, user_id) vira FK simples; o
--     vínculo continua conferido por transactions_goal_link_guard (item 30).
alter table public.transactions
  drop constraint transactions_goal_fk,
  add constraint transactions_goal_fk foreign key (goal_id)
    references public.goals (id) on delete no action;

-- 28. Guarda da meta (Plano 5), agora com a família: dono e família nunca
--     mudam; excluir meta da família só pelo administrador (A6 A) e só com
--     todas as partes zeradas; "usada" confere o uso de qualquer membro.
create or replace function public.goals_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
  v_has_use boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.used_on is not null or new.deleted_on is not null then
      raise exception 'Meta inválida.';
    end if;
    return new;
  end if;

  if old.deleted_on is not null then
    raise exception 'Meta excluída.';
  end if;
  if new.user_id is distinct from old.user_id or new.family_id is distinct from old.family_id then
    raise exception 'Meta inválida.';
  end if;

  if new.deleted_on is distinct from old.deleted_on then
    if new.deleted_on <> v_today then
      raise exception 'Meta inválida.';
    end if;
    if new.family_id is not null
       and (public.my_family_id() is distinct from new.family_id or public.my_family_role() is distinct from 'admin') then
      raise exception 'Meta inválida.';
    end if;
    select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)
      into v_balance
      from public.goal_movements m
      where m.goal_id = new.id and m.user_id is not null
        and (new.family_id is not null or m.user_id = new.user_id);
    if v_balance <> 0 then
      raise exception 'Meta ainda tem dinheiro guardado.';
    end if;
  end if;

  if new.status <> old.status then
    select exists (
      select 1 from public.goal_movements m
      where m.goal_id = new.id and m.kind = 'use'
        and (new.family_id is not null or m.user_id = new.user_id)
    ) into v_has_use;
    if new.status = 'used' and not v_has_use then
      raise exception 'Meta inválida.';
    end if;
    if new.status = 'active' and v_has_use then
      raise exception 'Meta inválida.';
    end if;
  end if;

  return new;
end;
$$;

-- 29. Guarda do guardado (Plano 5), agora com a família. SECURITY DEFINER:
--     confere a participação e a compra de outra pessoa (o gasto do uso é do
--     administrador), que a RLS de quem grava não mostra. Não devolve nada.
--     Meta pessoal: só a dona. Meta da família: só quem participa agora; o
--     "use" aponta para a compra da família dessa meta (a soma das partes é
--     conferida no fim, pelo item 30).
create or replace function public.goal_movements_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_goal record;
  v_balance bigint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.user_id is null or new.occurred_on <> v_today then
    raise exception 'Movimento inválido.';
  end if;

  select g.status, g.deleted_on, g.user_id, g.family_id into v_goal
    from public.goals g where g.id = new.goal_id
    for update;
  if not found or v_goal.deleted_on is not null then
    raise exception 'Meta não encontrada.';
  end if;
  if v_goal.family_id is null then
    if v_goal.user_id is distinct from new.user_id then
      raise exception 'Meta não encontrada.';
    end if;
  elsif not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_goal.family_id and fm.user_id = new.user_id and fm.left_at is null
  ) then
    raise exception 'Meta não encontrada.';
  end if;
  if new.kind = 'deposit' and v_goal.status <> 'active' then
    raise exception 'Meta não encontrada.';
  end if;

  if new.kind = 'use' and not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id and t.goal_id = new.goal_id
      and (
        (v_goal.family_id is null and t.user_id = new.user_id and t.goal_funded_cents = new.amount_cents)
        or (v_goal.family_id is not null and t.family_id = v_goal.family_id)
      )
  ) then
    raise exception 'Movimento inválido.';
  end if;

  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)
    into v_balance
    from public.goal_movements m
    where m.goal_id = new.goal_id and m.user_id = new.user_id;

  if new.kind = 'deposit' then
    if v_balance + new.amount_cents > 9999999999 then
      raise exception 'Valor inválido.';
    end if;
  elsif new.amount_cents > v_balance then
    raise exception 'Valor maior que o guardado.';
  end if;
  return new;
end;
$$;

-- 30. Vínculo gasto-uso (Plano 5), agora com a família: a soma dos "use" da
--     compra é exatamente a parte paga com a meta, todos da mesma meta; na
--     meta pessoal, todos da dona; na da família, a compra é da família da
--     meta. Registro sem dono (Ex-membro, RN-24) é histórico congelado.
--     SECURITY DEFINER: soma movimentos de todos os membros.
create or replace function public.transactions_goal_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
  v_sum bigint;
  v_bad boolean;
begin
  if tg_op = 'INSERT' and new.goal_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.goal_id is null and new.goal_id is null then
    return null;
  end if;
  if new.user_id is null then
    return null;
  end if;
  if new.goal_id is not null then
    select g.family_id into v_family from public.goals g where g.id = new.goal_id;
    select coalesce(sum(m.amount_cents), 0),
           coalesce(bool_or(m.goal_id <> new.goal_id or (v_family is null and m.user_id is distinct from new.user_id)), false)
      into v_sum, v_bad
      from public.goal_movements m
      where m.transaction_id = new.id and m.kind = 'use';
    if v_sum <> new.goal_funded_cents or v_bad
       or (v_family is not null and new.family_id is distinct from v_family) then
      raise exception 'Movimento inválido.';
    end if;
  elsif exists (
    select 1 from public.goal_movements m
    where m.transaction_id = new.id and m.kind = 'use'
  ) then
    raise exception 'Movimento inválido.';
  end if;
  return null;
end;
$$;

-- 31. Apagar um "use" só vale quando a compra já não existe (apagada junto,
--     por delete_goal_use/delete_family_goal_use) ou é histórico de
--     Ex-membro. SECURITY DEFINER: a compra da família é de outra pessoa (o
--     membro não a enxerga e, sem isto, apagaria a própria parte do uso).
create or replace function public.goal_movements_use_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind <> 'use' then
    return null;
  end if;
  if exists (
    select 1 from public.transactions t
    where t.id = old.transaction_id and t.user_id is not null
  ) then
    raise exception 'Movimento inválido.';
  end if;
  return null;
end;
$$;

-- 32. Total de cada meta da família (A4 B): todos veem o total; a parte de
--     cada um continua só dele (goal_movements tem RLS "só o dono").
--     SECURITY DEFINER: soma movimentos de todos; devolve só o total, só das
--     metas da família de quem chama.
create function public.family_goal_totals()
returns table (goal_id uuid, saved_cents bigint)
language sql stable security definer set search_path = '' as $$
  select g.id,
         coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end)
                  filter (where m.user_id is not null), 0)::bigint
  from public.goals g
  left join public.goal_movements m on m.goal_id = g.id
  where g.family_id is not null and g.family_id = public.my_family_id()
  group by g.id
$$;

-- 33. Criar e editar a meta da família (RF-25, decisão 61). Criar: qualquer
--     membro. Editar: quem criou e o administrador. SECURITY DEFINER: a meta
--     não tem dono e as políticas de goals não a alcançam.
create function public.create_family_goal(p_name text, p_target_cents bigint, p_deadline date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Família não encontrada.';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_target_cents is null or p_target_cents <= 0 or p_target_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_deadline is not null and (p_deadline <> date_trunc('month', p_deadline)::date
     or p_deadline < v_month or p_deadline > date '2099-12-01') then
    raise exception 'Prazo inválido.';
  end if;
  insert into public.goals (user_id, family_id, created_by, name, target_cents, deadline)
    values (null, v_family, v_uid, v_name, p_target_cents, p_deadline)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.update_family_goal(p_id uuid, p_name text, p_target_cents bigint, p_deadline date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_name text := btrim(coalesce(p_name, ''));
  v_goal record;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select g.created_by, g.deadline into v_goal from public.goals g
    where g.id = p_id and v_family is not null and g.family_id = v_family and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if v_goal.created_by is distinct from v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_target_cents is null or p_target_cents <= 0 or p_target_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_deadline is not null and p_deadline is distinct from v_goal.deadline
     and (p_deadline <> date_trunc('month', p_deadline)::date or p_deadline < v_month or p_deadline > date '2099-12-01') then
    raise exception 'Prazo inválido.';
  end if;
  update public.goals g set name = v_name, target_cents = p_target_cents, deadline = p_deadline
    where g.id = p_id;
end;
$$;

-- 34. Guardar e tirar a própria parte (RN-22, RN-22a): qualquer membro, hoje.
--     Tirar vale também na meta usada (a sobra de cada um, RN-22c).
--     SECURITY DEFINER: a meta não tem dono (a política de inserção de
--     goal_movements só aceita meta pessoal). Devolvem a própria parte.
create function public.deposit_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and v_family is not null and g.family_id = v_family
      and g.status = 'active' and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
    values (v_uid, p_goal_id, 'deposit', p_amount_cents, v_today);
  return public.goal_balance(p_goal_id);
end;
$$;

create function public.withdraw_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and v_family is not null and g.family_id = v_family and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_amount_cents > public.goal_balance(p_goal_id) then
    raise exception 'Valor maior que o guardado.';
  end if;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
    values (v_uid, p_goal_id, 'withdraw', p_amount_cents, v_today);
  return public.goal_balance(p_goal_id);
end;
$$;

-- 35. Usar o dinheiro da meta da família (RN-22b, RN-22c): só o
--     administrador; gasto de hoje, na categoria dele, da família. A meta paga
--     o menor entre o gasto e o total; a diferença sai do Disponível de quem
--     usou. A parte paga é dividida na proporção do que cada um guardou:
--     floor(pago × parte ÷ total), e os centavos que sobram vão, um a um, para
--     os maiores restos da divisão (empate: maior parte, depois o id) — a
--     mesma regra de splitFamilyUse (src/domain/family.ts). Em numeric: pago
--     × parte chega a 10^20. SECURITY DEFINER: grava o "use" de cada membro.
create function public.use_family_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid)
returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total bigint;
  v_funded bigint;
  v_tx uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.family_id = v_family and g.status = 'active' and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_category_id is null or not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_uid
  ) then
    raise exception 'Categoria não encontrada.';
  end if;
  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)
    into v_total
    from public.goal_movements m
    where m.goal_id = p_goal_id and m.user_id is not null;
  if v_total <= 0 then
    raise exception 'Meta sem dinheiro guardado.';
  end if;
  v_funded := least(p_amount_cents, v_total);

  insert into public.transactions (user_id, kind, amount_cents, category_id, occurred_on, goal_id, goal_funded_cents, family_id)
    values (v_uid, 'expense', p_amount_cents, p_category_id, v_today, p_goal_id, v_funded, v_family)
    returning id into v_tx;

  for r in
    with parts as (
      select m.user_id as member, sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
      from public.goal_movements m
      where m.goal_id = p_goal_id and m.user_id is not null
      group by m.user_id
    ), positive as (
      select p.member, p.part,
             floor(v_funded::numeric * p.part / v_total)::bigint as share,
             (v_funded::numeric * p.part) % v_total as rest
      from parts p
      where p.part > 0
    ), ranked as (
      select q.member, q.share,
             row_number() over (order by q.rest desc, q.part desc, q.member) as rn,
             v_funded - sum(q.share) over () as extra
      from positive q
    )
    select k.member, k.share + case when k.rn <= k.extra then 1 else 0 end as amount
    from ranked k
  loop
    if r.amount > 0 then
      insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on, transaction_id)
        values (r.member, p_goal_id, 'use', r.amount, v_today, v_tx);
    end if;
  end loop;

  update public.goals g set status = 'used', used_on = v_today where g.id = p_goal_id;

  return query select v_tx, v_funded, v_total - v_funded;
end;
$$;

-- Desfazer o uso (decisão 66): só o administrador; a compra e os "use" de
-- todos saem juntos; cada parte volta; a meta volta a ser ativa.
create function public.delete_family_goal_use(p_transaction_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_goal uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  select t.goal_id into v_goal from public.transactions t
    join public.goals g on g.id = t.goal_id and g.family_id = v_family
    where t.id = p_transaction_id and t.family_id = v_family;
  if v_goal is null then
    raise exception 'Gasto não encontrado.';
  end if;
  perform 1 from public.goals g where g.id = v_goal and g.deleted_on is null for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  delete from public.goal_movements m where m.transaction_id = p_transaction_id and m.kind = 'use';
  delete from public.transactions t where t.id = p_transaction_id;
  update public.goals g set status = 'active', used_on = null where g.id = v_goal;
  return v_goal;
end;
$$;

-- 36. Excluir a meta da família (A6 A): só o administrador; cada parte volta
--     hoje para quem guardou (como "tirado"); os meses anteriores não mudam.
create function public.delete_family_goal(p_goal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.family_id = v_family and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  for r in
    select m.user_id as member, sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
    from public.goal_movements m
    where m.goal_id = p_goal_id and m.user_id is not null
    group by m.user_id
    having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) > 0
  loop
    insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
      values (r.member, p_goal_id, 'withdraw', r.part, v_today);
  end loop;
  update public.goals g set deleted_on = v_today where g.id = p_goal_id;
end;
$$;

revoke execute on function
  public.goals_guard(),
  public.goal_movements_guard(),
  public.transactions_goal_link_guard(),
  public.goal_movements_use_delete_guard()
from public, anon, authenticated;

revoke execute on function
  public.family_goal_totals(),
  public.create_family_goal(text, bigint, date),
  public.update_family_goal(uuid, text, bigint, date),
  public.deposit_family_goal(uuid, bigint),
  public.withdraw_family_goal(uuid, bigint),
  public.use_family_goal(uuid, bigint, uuid),
  public.delete_family_goal_use(uuid),
  public.delete_family_goal(uuid)
from public, anon;

grant execute on function
  public.family_goal_totals(),
  public.create_family_goal(text, bigint, date),
  public.update_family_goal(uuid, text, bigint, date),
  public.deposit_family_goal(uuid, bigint),
  public.withdraw_family_goal(uuid, bigint),
  public.use_family_goal(uuid, bigint, uuid),
  public.delete_family_goal_use(uuid),
  public.delete_family_goal(uuid)
to authenticated;
```

Nota: `goal_balance` (Plano 5, `security invoker`) filtra `auth.uid()`: chamada dentro destas funções continua devolvendo **a parte de quem chama**. Os testes do Plano 5 (`tests/db/plano5.test.ts`) precisam continuar passando sem mudança: as mensagens e os códigos (`23514`, `23503`) são os mesmos.

- [ ] **Step 4: Rodar e ver passar (e o Plano 5 não quebrou)**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-metas.test.ts tests/db/plano5.test.ts tests/db/plano7-gastos.test.ts`
Expected: PASS (sem Docker: pendente).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000001_familia.sql tests/db/plano7-metas.test.ts
git commit -m "feat(db): metas da família (total para todos, parte de cada um, uso proporcional)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Banco — sair, remover, encerrar e excluir o cadastro

**Files:**
- Modify: `supabase/migrations/20261001000001_familia.sql` (anexar a seção 4)
- Test: `tests/db/plano7-saida.test.ts`

**Interfaces:**
- Consumes: seções 1–3.
- Produces (usados pelas Tasks 7, 10, 14; exclusão de cadastro pela tela: Plano 9):
  - `family_detach(p_family uuid, p_user uuid) returns void` — **interna** (sem `grant` a ninguém): devolve hoje, como `return_on_exit`, a parte de quem sai em cada meta da família não excluída (RN-22d) e grava um aviso por meta (`member_left`, nome, meta, valor) ou um aviso sem meta; encerra as contas da família que a pessoa criou e apaga as ainda não pagas dela; marca `left_at`.
  - `leave_family() returns void` — administrador com outras pessoas: `'Escolha quem vai administrar a família antes de sair.'`; sozinho: a família é encerrada (`ended_at`).
  - `remove_family_member(p_user uuid) returns void` — só o administrador, nunca ele mesmo.
  - Gatilho `on_auth_user_deleted` (`before delete on auth.users`, função `handle_user_deleted`): RN-22e e RN-24 (detalhes no SQL).

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano7-saida.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, categoryId, newUser, removeUsers, type TestUser } from './helpers'
import { createFamily, expense, inviteCode, joinFamily, todaySP } from './family-helpers'

let ana: TestUser // administra
let bia: TestUser // sai
let eva: TestUser // é removida
let fabio: TestUser // membro
let famAna: string
let reforma: string
const created: TestUser[] = []
const today = todaySP()
const monthStart = `${today.slice(0, 7)}-01`
const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'

async function user(name: string): Promise<TestUser> {
  const u = await newUser(name)
  created.push(u)
  return u
}
async function familyGoal(u: TestUser, name: string): Promise<string> {
  const { data, error } = await u.client.rpc('create_family_goal', { p_name: name, p_target_cents: 1_000_000, p_deadline: null })
  if (error) throw error
  return data as string
}
async function deposit(u: TestUser, goal: string, cents: number) {
  const { error } = await u.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: cents })
  if (error) throw error
}
async function totals(u: TestUser): Promise<Record<string, number>> {
  const { data } = await u.client.rpc('family_goal_totals')
  return Object.fromEntries(((data ?? []) as { goal_id: string; saved_cents: number }[]).map((r) => [r.goal_id, Number(r.saved_cents)]))
}
async function events(u: TestUser) {
  const { data } = await u.client.from('family_events').select('kind, member_name, goal_name, amount_cents').order('created_at').order('goal_name')
  return (data ?? []).map((e) => ({ ...e, amount_cents: e.amount_cents === null ? null : Number(e.amount_cents) }))
}
async function familyRows(u: TestUser) {
  const { data, error } = await u.client.rpc('family_expenses', { p_from: monthStart, p_to: today })
  if (error) throw error
  return data as { id: string; author_id: string | null; author_name: string | null; category_key: string | null; category_name: string; amount_cents: number }[]
}
async function familyBill(owner: TestUser, family: string, name: string): Promise<string> {
  const { data, error } = await owner.client.from('recurrences').insert({
    user_id: owner.id, kind: 'expense', name, amount_cents: 10000, category_id: await categoryId(owner, 'casa'),
    frequency: 'monthly', due_day: 28, starts_on: monthStart, family_id: family,
  }).select('id').single()
  if (error) throw error
  await owner.client.rpc('generate_family_occurrences')
  return data.id as string
}

beforeAll(async () => {
  ;[ana, bia, eva, fabio] = await Promise.all(['Ana', 'Bia', 'Eva', 'Fábio'].map((n) => user(n)))
  famAna = await createFamily(ana, 'Família Souza')
  for (const u of [bia, eva, fabio]) await joinFamily(u, ana)
  reforma = await familyGoal(ana, 'Reforma da cozinha')
})

afterAll(async () => {
  await removeUsers(...created)
})

describe('sair da família (RN-22d, RN-23, Review Focus 3)', () => {
  let biaExpense: string
  let biaBill: string

  test('a parte nas metas volta hoje para quem sai; a família recebe o aviso; o histórico fica com o nome', async () => {
    await deposit(bia, reforma, 2000)
    biaExpense = await expense(bia, 'mercado', 31240, { family_id: famAna })
    biaBill = await familyBill(bia, famAna, 'Faxina')
    expect((await bia.client.rpc('leave_family')).error).toBeNull()
    const moves = await bia.client.from('goal_movements').select('kind, amount_cents, occurred_on').eq('goal_id', reforma).eq('kind', 'return_on_exit')
    expect(moves.data).toEqual([{ kind: 'return_on_exit', amount_cents: 2000, occurred_on: today }])
    expect((await totals(ana))[reforma]).toBe(0)
    expect(await events(ana)).toEqual([{ kind: 'member_left', member_name: 'Bia', goal_name: 'Reforma da cozinha', amount_cents: 2000 }])
    expect((await familyRows(ana)).find((r) => r.id === biaExpense)).toMatchObject({ author_id: bia.id, author_name: 'Bia', amount_cents: 31240 })
  })

  test('ex-membro perde todo acesso ao espaço da família na hora, inclusive ao histórico dos outros', async () => {
    const anaExpense = await expense(ana, 'casa', 5000, { family_id: famAna })
    expect((await bia.client.rpc('my_family_id')).data).toBeNull()
    for (const table of ['families', 'family_members', 'family_events', 'family_invites']) {
      expect((await bia.client.from(table).select('id')).data ?? []).toEqual([])
    }
    expect((await bia.client.from('goals').select('id').eq('id', reforma)).data).toEqual([])
    expect(await familyRows(bia)).toEqual([])
    expect(await totals(bia)).toEqual({})
    expect((await bia.client.rpc('family_bills')).data).toEqual([])
    expect((await bia.client.rpc('family_recurrences')).data).toEqual([])
    expect((await bia.client.rpc('family_expense', { p_id: anaExpense })).data).toEqual([])
  })

  test('os próprios registros continuam dela; contas da família que ela criou são encerradas e as não pagas saem', async () => {
    expect((await bia.client.from('transactions').select('family_id').eq('id', biaExpense).single()).data?.family_id).toBe(famAna)
    expect((await bia.client.from('recurrences').select('ended_on').eq('id', biaBill).single()).data?.ended_on).toBe(today)
    expect((await bia.client.from('transactions').select('id').eq('recurrence_id', biaBill).eq('status', 'pending')).data).toEqual([])
    expect(((await ana.client.rpc('family_recurrences')).data as { id: string }[]).some((r) => r.id === biaBill)).toBe(false)
  })

  test('ex-membro não guarda, não paga, não convida e não marca nada novo como da família', async () => {
    const anaBill = await familyBill(ana, famAna, 'Aluguel')
    const pending = (await ana.client.from('transactions').select('id').eq('recurrence_id', anaBill).eq('status', 'pending').single()).data!.id
    expect((await bia.client.rpc('deposit_family_goal', { p_goal_id: reforma, p_amount_cents: 1 })).error?.message).toContain('Meta não encontrada.')
    expect((await bia.client.rpc('pay_family_bill', { p_id: pending })).error?.message).toContain('Conta não encontrada.')
    expect((await bia.client.rpc('create_family_invite')).error?.message).toContain(ADMIN_ONLY)
    const { error } = await bia.client.from('transactions').insert({
      user_id: bia.id, kind: 'expense', amount_cents: 100, category_id: await categoryId(bia, 'casa'), occurred_on: today, family_id: famAna,
    })
    expect(error?.message).toContain('Família não encontrada.')
  })

  test('ex-membro ainda edita o próprio registro antigo; a família vê a mudança com o nome dele (RN-23)', async () => {
    const upd = await bia.client.from('transactions').update({ amount_cents: 30000 }).eq('id', biaExpense).select('id')
    expect(upd.data).toHaveLength(1)
    expect((await familyRows(ana)).find((r) => r.id === biaExpense)).toMatchObject({ amount_cents: 30000, author_name: 'Bia' })
  })

  test('quem saiu pode voltar com um convite novo', async () => {
    expect((await bia.client.rpc('accept_family_invite', { p_code: await inviteCode(ana) })).error).toBeNull()
    expect((await bia.client.rpc('my_family_role')).data).toBe('member')
    const rows = (await ana.client.from('family_members').select('left_at').eq('user_id', bia.id)).data!
    expect(rows.map((r) => r.left_at === null).sort()).toEqual([false, true])
  })
})

describe('administração ao sair (RN-25, Review Focus 5)', () => {
  test('administrador com outras pessoas não sai sem passar a administração', async () => {
    expect((await ana.client.rpc('leave_family')).error?.message).toContain('Escolha quem vai administrar a família antes de sair.')
    expect((await ana.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('sozinho, sair encerra a família; depois dá para criar outra', async () => {
    const gil = await user('Gil')
    const fam = await createFamily(gil, 'Família Gil')
    expect((await gil.client.rpc('leave_family')).error).toBeNull()
    expect((await admin.from('families').select('ended_at').eq('id', fam).single()).data?.ended_at).not.toBeNull()
    expect((await gil.client.rpc('my_family_id')).data).toBeNull()
    expect((await gil.client.rpc('create_family', { p_name: 'Família Nova' })).error).toBeNull()
  })

  test('quem não participa de família nenhuma não sai', async () => {
    const hugo = await user('Hugo')
    expect((await hugo.client.rpc('leave_family')).error?.message).toContain('Família não encontrada.')
  })
})

describe('remover um membro (RF-44)', () => {
  test('só o administrador; nunca a si mesmo nem quem é de fora; a parte volta para quem foi removido', async () => {
    await deposit(eva, reforma, 1500)
    expect((await fabio.client.rpc('remove_family_member', { p_user: eva.id })).error?.message).toContain(ADMIN_ONLY)
    const outsider = await user('Iara')
    for (const p_user of [ana.id, outsider.id, null]) {
      expect((await ana.client.rpc('remove_family_member', { p_user })).error?.message).toContain('Pessoa não encontrada.')
    }
    expect((await ana.client.rpc('remove_family_member', { p_user: eva.id })).error).toBeNull()
    expect((await eva.client.rpc('my_family_id')).data).toBeNull()
    const back = await eva.client.from('goal_movements').select('kind, amount_cents').eq('goal_id', reforma).eq('kind', 'return_on_exit')
    expect(back.data).toEqual([{ kind: 'return_on_exit', amount_cents: 1500 }])
    expect((await events(fabio)).at(-1)).toEqual({ kind: 'member_left', member_name: 'Eva', goal_name: 'Reforma da cozinha', amount_cents: 1500 })
  })
})

describe('excluir o cadastro (RN-22e, RN-24; tela no Plano 9)', () => {
  test('gastos da família ficam como Ex-membro, sem nome; a parte sai das metas; a parte já usada fica na compra', async () => {
    const ivo = await newUser('Ivo') // excluído no teste: fora de `created`
    await joinFamily(ivo, ana)
    const pet = (await ivo.client.from('categories').insert({ user_id: ivo.id, name: 'Pet' }).select('id').single()).data!.id
    const { data: petExpense } = await ivo.client.from('transactions').insert({
      user_id: ivo.id, kind: 'expense', amount_cents: 4000, category_id: pet, occurred_on: today, family_id: famAna,
    }).select('id').single()
    const personal = await expense(ivo, 'lazer', 999)
    const ivoBill = await familyBill(ivo, famAna, 'Internet')
    const g1 = await familyGoal(ana, 'Viagem')
    const g2 = await familyGoal(ana, 'Sofá')
    await deposit(ivo, g1, 3000)
    await deposit(ana, g2, 1000)
    await deposit(ivo, g2, 1000)
    const { data: used } = await ana.client.rpc('use_family_goal', { p_goal_id: g2, p_amount_cents: 1500, p_category_id: await categoryId(ana, 'casa') })
    const useTx = (used as { tx_id: string }[])[0].tx_id
    const before = await totals(ana)
    const eventsBefore = (await events(ana)).length

    const { error } = await admin.auth.admin.deleteUser(ivo.id)
    expect(error).toBeNull()

    expect((await familyRows(ana)).find((r) => r.id === petExpense!.id)).toMatchObject({
      author_id: null, author_name: null, category_key: null, category_name: 'Pet', amount_cents: 4000,
    })
    expect((await admin.from('transactions').select('id').eq('id', personal)).data).toEqual([])
    expect((await admin.from('transactions').select('id').eq('recurrence_id', ivoBill)).data).toEqual([])
    const after = await totals(ana)
    expect(after[g1]).toBe(before[g1] - 3000)
    expect(after[g2]).toBe(250)
    const useMoves = (await admin.from('goal_movements').select('user_id, amount_cents').eq('transaction_id', useTx)).data!
    expect(useMoves.map((m) => [m.user_id === null ? null : 'ana', Number(m.amount_cents)]).sort()).toEqual([['ana', 750], [null, 750]])
    expect((await ana.client.from('transactions').select('amount_cents, goal_funded_cents').eq('id', useTx).single()).data).toEqual({ amount_cents: 1500, goal_funded_cents: 1500 })
    expect((await events(ana)).slice(eventsBefore)).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: 'Sofá', amount_cents: null },
      { kind: 'member_deleted', member_name: null, goal_name: 'Viagem', amount_cents: null },
    ])
    const rows = (await ana.client.from('family_members').select('user_id, display_name, left_at')).data!
    expect(rows.some((m) => m.user_id === ivo.id)).toBe(false)
    expect(rows.filter((m) => m.user_id === null).every((m) => m.display_name === null && m.left_at !== null)).toBe(true)
  })

  test('administrador que exclui o cadastro passa o papel a quem participa há mais tempo; a compra com a meta fica e pode ser desfeita', async () => {
    const [jo, ka, lu] = [await newUser('Jô'), await user('Ká'), await user('Lu')]
    await createFamily(jo, 'Família Jô')
    await joinFamily(ka, jo)
    await joinFamily(lu, jo)
    const goal = await familyGoal(jo, 'Geladeira')
    await deposit(jo, goal, 1000)
    await deposit(ka, goal, 1000)
    const { data } = await jo.client.rpc('use_family_goal', { p_goal_id: goal, p_amount_cents: 2000, p_category_id: await categoryId(jo, 'casa') })
    const tx = (data as { tx_id: string }[])[0].tx_id

    expect((await admin.auth.admin.deleteUser(jo.id)).error).toBeNull()

    expect((await ka.client.rpc('my_family_role')).data).toBe('admin')
    expect((await lu.client.rpc('my_family_role')).data).toBe('member')
    const { data: rows } = await ka.client.rpc('family_expenses', { p_from: monthStart, p_to: today })
    expect((rows as { id: string; author_id: string | null }[]).find((r) => r.id === tx)?.author_id).toBeNull()
    expect((await ka.client.rpc('delete_family_goal_use', { p_transaction_id: tx })).error).toBeNull()
    expect(Number((await ka.client.rpc('goal_balance', { p_goal_id: goal })).data)).toBe(1000)
  })

  test('sozinho, excluir o cadastro encerra a família; conta paga por outro membro continua dele', async () => {
    const mo = await newUser('Mô')
    const famMo = await createFamily(mo, 'Família Mô')
    expect((await admin.auth.admin.deleteUser(mo.id)).error).toBeNull()
    expect((await admin.from('families').select('ended_at').eq('id', famMo).single()).data?.ended_at).not.toBeNull()

    const [ze, yan] = [await newUser('Zé'), await user('Yan')]
    const famZe = await createFamily(ze, 'Família Zé')
    await joinFamily(yan, ze)
    const rec = await familyBill(ze, famZe, 'Luz')
    const pending = (await ze.client.from('transactions').select('id').eq('recurrence_id', rec).eq('status', 'pending').single()).data!.id
    const paid = (await yan.client.rpc('pay_family_bill', { p_id: pending })).data as string
    expect((await admin.auth.admin.deleteUser(ze.id)).error).toBeNull()
    expect((await yan.client.from('transactions').select('amount_cents, status').eq('id', paid).single()).data).toEqual({ amount_cents: 10000, status: 'confirmed' })
    expect((await yan.client.rpc('my_family_role')).data).toBe('admin')
  })

  test('excluir cadastro sem família continua como antes', async () => {
    const solo = await newUser('Solo')
    await expense(solo, 'lazer', 100)
    expect((await admin.auth.admin.deleteUser(solo.id)).error).toBeNull()
    expect((await admin.from('transactions').select('id').eq('user_id', solo.id)).data).toEqual([])
  })
})
```

Nota: quem é excluído no meio do teste é criado com `newUser` direto (fora de `created`): `removeUsers` no fim falharia ao apagar de novo um usuário que já não existe.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano7-saida.test.ts`
Expected: FAIL — `Could not find the function public.leave_family` (sem Docker: pendente).

- [ ] **Step 3: Implementação** — anexar a seção 4 a `supabase/migrations/20261001000001_familia.sql`:

```sql
-- ============================================================================
-- Seção 4 — sair, remover, encerrar e excluir o cadastro (RN-22d/e, RN-23–25)
-- ============================================================================

-- 37. Saída de uma pessoa (sair ou ser removida). Interna: sem grant; só as
--     funções abaixo a chamam. RN-22d: a parte de quem sai em cada meta da
--     família volta hoje para o Disponível dela (return_on_exit), e a família
--     recebe um aviso por meta; sem parte, um aviso só. As contas da família
--     que a pessoa criou são encerradas e as ainda não pagas dela saem (a
--     família cria de novo se quiser). Os gastos ficam (RN-23): a linha de
--     participação guarda o nome. Os movimentos entram antes de left_at
--     (a guarda exige participação ativa).
create function public.family_detach(p_family uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_name text;
  v_any boolean := false;
  r record;
begin
  select fm.display_name into v_name from public.family_members fm
    where fm.family_id = p_family and fm.user_id = p_user and fm.left_at is null
    for update;
  if not found then
    raise exception 'Pessoa não encontrada.';
  end if;

  for r in
    select g.id, g.name,
           sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
    from public.goals g
    join public.goal_movements m on m.goal_id = g.id and m.user_id = p_user
    where g.family_id = p_family and g.deleted_on is null
    group by g.id, g.name
    having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) > 0
    order by g.name, g.id
  loop
    insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
      values (p_user, r.id, 'return_on_exit', r.part, v_today);
    insert into public.family_events (family_id, kind, member_name, goal_name, amount_cents)
      values (p_family, 'member_left', v_name, r.name, r.part);
    v_any := true;
  end loop;
  if not v_any then
    insert into public.family_events (family_id, kind, member_name) values (p_family, 'member_left', v_name);
  end if;

  update public.recurrences rc set ended_on = v_today
    where rc.family_id = p_family and rc.user_id = p_user and rc.ended_on is null;
  delete from public.transactions t
    where t.family_id = p_family and t.user_id = p_user and t.status = 'pending';

  update public.family_members fm set left_at = now()
    where fm.family_id = p_family and fm.user_id = p_user and fm.left_at is null;
end;
$$;

-- 38. Sair da família (RF-45, RN-25). Administrador com outras pessoas passa
--     a administração antes; sozinho, a família é encerrada.
create function public.leave_family() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_others integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Família não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for update;
  select count(*) into v_others from public.family_members fm
    where fm.family_id = v_family and fm.left_at is null and fm.user_id <> v_uid;
  if public.my_family_role() = 'admin' and v_others > 0 then
    raise exception 'Escolha quem vai administrar a família antes de sair.';
  end if;
  perform public.family_detach(v_family, v_uid);
  if v_others = 0 then
    update public.families f set ended_at = now() where f.id = v_family;
  end if;
end;
$$;

-- 39. Remover um membro (RF-44): só o administrador, nunca a si mesmo.
create function public.remove_family_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_uid then
    raise exception 'Pessoa não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for update;
  perform public.family_detach(v_family, p_user);
end;
$$;

-- 40. Exclusão do cadastro (RN-22e, RN-24; a tela é do Plano 9). Roda antes
--     da cascata de auth.users, como dona da função (SECURITY DEFINER: mexe em
--     registros e participações que a pessoa não alcança pela API, e quem
--     apaga é o serviço de autenticação). Em ordem:
--     a) família ativa: aviso sem nome por meta em que havia parte; quem
--        participa há mais tempo vira administrador (se era ela); sozinha, a
--        família é encerrada;
--     b) contas da família ainda não pagas dela saem;
--     c) gasto pago com meta pessoal que foi marcado da família (só por
--        gravação direta) sai junto com a meta;
--     d) gastos da família (de todas as famílias de que participou) ficam sem
--        dono, com a categoria guardada, sem cartão, parcela nem molde;
--     e) a parte dela já usada em compras da família fica na compra, sem dono
--        (a soma das partes continua batendo); o resto do guardado sai na
--        cascata, e as metas da família diminuem;
--     f) participações perdem a pessoa e o nome.
create function public.handle_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
  v_role text;
  v_next uuid;
  r record;
begin
  select fm.family_id, fm.role into v_family, v_role from public.family_members fm
    where fm.user_id = old.id and fm.left_at is null;
  if v_family is not null then
    perform 1 from public.families f where f.id = v_family for update;
    for r in
      select g.name from public.goals g
      join public.goal_movements m on m.goal_id = g.id and m.user_id = old.id
      where g.family_id = v_family and g.deleted_on is null
      group by g.id, g.name
      having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) > 0
      order by g.name
    loop
      insert into public.family_events (family_id, kind, goal_name) values (v_family, 'member_deleted', r.name);
    end loop;
    if not found then
      insert into public.family_events (family_id, kind) values (v_family, 'member_deleted');
    end if;
    if v_role = 'admin' then
      select fm.user_id into v_next from public.family_members fm
        where fm.family_id = v_family and fm.left_at is null and fm.user_id <> old.id
        order by fm.joined_at, fm.user_id
        limit 1;
    end if;
    update public.family_members fm set left_at = now(), role = 'member'
      where fm.family_id = v_family and fm.user_id = old.id and fm.left_at is null;
    if v_next is not null then
      update public.family_members fm set role = 'admin'
        where fm.family_id = v_family and fm.user_id = v_next and fm.left_at is null;
    elsif not exists (select 1 from public.family_members fm where fm.family_id = v_family and fm.left_at is null) then
      update public.families f set ended_at = now() where f.id = v_family;
    end if;
  end if;

  delete from public.transactions t
    where t.user_id = old.id and t.family_id is not null and t.status = 'pending';

  delete from public.goal_movements m
    using public.transactions t, public.goals g
    where m.transaction_id = t.id and t.user_id = old.id and t.family_id is not null
      and g.id = t.goal_id and g.family_id is null;
  delete from public.transactions t
    using public.goals g
    where t.user_id = old.id and t.family_id is not null and g.id = t.goal_id and g.family_id is null;

  update public.transactions t set
    ex_category_key = (select c.default_key from public.categories c where c.id = t.category_id and c.user_id = old.id),
    ex_category_name = (select c.name from public.categories c where c.id = t.category_id and c.user_id = old.id),
    user_id = null, card_id = null, card_deleted = false, payment_method = null,
    installment_plan_id = null, installment_number = null, installment_count = null,
    recurrence_id = null, recurrence_period = null
  where t.user_id = old.id and t.family_id is not null;

  update public.goal_movements m set user_id = null
    where m.user_id = old.id and m.kind = 'use'
      and exists (select 1 from public.goals g where g.id = m.goal_id and g.family_id is not null);

  update public.family_members fm set user_id = null, display_name = null, left_at = coalesce(fm.left_at, now())
    where fm.user_id = old.id;

  return old;
end;
$$;

create trigger on_auth_user_deleted before delete on auth.users
  for each row execute function public.handle_user_deleted();

revoke execute on function public.family_detach(uuid, uuid), public.handle_user_deleted()
from public, anon, authenticated;

revoke execute on function public.leave_family(), public.remove_family_member(uuid) from public, anon;
grant execute on function public.leave_family(), public.remove_family_member(uuid) to authenticated;
```

Nota sobre o `if not found` depois do laço: em PL/pgSQL, `FOUND` fica verdadeiro depois de um `for … loop` que rodou ao menos uma vez — é exatamente "havia parte em alguma meta".

- [ ] **Step 4: Rodar todos os testes de banco (nada antigo quebrou)**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS em `rls`, `plano2` … `plano6`, `plano7-familia`, `plano7-gastos`, `plano7-metas`, `plano7-saida` (sem Docker: pendente; registrar).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000001_familia.sql tests/db/plano7-saida.test.ts
git commit -m "feat(db): sair, remover, encerrar a família e excluir o cadastro com família" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Leituras no servidor — livro pessoal, família e contas da família

**Files:**
- Modify: `src/features/registro/tx-row.ts` (+ `tx-row.test.ts`), `src/features/registro/queries.ts`
- Modify: `src/features/contas/occurrences.ts` (+ `occurrences.test.ts`), `src/features/contas/queries.ts`
- Modify: `src/features/metas/queries.ts` (`loadGoalLabel`), `src/lib/refresh.ts`
- Create: `src/features/familia/types.ts` (+ `types.test.ts`), `src/features/familia/queries.ts` (+ `queries.test.ts`)
- Test: `src/features/registro/queries.test.ts` (novo)

**Interfaces:**
- Consumes: `personalLedger`, `FamilyExpense` (Task 1); RPCs e tabelas das Tasks 2–4; `fetchAllPages`; `GOAL_COLUMNS`, `MOVEMENT_COLUMNS`, `toGoalRow`, `toMovementRow`, `GoalRow`, `GoalMovementRow` (`features/metas/types`); `dueDateIn`, `Frequency` (`domain/recurrence`).
- Produces (usados pelas Tasks 7–13):
  - `TxRow.familyId: string | null`; `TxRawRow.family_id`; `TX_COLUMNS` com `family_id`.
  - `loadLedger()`: transações com `.eq('user_id', user.id)` e passadas por `personalLedger`; categorias com `.eq('user_id', user.id)` (`fetchCategories(supabase, userId)`).
  - `ensureOccurrences(supabase)`: chama `generate_occurrences` e depois `generate_family_occurrences` (cada erro só vai para o log).
  - `loadRecurrences()`/`loadRecurrence(id)`: `.is('family_id', null)` (as da família ficam em Família → Contas).
  - `loadGoalLabel(id)`: meta pessoal (filtro `user_id`, como hoje) ou, se não houver, meta da família (`.eq('family_id', myFamily)`).
  - `refreshMoneyViews()` também revalida `/familia` (`'layout'`) e `/inicio/familia`.
  - `features/familia/types.ts`:
    - `type FamilyRole = 'admin' | 'member'`
    - `interface MemberRow { userId: string | null; role: FamilyRole; displayName: string | null; joinedAt: string; leftAt: string | null }`, `MEMBER_COLUMNS = 'user_id, role, display_name, joined_at, left_at'`, `toMemberRow`
    - `interface InviteRow { id: string; expiresAt: string }`, `INVITE_COLUMNS = 'id, expires_at'`, `toInviteRow`
    - `interface FamilyEventRow { id: string; kind: 'member_left' | 'member_deleted'; memberName: string | null; goalName: string | null; amountCents: number | null; createdAt: string }`, `EVENT_COLUMNS = 'id, kind, member_name, goal_name, amount_cents, created_at'`, `toEventRow`
    - `interface MyFamily { id: string; name: string; meId: string; role: FamilyRole; members: MemberRow[]; invites: InviteRow[]; events: FamilyEventRow[] }` (`members` inclui quem já saiu — para o nome no histórico; `invites` vazio para membro)
    - `interface FamilyExpenseRow extends FamilyExpense { createdAt: string }`, `toFamilyExpenseRow` (de `family_expenses`)
    - `interface FamilyBillRow { id: string; name: string; amountCents: number; dueOn: ISODate; authorId: string | null }`, `toFamilyBillRow`
    - `interface FamilyRecurrenceRow { id: string; name: string; amountCents: number; frequency: Frequency; dueDay: number; dueMonth: number | null; authorId: string }`, `toFamilyRecurrenceRow`
    - `interface FamilyGoalRow extends GoalRow { familyId: string; createdBy: string | null; savedCents: number }`, `FAMILY_GOAL_COLUMNS = GOAL_COLUMNS + ', family_id, created_by'`
  - `features/familia/queries.ts` (`import 'server-only'`; todas chamam `requireUser()` antes):
    - `myFamilyId(supabase: SupabaseClient, userId: string): Promise<string | null>` — `family_members`, `.eq('user_id', userId).is('left_at', null)`.
    - `loadMyFamily(): Promise<MyFamily | null>` — sem família: `null` sem outra leitura. Com família: `families .eq('id', fid)`, `family_members .eq('family_id', fid).order('joined_at')`, `family_events .eq('family_id', fid).order('created_at', desc).limit(5)`; convites **só se administrador**: `.eq('family_id', fid).is('accepted_at', null).is('revoked_at', null).gt('expires_at', agora)`.
    - `loadFamilyExpenses(month: MonthKey): Promise<FamilyExpenseRow[]>` — `rpc('family_expenses', { p_from: '{mês}-01', p_to: dueDateIn(month, 31) })`, lida em páginas por `fetchAllPages` (`.range`).
    - `loadFamilySummary(): Promise<{ id: string; name: string; role: FamilyRole } | null>` — só a própria participação ativa e o nome da família (para o seletor Eu · Família, o Anotar e Mais).
    - `loadFamilyExpense(id: string): Promise<FamilyExpenseRow | null>`, `loadFamilyRecurrences(): Promise<FamilyRecurrenceRow[]>`.
    - `loadFamilyBills(): Promise<FamilyBillRow[]>` — chama `ensureOccurrences(supabase)` antes de ler (como `loadLedger`).
    - `loadFamilyGoals(familyId: string): Promise<FamilyGoalRow[]>` — `goals .eq('family_id', familyId).is('deleted_on', null).order('created_at').order('id')` + `rpc('family_goal_totals')`.
    - `loadFamilyGoal(id: string, familyId: string): Promise<{ goal: FamilyGoalRow; movements: GoalMovementRow[] } | null>` — meta `.eq('id', id).eq('family_id', familyId).is('deleted_on', null)`; movimentos **só os de quem pede** (`.eq('goal_id', id).eq('user_id', user.id)`, A4 B).

- [ ] **Step 1: Testes que falham**

`src/features/familia/queries.test.ts` (fake encadeável que registra cada chamada — mesmo formato de `src/features/metas/movement-actions.test.ts`, mais `vi.mock('server-only', () => ({}))`):

```ts
test('myFamilyId filtra a pessoa e só a participação ativa (Review Focus 3)', async () => {
  queue({ family_members: [{ family_id: 'f1' }] })
  expect(await myFamilyId(fake(), 'u1')).toBe('f1')
  expect(calls).toContainEqual({ table: 'family_members', op: 'select', filters: { 'eq:user_id': 'u1', 'is:left_at': null } })
})

test('loadMyFamily sem família devolve null sem ler mais nada', async () => {
  queue({ family_members: [] })
  expect(await loadMyFamily()).toBeNull()
  expect(calls.map((c) => c.table)).toEqual(['family_members'])
})

test('membro não lê convites; administrador lê só os pendentes, válidos e da própria família', async () => {
  queue({ family_members: [{ family_id: 'f1' }], families: [{ id: 'f1', name: 'Família Souza' }],
    members: [{ user_id: 'u1', role: 'member', display_name: 'Ana', joined_at: '2026-08-01T12:00:00Z', left_at: null }], family_events: [] })
  expect((await loadMyFamily())!.invites).toEqual([])
  expect(calls.some((c) => c.table === 'family_invites')).toBe(false)
  reset()
  queue({ /* o mesmo, com role: 'admin' */ family_invites: [{ id: 'i1', expires_at: '2026-10-05T12:00:00Z' }] })
  const fam = (await loadMyFamily())!
  expect(fam.role).toBe('admin')
  expect(calls.find((c) => c.table === 'family_invites')?.filters).toEqual({
    'eq:family_id': 'f1', 'is:accepted_at': null, 'is:revoked_at': null, 'gt:expires_at': '2026-09-28T15:00:00.000Z',
  })
})

test('gastos da família: só o mês pedido, do dia 1 ao último dia', async () => {
  await loadFamilyExpenses('2026-02')
  expect(calls[0]).toMatchObject({ rpc: 'family_expenses', args: { p_from: '2026-02-01', p_to: '2026-02-28' }, range: [0, 999] })
})

test('metas da família: filtra a família, sem as excluídas, e junta o total', async () => {
  queue({ goals: [{ id: 'g1', /* colunas */ family_id: 'f1', created_by: 'u2' }], family_goal_totals: [{ goal_id: 'g1', saved_cents: '300000' }] })
  const [g] = await loadFamilyGoals('f1')
  expect(g.savedCents).toBe(300000)
  expect(calls.find((c) => c.table === 'goals')?.filters).toEqual({ 'eq:family_id': 'f1', 'is:deleted_on': null })
})

test('meta da família: só os movimentos de quem pede (A4 B)', async () => {
  await loadFamilyGoal('g1', 'f1')
  expect(calls.find((c) => c.table === 'goal_movements')?.filters).toEqual({ 'eq:goal_id': 'g1', 'eq:user_id': 'u1' })
})
```

`src/features/registro/queries.test.ts` (mesmo fake):

```ts
test('loadLedger lê só os registros da própria pessoa e tira a conta da família a pagar (RNF-11)', async () => {
  queue({ transactions: [row({ id: 'a' }), row({ id: 'b', status: 'pending', due_on: '2026-09-28', family_id: 'f1' }), row({ id: 'c', family_id: 'f1' })] })
  const ledger = await loadLedger()
  expect(ledger.transactions.map((t) => t.id)).toEqual(['a', 'c'])
  expect(calls.find((c) => c.table === 'transactions')?.filters).toMatchObject({ 'eq:user_id': 'u1' })
  expect(calls.find((c) => c.table === 'categories')?.filters).toMatchObject({ 'eq:user_id': 'u1' })
  expect(calls.filter((c) => c.rpc).map((c) => c.rpc)).toEqual(['generate_occurrences', 'generate_family_occurrences'])
})
```

Em `src/features/registro/tx-row.test.ts`: `toTxRow` leva `family_id` para `familyId` (`null` e um id). Em `src/features/contas/occurrences.test.ts`: `'gera também as contas da família; o erro de uma não impede a outra'` — a primeira RPC devolve erro, a segunda é chamada mesmo assim, e nada é lançado.

`src/features/familia/types.test.ts`: `toFamilyExpenseRow` converte `amount_cents: '31240'` em `31240`, `effective_on` em `effectiveOn`, `author_name: null` em `authorName: null`; `toFamilyRecurrenceRow` converte `due_day`/`due_month` para número; `toEventRow` mantém `amountCents: null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia src/features/registro src/features/contas/occurrences.test.ts`
Expected: FAIL — `Failed to resolve import "./queries"` / `familyId` ausente.

- [ ] **Step 3: Implementação** — seguir Interfaces. `loadLedger` continua gerando as ocorrências antes de ler (agora as duas RPCs, em sequência, dentro de `ensureOccurrences`). `personalLedger` é aplicado depois de `toTxRow`, na leitura; **nenhuma** tela recalcula nada por conta própria. Nenhum filtro existente é removido.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (todos os testes antigos também: as telas pessoais não mudam de número).

- [ ] **Step 5: Commit**

```bash
git add src/features/familia/types.ts src/features/familia/types.test.ts src/features/familia/queries.ts src/features/familia/queries.test.ts src/features/registro src/features/contas/occurrences.ts src/features/contas/occurrences.test.ts src/features/contas/queries.ts src/features/metas/queries.ts src/lib/refresh.ts
git commit -m "feat(familia): leituras da família e livro pessoal só da pessoa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ações da família (criar, convidar, aceitar, sair, remover, transferir) e volta ao convite depois de entrar

**Files:**
- Create: `src/features/familia/schemas.ts` (+ `schemas.test.ts`), `src/features/familia/invite-state.ts`, `src/features/familia/actions.ts` (+ `actions.test.ts`)
- Modify: `src/features/auth/routes.ts` (+ `routes.test.ts`), `src/features/auth/actions.ts`, `src/features/auth/forms.tsx` (+ `forms.test.tsx`), `src/features/auth/google-button.tsx`

**Interfaces:**
- Consumes: `myFamilyId` (Task 6); RPCs das Tasks 2 e 5; `env.siteUrl`; `safeNext`; `todayInSaoPaulo`; `refreshMoneyViews`; `setFlash`.
- Produces (usados pelas Tasks 8, 10, 14):
  - `schemas.ts`: `familyNameSchema` (campo `name`: espaços colapsados; `'Falta o nome.'`; `'Use até 40 caracteres.'`); `INVITE_CODE = /^[A-Za-z0-9_-]{32}$/`; `inviteCodeSchema = z.string().regex(INVITE_CODE)`; `memberIdSchema = z.uuid()`; `inviteLink(siteUrl: string, code: string): string` → `${siteUrl}/convite/${code}`; `familyPatch(input: { existingFamilyId: string | null; wantsFamily: boolean; myFamilyId: string | null }): { family_id?: string | null }` (regras no Step 1).
  - `invite-state.ts`: `type InviteState = { status: 'idle' } | { status: 'ready'; link: string; expiresOn: ISODate } | { status: 'error'; message: string }`; `INVITE_IDLE`.
  - `actions.ts` (`'use server'`, só funções async):
    - `createFamily(_: FormState, fd: FormData): Promise<FormState>` → `rpc('create_family', { p_name })`; sucesso: flash `'Família criada.'`, `redirect('/familia')`; "já participa": `redirect('/familia')`; outro erro: `SAVE_FAILED` mantendo o nome.
    - `createInvite(_: InviteState, fd: FormData): Promise<InviteState>` → `rpc('create_family_invite')`; `{ status: 'ready', link, expiresOn }` (dia em Brasília); família completa: `'A família já está completa.'`; outro erro: `SAVE_FAILED`. Revalida `/familia`. O código nunca vai para flash, log ou URL de redirecionamento.
    - `revokeInvite(fd: FormData): Promise<void>` → `rpc('revoke_family_invite', { p_id })`; flash `'Convite cancelado.'`; `redirect('/familia')`.
    - `acceptInvite(fd: FormData): Promise<void>` → código inválido no formato: `redirect('/familia')`; `rpc('accept_family_invite', { p_code })`; "já participa": `redirect('/convite/{código}?erro=familia')`; qualquer outro erro: `redirect('/convite/{código}?erro=convite')`; sucesso: lê o nome (`families .eq('id', família)`), flash `'Você entrou na família {nome}.'`, `redirect('/familia')`.
    - `leaveFamily(fd: FormData): Promise<void>` → `rpc('leave_family')`; administrador com outras pessoas: `redirect('/familia?erro=admin')`; outro erro: `redirect('/familia?erro=1')`; sucesso: flash `'Você saiu da família.'`, `redirect('/familia')`.
    - `removeMember(fd: FormData): Promise<void>` / `transferAdmin(fd: FormData): Promise<void>` → `userId` uuid; o nome vem do banco (`family_members .eq('family_id', myFamilyId).eq('user_id', userId).is('left_at', null)`), nunca do formulário; flash `'{nome} saiu da família.'` / `'{nome} agora administra a família.'`; erro: `redirect('/familia?erro=1')`.
  - Auth: `isPublicPath('/convite/{qualquer}')` → `true`; `signIn` volta para `safeNext(next)` (padrão `/inicio`); `signUp` volta para `next` quando ele começa com `/convite/` (senão `/boas-vindas`, como hoje); `signInWithGoogle(fd?: FormData)` leva `next` para `/auth/callback?next=`; `SignInForm({ next }: { next?: string })` e `SignUpForm({ next }: { next?: string })` mandam `next` escondido e mantêm `?next=` no link "Criar meu cadastro"/"Entrar".

- [ ] **Step 1: Testes que falham**

`src/features/familia/schemas.test.ts`:

```ts
test('nome da família: limpo, obrigatório, até 40', () => {
  expect(familyNameSchema.safeParse({ name: '  Família   Souza ' }).data).toEqual({ name: 'Família Souza' })
  expect(familyNameSchema.safeParse({ name: '   ' }).error?.issues[0].message).toBe('Falta o nome.')
  expect(familyNameSchema.safeParse({ name: 'x'.repeat(41) }).error?.issues[0].message).toBe('Use até 40 caracteres.')
})

test('código do convite: 32 caracteres seguros; link no domínio do app', () => {
  expect(inviteCodeSchema.safeParse('a'.repeat(32)).success).toBe(true)
  for (const bad of ['a'.repeat(31), 'a'.repeat(33), `${'a'.repeat(31)}/`, '../../inicio', '']) expect(inviteCodeSchema.safeParse(bad).success).toBe(false)
  expect(inviteLink('https://iris.app', 'abc')).toBe('https://iris.app/convite/abc')
})

test('"Gasto da família" na edição: nunca leva um gasto antigo para outra família (decisão 97)', () => {
  expect(familyPatch({ existingFamilyId: null, wantsFamily: true, myFamilyId: 'f1' })).toEqual({ family_id: 'f1' })
  expect(familyPatch({ existingFamilyId: null, wantsFamily: true, myFamilyId: null })).toEqual({})
  expect(familyPatch({ existingFamilyId: 'f0', wantsFamily: true, myFamilyId: 'f1' })).toEqual({})
  expect(familyPatch({ existingFamilyId: 'f0', wantsFamily: false, myFamilyId: null })).toEqual({ family_id: null })
  expect(familyPatch({ existingFamilyId: null, wantsFamily: false, myFamilyId: 'f1' })).toEqual({})
})
```

`src/features/familia/actions.test.ts` (fake encadeável que registra `rpc` e filtros; relógio em `2026-09-28T15:00:00Z`; `env.siteUrl` mockado como `https://iris.app`):

```ts
test('criar: manda só o nome; sucesso vai para Família com aviso', async () => {
  expect(await redirectOf(actions.createFamily(idle, form({ name: ' Família  Souza ' })))).toBe('/familia')
  expect(rpcCalls).toEqual([{ fn: 'create_family', args: { p_name: 'Família Souza' } }])
  expect(h.setFlash).toHaveBeenCalledWith('Família criada.')
})

test('criar: nome vazio fica no formulário; falha mantém o que foi digitado', async () => {
  const s = await actions.createFamily(idle, form({ name: '' }))
  expect(s).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' } })
  rpcError('create_family', 'boom')
  expect(await actions.createFamily(idle, form({ name: 'Casa' }))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Casa' } })
})

test('convite: devolve o link e o último dia; nada do código em flash', async () => {
  rpcData('create_family_invite', [{ invite_code: 'A'.repeat(32), invite_expires_at: '2026-10-05T15:00:00Z' }])
  expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'ready', link: `https://iris.app/convite/${'A'.repeat(32)}`, expiresOn: '2026-10-05' })
  expect(h.setFlash).not.toHaveBeenCalled()
  rpcError('create_family_invite', 'A família já está completa.')
  expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'error', message: 'A família já está completa.' })
})

test('aceitar: formato estranho nem chega ao banco; erros voltam ao convite sem revelar o motivo (Review Focus 2)', async () => {
  expect(await redirectOf(actions.acceptInvite(form({ code: '../inicio' })))).toBe('/familia')
  expect(rpcCalls).toEqual([])
  const code = 'b'.repeat(32)
  rpcError('accept_family_invite', 'Convite inválido.')
  expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=convite`)
  rpcError('accept_family_invite', 'Você já participa de uma família.')
  expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=familia`)
})

test('aceitar: nome da família vem do banco, filtrado pela família aceita', async () => {
  rpcData('accept_family_invite', 'f1')
  queue({ families: [{ name: 'Família Souza' }] })
  expect(await redirectOf(actions.acceptInvite(form({ code: 'c'.repeat(32) })))).toBe('/familia')
  expect(calls.find((c) => c.table === 'families')?.filters).toEqual({ 'eq:id': 'f1' })
  expect(h.setFlash).toHaveBeenCalledWith('Você entrou na família Família Souza.')
})

test('sair: administrador com outras pessoas volta com o aviso; sucesso avisa', async () => {
  rpcError('leave_family', 'Escolha quem vai administrar a família antes de sair.')
  expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia?erro=admin')
  rpcData('leave_family', null)
  expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia')
  expect(h.setFlash).toHaveBeenCalledWith('Você saiu da família.')
})

test('remover e transferir: o nome vem do banco, filtrado pela minha família e pela pessoa ativa', async () => {
  queue({ family_members: [{ family_id: 'f1' }], members: [{ display_name: 'Alex' }] })
  expect(await redirectOf(actions.removeMember(form({ userId: UUID, name: 'Outro nome' })))).toBe('/familia')
  expect(calls.filter((c) => c.table === 'family_members').map((c) => c.filters)).toEqual([
    { 'eq:user_id': 'u1', 'is:left_at': null },
    { 'eq:family_id': 'f1', 'eq:user_id': UUID, 'is:left_at': null },
  ])
  expect(rpcCalls.at(-1)).toEqual({ fn: 'remove_family_member', args: { p_user: UUID } })
  expect(h.setFlash).toHaveBeenCalledWith('Alex saiu da família.')
  expect(await redirectOf(actions.transferAdmin(form({ userId: 'nao-e-uuid' })))).toBe('/familia?erro=1')
})
```

`src/features/auth/routes.test.ts`: `isPublicPath('/convite/abc')` é `true`; `isPublicPath('/convitex')` e `isPublicPath('/familia')` são `false`; `safeNext('/convite/abc')` é `'/convite/abc'`. `src/features/auth/forms.test.tsx`: `SignInForm({ next: '/convite/abc' })` tem `input[name=next]` com esse valor e o link "Criar meu cadastro" aponta para `/criar-cadastro?next=%2Fconvite%2Fabc`; sem `next`, nenhum campo `next`. Em `src/features/auth/actions.test.ts` (novo ou existente): `signIn` com `next=/convite/abc` redireciona para lá; com `next=//evil.com` vai para `/inicio`; `signUp` com `next=/convite/abc` vai para lá, com `next=/extrato` vai para `/boas-vindas`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia src/features/auth`
Expected: FAIL — módulos e exportações ausentes.

- [ ] **Step 3: Implementação** — seguir Interfaces. Erros do banco são reconhecidos por `message.includes(...)` (mesmo padrão de `movement-actions.ts`). `redirect()` fora de `try`. As páginas `/entrar` e `/criar-cadastro` passam `safeNext(searchParams.next)` aos formulários só quando `next` começa com `/convite/` (as outras voltas continuam como hoje).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/familia src/features/auth && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/familia/schemas.ts src/features/familia/schemas.test.ts src/features/familia/invite-state.ts src/features/familia/actions.ts src/features/familia/actions.test.ts src/features/auth "src/app/(auth)/entrar/page.tsx" "src/app/(auth)/criar-cadastro/page.tsx"
git commit -m "feat(familia): criar, convidar, aceitar, sair, remover e transferir; volta ao convite depois de entrar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ações de dinheiro da família (Anotar, Nova conta, pagar, administrador)

**Files:**
- Modify: `src/features/registro/actions.ts` (+ `actions.test.ts`), `src/features/contas/actions.ts` (+ `actions.test.ts`)
- Create: `src/features/familia/money-actions.ts` (+ `money-actions.test.ts`)
- Modify: `src/features/familia/schemas.ts` (+ testes): `makeFamilyExpenseSchema`, `familyBillSchema`

**Interfaces:**
- Consumes: `myFamilyId`, `familyPatch`; RPCs da Task 3; `amountField`, `resolveWhen`/`makeExpenseSchema` (`registro/schemas`).
- Produces (usados pelas Tasks 11, 12, 14):
  - `createTransaction`: campo `family` (`'on'`) em gasto → parcelado `p_family: true`; se repete `p_family: true`; avulso `family_id: myFamilyId` (sem família: `SAVE_FAILED`, mantendo tudo). Entrada ignora o campo. `family` entra nos valores devolvidos no erro.
  - `updateTransaction`: lê também `family_id` do registro (com os filtros de hoje) e aplica `familyPatch` ao `update` do gasto.
  - `createBill`: campo `family` → `family_id: myFamilyId` (sem família: `SAVE_FAILED`).
  - `familyReturnPath(raw: string): string` — aceita só `/inicio/familia` e `/familia/contas`, cada um com ou sem `?mes=AAAA-MM`; qualquer outra coisa vira `/familia/contas`.
  - `makeFamilyExpenseSchema(today: ISODate)` → `{ amountCents, occurredOn, note }` (mesmas mensagens e limites do Anotar; sem categoria). `familyBillSchema` → `{ name, amountCents, dueDay }` (mensagens de `contas/schemas.ts`).
  - `money-actions.ts` (`'use server'`):
    - `payFamilyBill(fd: FormData): Promise<void>` → `id` uuid, `volta` por `familyReturnPath`; `rpc('pay_family_bill', { p_id })`; conta já paga ou de fora: `redirect(volta)` sem aviso; erro: `redirect('/familia/contas?erro=1')`; sucesso: flash `'Conta marcada como paga.'`, `redirect(volta)`.
    - `updateFamilyExpense(_: FormState, fd: FormData): Promise<FormState>` → `rpc('admin_update_family_expense', { p_id, p_amount_cents, p_on, p_note })`; flash `'Alterações salvas.'`; `redirect('/inicio/familia?mes={mês da data}')`.
    - `deleteFamilyExpense(fd: FormData): Promise<void>` → `rpc('admin_delete_family_expense', { p_id })`; flash `'Gasto excluído.'`; `redirect('/inicio/familia?mes={mês devolvido}')`.
    - `updateFamilyBill(_: FormState, fd: FormData): Promise<FormState>` → `rpc('update_family_recurrence', { p_id, p_name, p_amount_cents, p_due_day })`; flash `'Alterações salvas.'`; `redirect('/familia/contas')`.
    - `endFamilyBill(fd: FormData): Promise<void>` → `rpc('end_family_recurrence', { p_id })`; flash `'Encerrada. O histórico continua no Extrato.'` (Plano 3); `redirect('/familia/contas')`.

- [ ] **Step 1: Testes que falham**

Em `src/features/registro/actions.test.ts` (acrescentar; mesmo fake do arquivo):

```ts
test('"Gasto da família" avulso grava a família de quem anota, lida do banco pela pessoa (RN-18)', async () => {
  queue({ family_members: [{ family_id: 'f1' }] })
  await redirectOf(createTransaction(idle, expenseForm({ family: 'on' })))
  expect(calls.find((c) => c.table === 'family_members')?.filters).toEqual({ 'eq:user_id': 'u1', 'is:left_at': null })
  expect(calls.find((c) => c.table === 'transactions' && c.op === 'insert')?.payload).toMatchObject({ user_id: 'u1', family_id: 'f1' })
})

test('"Gasto da família" sem família: não salva e mantém o que foi digitado (Review Focus 3)', async () => {
  queue({ family_members: [] })
  const s = await createTransaction(idle, expenseForm({ family: 'on', amount: '12,50' }))
  expect(s).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { family: 'on', amount: '12,50' } })
  expect(calls.some((c) => c.op === 'insert')).toBe(false)
})

test('parcelado e conta que se repete levam p_family; entrada nunca', async () => {
  await redirectOf(createTransaction(idle, expenseForm({ family: 'on', parcelado: 'on', installments: '3' })))
  expect(rpcCalls.at(-1)).toMatchObject({ fn: 'create_installment_purchase', args: { p_family: true } })
  await redirectOf(createTransaction(idle, expenseForm({ family: 'on', repeats: 'on', frequency: 'monthly' })))
  expect(rpcCalls.at(-1)).toMatchObject({ fn: 'create_recurring_transaction', args: { p_family: true } })
  await redirectOf(createTransaction(idle, incomeForm({ family: 'on' })))
  expect(calls.find((c) => c.op === 'insert')?.payload).not.toHaveProperty('family_id')
})

test('editar: aplica familyPatch e mantém todos os filtros de dono (nunca remover)', async () => {
  queue({ transactions: [{ kind: 'expense', status: 'confirmed', paid_on: null, family_id: null }], family_members: [{ family_id: 'f1' }] })
  await redirectOf(updateTransaction(idle, expenseForm({ id: UUID, family: 'on' })))
  const upd = calls.find((c) => c.op === 'update')!
  expect(upd.payload).toMatchObject({ family_id: 'f1' })
  expect(upd.filters).toMatchObject({ 'eq:id': UUID, 'eq:user_id': 'u1', 'eq:status': 'confirmed', 'is:installment_plan_id': null, 'is:goal_id': null })
})
```

Em `src/features/familia/schemas.test.ts`: `familyReturnPath` aceita `/inicio/familia`, `/inicio/familia?mes=2026-08` e `/familia/contas`; recusa `https://evil.com`, `//evil.com`, `/extrato` e `/inicio/familia?mes=abc` (todos viram `/familia/contas`). `makeFamilyExpenseSchema` recusa data antes de 2000 e mais de 1 ano à frente ("Escolha o dia.").

Em `src/features/contas/actions.test.ts`: `createBill` com `family: 'on'` grava `family_id: 'f1'` (lido por `myFamilyId`); sem família, `SAVE_FAILED`.

`src/features/familia/money-actions.test.ts`:

```ts
test('pagar conta da família: só o id; volta para onde estava; aviso da copy', async () => {
  expect(await redirectOf(payFamilyBill(form({ id: UUID, volta: '/inicio/familia' })))).toBe('/inicio/familia')
  expect(rpcCalls).toEqual([{ fn: 'pay_family_bill', args: { p_id: UUID } }])
  expect(h.setFlash).toHaveBeenCalledWith('Conta marcada como paga.')
  rpcError('pay_family_bill', 'Conta não encontrada.')
  expect(await redirectOf(payFamilyBill(form({ id: UUID, volta: 'https://evil.com' })))).toBe('/familia/contas')
  expect(await redirectOf(payFamilyBill(form({ id: 'x' })))).toBe('/familia/contas')
})

test('administrador edita gasto da família: valor, data e nota; erro de valor fica no campo', async () => {
  expect(await updateFamilyExpense(idle, form({ id: UUID, amount: 'abc', when: 'today', date: '', note: '' })))
    .toMatchObject({ fieldErrors: { amount: 'Esse valor não parece certo. Use apenas números.' } })
  expect(await redirectOf(updateFamilyExpense(idle, form({ id: UUID, amount: '99,90', when: 'other', date: '2026-08-10', note: ' lâmpadas ' }))))
    .toBe('/inicio/familia?mes=2026-08')
  expect(rpcCalls.at(-1)).toEqual({ fn: 'admin_update_family_expense', args: { p_id: UUID, p_amount_cents: 9990, p_on: '2026-08-10', p_note: 'lâmpadas' } })
})

test('administrador exclui: volta ao mês do gasto excluído', async () => {
  rpcData('admin_delete_family_expense', '2026-09-03')
  expect(await redirectOf(deleteFamilyExpense(form({ id: UUID })))).toBe('/inicio/familia?mes=2026-09')
  expect(h.setFlash).toHaveBeenCalledWith('Gasto excluído.')
})

test('alterar e encerrar conta da família', async () => {
  expect(await redirectOf(updateFamilyBill(idle, form({ id: UUID, name: 'Aluguel', amount: '1.800,00', dueDay: '5' })))).toBe('/familia/contas')
  expect(rpcCalls.at(-1)).toEqual({ fn: 'update_family_recurrence', args: { p_id: UUID, p_name: 'Aluguel', p_amount_cents: 180000, p_due_day: 5 } })
  expect(await redirectOf(endFamilyBill(form({ id: UUID })))).toBe('/familia/contas')
  expect(h.setFlash).toHaveBeenLastCalledWith('Encerrada. O histórico continua no Extrato.')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia src/features/registro src/features/contas`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces. `myFamilyId` é lido só quando o formulário pede a família (o Anotar sem família não faz leitura a mais).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/actions.ts src/features/registro/actions.test.ts src/features/contas/actions.ts src/features/contas/actions.test.ts src/features/familia/money-actions.ts src/features/familia/money-actions.test.ts src/features/familia/schemas.ts src/features/familia/schemas.test.ts
git commit -m "feat(familia): gasto e conta da família no Anotar e em Nova conta; pagar e ajustes do administrador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ações das metas da família

**Files:**
- Modify: `src/features/metas/actions.ts` (+ `actions.test.ts`): `createGoal` com "Meta da família"
- Create: `src/features/metas/family-goal-actions.ts` (+ `family-goal-actions.test.ts`)

**Interfaces:**
- Consumes: RPCs da Task 4; `makeGoalSchema`, `makeUseSchema` (`metas/schemas`); `crossedMilestone` (`domain/goals`); `formatBRL`.
- Produces (usados pela Task 12):
  - `createGoal`: campo `family: 'on'` → `rpc('create_family_goal', { p_name, p_target_cents, p_deadline })` (prazo no 1º dia do mês, ou `null`); flash `'Meta criada. O primeiro passo já foi dado.'`; `redirect('/metas')`. Sem `family`, igual a hoje.
  - `family-goal-actions.ts` (`'use server'`), todas com `id` uuid:
    - `updateFamilyGoal(_: FormState, fd: FormData): Promise<FormState>` → `rpc('update_family_goal', …)`; flash `'Alterações salvas.'`; `redirect('/metas/{id}')`.
    - `deleteFamilyGoal(fd: FormData): Promise<void>` → `rpc('delete_family_goal', { p_goal_id })`; flash `'Meta excluída.'`; `redirect('/metas')`.
    - `depositToFamilyGoal(_: FormState, fd: FormData): Promise<FormState>` → antes, o total por `rpc('family_goal_totals')`; depois `rpc('deposit_family_goal', …)`; aviso como `depositToGoal`, com o marco (`crossedMilestone`) calculado **sobre o total da família**; `redirect('/metas/{id}')`.
    - `withdrawFromFamilyGoal(_: FormState, fd: FormData): Promise<FormState>` → `rpc('withdraw_family_goal', …)`; "maior que o guardado": `fieldErrors.amount = 'Sua parte nesta meta é {parte}. Tire até esse valor.'` (parte por `rpc('goal_balance')`); flash `'Pronto. O valor voltou para o seu mês.'`.
    - `spendFromFamilyGoal(_: FormState, fd: FormData): Promise<FormState>` → `rpc('use_family_goal', …)`; flash `'Anotado. Seu mês já está atualizado.'`; `redirect('/metas/{id}')` (sem a pergunta da sobra — decisão 105).
    - `deleteFamilyGoalUse(fd: FormData): Promise<void>` → `rpc('delete_family_goal_use', { p_transaction_id })`; flash `'Excluído. Seu mês já está atualizado.'`; `redirect('/metas/{meta devolvida}')`.

- [ ] **Step 1: Testes que falham** — `src/features/metas/family-goal-actions.test.ts` (mesmo fake de `movement-actions.test.ts`):

```ts
test('guardar: marco pela meta da família inteira (Metade do caminho…)', async () => {
  rpcData('family_goal_totals', [{ goal_id: UUID, saved_cents: 495000 }])
  queue({ goals: [{ name: 'Reforma da cozinha', target_cents: 1000000 }] })
  expect(await redirectOf(depositToFamilyGoal(idle, form({ id: UUID, amount: '100,00' })))).toBe(`/metas/${UUID}`)
  expect(rpcCalls.at(-1)).toEqual({ fn: 'deposit_family_goal', args: { p_goal_id: UUID, p_amount_cents: 10000 } })
  expect(h.setFlash).toHaveBeenCalledWith('Metade do caminho até Reforma da cozinha.')
  expect(calls.find((c) => c.table === 'goals')?.filters).toMatchObject({ 'eq:id': UUID, 'eq:family_id': 'f1' })
})

test('tirar mais do que a própria parte: mensagem calma com a parte', async () => {
  rpcError('withdraw_family_goal', 'Valor maior que o guardado.')
  rpcData('goal_balance', 180000)
  const s = await withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '2.000,00' }))
  expect(s.status === 'error' && s.fieldErrors?.amount).toBe(`Sua parte nesta meta é ${formatBRL(180000)}. Tire até esse valor.`)
})

test('usar: vai para a meta, sem pergunta da sobra', async () => {
  rpcData('use_family_goal', [{ tx_id: UUID2, funded_cents: 300000, leftover_cents: 100000 }])
  expect(await redirectOf(spendFromFamilyGoal(idle, form({ id: UUID, amount: '3.000,00', categoryId: UUID3 })))).toBe(`/metas/${UUID}`)
  expect(rpcCalls.at(-1)).toEqual({ fn: 'use_family_goal', args: { p_goal_id: UUID, p_amount_cents: 300000, p_category_id: UUID3 } })
})

test('ações com id que não é uuid não chegam ao banco', async () => {
  for (const act of [() => deleteFamilyGoal(form({ id: 'x' })), () => deleteFamilyGoalUse(form({ id: 'x' }))]) await redirectOf(act())
  expect(rpcCalls).toEqual([])
})
```

Em `src/features/metas/actions.test.ts`: `createGoal` com `family: 'on'` chama `create_family_goal` com `{ p_name: 'Reforma', p_target_cents: 1000000, p_deadline: null }` e não faz `insert` em `goals`; sem `family`, faz o `insert` de hoje com `user_id: 'u1'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces. O nome e o valor da meta para o aviso vêm de `goals .eq('id', id).eq('family_id', myFamilyId)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/actions.ts src/features/metas/actions.test.ts src/features/metas/family-goal-actions.ts src/features/metas/family-goal-actions.test.ts
git commit -m "feat(metas): ações das metas da família" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Telas — Família e convite

**Files:**
- Create: `src/features/familia/view-model.ts` (+ `view-model.test.ts`): `buildFamiliaPage`, `eventText`, `sinceLabel`, `inviteView`
- Create: `src/features/familia/familia-page.tsx`, `invite-panel.tsx`, `member-actions.tsx`, `leave-family.tsx` (+ `familia-page.test.tsx`, `invite-panel.test.tsx`)
- Create: `src/app/(app)/familia/page.tsx`, `src/app/(auth)/convite/[codigo]/page.tsx`

**Interfaces:**
- Consumes: `loadMyFamily`, `MyFamily`, `FamilyEventRow` (Task 6); `createFamily`, `createInvite`, `revokeInvite`, `acceptInvite`, `leaveFamily`, `removeMember`, `transferAdmin`, `INVITE_CODE`, `InviteState` (Task 7); `FAMILY_LIMITS` (Task 1); `formatBRL`, `dayMonthLabel`, `todayInSaoPaulo`, `monthName`; `ConfirmAction`, `Button`, `Card`, `FormAlert`, `PageHeader`, `ListCard`/`ListRow`.
- Produces:
  - `sinceLabel(joinedAt: string, today: ISODate): string` — mês de entrada (Brasília): `'agosto'` no ano de hoje, `'agosto de 2025'` em outro ano (decisão 92).
  - `eventText(e: FamilyEventRow): string` — `member_left` com meta: `'{nome} saiu da família, e {valor} da meta {meta} voltaram para {nome}.'` (RN-22d); sem meta: `'{nome} saiu da família.'`; `member_deleted` com meta: `'Um membro saiu da família, e a meta {meta} foi atualizada.'` (RN-22e); sem meta: `'Um membro saiu da família.'`.
  - `type FamiliaPageView = { kind: 'none' } | { kind: 'member'; name: string; isAdmin: boolean; members: { userId: string; label: string; initial: string; caption: string; isMe: boolean; isAdmin: boolean }[]; invite: { id: string; caption: string } | null; canInvite: boolean; events: string[]; leave: 'member' | 'admin-with-others' | 'alone' }`; `buildFamiliaPage(input: { family: MyFamily | null; today: ISODate }): FamiliaPageView` — só participações ativas, "Você" primeiro, depois por `joinedAt`; legenda `'Administra a família'` ou `'Membro desde {sinceLabel}'`; convite (só administrador): o mais recente pendente, `'Convite pendente · vale até {dia de mês}'`; `canInvite` = administrador e menos de `FAMILY_LIMITS.maxMembers` ativos.
  - `type InviteView = { kind: 'invalid' } | { kind: 'signed-out'; signUpHref: string; signInHref: string } | { kind: 'has-family' } | { kind: 'ready'; code: string; familyName: string; invitedBy: string | null }`; `inviteView(input: { code: string; signedIn: boolean; erro: string | undefined; preview: { familyName: string; invitedBy: string | null } | null }): InviteView` — código fora de `INVITE_CODE` → `invalid`; sem sessão → `signed-out` com `?next=` codificado (`/criar-cadastro?next=%2Fconvite%2F{código}`); `erro=familia` → `has-family`; `erro=convite` ou sem prévia → `invalid`.
  - `/familia`: sem família → `FamilyCreate`: título "Criar família", texto "Anote os gastos da casa junto com quem mora com você. Cada pessoa continua com o próprio mês.", campo "Nome da família" (placeholder "Ex.: Família Souza"), botão "Criar família" (`createFamily`), "Recebeu um convite? Abra o link que chegou para você." e "O que a família vê"; com família → cabeçalho com o nome, cartão-link "Ver o mês da família" / "Gastos comuns, contas e metas da casa" para `/inicio/familia`, cartão-link "Contas da família" para `/familia/contas`, "Quem participa" (com ações do administrador em cada membro que não é ele: "Tornar administrador" e "Remover da família", cada um com confirmação), convite pendente com "Cancelar convite", "Convidar pessoa" (`InvitePanel`), "Avisos da família" (até 5, `eventText`), "O que a família vê" (texto do protótipo) e "Sair da família" (`LeaveFamily`). `?erro=admin` mostra `FormAlert` "Antes de sair, escolha quem vai administrar a família."; `?erro=1` mostra "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.".
  - `InvitePanel` (client): `useActionState(createInvite, INVITE_IDLE)`; botão "Convidar pessoa"; pronto: "Envie este link para quem vai participar. Ele vale até {dia de mês} e serve para uma pessoa.", campo só leitura com rótulo "Link do convite", botão "Copiar link" (`navigator.clipboard.writeText`; depois, `role="status"` "Link copiado.") e "Compartilhar" (só se `navigator.share` existir); erro: `FormAlert` com a mensagem.
  - `LeaveFamily({ mode }: { mode: 'member' | 'admin-with-others' | 'alone' })` — `admin-with-others`: sem botão, com o texto "Antes de sair, escolha quem vai administrar a família: toque em Tornar administrador ao lado da pessoa."; senão `ConfirmAction` "Sair da família" → título "Sair da família?", corpo (membro) "Sua parte nas metas da família volta para o seu Disponível deste mês. Os gastos que você registrou continuam no histórico da família." ou (sozinho) "Você é a única pessoa na família. Ao sair, a família é encerrada.", botões "Sair da família" · "Ficar".
  - `MemberActions({ userId, name })` — "Tornar administrador" (nome acessível "Tornar {nome} administrador"; confirmação "{nome} vai administrar a família?" / "Você continua participando como membro." / "Tornar administrador" · "Cancelar") e "Remover da família" (nome acessível "Remover {nome} da família"; confirmação "Remover {nome} da família?" / "A parte de {nome} nas metas da família volta para {nome}. Os gastos que {nome} registrou continuam no histórico da família." / "Remover" · "Cancelar"). Nunca manda o nome no formulário (só `userId`).
  - `/convite/[codigo]` (grupo `(auth)`, pública, `metadata: { robots: { index: false }, referrer: 'no-referrer' }`): lê a sessão com `supabase.auth.getUser()` (sem `requireUser`, a página é pública) e, com sessão, `rpc('invite_preview', { p_code })`; mostra por `inviteView`: `invalid` → "Este convite não vale mais. Peça um novo link a quem convidou você." + "Ver meu mês" (`/inicio`); `signed-out` → "Você recebeu um convite" / "Crie seu cadastro ou entre para participar da família na Íris." + "Criar meu cadastro" e "Entrar"; `has-family` → "Você já participa de uma família. Para entrar em outra, saia da atual primeiro." + "Ver a família" (`/familia`); `ready` → título "Entrar na família {nome}?", "{quem convidou} convidou você." (se houver), "A família vê só os gastos que você marcar como da família, as contas da casa e as metas da família. Seu Disponível, suas entradas e seus cartões continuam só seus.", formulário `acceptInvite` (código escondido) com "Entrar na família" e o link "Agora não" (`/inicio`).

- [ ] **Step 1: Testes que falham**

`src/features/familia/view-model.test.ts`:

```ts
const NBSP = String.fromCharCode(0xa0)
const fam = (p: Partial<MyFamily> = {}): MyFamily => ({
  id: 'f1', name: 'Família Souza', meId: 'u1', role: 'admin', invites: [], events: [],
  members: [
    { userId: 'u2', role: 'member', displayName: 'Alex', joinedAt: '2026-08-10T12:00:00Z', leftAt: null },
    { userId: 'u1', role: 'admin', displayName: 'Camila', joinedAt: '2026-07-01T12:00:00Z', leftAt: null },
    { userId: 'u3', role: 'member', displayName: 'Jordan', joinedAt: '2026-08-01T12:00:00Z', leftAt: '2026-09-01T12:00:00Z' },
  ], ...p,
})

test('sem família: tela de criar', () => {
  expect(buildFamiliaPage({ family: null, today: '2026-09-28' })).toEqual({ kind: 'none' })
})

test('protótipo Familia: Você primeiro, quem saiu fica de fora, legendas', () => {
  const v = buildFamiliaPage({ family: fam(), today: '2026-09-28' })
  expect(v.kind === 'member' && v.members.map((m) => [m.label, m.caption])).toEqual([
    ['Você', 'Administra a família'],
    ['Alex', 'Membro desde agosto'],
  ])
  expect(v.kind === 'member' && [v.canInvite, v.leave]).toEqual([true, 'admin-with-others'])
})

test('convite pendente só para o administrador; sair conforme o papel (RN-25)', () => {
  const admin = buildFamiliaPage({ family: fam({ invites: [{ id: 'i1', expiresAt: '2026-10-05T02:00:00Z' }] }), today: '2026-09-28' })
  expect(admin.kind === 'member' && admin.invite).toEqual({ id: 'i1', caption: 'Convite pendente · vale até 4 de outubro' })
  const member = buildFamiliaPage({ family: fam({ role: 'member', meId: 'u2' }), today: '2026-09-28' })
  expect(member.kind === 'member' && [member.isAdmin, member.invite, member.canInvite, member.leave]).toEqual([false, null, false, 'member'])
  const alone = buildFamiliaPage({ family: fam({ members: [fam().members[1]] }), today: '2026-09-28' })
  expect(alone.kind === 'member' && alone.leave).toBe('alone')
})

test('família completa não convida', () => {
  const members = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i + 1}`, role: (i === 0 ? 'admin' : 'member') as FamilyRole, displayName: `P${i}`, joinedAt: '2026-08-01T12:00:00Z', leftAt: null }))
  const v = buildFamiliaPage({ family: fam({ members }), today: '2026-09-28' })
  expect(v.kind === 'member' && v.canInvite).toBe(false)
})

test('avisos da família (RN-22d, RN-22e)', () => {
  const e = (p: Partial<FamilyEventRow>): FamilyEventRow => ({ id: 'e', kind: 'member_left', memberName: 'Alex', goalName: null, amountCents: null, createdAt: '', ...p })
  expect(eventText(e({ goalName: 'Reforma da cozinha', amountCents: 180000 }))).toBe(`Alex saiu da família, e R$${NBSP}1.800,00 da meta Reforma da cozinha voltaram para Alex.`)
  expect(eventText(e({}))).toBe('Alex saiu da família.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null, goalName: 'Viagem' }))).toBe('Um membro saiu da família, e a meta Viagem foi atualizada.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null }))).toBe('Um membro saiu da família.')
})

test('membro desde: com o ano quando não é o ano de hoje', () => {
  expect(sinceLabel('2025-12-31T23:30:00Z', '2026-09-28')).toBe('dezembro de 2025')
  expect(sinceLabel('2026-01-01T02:00:00Z', '2026-09-28')).toBe('dezembro de 2025')
})

test('tela do convite (Review Focus 2)', () => {
  const code = 'a'.repeat(32)
  expect(inviteView({ code: '../x', signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: false, erro: undefined, preview: null })).toEqual({
    kind: 'signed-out', signUpHref: `/criar-cadastro?next=%2Fconvite%2F${code}`, signInHref: `/entrar?next=%2Fconvite%2F${code}`,
  })
  expect(inviteView({ code, signedIn: true, erro: 'familia', preview: null })).toEqual({ kind: 'has-family' })
  expect(inviteView({ code, signedIn: true, erro: 'convite', preview: { familyName: 'X', invitedBy: null } })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: { familyName: 'Família Souza', invitedBy: 'Camila' } }))
    .toEqual({ kind: 'ready', code, familyName: 'Família Souza', invitedBy: 'Camila' })
})
```

`src/features/familia/invite-panel.test.tsx` (mock de `useActionState` devolvendo `{ status: 'ready', link: 'https://iris.app/convite/abc', expiresOn: '2026-10-05' }`):

```ts
test('mostra o link, copia e avisa; sem "Compartilhar" quando o navegador não tem', async () => {
  const writeText = vi.fn(async () => {})
  Object.assign(navigator, { clipboard: { writeText }, share: undefined })
  render(<InvitePanel />)
  expect(screen.getByLabelText('Link do convite')).toHaveProperty('value', 'https://iris.app/convite/abc')
  expect(screen.getByText('Envie este link para quem vai participar. Ele vale até 5 de outubro e serve para uma pessoa.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copiado.'))
  expect(writeText).toHaveBeenCalledWith('https://iris.app/convite/abc')
  expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull()
})
```

`src/features/familia/familia-page.test.tsx`: sem família → campo com rótulo "Nome da família" e botão "Criar família"; membro → sem "Convidar pessoa", sem "Remover Alex da família"; administrador → botões "Convidar pessoa", "Tornar Alex administrador", "Remover Alex da família", "Cancelar convite", e nenhum botão com o próprio nome; `admin-with-others` → sem botão "Sair da família" e com o texto de antes de sair; `member` → botão "Sair da família" abre "Sair da família?" com "Ficar"; todos os botões com `min-h-11` ou `size-11`; o formulário de remover tem só `userId` (nenhum campo `name`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces, com o visual do protótipo `Familia` (cartões, iniciais em círculo, "Administra a família" em `text-muted`). `/familia/page.tsx`: `todayInSaoPaulo()`, `loadMyFamily()`, `await searchParams`. A página do convite **não** usa `requireUser` (pública); o formulário de aceitar chama a ação, que chama `requireUser`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/familia && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/familia "src/app/(app)/familia/page.tsx" "src/app/(auth)/convite"
git commit -m "feat(familia): tela da família, convite por link e página do convite" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Telas — Seu mês da família (Eu · Família), contas da família e gasto da família (administrador)

**Files:**
- Modify: `src/features/familia/view-model.ts` (+ testes): `buildFamilyMonth`, `buildFamilyBills`
- Create: `src/features/familia/view-switch.tsx`, `family-month.tsx`, `family-bills.tsx`, `family-bill-form.tsx`, `family-expense-form.tsx` (+ `family-month.test.tsx`, `family-bills.test.tsx`, `view-switch.test.tsx`)
- Modify: `src/features/contas/pay-button.tsx` (prop opcional `action`)
- Create: `src/app/(app)/inicio/familia/page.tsx`, `src/app/(app)/familia/contas/page.tsx`, `src/app/(app)/familia/contas/[id]/page.tsx`, `src/app/(app)/familia/gastos/[id]/page.tsx`
- Modify: `src/app/(app)/inicio/page.tsx` (seletor "Eu · Família")

**Interfaces:**
- Consumes: `familyMonth`, `authorLabel`, `familyCategoryGroup` (Task 1); `loadFamilySummary`, `loadMyFamily`, `loadFamilyExpenses`, `loadFamilyExpense`, `loadFamilyBills`, `loadFamilyRecurrences`, `loadFamilyGoals`, `loadGoalMovements` (Task 6); `payFamilyBill`, `updateFamilyExpense`, `deleteFamilyExpense`, `updateFamilyBill`, `endFamilyBill` (Task 8); `goalBalance`, `goalProgress` (`domain/goals`); `dayLabel`, `monthLabel`, `relativeDue`, `recurrenceLabel`; `MonthNav` (`basePath`), `ProgressBar`, `Money`, `formatCompactBRL`.
- Produces:
  - `ViewSwitch({ month, current }: { month: MonthKey; current: 'eu' | 'familia' })` — `<nav aria-label="Ver o mês de">` com os links "Eu" (`/inicio?mes=`) e "Família" (`/inicio/familia?mes=`), `aria-current="page"` no atual, alvos de 44 px. Aparece em `/inicio` só para quem tem família (`loadFamilySummary`).
  - `interface FamilyMonthView { label: string; isCurrentMonth: boolean; totalCents: number; byMember: { label: string; initial: string; cents: number }[]; categories: { label: string; cents: number; percent: number }[]; bills: { id: string; name: string; amountCents: number; due: string }[]; goals: { id: string; name: string; percent: number; remainingCents: number; savedCents: number; targetCents: number; myPartCents: number }[]; recent: { id: string; title: string; caption: string; amountCents: number; href: string | null }[]; empty: boolean }`
  - `buildFamilyMonth(input: { month: MonthKey; today: ISODate; meId: string; isAdmin: boolean; expenses: FamilyExpenseRow[]; bills: FamilyBillRow[]; goals: FamilyGoalRow[]; myMovements: GoalMovementRow[] }): FamilyMonthView` — números de `familyMonth`; `percent` de cada categoria sobre o total (arredondado para baixo); contas (só no mês atual, até 3, vencidas primeiro, `due` = `relativeDue`); metas ativas (até 2, a de maior percentual primeiro); últimos 5 com `title` = rótulo da categoria (A3), `caption` = `'{dia} · por {quem}'` (`'por você'` para a própria pessoa, `'por Ex-membro'` sem nome), `href`: próprio → `/extrato/{id}`; de outra pessoa → `/familia/gastos/{id}` só para o administrador; senão `null`.
  - `interface FamilyBillsView { overdue: FamilyBillItem[]; due: FamilyBillItem[]; recurring: { id: string; name: string; amountCents: number; caption: string; canManage: boolean }[] }` com `FamilyBillItem = { id: string; name: string; amountCents: number; due: string; author: string }`; `buildFamilyBills(input: { today: ISODate; meId: string; isAdmin: boolean; members: MemberRow[]; bills: FamilyBillRow[]; recurrences: FamilyRecurrenceRow[] }): FamilyBillsView` — vencidas = `dueOn < today`; `caption` = `'{recurrenceLabel} · criada por {quem}'`; `canManage` = quem criou ou administrador.
  - `/inicio/familia?mes=`: sem família → `redirect('/familia')`; cabeçalho do protótipo `Mobile-Familia`: nome da família, "Oi, {nome}.", `ViewSwitch` e `MonthNav basePath="/inicio/familia"`; cartão "Gastos da família em {mês}" com o total, "Aqui aparecem só os gastos marcados como da família." e a linha por pessoa; "Contas da família" (com "Marcar como paga" — `PayBillButton` com `action={payFamilyBill}` e `back='/inicio/familia'` — e "Ver todas" → `/familia/contas`); "Para onde vai o dinheiro da casa"; "Metas da família" ("Ver metas" → `/metas`, "Faltam {valor} para {meta}.", "{guardado} de {valor}", "Sua parte: {valor}", "Guardar dinheiro" → `/metas/{id}/guardar`); "Últimos gastos da família"; rodapé "O Disponível e as entradas de cada pessoa nunca aparecem aqui."; vazio: "Nenhum gasto da família neste mês. Quando alguém marcar um gasto como da família, ele aparece aqui." + "Anotar gasto".
  - `/familia/contas`: "Contas da família" — "Vencidas", "A pagar" (cada uma com `PayBillButton` curto, `action={payFamilyBill}`, `back='/familia/contas'`, confirmação da copy "Marcar {conta} como paga?" · "Marcar como paga" · "Agora não"), vazio "Nenhuma conta da família a pagar."; "Contas da família que se repetem" com "Alterar" (→ `/familia/contas/{id}`) e "Encerrar" (confirmação do Plano 3) só quando `canManage`.
  - `/familia/contas/[id]`: `FamilyBillForm` (Nome, Valor, Vence dia; "Salvar conta"); molde que não é da família, encerrado ou sem permissão → `redirect('/familia/contas')`.
  - `/familia/gastos/[id]`: só administrador (senão `redirect('/inicio/familia')`); `id` não uuid ou gasto não encontrado → `redirect('/inicio/familia')`; gasto da própria pessoa → `redirect('/extrato/{id}')`; `FamilyExpenseForm`: "Registrado por {quem}", "Quanto foi?", "Quando?" (Hoje · Ontem · Outro dia), "Uma nota, se quiser", "Salvar gasto"; "Excluir" com confirmação "Excluir este gasto?" / "O mês de quem registrou será recalculado." / "Excluir" · "Cancelar".

- [ ] **Step 1: Testes que falham** — em `src/features/familia/view-model.test.ts`:

```ts
const x = (p: Partial<FamilyExpenseRow>): FamilyExpenseRow => ({
  id: 'x', effectiveOn: '2026-09-28', amountCents: 0, categoryKey: 'mercado', categoryName: 'Mercado', note: null,
  authorId: 'u1', authorName: 'Camila', createdAt: '2026-09-28T12:00:00Z', ...p,
})

test('protótipo Mobile-Familia: total, pessoas, casa, últimos com quem registrou', () => {
  const v = buildFamilyMonth({
    month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, myMovements: [], goals: [], bills: [],
    expenses: [
      x({ id: 'a', amountCents: 31240, authorId: 'u2', authorName: 'Alex' }),
      x({ id: 'b', effectiveOn: '2026-09-27', amountCents: 8990, categoryKey: 'casa', categoryName: 'Casa' }),
      x({ id: 'c', effectiveOn: '2026-09-02', amountCents: 40000, authorId: null, authorName: null, categoryKey: null, categoryName: 'Pet' }),
    ],
  })
  expect(v.totalCents).toBe(80230)
  expect(v.byMember.map((m) => [m.label, m.cents])).toEqual([['Você', 8990], ['Ex-membro', 40000], ['Alex', 31240]])
  expect(v.recent.map((r) => [r.title, r.caption, r.href])).toEqual([
    ['Mercado', 'Hoje · por Alex', null],
    ['Casa', 'Ontem · por você', '/extrato/b'],
    ['Pet', '2 de setembro · por Ex-membro', null],
  ])
})

test('administrador abre o gasto de outra pessoa para ajustar (RN-21)', () => {
  const v = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: true, myMovements: [], goals: [], bills: [], expenses: [x({ id: 'a', authorId: 'u2', authorName: 'Alex' }), x({ id: 'z', authorId: null, authorName: null })] })
  expect(v.recent.map((r) => r.href)).toEqual(['/familia/gastos/a', '/familia/gastos/z'])
})

test('metas da família: total, quanto falta e só a minha parte (A4 B)', () => {
  const goal = { id: 'g1', name: 'Reforma da cozinha', targetCents: 1000000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '', familyId: 'f1', createdBy: 'u2', savedCents: 300000 } as FamilyGoalRow
  const v = buildFamilyMonth({
    month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], bills: [], goals: [goal],
    myMovements: [{ id: 'm', goalId: 'g1', kind: 'deposit', amountCents: 180000, occurredOn: '2026-09-01', transactionId: null, createdAt: '' }],
  })
  expect(v.goals).toEqual([{ id: 'g1', name: 'Reforma da cozinha', percent: 30, remainingCents: 700000, savedCents: 300000, targetCents: 1000000, myPartCents: 180000 }])
})

test('contas da família no Seu mês: só no mês atual, até 3, vencidas primeiro', () => {
  const bills = [
    { id: 'b1', name: 'Aluguel', amountCents: 180000, dueOn: '2026-10-03', authorId: 'u2' },
    { id: 'b2', name: 'Luz', amountCents: 20000, dueOn: '2026-09-20', authorId: 'u1' },
    { id: 'b3', name: 'Água', amountCents: 9000, dueOn: '2026-09-30', authorId: 'u1' },
    { id: 'b4', name: 'Gás', amountCents: 9000, dueOn: '2026-09-29', authorId: 'u1' },
  ]
  const now = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], goals: [], myMovements: [], bills })
  expect(now.bills.map((b) => b.id)).toEqual(['b2', 'b4', 'b3'])
  expect(buildFamilyMonth({ month: '2026-08', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], goals: [], myMovements: [], bills }).bills).toEqual([])
})

test('contas da família: vencidas, a pagar e quem pode alterar', () => {
  const v = buildFamilyBills({
    today: '2026-09-28', meId: 'u1', isAdmin: false,
    members: [{ userId: 'u2', role: 'admin', displayName: 'Alex', joinedAt: '', leftAt: null }],
    bills: [{ id: 'b1', name: 'Luz', amountCents: 1, dueOn: '2026-09-20', authorId: 'u2' }, { id: 'b2', name: 'Água', amountCents: 1, dueOn: '2026-09-30', authorId: 'u1' }],
    recurrences: [
      { id: 'r1', name: 'Aluguel', amountCents: 180000, frequency: 'monthly', dueDay: 5, dueMonth: null, authorId: 'u2' },
      { id: 'r2', name: 'Água', amountCents: 9000, frequency: 'monthly', dueDay: 30, dueMonth: null, authorId: 'u1' },
    ],
  })
  expect([v.overdue.map((b) => b.id), v.due.map((b) => b.id)]).toEqual([['b1'], ['b2']])
  expect(v.recurring.map((r) => [r.name, r.canManage])).toEqual([['Aluguel', false], ['Água', true]])
  expect(v.recurring[0].caption).toMatch(/ · criada por Alex$/)
})
```


`src/features/familia/view-switch.test.tsx`: dois links com nomes exatos "Eu" e "Família", `href` `/inicio?mes=2026-09` e `/inicio/familia?mes=2026-09`, `aria-current="page"` só no atual. `src/features/familia/family-month.test.tsx`: o cartão do total tem "Gastos da família em setembro" e, por `textContent`, `R$ 802,30`; o rodapé "O Disponível e as entradas de cada pessoa nunca aparecem aqui." está sempre lá; item de gasto com `href: null` não é link; vazio mostra o texto e "Anotar gasto" (`/anotar`). `src/features/familia/family-bills.test.tsx`: "Encerrar" e "Alterar" só nas contas com `canManage`; "Marcar Luz como paga" (nome acessível, como no Plano 3) em cada conta; vazio "Nenhuma conta da família a pagar.".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces e o protótipo `Mobile-Familia` (desktop: duas colunas como o Seu mês, `md:grid-cols-3`). As páginas carregam em paralelo (`Promise.all`) depois de `loadMyFamily`. `PayBillButton` ganha `action?: (fd: FormData) => Promise<void>` (padrão `markBillPaid`), sem mudar quem já o usa.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/familia src/features/contas/pay-button.tsx "src/app/(app)/inicio" "src/app/(app)/familia"
git commit -m "feat(familia): Seu mês da família, contas da família e ajuste do administrador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Telas — "Gasto da família" no Anotar, "Conta da família", Extrato e metas da família

**Files:**
- Modify: `src/features/registro/anotar-form.tsx`, `form-values.ts` (+ testes); `src/app/(app)/anotar/page.tsx`, `src/app/(app)/extrato/[id]/page.tsx`
- Modify: `src/features/contas/recurrence-form.tsx` (+ teste); `src/app/(app)/contas/nova/page.tsx`
- Modify: `src/features/extrato/view-model.ts`, `extrato-list.tsx` (+ testes)
- Modify: `src/features/metas/view-model.ts`, `metas-list.tsx`, `goal-form.tsx`, `move-form.tsx`, `use-form.tsx` (+ testes); Create: `src/features/metas/family-goal-detail.tsx` (+ teste)
- Modify: `src/app/(app)/metas/page.tsx`, `metas/nova/page.tsx`, `metas/[id]/page.tsx`, `metas/[id]/editar/page.tsx`, `metas/[id]/guardar/page.tsx`, `metas/[id]/tirar/page.tsx`, `metas/[id]/usar/page.tsx`

**Interfaces:**
- Consumes: Tasks 6, 8, 9; `loadFamilySummary`, `loadFamilyGoals`, `loadFamilyGoal`.
- Produces:
  - `AnotarForm` ganha `inFamily?: boolean` (padrão `false`): com ele, e só em gasto, "Mais detalhes" mostra a caixa `name="family"` com o rótulo "Gasto da família" (protótipo), marcada pelo valor devolvido (`family === 'on'`) ou, na edição, por `record.familyId !== null`. `formValues` leva `family`. `/anotar` passa `inFamily = !!(await loadFamilySummary())`; `/extrato/[id]` passa `inFamily = !!summary || record.familyId !== null` (quem saiu ainda pode desmarcar — decisão 97).
  - `RecurrenceForm` ganha `inFamily?: boolean`: em conta (não entrada), caixa `name="family"` "Conta da família". `/contas/nova` passa o valor.
  - `ExtratoRow.family: boolean` (registro com `familyId`); `ExtratoList` mostra a etiqueta "da família" (protótipo `Extrato`) na linha.
  - `buildMetas` recebe também `familyGoals: FamilyGoalRow[]` e usa os movimentos da própria pessoa para a parte: `MetasView.family: { id: string; name: string; percent: number; remainingCents: number; myPartCents: number }[]` (ativas não excluídas); `MetasList` mostra a seção "Da família" depois de "Só suas", com "Faltam {valor}" e "Sua parte: {valor}" (`formatCompactBRL`, como no protótipo `Metas`); "Guardado em metas" continua sendo `summarizeMonth(...).guardadoTotalCents` (inclui a parte da pessoa nas metas da família — decisão 104). Meta da família usada vai para "Concluídas" como as individuais.
  - `GoalForm` ganha `inFamily?: boolean`: caixa `name="family"` "Meta da família" com a ajuda "Todos da família veem o total; cada pessoa vê só a própria parte." (só ao criar).
  - `FamilyGoalDetail({ goal, myPartCents, history, isAdmin, canEdit })` — cabeçalho como `GoalHero` com o **total** (`goal.savedCents`) e "Sua parte: {valor}"; ações: "Guardar dinheiro" (ativa), "Tirar dinheiro" (parte > 0), "Usar o dinheiro da meta" (só administrador, ativa, total > 0); "Mais opções" com "Editar" (`canEdit`) e "Excluir" (só administrador; confirmação da copy "Excluir {meta}? O valor guardado continua registrado no seu histórico." + "A parte de cada pessoa volta para quem guardou."); histórico só com os movimentos da própria pessoa (`GoalHistory`), e "Excluir" no "Usou" só para o administrador (`deleteFamilyGoalUse`).
  - `/metas/[id]` e os painéis: tentam a meta pessoal (`loadGoal`); se não houver e a pessoa tem família, `loadFamilyGoal(id, família)`; senão `notFound()` como hoje. Painéis da família: `MoveForm` e `UseGoalForm` ganham `family?: boolean` (escolhe `depositToFamilyGoal`/`withdrawFromFamilyGoal`/`spendFromFamilyGoal`); `usar` de quem não administra → `redirect('/metas/{id}')`; `editar` sem permissão → `redirect('/metas/{id}')`, com permissão usa `updateFamilyGoal`. `/metas/[id]/sobra` não existe para meta da família (`redirect('/metas/{id}')`).

- [ ] **Step 1: Testes que falham**

Em `src/features/registro/anotar-form.test.tsx`: sem `inFamily`, nenhuma caixa "Gasto da família"; com `inFamily`, a caixa existe só em "Saiu dinheiro", com `name="family"`; na edição de um registro com `familyId`, vem marcada; o valor devolvido `family: 'on'` volta marcado depois de um erro. Em `src/features/contas/recurrence-form.test.tsx`: "Conta da família" só com `inFamily` e só em conta. Em `src/features/extrato/view-model.test.ts`: `family` verdadeiro para registro com `familyId`; em `extrato-list.test.tsx`: a etiqueta "da família" aparece só nessa linha.

Em `src/features/metas/view-model.test.ts`:

```ts
test('Da família: total da família, quanto falta e só a minha parte (protótipo Metas)', () => {
  const v = buildMetas({
    goals: [], today: '2026-09-28',
    movements: [{ id: 'm', goalId: 'g1', kind: 'deposit', amountCents: 180000, occurredOn: '2026-09-01', transactionId: null, createdAt: '' }],
    familyGoals: [{ ...goalRow({ id: 'g1', name: 'Reforma da cozinha', targetCents: 1000000 }), familyId: 'f1', createdBy: 'u2', savedCents: 300000 }],
  })
  expect(v.family).toEqual([{ id: 'g1', name: 'Reforma da cozinha', percent: 30, remainingCents: 700000, myPartCents: 180000 }])
})
```

Em `src/features/metas/metas-list.test.tsx`: com `family` vazio, sem a seção "Da família"; com um item, a seção existe depois de "Só suas" e o texto do item tem "Sua parte: R$ 1.800" (por `textContent`, com NBSP). Em `src/features/metas/family-goal-detail.test.tsx`: membro não vê "Usar o dinheiro da meta" nem "Excluir"; administrador vê; "Tirar dinheiro" some com parte 0; o texto da confirmação de excluir tem a frase nova. Em `src/features/metas/move-form.test.tsx`: `family` troca a ação chamada (mock das duas actions; conferir qual `useActionState` recebeu).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro src/features/contas src/features/extrato src/features/metas`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces. A seção "Da família" e a caixa "Meta da família" só aparecem para quem tem família. Nenhum filtro de dono existente é removido das páginas de metas.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro src/features/contas src/features/extrato src/features/metas "src/app/(app)/anotar" "src/app/(app)/extrato" "src/app/(app)/contas/nova" "src/app/(app)/metas"
git commit -m "feat(familia): gasto e conta da família no Anotar, etiqueta no Extrato e metas da família" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Navegação — Família no menu lateral e em Mais

**Files:**
- Modify: `src/features/shell/nav-items.ts` (+ `nav-items.test.ts`, `sidebar.test.tsx`)
- Modify: `src/app/(app)/mais/page.tsx`

**Interfaces:**
- Consumes: `loadFamilySummary` (Task 6).
- Produces:
  - `FAMILIA: NavItem = { href: '/familia', label: 'Família', icon: Users, match: ['/familia'] }`.
  - `SIDEBAR_ITEMS = [SEU_MES, EXTRATO, CONTAS, PLANEJAMENTO, METAS, CARTOES, RELATORIOS, FAMILIA, Categorias, Configurações]` (protótipo Desktop).
  - `BOTTOM_NAV_ITEMS`: o "Mais" passa a marcar também `/familia`. O Seu mês continua marcando `/inicio/familia` (subpágina de `/inicio`).
  - `/mais`: sob o nome da pessoa, o nome da família quando houver (protótipo `Mais`: "Família Souza"); `RowLink href="/familia" title="Família"` (`Users`) depois de Relatórios, sempre (sem família, a página oferece criar).

- [ ] **Step 1: Testes que falham** — em `src/features/shell/nav-items.test.ts`:

```ts
test('menu lateral na ordem do protótipo Desktop, com Família depois de Relatórios', () => {
  expect(SIDEBAR_ITEMS.map((i) => i.label)).toEqual(['Seu mês', 'Extrato', 'Contas', 'Planejamento', 'Metas', 'Cartões', 'Relatórios', 'Família', 'Categorias', 'Configurações'])
})

test('Família e as subpáginas marcam Mais no celular; o mês da família marca Seu mês', () => {
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.label === 'Mais')!
  const seuMes = BOTTOM_NAV_ITEMS.find((i) => i.label === 'Seu mês')!
  for (const p of ['/familia', '/familia/contas', '/familia/gastos/x']) expect(isActive(p, mais)).toBe(true)
  expect(isActive('/inicio/familia', seuMes)).toBe(true)
  expect(isActive('/inicio/familia', mais)).toBe(false)
})
```

Em `src/features/shell/sidebar.test.tsx`: link "Família" (nome exato) com `href="/familia"` e `aria-current` em `/familia/contas`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL.

- [ ] **Step 3: Implementação** — seguir Interfaces; comentário de `mais/page.tsx` atualizado (todas as áreas do protótipo agora existem).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell "src/app/(app)/mais/page.tsx"
git commit -m "feat(shell): Família no menu lateral e em Mais" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Ponta a ponta com duas pessoas, verificação completa e registro

**Files:**
- Create: `tests/e2e/plano7.spec.ts`
- Modify: `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo acima; o padrão de `tests/e2e/plano6.spec.ts` (cliente administrador, prefixo único por worker e por execução, limpeza no `afterAll`, `entrar`, `line`, `item`, `brl` com NBSP).
- Produces: 3 testes (celular: 2, desktop: 1) → 6 entradas em `--list`. **Cada teste usa duas pessoas** (administradora e membro), em dois contextos do navegador: `const other = await browser.newContext(info.project.use as BrowserContextOptions)`.
- Seeds (cliente administrador; a `service_role` não passa pela RLS, mas os gatilhos valem — os seeds os respeitam): `seedFamily(adminId, name, memberIds)` insere `families` e `family_members` (administradora primeiro; `joined_at` crescente); `seedFamilyExpense(userId, familyId, key, cents)` (gasto de hoje; a guarda confere que a pessoa participa); `seedFamilyBill(userId, familyId, name, cents)` (molde em `recurrences` com `starts_on` no dia 1 do mês e `due_day` = dia de hoje; a ocorrência nasce quando alguém abre o app); `seedFamilyGoal(familyId, createdBy, name, target)` (`user_id` nulo); `seedFamilyDeposit(userId, goalId, cents, monthsAgo)` (grava hoje — a guarda só aceita hoje — e, se `monthsAgo > 0`, volta a data com uma atualização administrativa, como `seedGoal` do Plano 5).

- [ ] **Step 1: Escrever `tests/e2e/plano7.spec.ts`**

```ts
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn, monthName } from '../../src/domain/recurrence'

// admin, password, created, NBSP, brl, RUN_PREFIX (`e2e-p7-w{worker}-{run}-`), makeUser, category, entrar,
// line, item e o afterAll de limpeza: iguais aos de tests/e2e/plano6.spec.ts.
// Seeds da família: ver "Interfaces" desta tarefa.

const today = todayInSaoPaulo()
const current = monthOf(today)
const mes = monthName(Number(current.slice(5)))

test('celular: convite por link, o membro entra e anota um gasto da família; cada um só vê o que é da família', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'mobile')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  await seedExpense(alex.id, 'lazer', 12000, today, 'cinema')

  await entrar(page, camila.email)
  await page.goto('/mais')
  await page.getByRole('link', { name: 'Família', exact: true }).click()
  await page.getByLabel('Nome da família').fill('Família Souza')
  await page.getByRole('button', { name: 'Criar família', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Família criada.')
  await page.getByRole('button', { name: 'Convidar pessoa', exact: true }).click()
  const link = await page.getByLabel('Link do convite').inputValue()
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{32}$/)
  const path = new URL(link).pathname

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await alexPage.goto(path)
  await expect(alexPage.getByText('Você recebeu um convite', { exact: true })).toBeVisible()
  await alexPage.getByRole('link', { name: 'Entrar', exact: true }).click()
  await alexPage.getByLabel('E-mail').fill(alex.email)
  await alexPage.getByLabel('Senha').fill(password)
  await alexPage.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(alexPage.getByRole('heading', { name: 'Entrar na família Família Souza?' })).toBeVisible()
  await alexPage.getByRole('button', { name: 'Entrar na família', exact: true }).click()
  await expect(alexPage).toHaveURL(/\/familia$/)
  await expect(alexPage.getByRole('status')).toContainText('Você entrou na família Família Souza.')

  // Review Focus 2: o link já foi usado.
  await alexPage.goto(path)
  await expect(alexPage.getByText('Este convite não vale mais. Peça um novo link a quem convidou você.')).toBeVisible()

  await alexPage.goto('/anotar')
  await alexPage.getByLabel('Quanto foi?').fill('312,40')
  await alexPage.getByText('Mercado', { exact: true }).click()
  await alexPage.getByText('Mais detalhes', { exact: true }).click()
  await alexPage.getByLabel('Gasto da família').check()
  await alexPage.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(line(alexPage, 'Saiu')).toContainText(brl('432,40'))

  await page.goto('/inicio')
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await page.getByRole('navigation', { name: 'Ver o mês de' }).getByRole('link', { name: 'Família', exact: true }).click()
  await expect(page.getByText(`Gastos da família em ${mes}`)).toBeVisible()
  await expect(page.getByRole('main')).toContainText(brl('312,40'))
  await expect(item(page, 'Mercado')).toContainText('Hoje · por Alex')
  // Review Focus 1: nada do privado do Alex.
  await expect(page.getByRole('main')).not.toContainText('cinema')
  await expect(page.getByRole('main')).not.toContainText(brl('120,00'))
  await expect(page.getByText('O Disponível e as entradas de cada pessoa nunca aparecem aqui.')).toBeVisible()
  await other.close()
})

test('celular: conta da família paga pelo membro sai do Disponível dele; meta da família; quem sai recebe a parte', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'mobile')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const fam = await seedFamily(camila.id, 'Família Souza', [alex.id])
  await seedFamilyBill(camila.id, fam, 'Aluguel', 180000)
  const goal = await seedFamilyGoal(fam, camila.id, 'Reforma da cozinha', 1_000_000)
  await seedFamilyDeposit(camila.id, goal, 300000, 1)
  await seedFamilyDeposit(alex.id, goal, 180000, 1)

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await entrar(alexPage, alex.email)
  await alexPage.goto(`/inicio/familia?mes=${current}`)
  const contas = alexPage.getByRole('region', { name: 'Contas da família' })
  await contas.getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await alexPage.getByRole('dialog').getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Conta marcada como paga.')
  await alexPage.getByRole('navigation', { name: 'Ver o mês de' }).getByRole('link', { name: 'Eu', exact: true }).click()
  await expect(line(alexPage, 'Saiu')).toContainText(brl('1.800,00'))

  // A administradora não paga de novo, e o Saiu dela não muda (Review Focus 4).
  await entrar(page, camila.email)
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await page.goto('/familia/contas')
  await expect(page.getByText('Nenhuma conta da família a pagar.')).toBeVisible()

  await alexPage.goto('/metas')
  const familia = alexPage.getByRole('region', { name: 'Da família' })
  await expect(familia).toContainText('Reforma da cozinha')
  await expect(familia).toContainText(`Sua parte: ${brl('1.800')}`)

  await alexPage.goto('/familia')
  await alexPage.getByRole('button', { name: 'Sair da família', exact: true }).click()
  await expect(alexPage.getByText('Sair da família?', { exact: true })).toBeVisible()
  await alexPage.getByRole('dialog').getByRole('button', { name: 'Sair da família', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Você saiu da família.')
  await expect(alexPage.getByRole('button', { name: 'Criar família', exact: true })).toBeVisible()
  await alexPage.goto('/inicio/familia')
  await expect(alexPage).toHaveURL(/\/familia$/)
  await alexPage.goto('/inicio')
  await expect(line(alexPage, 'Tirado das metas')).toContainText(brl('1.800,00'))

  await page.goto('/familia')
  await expect(page.getByRole('region', { name: 'Avisos da família' }))
    .toContainText(`Alex saiu da família, e ${brl('1.800,00')} da meta Reforma da cozinha voltaram para Alex.`)
  await other.close()
})

test('desktop: Família pelo menu lateral; a administradora ajusta o gasto do membro e passa a administração; a nova administradora remove', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const bia = await makeUser('Bia')
  const caio = await makeUser('Caio')
  const fam = await seedFamily(camila.id, 'Família Souza', [bia.id, caio.id])
  await seedFamilyExpense(bia.id, fam, 'casa', 8990)

  await entrar(page, camila.email)
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Família', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Família Souza' })).toBeVisible()
  await page.getByRole('link', { name: /Ver o mês da família/ }).click()
  await item(page, 'Casa').getByRole('link').click()
  await expect(page.getByText('Registrado por Bia')).toBeVisible()
  await page.getByLabel('Quanto foi?').fill('99,90')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Alterações salvas.')
  await expect(page.getByRole('main')).toContainText(brl('99,90'))

  await page.goto('/familia')
  await page.getByRole('button', { name: 'Tornar Bia administrador', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tornar administrador', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Bia agora administra a família.')
  await expect(page.getByRole('button', { name: 'Convidar pessoa', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remover / })).toHaveCount(0)

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const biaPage = await other.newPage()
  await entrar(biaPage, bia.email)
  await expect(line(biaPage, 'Saiu')).toContainText(brl('99,90'))
  await biaPage.goto('/familia')
  await biaPage.getByRole('button', { name: 'Remover Caio da família', exact: true }).click()
  await biaPage.getByRole('dialog').getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(biaPage.getByRole('status')).toContainText('Caio saiu da família.')
  await other.close()
})
```

Notas: `seedExpense` aceita a nota como 5º argumento (igual ao do Plano 6, mais `note`). Os blocos "Contas da família", "Da família" e "Avisos da família" são `section` com `aria-labelledby` no título (padrão de `Card labelledBy`), por isso `getByRole('region', { name })` os encontra. O diálogo de confirmação é o `ConfirmPanel` (`role="dialog"`).

- [ ] **Step 2: Conferir a lista e rodar**

Run: `npx playwright test --list tests/e2e/plano7.spec.ts`
Expected: 6 entradas (3 testes × 2 projetos; os `test.skip` de projeto são resolvidos ao rodar).

Run (com Docker): `npx supabase db reset && npm run test:db && npm run test:e2e`
Expected: PASS em todos os arquivos (`rls`, `plano2` … `plano6`, `plano7-*`; e2e `nucleo`, `plano2` … `plano7`). Sem Docker: registrar como pendente.

- [ ] **Step 3: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes unitários e de componentes passando; tipos, lint e build sem erros.

Conferências de segurança e de texto (todas sem resultado):
- `grep -rn "security definer" supabase/migrations/20261001000001_familia.sql | wc -l` deve bater com a lista da seção "Funções SECURITY DEFINER" da Autorrevisão (36), e cada uma tem `set search_path = ''` na mesma linha: `grep -n "security definer" supabase/migrations/20261001000001_familia.sql | grep -v "search_path = ''"` → vazio.
- `grep -rnE "\.from\('(transactions|goals|goal_movements|family_members)'\)" src --include=*.ts | grep -v test` — conferir à mão que cada leitura por id tem o filtro de dono ou de família.
- `grep -rniE "text-red|bg-red|!\"|despesa|orçamento|conta bancária|Ops" src/features/familia "src/app/(app)/familia" "src/app/(auth)/convite"` → vazio.
- `grep -rn "invite_code\|console.log" src/features/familia` → só o uso em `actions.ts` que monta o link (nenhum log).

- [ ] **Step 4: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 7 — Família · concluído em {data}

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

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco (`plano7-familia`, `plano7-gastos`, `plano7-metas`, `plano7-saida`: {n} testes) e ponta a ponta (`plano7.spec.ts`: 3 testes com duas pessoas — celular: 2, desktop: 1; 6 entradas em `--list`): {rodados | pendentes do Docker}.

**Pendências levadas a outros planos**
- Convite por e-mail, "Reenviar" (protótipo) e avisos da família por push/e-mail: Plano 8.
- Tela de excluir cadastro com "Sua parte nas metas da família ({valor}) também sairá delas.": Plano 9 (o banco já faz a regra).
- Exportar a família no CSV (gastos que a pessoa registrou, parte nas metas): Plano 9.
- Trocar o nome da família; extrato da família ("Ver todos" dos últimos gastos): depois da v1, se fizer falta.
- Desktop da tela Família e do mês da família com layout próprio: Plano 10.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 7` com a tabela da seção "Decisões tomadas neste plano" abaixo (numeração 94–111), e ao fim da seção de textos novos a linha `Plano 7: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-09-30-iris-plano-7-familia.md\`.` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plano7.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): família com duas pessoas; progresso e decisões do Plano 7" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica as oito migrações (`…_nucleo` … `…_planejamento`, `…_familia`).
3. `npm run dev` → http://localhost:3000. Para testar a família, use duas janelas (uma anônima): uma pessoa cria a família e o convite, a outra abre o link.

## Testes

- `npm test` — regras da família (livro pessoal, categorias A3, mês da família, divisão do uso), leituras e ações (Supabase simulado com filtros e parâmetros conferidos) e componentes
- `npm run test:db` — privacidade entre membros e de quem é de fora, convites, gastos e contas da família, metas da família, saída, remoção e exclusão de cadastro; todos os testes dos Planos 1–6 continuam passando
- `npm run test:e2e` — fluxos com duas pessoas no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| RF-41 criar família (quem cria administra) | Tasks 2, 7, 10, 14 |
| RF-42 convidar por link (e-mail: Plano 8); aceitar depois de entrar ou criar o cadastro | Tasks 2, 7, 10, 14 |
| RF-43 espaço da família: gastos do mês, por categoria e por pessoa; contas; metas | Tasks 1, 3, 4, 6, 11, 14 |
| RF-44 administrador remove membros e edita/exclui gastos comuns | Tasks 3, 5, 7, 8, 10, 11, 14 |
| RF-45 sair; administrador transfere antes | Tasks 2, 5, 7, 10, 14 |
| RF-25 meta individual ou da família | Tasks 4, 9, 12 |
| RF-35 alternar para o espaço da família | Tasks 11, 14 |
| RN-17 privado por padrão | Tasks 3 (tabelas pessoais), 4 (parte de cada um) |
| RN-18 gasto da família sai do Disponível de quem registrou; aparece somado na família | Tasks 1, 3, 6, 8, 11, 14 |
| RN-19 só gastos; entradas individuais | Task 3 (`family_only_expense`, `p_family` em entrada), Task 8 |
| RN-20 conta da família: qualquer membro paga; sai do Disponível de quem pagou | Tasks 1 (`personalLedger`), 3, 8, 11, 14 |
| RN-21 gasto da família editado/excluído por quem registrou e pelo administrador | Tasks 3, 8, 11, 14 |
| RN-22, 22a, 22b, 22c metas da família | Tasks 1 (`splitFamilyUse`), 4, 9, 12, 14 |
| RN-22d saída devolve a parte; aviso | Tasks 5, 10, 14 |
| RN-22e exclusão de cadastro tira a parte; aviso | Task 5 (tela: Plano 9) |
| RN-23 gastos de quem saiu ficam com o nome | Tasks 2 (participação guardada), 5 |
| RN-24 Ex-membro sem nome | Tasks 1 (`authorLabel`), 5 |
| RN-25 administrador passa o papel; sozinho encerra | Tasks 2, 5, 10, 14 |
| RN-26 uma família por pessoa | Task 2 (índice único + funções) |
| RN-31 cartões privados; gasto da família com cartão conta no cartão da pessoa | Tasks 3 (colunas seguras; parcelado com cartão), 14 |
| A3 categorias na família | Tasks 1, 3 |
| A4 B total para todos, só a própria parte | Tasks 4, 6, 12 |
| A6 A meta da família excluída: cada parte volta; só o administrador | Tasks 4, 12 |
| Pendências "Plano 7" do `docs/progresso.md` (família em recorrências; parcelado da família; cartão em gasto da família; metas da família e `return_on_exit`) | Tasks 3, 4, 5 |
| Segurança (pedido): RLS em toda tabela nova, ex-membro sem acesso, convite impossível de adivinhar/de uso único/que vence, operações do administrador no banco, sem recursão, guardas antigas valendo com a família | Tasks 2–5 (testes de banco), Global Constraints |
| Testes unitários, banco e ponta a ponta | Todas; Task 14 |

**Funções SECURITY DEFINER (todas com `search_path = ''`, família por `my_family_id()`, sem grant a `anon`) e o motivo:** `my_family_id`, `my_family_role` (políticas sem recursão; só dados de quem chama) · `sync_family_display_name` (gatilho; grava participação) · `create_family`, `create_family_invite`, `revoke_family_invite`, `invite_preview`, `accept_family_invite`, `transfer_family_admin` (tabelas da família sem gravação direta; preview só nome) · `transactions_family_guard`, `recurrences_family_guard` (gatilhos; leem participação) · `generate_family_occurrences` (grava a ocorrência em nome de quem criou o molde) · `family_expenses`, `family_expense`, `family_bills`, `family_recurrences` (projeção de colunas seguras de registros de outros membros) · `pay_family_bill`, `admin_update_family_expense`, `admin_delete_family_expense`, `update_family_recurrence`, `end_family_recurrence` (registros de outra pessoa; papel conferido) · `goal_movements_guard`, `transactions_goal_link_guard`, `goal_movements_use_delete_guard` (gatilhos; somam partes de todos) · `family_goal_totals` (só o total — A4 B) · `create_family_goal`, `update_family_goal`, `deposit_family_goal`, `withdraw_family_goal`, `use_family_goal`, `delete_family_goal_use`, `delete_family_goal` (meta sem dono; gravam movimentos de outros no uso e na exclusão) · `family_detach`, `leave_family`, `remove_family_member`, `handle_user_deleted` (saída e exclusão). Nenhuma das que podem ser chamadas pela API recebe o id da família nem o papel por parâmetro (só a interna `family_detach`, sem grant, recebe a família de quem a chama).

**Busca por marcadores proibidos:** nenhum "TBD", "a definir" ou "similar à Task N". Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 14, Step 4).

**Consistência de tipos e nomes:** `FAMILY_LIMITS`/`DEFAULT_CATEGORY_NAMES`/`EX_MEMBER`/`personalLedger`/`familyCategoryGroup`/`authorLabel`/`familyMonth`/`splitFamilyUse`/`FamilyExpense`/`FamilyMonth` (1 → 6, 10, 11, 12); RPCs `create_family(p_name)`, `create_family_invite()` → `invite_code`/`invite_expires_at`, `revoke_family_invite(p_id)`, `invite_preview(p_code)` → `family_name`/`invited_by`, `accept_family_invite(p_code)`, `transfer_family_admin(p_user)` (2 → 7, 10); `family_expenses(p_from, p_to)`, `family_expense(p_id)`, `family_bills()`, `family_recurrences()`, `pay_family_bill(p_id)` → uuid, `admin_update_family_expense(p_id, p_amount_cents, p_on, p_note)`, `admin_delete_family_expense(p_id)`, `update_family_recurrence(p_id, p_name, p_amount_cents, p_due_day)`, `end_family_recurrence(p_id)`, `generate_family_occurrences()`, `p_family` em `create_recurring_transaction`/`create_installment_purchase` (3 → 6, 8); `family_goal_totals()` → `goal_id`/`saved_cents`, `create_family_goal`, `update_family_goal`, `deposit_family_goal`, `withdraw_family_goal`, `use_family_goal` → `tx_id`/`funded_cents`/`leftover_cents`, `delete_family_goal_use(p_transaction_id)`, `delete_family_goal(p_goal_id)` (4 → 6, 9); `leave_family()`, `remove_family_member(p_user)` (5 → 7); `myFamilyId`/`loadFamilySummary`/`loadMyFamily`/`MyFamily`/`MemberRow`/`InviteRow`/`FamilyEventRow`/`FamilyExpenseRow`/`FamilyBillRow`/`FamilyRecurrenceRow`/`FamilyGoalRow`/`loadFamilyExpenses`/`loadFamilyExpense`/`loadFamilyBills`/`loadFamilyRecurrences`/`loadFamilyGoals`/`loadFamilyGoal` (6 → 7–13); `familyNameSchema`/`inviteCodeSchema`/`INVITE_CODE`/`inviteLink`/`familyPatch`/`InviteState`/`INVITE_IDLE` e as ações (7 → 8, 10); `familyReturnPath`/`makeFamilyExpenseSchema`/`familyBillSchema`/`payFamilyBill`/`updateFamilyExpense`/`deleteFamilyExpense`/`updateFamilyBill`/`endFamilyBill` (8 → 11); `updateFamilyGoal`/`deleteFamilyGoal`/`depositToFamilyGoal`/`withdrawFromFamilyGoal`/`spendFromFamilyGoal`/`deleteFamilyGoalUse` (9 → 12); `buildFamiliaPage`/`eventText`/`sinceLabel`/`inviteView` (10); `buildFamilyMonth`/`buildFamilyBills`/`ViewSwitch` (11); `FAMILIA` (13).

**Review Focus → testes:** 1 → Task 3 (`a família nunca lê…`, `ninguém altera ou apaga…`, `colunas seguras…`), Task 4 (`cada um vê só a própria parte`), e2e 1; 2 → Task 2 (`convite vencido, cancelado…`, `o convite serve uma vez`, `quem já participa…`, `ninguém grava direto…`), Task 7 (`aceitar: formato estranho…`), Task 10 (`tela do convite`), e2e 1; 3 → Task 5 (`ex-membro perde todo acesso…`, `ex-membro não guarda, não paga…`), Task 6 (`myFamilyId filtra…`), Task 8 (`"Gasto da família" sem família…`), e2e 2; 4 → Task 1 (`personalLedger`, `splitFamilyUse`), Task 3 (`quem paga fica com o gasto`), Task 4 (`divide na proporção…`, `centavos…`, `excluir…`), Task 5 (`excluir o cadastro…`), e2e 2; 5 → Task 2 (`transferir…`), Task 5 (`administrador com outras pessoas…`, `sozinho…`, `remover…`, `administrador que exclui o cadastro…`), Task 10 (`sair conforme o papel`), e2e 3.

**Proporção:** o SQL e os testes de banco vêm completos (são o contrato de segurança); domínio com testes completos; ações, telas e páginas vêm por assinatura, regras, textos exatos e asserções-chave.

---

## Conflitos encontrados na especificação

1. **Protótipo `Familia` com convite por e-mail ("jordan@email.com · Convite enviado · aguardando · Reenviar") × roteiro (e-mails no Plano 8) e RF-42 ("por e-mail ou link"):** nesta versão só o link; a linha do protótipo vira "Convite pendente · vale até {dia}" com "Cancelar convite" (decisão 95). O e-mail entra no Plano 8 sobre a mesma tabela.
2. **A copy oficial não tem textos de família:** todos os textos de família fora dos requisitos, da Etapa 5 e do protótipo estão em "Textos novos" (58 itens) para aprovação.
3. **RN-15b ("Devolver"/"Deixar guardado") × RN-22c (a sobra fica com cada um):** na meta da família não há a pergunta; cada pessoa tira a própria parte (decisão 105 — interpretação, confirme).
4. **RN-03 ("contas a pagar do mês") × RN-20 (a conta da família sai de quem pagar):** a conta da família ainda não paga não entra no "Disponível depois das contas" de ninguém; aparece no espaço da família (decisão 102 — interpretação, confirme).
5. **Protótipo `Mobile-Familia` com "Ver todos" nos últimos gastos da família:** não há extrato da família nesta versão; o link fica de fora (decisão 100).
6. **Etapa 3 §4 "Família (nome…): só o administrador altera":** o nome é escolhido ao criar e não muda nesta versão (decisão 94).
7. **Etapa 3 §3.1 `goals` "dono _ou_ família" e `family_invites` com e-mail:** meta da família = `user_id` nulo + `family_id`; o e-mail do convite fica para o Plano 8.
8. **RN-23 × privacidade de quem saiu:** quem saiu perde o espaço da família, mas os gastos que registrou continuam no histórico dela com o nome (RN-23), e ele ainda pode editá-los como registros seus (decisão 97 — interpretação, confirme).

---

## Decisões tomadas neste plano

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

## Textos novos

Fora da copy oficial (que não tem seção de família), do protótipo e dos textos já aprovados; precisam da sua aprovação (58):

- Criar: "Criar família" · "Anote os gastos da casa junto com quem mora com você. Cada pessoa continua com o próprio mês." · "Nome da família" · "Ex.: Família Souza" · "Recebeu um convite? Abra o link que chegou para você." · "Família criada."
- Participantes: "Tornar administrador" · "Tornar {nome} administrador" (rótulo acessível) · "{nome} vai administrar a família?" · "Você continua participando como membro." · "{nome} agora administra a família." · "Remover da família" · "Remover {nome} da família" (rótulo acessível) · "Remover {nome} da família?" · "A parte de {nome} nas metas da família volta para {nome}. Os gastos que {nome} registrou continuam no histórico da família." · "Remover" · "{nome} saiu da família."
- Convite (administrador): "Convite pendente · vale até {dia}" · "Cancelar convite" · "Convite cancelado." · "Envie este link para quem vai participar. Ele vale até {dia} e serve para uma pessoa." · "Link do convite" · "Copiar link" · "Link copiado." · "Compartilhar" · "A família já está completa."
- Avisos e saída: "Avisos da família" · "Um membro saiu da família." · "Sair da família?" · "Sua parte nas metas da família volta para o seu Disponível deste mês. Os gastos que você registrou continuam no histórico da família." · "Você é a única pessoa na família. Ao sair, a família é encerrada." · "Antes de sair, escolha quem vai administrar a família: toque em Tornar administrador ao lado da pessoa." · "Antes de sair, escolha quem vai administrar a família." · "Você saiu da família."
- Página do convite: "Você recebeu um convite" · "Crie seu cadastro ou entre para participar da família na Íris." · "Entrar na família {nome}?" · "{nome} convidou você." · "A família vê só os gastos que você marcar como da família, as contas da casa e as metas da família. Seu Disponível, suas entradas e seus cartões continuam só seus." · "Entrar na família" · "Você entrou na família {nome}." · "Este convite não vale mais. Peça um novo link a quem convidou você." · "Você já participa de uma família. Para entrar em outra, saia da atual primeiro." · "Ver a família"
- Mês e contas da família: "Ver o mês de" (rótulo acessível do seletor Eu · Família) · "Nenhum gasto da família neste mês. Quando alguém marcar um gasto como da família, ele aparece aqui." · "por Ex-membro" · "Contas da família que se repetem" · "Nenhuma conta da família a pagar." · "criada por {quem}" · "Registrado por {quem}" · "O mês de quem registrou será recalculado." · "Gasto excluído."
- Anotar, contas e metas: "Conta da família" · "Meta da família" · "Todos da família veem o total; cada pessoa vê só a própria parte." · "A parte de cada pessoa volta para quem guardou." · "Sua parte nesta meta é {valor}. Tire até esse valor."

Da copy oficial, do protótipo, dos requisitos ou já aprovados, usados aqui: "Família", "Família {nome}" (Mais), "Ver o mês da família", "Gastos comuns, contas e metas da casa", "Quem participa", "Você", "Administra a família", "Membro desde {mês}", "Convidar pessoa", "O que a família vê", "Só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O Disponível, as entradas, os cartões e as metas individuais de cada pessoa continuam privados.", "Sair da família", "Eu", "Gastos da família em {mês}", "Aqui aparecem só os gastos marcados como da família.", "Contas da família", "Ver todas", "Marcar como paga", "Para onde vai o dinheiro da casa", "Metas da família", "Ver metas", "Faltam {valor} para {meta}.", "Sua parte: {valor}", "Guardar dinheiro", "Últimos gastos da família", "{dia} · por {nome}", "por você", "O Disponível e as entradas de cada pessoa nunca aparecem aqui.", "Gasto da família", "da família", "Da família", "Ex-membro", "{nome} saiu da família, e {valor} da meta {meta} voltaram para {nome}.", "Um membro saiu da família, e a meta {meta} foi atualizada.", "Criar meu cadastro", "Entrar", "Agora não", "Ficar", "Cancelar", "Excluir", "Excluir este gasto?", "Salvar gasto", "Salvar conta", "Quanto foi?", "Quando?", "Hoje", "Ontem", "Outro dia", "Uma nota, se quiser", "Nome", "Valor", "Vence dia", "Alterar", "Encerrar", "Encerrar "{nome}"?", "Encerrada. O histórico continua no Extrato.", "Marcar {conta} como paga?", "Conta marcada como paga.", "Alterações salvas.", "Meta excluída.", "Excluir {meta}? O valor guardado continua registrado no seu histórico.", "Anotar gasto", "Ver meu mês", "Falta o nome.", "Use até 40 caracteres.", "Escolha o dia.", "Esse valor não parece certo. Use apenas números.", "Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.".
