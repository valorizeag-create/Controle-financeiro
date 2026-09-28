# Íris — Plano 6: Planejamento e relatórios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa define quanto quer usar em cada categoria num mês (planejado), vê "{gasto} de {planejado}" com os estados dentro, perto do limite e passou do planejado, ajusta o valor, repete o planejamento do mês anterior e acompanha o "Planejado" no Seu mês; em Relatórios, vê cada mês (entrou, saiu, guardado), o que mudou por categoria em relação ao mês anterior em frases, um gráfico simples de entrou e saiu e os gastos por categoria no período (este mês, mês passado, últimos 3 meses ou personalizado até 12 meses). Planejamento e Relatórios entram no menu lateral e em Mais.

**Architecture:** Mesma base dos Planos 1–5. Uma tabela nova, `budgets` (pessoa, mês, categoria, valor), com RLS e FK composta `(category_id, user_id)`; salvar o planejamento do mês e repetir o do mês anterior são funções SQL atômicas (`security invoker`, `search_path = ''`, `auth.uid()`), e `delete_category` passa a levar o planejado da categoria excluída para "Outros" (somado), como já faz com os gastos (RN-27). **Nenhuma regra de dinheiro nova fora de `src/domain/`**: o "gasto" do planejado é exatamente `spendingByCategory` (o mesmo de "Para onde seu dinheiro vai", só a parte paga com o dinheiro do mês — RN-01a, A1), e cada mês dos relatórios é `summarizeMonth` + `spendingByCategory`, por isso os números batem com o Seu mês. As regras novas (estado do planejado, linhas, comparação entre meses) ficam em `src/domain/planning.ts` e `src/domain/reports.ts`, puras e testadas. O histórico é lido só por `loadLedger()` (paginada). O gráfico é feito aqui, com barras em CSS, sem biblioteca nova, e tem alternativa em texto (tabela para leitor de tela e a lista "Mês a mês").

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-22–24, RF-33 "planejado mais relevante", RF-38–40, RN-01, RN-01a, RN-27, RNF-05, RNF-11, §6 "Planejamento da família" fora da v1, terminologia §1.1), `docs/etapa-3-arquitetura.md` (§2 princípios, §3.1 `budgets` "dono, mês, categoria, valor", §3.2 fórmulas, §6 `/planejamento` e `/relatorios` a partir de Mais, §7 Planejamento como bloco do Seu mês e menu lateral), `docs/etapa-5-ui.md` (tokens; V5 "passou do planejado" em âmbar suave com texto, sem vermelho; V6 sem mini-gráficos e sem tabela densa), `docs/etapa-7-roteiro.md` (escopo do Plano 6), `docs/decisoes-para-revisao.md` (decisões 1–74, obrigatórias, incluindo a leitura da RN-01a: categorias batem com o "Saiu", parte paga com meta fora — decisão 68), `docs/progresso.md`, protótipo aprovado (`Planejamento`, `Relatorios`, `Main` bloco "Planejado", `Desktop` menu lateral e bloco "Planejado", `Mais`), copy oficial (Claude Doc "Íris — Documento-base de comunicação": §7 Planejamento, Relatórios, Seu mês; §8 estados vazios, status e leitura do mês, sucesso, erros, ajuda "O que é Planejado?"). Pedido Q2 (controlador): relatórios mensais e anuais.

## Global Constraints

- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`): `01-app/02-guides/forms.md`, `01-app/02-guides/server-actions.md`, `01-app/03-api-reference/03-file-conventions` (page). `params`/`searchParams` de página são `Promise` e precisam de `await`.
- Idioma pt-BR, moeda somente R$. Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor; nunca do navegador. Meses são `MonthKey` (`AAAA-MM`), de `2000-01` a `2099-12` (`parseMonthKey`); no banco, o mês é o 1º dia (`date`).
- Dinheiro sempre em **centavos inteiros**; planejado entre 1 e `MAX_CENTS = 9_999_999_999`. Texto → centavos só por `parseBRL`; centavos → texto por `formatBRL` ou, onde o protótipo mostra valores sem centavos, `formatCompactBRL` (Task 1) — NBSP entre `R$` e o número.
- **Uma regra de dinheiro, um lugar (RNF-11):** o "gasto" de uma categoria no mês é sempre `spendingByCategory` (`src/domain/breakdown.ts`); Entrou, Saiu e a linha das metas de um mês são sempre `summarizeMonth` (`src/domain/summary.ts`). Planejamento e relatórios **não** recalculam nada por conta própria. Parte paga com meta fica fora (RN-01a, decisão 68); conta paga com atraso conta no mês em que foi paga (A1); conta a pagar e entrada a receber não contam.
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar; "planejado" (nunca "orçamento", "limite máximo", "estourou", "déficit"); "passou do planejado" em âmbar suave com texto (V5), nunca vermelho; sem exclamação; tom calmo, sem julgamento.
- Todo texto visível vem da copy oficial, do protótipo aprovado, dos textos já aprovados em `docs/decisoes-para-revisao.md`, ou da seção "Textos novos" no fim deste plano.
- Alvos de toque ≥ 44 px (`min-h-11`/`size-11`); texto 15–16 px no celular; contraste WCAG AA; o estado do planejado nunca depende só de cor (sempre há texto); o gráfico tem alternativa em texto.
- Banco: **nunca editar** migrações já aplicadas (`20260922000001_nucleo.sql` … `20260929000001_metas.sql`); tudo deste plano vai em **`supabase/migrations/20260930000001_planejamento.sql`**. RLS ligada na tabela nova. FK composta `(category_id, user_id)` com `on delete no action`. Funções: `security invoker`, `set search_path = ''`, nomes com `public.`, checam `auth.uid()`, filtram por `user_id`, limitam todas as entradas (mês no 1º dia entre 2000-01-01 e 2099-12-01; até 200 categorias por chamada; valor entre 1 e `9999999999`; ids nulos ou repetidos recusados); `revoke execute … from public, anon` + `grant execute … to authenticated`.
- Servidor: o id da pessoa vem **só** de `requireUser()`, chamado no começo de toda Server Action e loader; nunca do formulário. Zod/`parseBRL` no servidor; formulários usam `FormState` (`errorState`, `readFields`) e mantêm o que foi digitado. `redirect()` nunca dentro de `try`.
- **Defesa em profundidade:** toda leitura por dono filtra `user_id` (além da RLS). Os testes de Server Action usam fakes encadeáveis do Supabase que registram cada `.eq`/`.in` e **afirmam os filtros**. **Nunca remover** um filtro de segurança existente para um teste passar.
- Módulos `'use server'` exportam **somente funções async** (constantes e tipos ficam em outros arquivos).
- Leituras do histórico completo sempre por `loadLedger()` (paginada, gera ocorrências antes). Planejado de poucos meses por `loadBudgets(months)` (limitado: no máximo 2 meses × categorias). Depois de gravar dinheiro ou planejado: `refreshMoneyViews()` (a partir da Task 5 inclui `/planejamento` e `/relatorios`).
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Textos com NBSP (valores em R$) são conferidos por `textContent`, nunca por `getByText`. Componentes que usam `useActionState` seguem o padrão de `src/features/metas/goal-form.test.tsx` (mock de `useActionState`). Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `@/lib/refresh` e `next/navigation`; relógio falso em `2026-09-28T15:00:00Z` quando a ação usa a data.
- Planejamento da família está **fora da v1** (etapa-2 §6): nenhuma coluna `family_id`.
- Nenhuma dependência nova (o gráfico é CSS). Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`.
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como **pendente** em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem atrapalhar a pessoa e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Números que não batem com o Seu mês** — um gasto pago em parte com meta, uma conta de agosto paga em setembro, uma conta ainda a pagar: o "gasto" do planejado e o "Saiu"/categorias dos relatórios precisam ser exatamente os do Seu mês. → **Task 1** (`o gasto é o mesmo de "Para onde seu dinheiro vai"…`), **Task 2** (`cada mês usa as mesmas regras do Seu mês`), **Task 8** (`relatório de um mês bate com o Seu mês…`), e2e na **Task 11**.
2. **Excluir uma categoria que tem planejado** — a pessoa espera que nada suma: o planejado vai para "Outros" no mesmo mês, somado ao que "Outros" já tinha (os gastos já vão), e apagar a categoria direto na tabela continua barrado. → **Task 3** (`excluir a categoria leva o planejado para "Outros"…`, `apagar direto uma categoria com planejado é barrado`).
3. **Duas abas ou formulário velho** — salvar o planejamento com uma categoria que foi excluída em outra aba, ou tocar duas vezes em "Repetir o planejamento": nada de erro sem saída, nada de valor duplicado. → **Task 3** (`repetir não sobrescreve nem duplica`), **Task 5** (`categoria excluída em outra aba é ignorada…`, `repetir sem nada novo não avisa`).
4. **Valores digitados** — em branco, "0", "0,00", "abc", "1 2", acima do limite: em branco e zero tiram a categoria do planejado; o resto mostra a mensagem calma da copy sob o campo, sem perder nada do que foi digitado. → **Task 3** (limites no banco), **Task 5** (`zero e em branco tiram a categoria…`, `valor inválido fica no campo…`), **Task 6** (erro sob o campo).
5. **Período estranho no endereço** — `?periodo=personalizado&de=2026-10&ate=2026-09`, 13 meses, `de=1999-12`, `?mes=abc` no Planejamento, "Mês passado" em janeiro: mensagem calma e um período válido, nunca tela de erro nem leitura sem limite. → **Task 2** (`período personalizado inválido…`, `mês passado em janeiro…`), **Task 7** (`?mes` inválido vira o mês atual), **Task 9** (aviso no filtro), e2e na **Task 11**.

---

## Estrutura de arquivos

```
supabase/migrations/20260930000001_planejamento.sql          NOVO: budgets, set_month_budgets, repeat_previous_budgets, delete_category (planejado vai para Outros)
tests/db/plano6.test.ts                                      NOVO: privacidade, limites, salvar, repetir, excluir categoria, excluir cadastro
tests/e2e/plano6.spec.ts                                     NOVO: planejar + ajustar + Seu mês; repetir; relatórios no desktop
src/
  domain/money.ts (+ money.test.ts)                          MOD: formatCompactBRL
  domain/planning.ts (+ .test.ts)                            NOVO: NEAR_LIMIT_PERCENT, budgetState, budgetLines, withinCount
  domain/reports.ts (+ .test.ts)                             NOVO: monthReports, compareCategories, sumCategories
  lib/refresh.ts                                             MOD: /planejamento e /relatorios
  ui/progress-bar.tsx (+ .test.tsx)                          MOD: tom "over" (âmbar)
  features/
    planejamento/types.ts (+ .test.ts)                       NOVO: BudgetRow, BUDGET_COLUMNS, toBudgetRow
    planejamento/queries.ts                                  NOVO: loadBudgets
    planejamento/view-model.ts (+ .test.ts)                  NOVO: buildPlanejamento, buildPlannedCard, buildPlanForm
    planejamento/schemas.ts (+ .test.ts)                     NOVO: parsePlanFields, PLAN_FIELD_PREFIX
    planejamento/actions.ts (+ .test.ts)                     NOVO: saveBudgets, repeatPreviousBudgets
    planejamento/budget-lines.tsx, plan-form.tsx (+ testes)  NOVO
    seu-mes/view-model.ts (+ .test.ts), planned-card.tsx (+ .test.tsx)   MOD/NOVO: bloco "Planejado"
    relatorios/period.ts (+ .test.ts)                        NOVO: resolvePeriod, PERIOD_OPTIONS, periodHref
    relatorios/view-model.ts (+ .test.ts)                    NOVO: buildRelatorios, sentenceText
    relatorios/period-filter.tsx, in-out-chart.tsx, report-sections.tsx (+ testes)   NOVO
    shell/nav-items.ts (+ nav-items.test.ts, sidebar.test.tsx)   MOD: Planejamento e Relatórios
  app/(app)/
    planejamento/page.tsx, planejamento/editar/page.tsx      NOVO
    relatorios/page.tsx                                      NOVO
    inicio/page.tsx, mais/page.tsx                           MOD
docs/progresso.md, docs/decisoes-para-revisao.md             MOD no fim
```

**Rotas:** `/planejamento?mes=AAAA-MM`, `/planejamento/editar?mes=AAAA-MM[&categoria={id}]`, `/relatorios?periodo=este-mes|mes-passado|3-meses|personalizado[&de=AAAA-MM&ate=AAAA-MM]`. Nenhuma é painel (`isSheetRoute` não muda).

**Modelo (etapa-3 §3.1 → banco):** `budgets` = id, dono (`user_id`), mês (`month`, 1º dia), categoria (`category_id`), valor (`amount_cents`); um valor por pessoa, mês e categoria (`unique (user_id, month, category_id)`). Sem planejado = sem linha.

---

### Task 1: Regras do planejado (domínio) e valor sem centavos

**Files:**
- Create: `src/domain/planning.ts`
- Modify: `src/domain/money.ts` (`formatCompactBRL`)
- Test: `src/domain/planning.test.ts`, `src/domain/money.test.ts` (acrescentar 1 teste)

**Interfaces:**
- Consumes: `spendingByCategory`, `CategorizedTx` (`./breakdown`, sem mudança); `Cents`, `formatBRL` (`./money`); `MonthKey`.
- Produces:
  - `formatCompactBRL(cents: Cents): string` — `formatBRL` sem `,00` quando o valor é de reais inteiros: `89000` → `'R$ 890'`, `100000` → `'R$ 1.000'`, `89050` → `'R$ 890,50'` (NBSP depois de `R$`; negativo com `−` como `formatBRL`).
  - `NEAR_LIMIT_PERCENT = 90`.
  - `type BudgetState = 'within' | 'near' | 'over'`; `budgetState(spentCents: Cents, plannedCents: Cents): BudgetState` — `'over'` se `spent > planned`; senão `'near'` se `spent * 100 >= planned * NEAR_LIMIT_PERCENT`; senão `'within'`.
  - `interface PlannedCategory { categoryId: string; plannedCents: Cents }`.
  - `interface BudgetLine { categoryId: string; plannedCents: Cents; spentCents: Cents; remainingCents: Cents; overCents: Cents; percent: number; usage: number; state: BudgetState }` — `remaining = max(0, planned − spent)`, `over = max(0, spent − planned)`, `percent = min(100, floor(spent × 100 / planned))`, `usage = spent / planned` (sem limite, para ordenar).
  - `budgetLines(input: { month: MonthKey; transactions: CategorizedTx[]; planned: PlannedCategory[] }): BudgetLine[]` — uma linha por `planned`, na mesma ordem; `spent` = total da categoria em `spendingByCategory(transactions, month)` (0 se não houver).
  - `withinCount(lines: BudgetLine[]): number` — quantas **não** passaram (`state !== 'over'`): "dentro do planejado" conta dentro e perto (protótipo: 4 de 6).

- [ ] **Step 1: Testes que falham** — criar `src/domain/planning.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NEAR_LIMIT_PERCENT, budgetLines, budgetState, withinCount } from './planning'
import { spendingByCategory, type CategorizedTx } from './breakdown'

const tx = (p: Partial<CategorizedTx>): CategorizedTx => ({
  kind: 'expense', amountCents: 0, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, categoryId: 'c1', ...p,
})

describe('estado do planejado (RF-23)', () => {
  test('passou só quando o gasto é maior; perto a partir de 90%, inclusive igual', () => {
    expect(NEAR_LIMIT_PERCENT).toBe(90)
    expect(budgetState(0, 100000)).toBe('within')
    expect(budgetState(89999, 100000)).toBe('within')
    expect(budgetState(90000, 100000)).toBe('near')
    expect(budgetState(100000, 100000)).toBe('near')
    expect(budgetState(100001, 100000)).toBe('over')
  })
})

describe('linhas do planejado', () => {
  test('protótipo Planejamento: valores, percentuais, quanto falta e quanto passou; 4 de 6 dentro', () => {
    const planned = [
      { categoryId: 'casa', plannedCents: 90000 },
      { categoryId: 'mercado', plannedCents: 100000 },
      { categoryId: 'transporte', plannedCents: 30000 },
      { categoryId: 'comer', plannedCents: 40000 },
      { categoryId: 'saude', plannedCents: 90000 },
      { categoryId: 'lazer', plannedCents: 30000 },
    ]
    const transactions = [
      tx({ categoryId: 'casa', amountCents: 72000 }),
      tx({ categoryId: 'mercado', amountCents: 89000 }),
      tx({ categoryId: 'transporte', amountCents: 38000 }),
      tx({ categoryId: 'comer', amountCents: 42000 }),
      tx({ categoryId: 'saude', amountCents: 81000 }),
      tx({ categoryId: 'lazer', amountCents: 15000 }),
    ]
    const lines = budgetLines({ month: '2026-09', transactions, planned })
    expect(lines.map((l) => [l.categoryId, l.spentCents, l.state, l.percent, l.remainingCents, l.overCents])).toEqual([
      ['casa', 72000, 'within', 80, 18000, 0],
      ['mercado', 89000, 'within', 89, 11000, 0],
      ['transporte', 38000, 'over', 100, 0, 8000],
      ['comer', 42000, 'over', 100, 0, 2000],
      ['saude', 81000, 'near', 90, 9000, 0],
      ['lazer', 15000, 'within', 50, 15000, 0],
    ])
    expect(lines[2].usage).toBeCloseTo(38000 / 30000)
    expect(withinCount(lines)).toBe(4)
  })

  test('o gasto é o mesmo de "Para onde seu dinheiro vai": parte paga com meta fora, conta paga no mês em que foi paga, a pagar não conta (RN-01a, A1, Review Focus 1)', () => {
    const transactions = [
      tx({ amountCents: 50000, goalFundedCents: 21000 }),
      tx({ amountCents: 30000, occurredOn: '2026-08-28', paidOn: '2026-09-02' }),
      tx({ amountCents: 40000, status: 'pending', dueOn: '2026-09-20' }),
      tx({ amountCents: 7000, occurredOn: '2026-10-01' }),
      tx({ kind: 'income', amountCents: 500000, categoryId: null }),
      tx({ amountCents: 1000, categoryId: 'c2' }),
    ]
    const [line] = budgetLines({ month: '2026-09', transactions, planned: [{ categoryId: 'c1', plannedCents: 100000 }] })
    expect(line.spentCents).toBe(29000 + 30000)
    expect(spendingByCategory(transactions, '2026-09').find((t) => t.categoryId === 'c1')?.cents).toBe(line.spentCents)
  })

  test('categoria planejada sem gasto: 0%, dentro, falta tudo', () => {
    expect(budgetLines({ month: '2026-09', transactions: [], planned: [{ categoryId: 'c1', plannedCents: 30000 }] })).toEqual([
      { categoryId: 'c1', plannedCents: 30000, spentCents: 0, remainingCents: 30000, overCents: 0, percent: 0, usage: 0, state: 'within' },
    ])
    expect(withinCount([])).toBe(0)
  })
})
```

Em `src/domain/money.test.ts` (importando `formatCompactBRL`):

```ts
test('formatCompactBRL tira ",00" só de valores inteiros (protótipo "R$ 890 de R$ 1.000")', () => {
  const NBSP = String.fromCharCode(0xa0)
  expect(formatCompactBRL(89000)).toBe(`R$${NBSP}890`)
  expect(formatCompactBRL(100000)).toBe(`R$${NBSP}1.000`)
  expect(formatCompactBRL(89050)).toBe(`R$${NBSP}890,50`)
  expect(formatCompactBRL(5)).toBe(`R$${NBSP}0,05`)
  expect(formatCompactBRL(0)).toBe(`R$${NBSP}0`)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain`
Expected: FAIL — `Failed to resolve import "./planning"`, `formatCompactBRL is not a function`.

- [ ] **Step 3: Implementação** — seguir Interfaces. `formatCompactBRL`: `formatBRL(cents)` e, quando `Math.abs(cents) % 100 === 0`, tirar o `,00` final. `budgetLines`: um `Map` de `spendingByCategory(transactions, month)`; nada de somar gastos à mão.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planning.ts src/domain/planning.test.ts src/domain/money.ts src/domain/money.test.ts
git commit -m "feat(domain): regras do planejado e valor sem centavos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras dos relatórios (domínio) e período

**Files:**
- Create: `src/domain/reports.ts`, `src/features/relatorios/period.ts`
- Test: `src/domain/reports.test.ts`, `src/features/relatorios/period.test.ts`

**Interfaces:**
- Consumes: `summarizeMonth`, `GoalLine`, `GoalMovement` (`./summary`); `spendingByCategory`, `CategorizedTx`, `CategoryTotal` (`./breakdown`); `addMonths`, `monthOf`, `monthsBetween`, `parseMonthKey`, `ISODate`, `MonthKey` (`@/domain/dates`).
- Produces:
  - `interface MonthReport { month: MonthKey; entrouCents: Cents; saiuCents: Cents; goalLine: GoalLine | null; byCategory: CategoryTotal[] }`.
  - `monthReports(input: { months: MonthKey[]; today: ISODate; initialBalanceCents: Cents; transactions: CategorizedTx[]; goalMovements: GoalMovement[] }): MonthReport[]` — um por mês, na ordem recebida; `entrou`/`saiu`/`goalLine` de `summarizeMonth`, `byCategory` de `spendingByCategory`.
  - `interface CategoryChange { categoryId: string; currentCents: Cents; previousCents: Cents; deltaCents: Cents }`.
  - `compareCategories(current: CategoryTotal[], previous: CategoryTotal[], limit = 3): CategoryChange[]` — todas as categorias de um ou outro mês; `delta = current − previous`; sem as de `delta = 0`; ordem por `|delta|` desc, depois `categoryId`; no máximo `limit`.
  - `sumCategories(months: CategoryTotal[][]): CategoryTotal[]` — soma por categoria; ordem por `cents` desc, depois `categoryId`.
  - `features/relatorios/period.ts` (puro):
    - `type PeriodKey = 'este-mes' | 'mes-passado' | '3-meses' | 'personalizado'`
    - `MAX_PERIOD_MONTHS = 12`; `PERIOD_ERROR = 'Escolha um período de até 12 meses.'`
    - `PERIOD_OPTIONS: { key: PeriodKey; label: string }[]` = Este mês · Mês passado · Últimos 3 meses · Personalizado (copy, nessa ordem).
    - `interface Period { key: PeriodKey; from: MonthKey; to: MonthKey; months: MonthKey[]; error: string | null }` — `months` em ordem crescente, de `from` a `to`.
    - `resolvePeriod(params: { periodo?: string; de?: string; ate?: string }, today: ISODate): Period` — `este-mes`: mês de hoje; `mes-passado`: o anterior; `3-meses` (padrão, também para `periodo` ausente ou desconhecido): os 2 anteriores + o atual; `personalizado`: sem `de` e sem `ate` → os 3 meses padrão, sem erro; com `de`/`ate` válidos (`parseMonthKey`), `de <= ate` e até 12 meses → esse intervalo; qualquer outra coisa → os 3 meses padrão com `error = PERIOD_ERROR` (a `key` continua `personalizado`).
    - `periodHref(key: PeriodKey): string` → `/relatorios?periodo={key}`.

- [ ] **Step 1: Testes que falham** — criar `src/domain/reports.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { compareCategories, monthReports, sumCategories } from './reports'
import { spendingByCategory, type CategorizedTx } from './breakdown'
import { summarizeMonth, type GoalMovement } from './summary'

const tx = (p: Partial<CategorizedTx>): CategorizedTx => ({
  kind: 'expense', amountCents: 0, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, categoryId: 'c1', ...p,
})

describe('relatório de cada mês (RF-38)', () => {
  test('cada mês usa as mesmas regras do Seu mês (RNF-11, Review Focus 1)', () => {
    const transactions = [
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-08-05', categoryId: null }),
      tx({ amountCents: 372000, occurredOn: '2026-08-12' }),
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', categoryId: null }),
      tx({ amountCents: 100000, occurredOn: '2026-09-06', goalFundedCents: 40000 }),
      tx({ amountCents: 12000, occurredOn: '2026-08-30', paidOn: '2026-09-03', categoryId: 'c2' }),
      tx({ amountCents: 9000, status: 'pending', dueOn: '2026-09-25', categoryId: 'c2' }),
    ]
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 50000, occurredOn: '2026-08-10' },
      { kind: 'use', amountCents: 40000, occurredOn: '2026-09-06' },
    ]
    const input = { today: '2026-09-28', initialBalanceCents: 0, transactions, goalMovements }
    const reports = monthReports({ ...input, months: ['2026-08', '2026-09'] })
    for (const r of reports) {
      const s = summarizeMonth({ ...input, month: r.month })
      expect({ entrou: r.entrouCents, saiu: r.saiuCents, goalLine: r.goalLine }).toEqual({ entrou: s.entrouCents, saiu: s.saiuCents, goalLine: s.goalLine })
      expect(r.byCategory).toEqual(spendingByCategory(transactions, r.month))
    }
    expect(reports.map((r) => r.month)).toEqual(['2026-08', '2026-09'])
    expect(reports[0].goalLine).toEqual({ label: 'Guardado este mês', amountCents: 50000 })
    expect(reports[1].saiuCents).toBe(60000 + 12000)
  })
})

describe('comparação com o mês anterior (RF-39)', () => {
  test('maiores mudanças primeiro, sem as que não mudaram, até 3', () => {
    const current = [{ categoryId: 'c2', cents: 81000 }, { categoryId: 'c1', cents: 42000 }, { categoryId: 'c3', cents: 15000 }]
    const previous = [{ categoryId: 'c1', cents: 60000 }, { categoryId: 'c2', cents: 47000 }, { categoryId: 'c3', cents: 15000 }, { categoryId: 'c4', cents: 10000 }]
    expect(compareCategories(current, previous)).toEqual([
      { categoryId: 'c2', currentCents: 81000, previousCents: 47000, deltaCents: 34000 },
      { categoryId: 'c1', currentCents: 42000, previousCents: 60000, deltaCents: -18000 },
      { categoryId: 'c4', currentCents: 0, previousCents: 10000, deltaCents: -10000 },
    ])
    expect(compareCategories(current, previous, 1).map((c) => c.categoryId)).toEqual(['c2'])
  })

  test('empate na mudança: ordem pela categoria; nada mudou: lista vazia', () => {
    expect(compareCategories([{ categoryId: 'b', cents: 100 }, { categoryId: 'a', cents: 100 }], []).map((c) => c.categoryId)).toEqual(['a', 'b'])
    expect(compareCategories([{ categoryId: 'a', cents: 100 }], [{ categoryId: 'a', cents: 100 }])).toEqual([])
  })
})

test('soma das categorias no período', () => {
  expect(sumCategories([
    [{ categoryId: 'c1', cents: 100 }, { categoryId: 'c2', cents: 50 }],
    [{ categoryId: 'c1', cents: 20 }, { categoryId: 'c3', cents: 200 }],
  ])).toEqual([
    { categoryId: 'c3', cents: 200 },
    { categoryId: 'c1', cents: 120 },
    { categoryId: 'c2', cents: 50 },
  ])
})
```

Criar `src/features/relatorios/period.test.ts`:

```ts
import { expect, test } from 'vitest'
import { MAX_PERIOD_MONTHS, PERIOD_ERROR, PERIOD_OPTIONS, periodHref, resolvePeriod } from './period'

const today = '2026-09-28'

test('filtros da copy, nessa ordem (RF-40)', () => {
  expect(PERIOD_OPTIONS).toEqual([
    { key: 'este-mes', label: 'Este mês' },
    { key: 'mes-passado', label: 'Mês passado' },
    { key: '3-meses', label: 'Últimos 3 meses' },
    { key: 'personalizado', label: 'Personalizado' },
  ])
  expect(periodHref('mes-passado')).toBe('/relatorios?periodo=mes-passado')
  expect(MAX_PERIOD_MONTHS).toBe(12)
})

test('padrão: últimos 3 meses, terminando no mês atual (protótipo)', () => {
  const p = { key: '3-meses', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: null }
  expect(resolvePeriod({}, today)).toEqual(p)
  expect(resolvePeriod({ periodo: 'qualquer' }, today)).toEqual(p)
})

test('este mês e mês passado; mês passado em janeiro é dezembro do ano anterior (Review Focus 5)', () => {
  expect(resolvePeriod({ periodo: 'este-mes' }, today).months).toEqual(['2026-09'])
  expect(resolvePeriod({ periodo: 'mes-passado' }, today).months).toEqual(['2026-08'])
  expect(resolvePeriod({ periodo: 'mes-passado' }, '2027-01-05').months).toEqual(['2026-12'])
  expect(resolvePeriod({ periodo: '3-meses' }, '2027-01-05').months).toEqual(['2026-11', '2026-12', '2027-01'])
})

test('personalizado: sem datas mostra os 3 meses; um ano inteiro é aceito (mensal e anual)', () => {
  expect(resolvePeriod({ periodo: 'personalizado' }, today)).toEqual({
    key: 'personalizado', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: null,
  })
  const year = resolvePeriod({ periodo: 'personalizado', de: '2026-01', ate: '2026-12' }, today)
  expect(year.months).toHaveLength(12)
  expect([year.from, year.to, year.error]).toEqual(['2026-01', '2026-12', null])
})

test('período personalizado inválido: aviso calmo e os 3 meses (Review Focus 5)', () => {
  for (const [de, ate] of [['2026-10', '2026-09'], ['2025-09', '2026-09'], ['abc', '2026-09'], ['1999-12', '2000-01'], ['2026-01', ''], ['', '2026-01']]) {
    expect(resolvePeriod({ periodo: 'personalizado', de, ate }, today)).toEqual({
      key: 'personalizado', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: PERIOD_ERROR,
    })
  }
  expect(PERIOD_ERROR).toBe('Escolha um período de até 12 meses.')
})
```

Nota: `de = ''` e `ate = ''` juntos contam como "sem datas" (sem erro); só um dos dois vazio é inválido.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/reports.test.ts src/features/relatorios`
Expected: FAIL — `Failed to resolve import "./reports"` / `"./period"`.

- [ ] **Step 3: Implementação** — seguir Interfaces; `monthReports` chama `summarizeMonth` e `spendingByCategory` uma vez por mês (nada de somar à mão). `resolvePeriod` usa `addMonths`, `monthOf`, `monthsBetween`, `parseMonthKey`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain src/features/relatorios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reports.ts src/domain/reports.test.ts src/features/relatorios/period.ts src/features/relatorios/period.test.ts
git commit -m "feat(domain): relatórios por mês, comparação entre meses e período" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Banco — planejado, salvar o mês, repetir o anterior e categoria excluída

**Files:**
- Create: `supabase/migrations/20260930000001_planejamento.sql`
- Test: `tests/db/plano6.test.ts`

**Interfaces:**
- Consumes: `public.touch_updated_at()`, `public.categories` (`unique (id, user_id)`), `tests/db/helpers.ts` (`newUser`, `removeUsers`, `categoryId`, `admin`, `url`, `publishable`).
- Produces (usados pelas Tasks 4, 5, 7 e 11):
  - Tabela `public.budgets (id, user_id, month date, category_id, amount_cents bigint, created_at, updated_at)`, `unique (user_id, month, category_id)`, FK `(category_id, user_id)` → `categories (id, user_id)` `on delete no action`. Políticas: ver, gravar, alterar e excluir os próprios.
  - `set_month_budgets(p_month date, p_category_ids uuid[], p_amounts bigint[]) returns integer` — para cada par: valor nulo tira a categoria do planejado do mês; valor presente grava ou troca. Categorias fora da lista não mudam. Devolve quantas categorias o mês tem planejadas depois.
  - `repeat_previous_budgets(p_month date) returns integer` — copia o planejado do mês anterior para as categorias ainda sem planejado em `p_month` (nunca sobrescreve); devolve quantas copiou.
  - `delete_category(p_category_id uuid)` (substituída): antes de apagar a categoria, soma o planejado dela ao de "Outros" no mesmo mês (até `9999999999`) e apaga as linhas dela; o resto igual ao da migração `20260926000001`.
  - Mensagens de erro: `'Mês inválido.'`, `'Valor inválido.'`, `'Categoria não encontrada.'`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano6.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function plan(user: TestUser, month: string) {
  const { data, error } = await user.client
    .from('budgets')
    .select('category_id, amount_cents')
    .eq('month', month)
    .order('category_id')
  if (error) throw error
  return data.map((r) => ({ category_id: r.category_id, amount_cents: Number(r.amount_cents) }))
}

async function setMonth(user: TestUser, month: string, ids: string[], amounts: (number | null)[]) {
  return user.client.rpc('set_month_budgets', { p_month: month, p_category_ids: ids, p_amounts: amounts })
}

describe('privacidade do planejado', () => {
  test('ninguém vê, grava, altera ou apaga o planejado de outra pessoa', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { error } = await setMonth(a, '2026-01-01', [mercado], [100000])
    expect(error).toBeNull()
    expect(await plan(b, '2026-01-01')).toEqual([])
    const upd = await b.client.from('budgets').update({ amount_cents: 1 }).eq('category_id', mercado).select()
    expect(upd.data ?? []).toEqual([])
    const del = await b.client.from('budgets').delete().eq('category_id', mercado).select()
    expect(del.data ?? []).toEqual([])
    const ins = await b.client.from('budgets').insert({ user_id: b.id, month: '2026-01-01', category_id: mercado, amount_cents: 100 })
    expect(ins.error).not.toBeNull()
    const other = await setMonth(b, '2026-01-01', [mercado], [100])
    expect(other.error?.message).toContain('Categoria não encontrada.')
    expect(await plan(a, '2026-01-01')).toEqual([{ category_id: mercado, amount_cents: 100000 }])
  })

  test('quem não entrou não planeja', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('set_month_budgets', { p_month: '2026-01-01', p_category_ids: [await categoryId(a, 'lazer')], p_amounts: [100] })
    expect(error).not.toBeNull()
  })
})

describe('limites da tabela (gravação direta também respeita)', () => {
  test('mês no 1º dia entre 2000 e 2099, valor entre 1 e o limite, um valor por categoria e mês', async () => {
    const lazer = await categoryId(a, 'lazer')
    const bad = [
      { month: '2026-02-15' }, { month: '1999-12-01' }, { month: '2100-01-01' },
      { amount_cents: 0 }, { amount_cents: -1 }, { amount_cents: 10_000_000_000 },
    ]
    for (const p of bad) {
      const { error } = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 100, ...p })
      expect(error?.code).toBe('23514')
    }
    const ok = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 9_999_999_999 })
    expect(ok.error).toBeNull()
    const dup = await a.client.from('budgets').insert({ user_id: a.id, month: '2026-02-01', category_id: lazer, amount_cents: 100 })
    expect(dup.error?.code).toBe('23505')
  })
})

describe('salvar o planejamento do mês (RF-22)', () => {
  test('grava, troca e tira; categorias fora da lista não mudam', async () => {
    const [mercado, lazer, casa] = await Promise.all(['mercado', 'lazer', 'casa'].map((k) => categoryId(a, k)))
    const first = await setMonth(a, '2026-03-01', [mercado, lazer, casa], [100000, 30000, null])
    expect(first.error).toBeNull()
    expect(first.data).toBe(2)
    const second = await setMonth(a, '2026-03-01', [mercado, lazer], [120000, null])
    expect(second.data).toBe(1)
    const third = await setMonth(a, '2026-03-01', [casa], [90000])
    expect(third.data).toBe(2)
    expect(await plan(a, '2026-03-01')).toEqual(
      [{ category_id: mercado, amount_cents: 120000 }, { category_id: casa, amount_cents: 90000 }].sort((x, y) => x.category_id.localeCompare(y.category_id)),
    )
  })

  test('mês, valores e categorias inválidos são recusados sem mudar nada', async () => {
    const lazer = await categoryId(a, 'lazer')
    await setMonth(a, '2026-04-01', [lazer], [30000])
    const cases: [string | null, (string | null)[], (number | null)[], string][] = [
      ['2026-04-15', [lazer], [1], 'Mês inválido.'],
      ['2100-01-01', [lazer], [1], 'Mês inválido.'],
      [null, [lazer], [1], 'Mês inválido.'],
      ['2026-04-01', [], [], 'Valor inválido.'],
      ['2026-04-01', [lazer], [1, 2], 'Valor inválido.'],
      ['2026-04-01', [lazer], [0], 'Valor inválido.'],
      ['2026-04-01', [lazer], [-5], 'Valor inválido.'],
      ['2026-04-01', [lazer], [10_000_000_000], 'Valor inválido.'],
      ['2026-04-01', Array(201).fill(lazer), Array(201).fill(1), 'Valor inválido.'],
      ['2026-04-01', [lazer, lazer], [1, 2], 'Categoria não encontrada.'],
      ['2026-04-01', [null], [1], 'Categoria não encontrada.'],
      ['2026-04-01', ['3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'], [1], 'Categoria não encontrada.'],
    ]
    for (const [month, ids, amounts, message] of cases) {
      const { error } = await a.client.rpc('set_month_budgets', { p_month: month, p_category_ids: ids, p_amounts: amounts })
      expect(error?.message).toContain(message)
    }
    expect(await plan(a, '2026-04-01')).toEqual([{ category_id: lazer, amount_cents: 30000 }])
  })
})

describe('repetir o planejamento do mês anterior (RF-24)', () => {
  test('copia para as categorias ainda sem planejado; não sobrescreve nem duplica (Review Focus 3)', async () => {
    const [mercado, lazer] = await Promise.all(['mercado', 'lazer'].map((k) => categoryId(a, k)))
    await setMonth(a, '2026-05-01', [mercado, lazer], [100000, 30000])
    const { data, error } = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' })
    expect(error).toBeNull()
    expect(data).toBe(2)
    await setMonth(a, '2026-07-01', [lazer], [50000])
    const partial = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-07-01' })
    expect(partial.data).toBe(1)
    const lazerJul = (await plan(a, '2026-07-01')).find((r) => r.category_id === lazer)
    expect(lazerJul?.amount_cents).toBe(50000)
    const again = await Promise.all([
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
      a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' }),
    ])
    expect(again.map((r) => r.data)).toEqual([0, 0])
    expect(await plan(a, '2026-06-01')).toHaveLength(2)
  })

  test('mês inválido é recusado; mês anterior vazio não copia nada; nada vem de outra pessoa', async () => {
    const bad = await a.client.rpc('repeat_previous_budgets', { p_month: '2026-06-10' })
    expect(bad.error?.message).toContain('Mês inválido.')
    const empty = await a.client.rpc('repeat_previous_budgets', { p_month: '2030-01-01' })
    expect(empty.data).toBe(0)
    const other = await b.client.rpc('repeat_previous_budgets', { p_month: '2026-06-01' })
    expect(other.data).toBe(0)
    expect(await plan(b, '2026-06-01')).toEqual([])
  })
})

describe('categoria excluída (RN-27, Review Focus 2)', () => {
  test('excluir a categoria leva o planejado para "Outros", somado no mesmo mês', async () => {
    const [outros, educacao] = await Promise.all([categoryId(a, 'outros'), categoryId(a, 'educacao')])
    await setMonth(a, '2026-08-01', [educacao, outros], [30000, 10000])
    await setMonth(a, '2026-09-01', [educacao], [5000])
    const { error } = await a.client.rpc('delete_category', { p_category_id: educacao })
    expect(error).toBeNull()
    expect(await plan(a, '2026-08-01')).toEqual([{ category_id: outros, amount_cents: 40000 }])
    expect(await plan(a, '2026-09-01')).toEqual([{ category_id: outros, amount_cents: 5000 }])
  })

  test('a soma em "Outros" nunca passa do limite do app', async () => {
    const [outros, compras] = await Promise.all([categoryId(a, 'outros'), categoryId(a, 'compras')])
    await setMonth(a, '2026-10-01', [compras, outros], [1, 9_999_999_999])
    await a.client.rpc('delete_category', { p_category_id: compras })
    expect(await plan(a, '2026-10-01')).toEqual([{ category_id: outros, amount_cents: 9_999_999_999 }])
  })

  test('apagar direto uma categoria com planejado é barrado — por isso existe a função', async () => {
    const saude = await categoryId(a, 'saude')
    await setMonth(a, '2026-11-01', [saude], [1000])
    const { error } = await a.client.from('categories').delete().eq('id', saude)
    expect(error?.code).toBe('23503')
  })

  test('excluir o cadastro apaga o planejado junto', async () => {
    const c = await newUser('Caio')
    await setMonth(c, '2026-01-01', [await categoryId(c, 'mercado')], [1000])
    const { error } = await admin.auth.admin.deleteUser(c.id)
    expect(error).toBeNull()
    const { data } = await admin.from('budgets').select('id').eq('user_id', c.id)
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano6.test.ts`
Expected: FAIL — `relation "public.budgets" does not exist` (sem Docker: `fetch failed`; registrar como pendente e seguir; `npx tsc --noEmit` precisa passar).

- [ ] **Step 3: Implementação** — criar `supabase/migrations/20260930000001_planejamento.sql`:

```sql
-- Plano 6: planejamento individual (RF-22–24) e categoria excluída (RN-27).
-- As migrações anteriores não são editadas; tudo muda aqui.
-- Planejamento da família está fora da v1 (etapa-2 §6): sem family_id.
-- O "gasto" do planejado nunca é guardado: é calculado em src/domain.

-- 1. Planejado: um valor por pessoa, mês e categoria. Sem planejado = sem linha.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (
    month = date_trunc('month', month)::date
    and month between date '2000-01-01' and date '2099-12-01'
  ),
  category_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_category_key unique (user_id, month, category_id),
  -- no action (adiável): não quebra o cascade de exclusão do cadastro, e
  -- barra apagar direto uma categoria que ainda tem planejado.
  constraint budgets_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete no action
);

create index budgets_category_idx on public.budgets (category_id);

create trigger budgets_touch before update on public.budgets
  for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update on public.budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy budgets_delete on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

-- 2. Salvar o planejamento do mês: tudo de uma vez. Valor nulo tira a
--    categoria do planejado; categorias fora da lista não mudam.
--    As categorias ficam travadas (for share) até o fim: uma exclusão de
--    categoria ao mesmo tempo espera, e depois leva o planejado para Outros.
create function public.set_month_budgets(p_month date, p_category_ids uuid[], p_amounts bigint[])
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := coalesce(cardinality(p_category_ids), 0);
  v_found integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not between date '2000-01-01' and date '2099-12-01' then
    raise exception 'Mês inválido.';
  end if;
  if v_n = 0 or v_n > 200 or v_n <> coalesce(cardinality(p_amounts), 0) then
    raise exception 'Valor inválido.';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is not null and (a <= 0 or a > 9999999999)) then
    raise exception 'Valor inválido.';
  end if;
  if (select count(distinct c) from unnest(p_category_ids) c) <> v_n then
    raise exception 'Categoria não encontrada.';
  end if;
  select count(*) into v_found from (
    select 1 from public.categories c
      where c.user_id = v_uid and c.id = any (p_category_ids)
      for share
  ) s;
  if v_found <> v_n then
    raise exception 'Categoria não encontrada.';
  end if;

  delete from public.budgets b
    using unnest(p_category_ids, p_amounts) as x (category_id, amount_cents)
    where b.user_id = v_uid and b.month = p_month
      and b.category_id = x.category_id and x.amount_cents is null;

  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, p_month, x.category_id, x.amount_cents
      from unnest(p_category_ids, p_amounts) as x (category_id, amount_cents)
      where x.amount_cents is not null
    on conflict (user_id, month, category_id)
      do update set amount_cents = excluded.amount_cents;

  return (select count(*)::integer from public.budgets b where b.user_id = v_uid and b.month = p_month);
end;
$$;

-- 3. Repetir o planejamento do mês anterior (RF-24): só categorias ainda sem
--    planejado no mês; nunca sobrescreve. Dois pedidos ao mesmo tempo: o
--    segundo não copia nada (on conflict do nothing).
create function public.repeat_previous_budgets(p_month date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not between date '2000-01-01' and date '2099-12-01' then
    raise exception 'Mês inválido.';
  end if;
  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, p_month, b.category_id, b.amount_cents
      from public.budgets b
      where b.user_id = v_uid and b.month = (p_month - interval '1 month')::date
    on conflict (user_id, month, category_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 4. Excluir categoria (RN-27): além dos gastos e das contas que se repetem,
--    o planejado vai para "Outros" no mesmo mês, somado (até o limite do app).
--    Mesmo corpo da migração 20260926000001, mais o passo do planejado.
--    create or replace mantém as permissões já concedidas.
create or replace function public.delete_category(p_category_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_outros uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  select c.default_key into v_key
    from public.categories c
    where c.id = p_category_id and c.user_id = v_uid
    for update;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_key = 'outros' then
    raise exception 'A categoria Outros não pode ser excluída.';
  end if;

  select c.id into v_outros
    from public.categories c
    where c.user_id = v_uid and c.default_key = 'outros';
  if v_outros is null then
    raise exception 'Categoria Outros não encontrada.';
  end if;

  update public.transactions t
    set category_id = v_outros
    where t.category_id = p_category_id and t.user_id = v_uid;

  update public.recurrences r
    set category_id = v_outros
    where r.category_id = p_category_id and r.user_id = v_uid;

  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, b.month, v_outros, b.amount_cents
      from public.budgets b
      where b.category_id = p_category_id and b.user_id = v_uid
    on conflict (user_id, month, category_id)
      do update set amount_cents = least(public.budgets.amount_cents + excluded.amount_cents, 9999999999);
  delete from public.budgets b
    where b.category_id = p_category_id and b.user_id = v_uid;

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function
  public.set_month_budgets(date, uuid[], bigint[]),
  public.repeat_previous_budgets(date)
from public, anon;

grant execute on function
  public.set_month_budgets(date, uuid[], bigint[]),
  public.repeat_previous_budgets(date)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS (`rls`, `plano2` a `plano6`; `plano2` continua passando com a nova `delete_category`). Sem Docker: registrar "pendente" e conferir `npx tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000001_planejamento.sql tests/db/plano6.test.ts
git commit -m "feat(db): planejado por categoria, salvar o mês, repetir o anterior e categoria excluída" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Leitura do planejado e montagem das telas (view-models)

**Files:**
- Create: `src/features/planejamento/types.ts`, `src/features/planejamento/queries.ts`, `src/features/planejamento/view-model.ts`
- Test: `src/features/planejamento/types.test.ts`, `src/features/planejamento/view-model.test.ts`

**Interfaces:**
- Consumes: `budgetLines`, `withinCount`, `BudgetState` (Task 1); `formatBRL`, `formatCompactBRL`; `addMonths`, `monthLabel`, `monthOf`, `MonthKey`, `ISODate`; `monthName` (`@/domain/recurrence`); `centsToInput` (`@/features/registro/form-values`); `Category`, `TxRow` (`@/features/registro/queries`); tabela `budgets` (Task 3); `requireUser`, `createClient`.
- Produces:
  - `types.ts` (puro): `interface BudgetRow { month: MonthKey; categoryId: string; amountCents: number }`; `type BudgetRawRow = { month: string; category_id: string; amount_cents: number | string }`; `BUDGET_COLUMNS = 'month, category_id, amount_cents'`; `toBudgetRow(r)` (`'2026-09-01'` → `'2026-09'`).
  - `queries.ts` (`server-only`): `loadBudgets(months: MonthKey[]): Promise<BudgetRow[]>` — `requireUser()`; `from('budgets').select(BUDGET_COLUMNS).eq('user_id', user.id).in('month', months.map((m) => \`${m}-01\`))`; erro → `throw`. Lista limitada (poucos meses × categorias; sem paginação).
  - `view-model.ts` (puro):
    - `interface BudgetLineView { categoryId: string; name: string; amountsText: string; percent: number; state: BudgetState; statusText: string; adjustHref: string }` — `amountsText = '{compact(gasto)} de {compact(planejado)}'`; `statusText`: `within` → `'Ainda tem {compact(falta)} disponível.'`, `near` → `'Falta pouco para chegar ao que você planejou.'`, `over` → `'Passou {compact(passou)} do planejado.'` (protótipo); `adjustHref = '/planejamento/editar?mes={mês}&categoria={id}'`.
    - `interface PlanejamentoView { month: MonthKey; empty: boolean; heroLabel: string; totalCents: number; withinText: string; lines: BudgetLineView[]; editHref: string; repeatFrom: { label: string } | null }`.
    - `buildPlanejamento(input: { month: MonthKey; today: ISODate; categories: Category[]; transactions: TxRow[]; budgets: BudgetRow[] }): PlanejamentoView` — usa só os `budgets` do `month` cujas categorias estão em `categories`, **na ordem de `categories`** (Outros por último); `heroLabel = 'Planejado para {mês}'` (`monthName` no ano de hoje, senão `monthLabel`); `totalCents` = soma do planejado; `withinText = 'Você está dentro do planejado em {withinCount} de {linhas} categorias.'`; `editHref = '/planejamento/editar?mes={mês}'`; `empty` sem linhas; `repeatFrom` só quando `empty` e o mês anterior (`addMonths(month, −1)`) tem planejado: `{ label: 'Repetir o planejamento de {mês anterior}' }` (mesma regra de nome do mês).
    - `interface PlannedCardView { withinText: string; lines: BudgetLineView[] }`; `buildPlannedCard(input)` (mesma entrada de `buildPlanejamento`) — `null` fora do mês de hoje ou sem planejado; senão `withinText` e até 3 linhas por `usage` desc, empate: planejado maior, depois nome (decisão 82).
    - `interface PlanFormView { month: MonthKey; monthText: string; fields: { categoryId: string; name: string; value: string; autoFocus: boolean }[] }`; `buildPlanForm(input: { month: MonthKey; categories: Category[]; budgets: BudgetRow[]; focusCategoryId: string | null }): PlanFormView` — um campo por categoria, na ordem de `categories`; `value = centsToInput(planejado)` ou `''`; `autoFocus` só na categoria pedida; `monthText` = `monthLabel` com a 1ª letra maiúscula.

- [ ] **Step 1: Testes que falham**

`src/features/planejamento/types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { BUDGET_COLUMNS, toBudgetRow } from './types'

test('converte o planejado do banco; mês vira AAAA-MM', () => {
  expect(toBudgetRow({ month: '2026-09-01', category_id: 'c1', amount_cents: '100000' })).toEqual({ month: '2026-09', categoryId: 'c1', amountCents: 100000 })
  for (const c of ['month', 'category_id', 'amount_cents']) expect(BUDGET_COLUMNS).toContain(c)
})
```

`src/features/planejamento/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import type { BudgetRow } from './types'
import { buildPlanForm, buildPlanejamento, buildPlannedCard } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'

const categories = [
  { id: 'c3', name: 'Casa', defaultKey: 'casa' },
  { id: 'c1', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c5', name: 'Transporte', defaultKey: 'transporte' },
  { id: 'c4', name: 'Comer fora', defaultKey: 'comer_fora' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
  { id: 'c6', name: 'Lazer', defaultKey: 'lazer' },
  { id: 'c7', name: 'Outros', defaultKey: 'outros' },
]
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'categoryId'>): TxRow => ({
  kind: 'expense', occurredOn: '2026-09-10', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: '2026-09-10T12:00:00Z', cardId: null, cardDeleted: false, installmentPlanId: null,
  installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const budget = (categoryId: string, amountCents: number, month = '2026-09'): BudgetRow => ({ month, categoryId, amountCents })

// Protótipo Planejamento (setembro): Casa 720/900, Mercado 890/1.000, Transporte 380/300,
// Comer fora 420/400, Saúde 810/900, Lazer 150/300.
const transactions = [
  row({ id: 't1', categoryId: 'c3', amountCents: 72000, occurredOn: '2026-08-28', paidOn: '2026-09-02' }),
  row({ id: 't2', categoryId: 'c3', amountCents: 50000, status: 'pending', dueOn: '2026-09-20' }),
  row({ id: 't3', categoryId: 'c1', amountCents: 60000 }),
  row({ id: 't4', categoryId: 'c1', amountCents: 50000, goalId: 'g1', goalFundedCents: 21000 }),
  row({ id: 't5', categoryId: 'c5', amountCents: 38000 }),
  row({ id: 't6', categoryId: 'c4', amountCents: 42000 }),
  row({ id: 't7', categoryId: 'c2', amountCents: 81000 }),
  row({ id: 't8', categoryId: 'c6', amountCents: 15000 }),
  row({ id: 't9', categoryId: null, kind: 'income', amountCents: 500000, source: 'Salário' }),
]
const budgets = [
  budget('c6', 30000), budget('c2', 90000), budget('c4', 40000), budget('c5', 30000), budget('c1', 100000), budget('c3', 90000),
  budget('c1', 99999, '2026-08'), budget('sumiu', 5000),
]

describe('tela do planejamento (RF-22, RF-23)', () => {
  test('protótipo: total, dentro em 4 de 6, linhas na ordem das categorias com os textos da copy', () => {
    const v = buildPlanejamento({ month: '2026-09', today, categories, transactions, budgets })
    expect(v.empty).toBe(false)
    expect(v.heroLabel).toBe('Planejado para setembro')
    expect(v.totalCents).toBe(380000)
    expect(v.withinText).toBe('Você está dentro do planejado em 4 de 6 categorias.')
    expect(v.editHref).toBe('/planejamento/editar?mes=2026-09')
    expect(v.repeatFrom).toBeNull()
    expect(v.lines.map((l) => [l.name, l.amountsText, l.state, l.statusText])).toEqual([
      ['Casa', `${brl('720')} de ${brl('900')}`, 'within', `Ainda tem ${brl('180')} disponível.`],
      ['Mercado', `${brl('890')} de ${brl('1.000')}`, 'within', `Ainda tem ${brl('110')} disponível.`],
      ['Transporte', `${brl('380')} de ${brl('300')}`, 'over', `Passou ${brl('80')} do planejado.`],
      ['Comer fora', `${brl('420')} de ${brl('400')}`, 'over', `Passou ${brl('20')} do planejado.`],
      ['Saúde', `${brl('810')} de ${brl('900')}`, 'near', 'Falta pouco para chegar ao que você planejou.'],
      ['Lazer', `${brl('150')} de ${brl('300')}`, 'within', `Ainda tem ${brl('150')} disponível.`],
    ])
    expect(v.lines[3]).toMatchObject({ percent: 100, adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4' })
  })

  test('mês sem planejado: vazio, com "Repetir" quando o mês anterior tem (RF-24)', () => {
    const v = buildPlanejamento({ month: '2026-10', today, categories, transactions, budgets })
    expect(v.empty).toBe(true)
    expect(v.repeatFrom).toEqual({ label: 'Repetir o planejamento de setembro' })
    expect(buildPlanejamento({ month: '2026-08', today, categories, transactions, budgets: [] }).repeatFrom).toBeNull()
  })

  test('mês de outro ano leva o ano no nome', () => {
    const v = buildPlanejamento({ month: '2027-01', today, categories, transactions: [], budgets: [budget('c1', 1000, '2027-01'), budget('c1', 1000, '2026-12')] })
    expect(v.heroLabel).toBe('Planejado para janeiro de 2027')
    expect(buildPlanejamento({ month: '2027-02', today, categories, transactions: [], budgets: [budget('c1', 1000, '2027-01')] }).repeatFrom).toEqual({
      label: 'Repetir o planejamento de janeiro de 2027',
    })
  })
})

describe('bloco "Planejado" do Seu mês (RF-33)', () => {
  test('até 3 categorias, as mais usadas primeiro; só no mês atual e com planejado', () => {
    const card = buildPlannedCard({ month: '2026-09', today, categories, transactions, budgets })
    expect(card?.withinText).toBe('Você está dentro do planejado em 4 de 6 categorias.')
    expect(card?.lines.map((l) => l.name)).toEqual(['Transporte', 'Comer fora', 'Saúde'])
    expect(buildPlannedCard({ month: '2026-08', today, categories, transactions, budgets })).toBeNull()
    expect(buildPlannedCard({ month: '2026-09', today, categories, transactions, budgets: [] })).toBeNull()
  })
})

test('formulário: um campo por categoria, com o planejado atual e o foco no "Ajustar valor"', () => {
  const v = buildPlanForm({ month: '2026-09', categories, budgets, focusCategoryId: 'c4' })
  expect(v.monthText).toBe('Setembro de 2026')
  expect(v.fields.map((f) => [f.categoryId, f.name, f.value, f.autoFocus])).toEqual([
    ['c3', 'Casa', '900,00', false],
    ['c1', 'Mercado', '1000,00', false],
    ['c5', 'Transporte', '300,00', false],
    ['c4', 'Comer fora', '400,00', true],
    ['c2', 'Saúde', '900,00', false],
    ['c6', 'Lazer', '300,00', false],
    ['c7', 'Outros', '', false],
  ])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/planejamento`
Expected: FAIL — `Failed to resolve import "./types"` / `"./view-model"`.

- [ ] **Step 3: Implementação** — seguir Interfaces; `buildPlanejamento` e `buildPlannedCard` chamam `budgetLines` (nenhuma soma de gasto no view-model). `queries.ts` segue `src/features/metas/queries.ts` (`import 'server-only'`, `requireUser()` primeiro, filtro `user_id` explícito).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/planejamento && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planejamento/types.ts src/features/planejamento/types.test.ts src/features/planejamento/queries.ts src/features/planejamento/view-model.ts src/features/planejamento/view-model.test.ts
git commit -m "feat(planejamento): leitura do planejado e montagem das telas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Salvar e repetir o planejamento (Server Actions)

**Files:**
- Create: `src/features/planejamento/schemas.ts`, `src/features/planejamento/actions.ts`
- Modify: `src/lib/refresh.ts` (acrescentar `revalidatePath('/planejamento')` e `revalidatePath('/relatorios')`)
- Test: `src/features/planejamento/schemas.test.ts`, `src/features/planejamento/actions.test.ts`

**Interfaces:**
- Consumes: `parseBRL`; `parseMonthKey`; RPCs `set_month_budgets`, `repeat_previous_budgets` (Task 3); `requireUser`, `createClient`, `setFlash`, `refreshMoneyViews`, `errorState`.
- Produces:
  - `schemas.ts`: `PLAN_FIELD_PREFIX = 'plan.'`; `MAX_PLAN_FIELDS = 200`; `PLAN_INVALID = 'Esse valor não parece certo. Use apenas números.'` (copy); `parsePlanFields(fd: FormData): { entries: { categoryId: string; amountCents: number | null }[]; values: Record<string, string>; fieldErrors: Record<string, string> } | null` — lê as chaves `plan.{uuid}` (chaves com id que não é uuid são ignoradas); mais de 200 → `null`; em branco, `0` ou `0,00` → `amountCents: null`; `parseBRL` nulo → `fieldErrors['plan.{id}'] = PLAN_INVALID`; `values` guarda tudo o que foi digitado, com as mesmas chaves.
  - `actions.ts` (`'use server'`, só funções async; `SAVE_FAILED` local):
    - `saveBudgets(_: FormState, fd: FormData): Promise<FormState>` — `requireUser()`; mês do campo escondido `month` por `parseMonthKey` (inválido → `SAVE_FAILED`); `parsePlanFields` nulo → `SAVE_FAILED`; com `fieldErrors` → `errorState({ fieldErrors, values })` sem chamar o banco; lê as categorias da pessoa (`from('categories').select('id').eq('user_id', user.id)`) e **ignora** as entradas de categorias que não existem mais (excluídas em outra aba — decisão 79); sem entradas restantes → não chama a função e segue como sucesso (aviso, `refreshMoneyViews()`, redirecionamento abaixo); senão `rpc('set_month_budgets', { p_month: '{mês}-01', p_category_ids, p_amounts })`; erro → `errorState({ message: SAVE_FAILED, values })`; sucesso → `setFlash('Planejamento salvo. Agora é só acompanhar.')`, `refreshMoneyViews()`, `redirect('/planejamento?mes={mês}')`.
    - `repeatPreviousBudgets(fd: FormData): Promise<void>` — `requireUser()`; mês inválido → `/planejamento` sem chamar o banco; `rpc('repeat_previous_budgets', { p_month })`; erro → `/planejamento?mes={mês}&erro=1`; copiou algo (`data > 0`) → `setFlash('Planejamento salvo. Agora é só acompanhar.')`; sempre `refreshMoneyViews()` e `/planejamento?mes={mês}`.

- [ ] **Step 1: Testes que falham**

`src/features/planejamento/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { MAX_PLAN_FIELDS, PLAN_INVALID, parsePlanFields } from './schemas'

const A = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const B = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

test('lê um valor por categoria; zero e em branco tiram a categoria do planejado (Review Focus 4)', () => {
  const r = parsePlanFields(form({ month: '2026-09', [`plan.${A}`]: '1.000', [`plan.${B}`]: '', 'plan.nao-e-id': '5', outro: 'x' }))
  expect(r?.entries).toEqual([{ categoryId: A, amountCents: 100000 }, { categoryId: B, amountCents: null }])
  expect(r?.fieldErrors).toEqual({})
  for (const zero of ['0', '0,00', ' ']) expect(parsePlanFields(form({ [`plan.${A}`]: zero }))?.entries).toEqual([{ categoryId: A, amountCents: null }])
})

test('valor inválido: mensagem da copy no campo e tudo o que foi digitado fica', () => {
  for (const bad of ['abc', '1 2', '99999999999']) {
    const r = parsePlanFields(form({ [`plan.${A}`]: bad, [`plan.${B}`]: '300' }))
    expect(r?.fieldErrors).toEqual({ [`plan.${A}`]: PLAN_INVALID })
    expect(r?.values).toEqual({ [`plan.${A}`]: bad, [`plan.${B}`]: '300' })
  }
  expect(PLAN_INVALID).toBe('Esse valor não parece certo. Use apenas números.')
})

test('mais campos do que o limite: recusado', () => {
  const fields: Record<string, string> = {}
  for (let i = 0; i <= MAX_PLAN_FIELDS; i++) fields[`plan.00000000-0000-4000-8000-${String(i).padStart(12, '0')}`] = '1'
  expect(parsePlanFields(form(fields))).toBeNull()
})
```

`src/features/planejamento/actions.test.ts` (cabeçalho de mocks igual ao de `src/features/metas/actions.test.ts`: `h` com `RedirectSignal`, `supabase`, `setFlash`, `refresh`; mocks de `@/lib/supabase/server`, `@/lib/flash`, `@/lib/refresh`, `next/cache`, `next/navigation`; `redirectOf`, `form`; relógio falso em `2026-09-28T15:00:00Z`; `const actions = await import('./actions')`):

```ts
type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []
const A = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const B = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

function fakeSupabase(s: { categoryIds?: string[]; rpc?: { data?: unknown; error?: unknown } } = {}) {
  return {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: async (col: string, val: unknown) => {
          calls.push({ op: `select:${table}:${cols}`, filters: { [col]: val } })
          return { data: (s.categoryIds ?? [A, B]).map((id) => ({ id })), error: null }
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: s.rpc?.data ?? null, error: s.rpc?.error ?? null }
    },
  }
}

describe('saveBudgets (RF-22)', () => {
  test('salva o mês pela função atômica, só com categorias da própria pessoa, e avisa com a copy', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 1 } })
    const url = await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '1.000', [`plan.${B}`]: '', user_id: 'outra' })))
    expect(url).toBe('/planejamento?mes=2026-09')
    expect(calls).toEqual([
      { op: 'select:categories:id', filters: { user_id: 'u1' } },
      { op: 'rpc:set_month_budgets', filters: {}, payload: { p_month: '2026-09-01', p_category_ids: [A, B], p_amounts: [100000, null] } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Planejamento salvo. Agora é só acompanhar.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('categoria excluída em outra aba é ignorada; o resto é salvo (Review Focus 3)', async () => {
    h.supabase = fakeSupabase({ categoryIds: [A], rpc: { data: 1 } })
    await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100', [`plan.${B}`]: '50' })))
    expect(calls[1].payload).toEqual({ p_month: '2026-09-01', p_category_ids: [A], p_amounts: [10000] })
  })

  test('nenhuma categoria sobrou: não chama a função e volta ao planejamento', async () => {
    h.supabase = fakeSupabase({ categoryIds: [] })
    expect(await redirectOf(actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100' })))).toBe('/planejamento?mes=2026-09')
    expect(calls.map((c) => c.op)).toEqual(['select:categories:id'])
  })

  test('valor inválido fica no campo com a mensagem da copy, sem chamar o banco (Review Focus 4)', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: 'abc', [`plan.${B}`]: '300' }))
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { [`plan.${A}`]: 'Esse valor não parece certo. Use apenas números.' },
      values: { [`plan.${A}`]: 'abc', [`plan.${B}`]: '300' },
    })
    expect(calls).toEqual([])
  })

  test('mês inválido ou falha no banco: aviso da copy, sem perder o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.saveBudgets({ status: 'idle' }, form({ month: 'abc', [`plan.${A}`]: '100' }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
    h.supabase = fakeSupabase({ rpc: { error: { message: 'Categoria não encontrada.' } } })
    expect(await actions.saveBudgets({ status: 'idle' }, form({ month: '2026-09', [`plan.${A}`]: '100' }))).toMatchObject({
      status: 'error', message: SAVE_FAILED, values: { [`plan.${A}`]: '100' },
    })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('repeatPreviousBudgets (RF-24)', () => {
  test('repete o mês anterior e avisa', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 6 } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10')
    expect(calls).toEqual([{ op: 'rpc:repeat_previous_budgets', filters: {}, payload: { p_month: '2026-10-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Planejamento salvo. Agora é só acompanhar.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('repetir sem nada novo não avisa; falha volta com aviso; mês inválido não chama o banco (Review Focus 3)', async () => {
    h.supabase = fakeSupabase({ rpc: { data: 0 } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10')
    expect(h.setFlash).not.toHaveBeenCalled()
    h.supabase = fakeSupabase({ rpc: { error: { message: 'x' } } })
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-10' })))).toBe('/planejamento?mes=2026-10&erro=1')
    calls.length = 0
    expect(await redirectOf(actions.repeatPreviousBudgets(form({ month: '2026-13' })))).toBe('/planejamento')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/planejamento/schemas.test.ts src/features/planejamento/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"` / `"./actions"`.

- [ ] **Step 3: Implementação** — seguir Interfaces. A ordem das entradas é a dos campos no formulário (a ordem das categorias). Erros do banco não são reconhecidos por texto aqui: qualquer erro → `SAVE_FAILED`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/planejamento src/lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planejamento/schemas.ts src/features/planejamento/schemas.test.ts src/features/planejamento/actions.ts src/features/planejamento/actions.test.ts src/lib/refresh.ts
git commit -m "feat(planejamento): salvar o planejamento do mês e repetir o anterior" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Componentes do planejamento — linhas e formulário

**Files:**
- Create: `src/features/planejamento/budget-lines.tsx`, `src/features/planejamento/plan-form.tsx`
- Modify: `src/ui/progress-bar.tsx` (tom `over`)
- Test: `src/features/planejamento/budget-lines.test.tsx`, `src/features/planejamento/plan-form.test.tsx`, `src/ui/progress-bar.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `BudgetLineView`, `PlanFormView` (Task 4); `PLAN_FIELD_PREFIX` (Task 5); `ProgressBar`; `Button`, `FormAlert`; `idle`/`FormState`.
- Produces:
  - `ProgressBar` ganha `tone?: 'brand' | 'over'` (padrão `brand`; `over` pinta o preenchimento com `bg-amber-bar`, V5) e o tamanho `sm` (trilho `h-2 bg-sunken`, protótipo Planejamento). `md` e `lg` não mudam.
  - `BudgetLines({ lines, showAdjust }: { lines: BudgetLineView[]; showAdjust: boolean })` — `ul` sem marcadores, um `li` por linha (separador `border-line` entre elas, visual do protótipo): nome (15 px, 600, `text-ink`) e `amountsText` (`num`) na mesma linha; `ProgressBar percent={percent} label="Uso do planejado em {nome}" tone={state === 'over' ? 'over' : 'brand'} size="sm"`; `within`/`near` → `p` 14 px `text-muted` com `statusText`; `over` → `span` pílula `bg-amber-wash text-amber-ink` 14 px 500 com `statusText` e, se `showAdjust`, `Link` "Ajustar valor" (`aria-label="Ajustar valor de {nome}"`, `min-h-11`, `text-brand-text`) para `adjustHref`.
  - `PlanForm({ view, action }: { view: PlanFormView; action: (s: FormState, fd: FormData) => Promise<FormState> })` — `'use client'`; `useActionState(action, idle)`; `<form key={err ? err.submission : 'idle'}>`; `input hidden name="month"`; um campo por `field`: `label` com o nome da categoria (15 px, 500) ligado a `input` `name="plan.{id}"`, `id="plan-{id}"`, `inputMode="decimal"`, `autoComplete="off"`, `autoFocus` quando `field.autoFocus`, `defaultValue = err.values['plan.{id}'] ?? field.value`; erro sob o campo (`aria-invalid`, `aria-describedby`); `err.message` em `FormAlert`; botão `Button` "Salvar planejamento" (`disabled` enquanto envia).

- [ ] **Step 1: Testes que falham**

Em `src/ui/progress-bar.test.tsx` (acrescentar):

```tsx
test('tom "passou" pinta a barra de âmbar (V5); o padrão continua verde', () => {
  render(<ProgressBar percent={100} label="Uso do planejado em Lazer" tone="over" />)
  const bar = screen.getByRole('progressbar', { name: 'Uso do planejado em Lazer' })
  expect((bar.firstElementChild as HTMLElement).className).toContain('bg-amber-bar')
  cleanup()
  render(<ProgressBar percent={10} label="X" />)
  expect((screen.getByRole('progressbar', { name: 'X' }).firstElementChild as HTMLElement).className).toContain('bg-brand')
})
```

`src/features/planejamento/budget-lines.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BudgetLines } from './budget-lines'
import type { BudgetLineView } from './view-model'

afterEach(() => cleanup())

const lines: BudgetLineView[] = [
  { categoryId: 'c1', name: 'Mercado', amountsText: 'R$ 890 de R$ 1.000', percent: 89, state: 'within', statusText: 'Ainda tem R$ 110 disponível.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c1' },
  { categoryId: 'c2', name: 'Saúde', amountsText: 'R$ 810 de R$ 900', percent: 90, state: 'near', statusText: 'Falta pouco para chegar ao que você planejou.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c2' },
  { categoryId: 'c4', name: 'Comer fora', amountsText: 'R$ 420 de R$ 400', percent: 100, state: 'over', statusText: 'Passou R$ 20 do planejado.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4' },
]

test('cada linha: nome, "{gasto} de {planejado}", barra acessível e o estado em texto (RF-23)', () => {
  render(<BudgetLines lines={lines} showAdjust />)
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(items[0].textContent).toContain('Mercado')
  expect(items[0].textContent).toContain('R$ 890 de R$ 1.000')
  expect(items[0].textContent).toContain('Ainda tem R$ 110 disponível.')
  expect(items[1].textContent).toContain('Falta pouco para chegar ao que você planejou.')
  expect(items[2].textContent).toContain('Passou R$ 20 do planejado.')
  const over = screen.getByRole('progressbar', { name: 'Uso do planejado em Comer fora' })
  expect(over.getAttribute('aria-valuenow')).toBe('100')
  expect((over.firstElementChild as HTMLElement).className).toContain('bg-amber-bar')
  expect(screen.getByRole('link', { name: 'Ajustar valor de Comer fora' }).getAttribute('href')).toBe('/planejamento/editar?mes=2026-09&categoria=c4')
  expect(screen.queryByRole('link', { name: 'Ajustar valor de Mercado' })).toBeNull()
  expect(document.body.innerHTML).not.toMatch(/text-red|bg-red/)
})

test('sem "Ajustar valor" quando não pedido (Seu mês)', () => {
  render(<BudgetLines lines={lines} showAdjust={false} />)
  expect(screen.queryAllByRole('link')).toHaveLength(0)
})
```

`src/features/planejamento/plan-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { PlanForm } = await import('./plan-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()
const view = {
  month: '2026-09',
  monthText: 'Setembro de 2026',
  fields: [
    { categoryId: 'c1', name: 'Mercado', value: '1000,00', autoFocus: false },
    { categoryId: 'c4', name: 'Comer fora', value: '400,00', autoFocus: true },
    { categoryId: 'c7', name: 'Outros', value: '', autoFocus: false },
  ],
}

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('um campo por categoria, com o planejado atual, o mês escondido e o foco no "Ajustar valor"', () => {
  render(<PlanForm view={view} action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  const mercado = screen.getByLabelText('Mercado') as HTMLInputElement
  expect([mercado.name, mercado.value, mercado.inputMode]).toEqual(['plan.c1', '1000,00', 'decimal'])
  expect((screen.getByLabelText('Outros') as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(screen.getByLabelText('Comer fora'))
  expect((document.querySelector('input[type="hidden"][name="month"]') as HTMLInputElement).value).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Salvar planejamento' })).toBeTruthy()
})

test('erro sob o campo e o que foi digitado fica (Review Focus 4)', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { 'plan.c1': 'Esse valor não parece certo. Use apenas números.' }, values: { 'plan.c1': 'abc', 'plan.c4': '500', 'plan.c7': '' } },
    vi.fn(),
    false,
  ])
  render(<PlanForm view={view} action={action} />)
  const mercado = screen.getByLabelText('Mercado') as HTMLInputElement
  expect(mercado.value).toBe('abc')
  expect(mercado.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(mercado.getAttribute('aria-describedby')!)?.textContent).toBe('Esse valor não parece certo. Use apenas números.')
  expect((screen.getByLabelText('Comer fora') as HTMLInputElement).value).toBe('500')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/planejamento src/ui/progress-bar.test.tsx`
Expected: FAIL — `Failed to resolve import "./budget-lines"` / `"./plan-form"`; `tone` sem efeito.

- [ ] **Step 3: Implementação** — seguir Interfaces; `plan-form.tsx` segue `src/features/metas/goal-form.tsx`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/planejamento src/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planejamento/budget-lines.tsx src/features/planejamento/budget-lines.test.tsx src/features/planejamento/plan-form.tsx src/features/planejamento/plan-form.test.tsx src/ui/progress-bar.tsx src/ui/progress-bar.test.tsx
git commit -m "feat(planejamento): linhas do planejado e formulário do mês" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Páginas do planejamento e bloco "Planejado" no Seu mês

**Files:**
- Create: `src/app/(app)/planejamento/page.tsx`, `src/app/(app)/planejamento/editar/page.tsx`, `src/features/seu-mes/planned-card.tsx`
- Modify: `src/features/seu-mes/view-model.ts`, `src/app/(app)/inicio/page.tsx`
- Test: `src/features/seu-mes/planned-card.test.tsx`, `src/features/seu-mes/view-model.test.ts` (acrescentar; chamadas existentes ganham `budgets: []`)

**Interfaces:**
- Consumes: `loadBudgets`, `buildPlanejamento`, `buildPlannedCard`, `buildPlanForm`, `PlannedCardView`, `BudgetRow` (Task 4); `saveBudgets`, `repeatPreviousBudgets` (Task 5); `BudgetLines`, `PlanForm` (Task 6); `loadLedger`, `loadCategories`; `MonthNav` (`basePath`); `PageHeader`, `Card`, `Button`, `FormAlert`, `Money`; `parseMonthKey`, `monthOf`, `addMonths`, `todayInSaoPaulo`; `z.uuid()`.
- Produces:
  - `buildSeuMes` recebe também `budgets: BudgetRow[]` e devolve `planned: PlannedCardView | null` (= `buildPlannedCard` com o mesmo mês, hoje, categorias e registros).
  - `PlannedCard({ card }: { card: PlannedCardView })` — `section aria-labelledby` (cartão branco, visual do protótipo `Main`) com `h2` "Planejado" e `Link` "Ver planejamento" (`/planejamento`, `min-h-11`) na mesma linha; `p` 15 px com `withinText`; `BudgetLines lines={card.lines} showAdjust={false}`.
  - `inicio/page.tsx`: `loadBudgets([month])` em paralelo com `loadLedger()` e `loadGoals()`; `{v.planned && <PlannedCard card={v.planned} />}` logo depois de `UpcomingBills` (ordem do protótipo: Próximas contas, Planejado, Meta em destaque).
  - `/planejamento?mes=` — mês por `parseMonthKey` (inválido ou ausente → mês de hoje); `Promise.all([loadLedger(), loadBudgets([month, addMonths(month, -1)])])`; `?erro=1` → `FormAlert` "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; `PageHeader title="Quanto você quer usar este mês" backHref="/mais" backOnMobileOnly`; `p` "Defina um valor para cada área. A Íris mostra quanto ainda está disponível."; `MonthNav month label basePath="/planejamento"`. Vazio: cartão tracejado com "Você ainda não planejou este mês. Defina quanto quer usar em cada área e a Íris acompanha para você." + `Button href={editHref}` "Planejar meu mês" e, se `repeatFrom`, `form action={repeatPreviousBudgets}` com `input hidden month` e `Button variant="secondary" type="submit"` com `repeatFrom.label`. Com planejado: faixa `bg-brand-wash border-brand-wash-border rounded-card` com `heroLabel` (14 px, `text-brand-text`), total (`Money`, 26 px, 700, `text-brand-ink`) e `withinText` (14 px, `text-brand-ink`); `Card` com `BudgetLines showAdjust`; `Button variant="secondary" href={editHref}` "Planejar outra categoria". Sempre no fim: `p` 14 px `text-muted` "O que é "Planejado"? Quanto você decidiu usar em cada área este mês. Serve de referência, não é uma regra.". Largura `max-w-[720px]`.
  - `/planejamento/editar?mes=&categoria=` — mês como acima; `categoria` só se for uuid; `Promise.all([loadCategories(), loadBudgets([month])])`; `PageHeader title="Planejar meu mês" backHref="/planejamento?mes={mês}"`; `p` 14 px `text-muted` com `monthText`; `p` "Defina um valor para cada área. A Íris mostra quanto ainda está disponível." e `p` 14 px `text-muted` "Deixe em branco o que não quiser planejar."; `PlanForm view={buildPlanForm(...)} action={saveBudgets}`; largura `max-w-[560px]`.

- [ ] **Step 1: Testes que falham**

Em `src/features/seu-mes/view-model.test.ts` (acrescentar; `budgets: []` nas chamadas que já existem):

```ts
test('bloco "Planejado" só no mês atual e com planejado (RF-33)', () => {
  const input = {
    profile: { displayName: 'C', initialBalanceCents: 0 }, categories, goals: [], goalMovements: [],
    transactions: [row({ id: 't1', kind: 'expense', amountCents: 42000, occurredOn: '2026-09-10', categoryId: 'c1' })],
    budgets: [{ month: '2026-09', categoryId: 'c1', amountCents: 40000 }],
  }
  const v = buildSeuMes({ ...input, month: '2026-09', today: '2026-09-22' })
  expect(v.planned?.withinText).toBe('Você está dentro do planejado em 0 de 1 categorias.')
  expect(v.planned?.lines.map((l) => [l.name, l.state])).toEqual([['Mercado', 'over']])
  expect(buildSeuMes({ ...input, month: '2026-08', today: '2026-09-22' }).planned).toBeNull()
  expect(buildSeuMes({ ...input, budgets: [], month: '2026-09', today: '2026-09-22' }).planned).toBeNull()
})
```

`src/features/seu-mes/planned-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { PlannedCard } from './planned-card'

afterEach(() => cleanup())

test('Planejado: quantas estão dentro, linhas sem "Ajustar valor" e "Ver planejamento"', () => {
  render(
    <PlannedCard
      card={{
        withinText: 'Você está dentro do planejado em 4 de 6 categorias.',
        lines: [{ categoryId: 'c4', name: 'Comer fora', amountsText: 'R$ 420 de R$ 400', percent: 100, state: 'over', statusText: 'Passou R$ 20 do planejado.', adjustHref: '/planejamento/editar?mes=2026-09&categoria=c4' }],
      }}
    />,
  )
  const card = screen.getByRole('region', { name: 'Planejado' })
  expect(within(card).getByRole('link', { name: 'Ver planejamento' }).getAttribute('href')).toBe('/planejamento')
  expect(card.textContent).toContain('Você está dentro do planejado em 4 de 6 categorias.')
  expect(card.textContent).toContain('Passou R$ 20 do planejado.')
  expect(within(card).queryByRole('link', { name: /Ajustar valor/ })).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/seu-mes`
Expected: FAIL — `Failed to resolve import "./planned-card"`; `planned` indefinido.

- [ ] **Step 3: Implementação** — seguir Interfaces. Página `/planejamento`:

```tsx
type Props = { searchParams: Promise<{ mes?: string; erro?: string }> }

export default async function PlanejamentoPage({ searchParams }: Props) {
  const { mes, erro } = await searchParams
  const today = todayInSaoPaulo()
  const month = parseMonthKey(mes) ?? monthOf(today)
  const [{ categories, transactions }, budgets] = await Promise.all([loadLedger(), loadBudgets([month, addMonths(month, -1)])])
  const v = buildPlanejamento({ month, today, categories, transactions, budgets })
  // … cabeçalho, MonthNav, vazio ou faixa + linhas, ajuda (Interfaces)
}
```

`/planejamento/editar` segue `src/app/(app)/metas/nova/page.tsx`; o bloco no Seu mês segue `src/features/seu-mes/featured-goal.tsx`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos PASS; build com `/planejamento` e `/planejamento/editar`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planejamento" "src/app/(app)/inicio/page.tsx" src/features/seu-mes
git commit -m "feat(planejamento): telas do planejamento e bloco Planejado no Seu mês" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Montagem dos relatórios (view-model)

**Files:**
- Create: `src/features/relatorios/view-model.ts`
- Test: `src/features/relatorios/view-model.test.ts`

**Interfaces:**
- Consumes: `monthReports`, `compareCategories`, `sumCategories` (Task 2); `Period` (Task 2); `formatCompactBRL` (Task 1); `effectiveDate`; `addMonths`, `monthOf`, `monthLabel`, `shortMonthLabel`; `monthName`; `Category`, `Profile`, `TxRow` (`@/features/registro/queries`); `GoalMovementRow` (`@/features/metas/types`).
- Produces:
  - `type Sentence = (string | { value: string })[]`; `sentenceText(s: Sentence): string` (junta tudo; os `value` são os números em destaque).
  - `interface RelatoriosView { empty: boolean; summary: Sentence; changes: Sentence[]; chart: ChartBar[] | null; months: MonthRow[]; categories: { name: string; cents: number; share: number }[] }`.
  - `interface ChartBar { month: MonthKey; label: string; fullLabel: string; entrouText: string; saiuText: string; entrouHeight: number; saiuHeight: number }` — alturas em % do maior valor (entrou ou saiu) do período, `Math.round`; 0 quando tudo é 0; `label` = nome do mês com maiúscula (até 4 meses) ou as 3 primeiras letras com maiúscula ("Jul"); `fullLabel` = o `label` de `MonthRow`.
  - `interface MonthRow { month: MonthKey; label: string; current: boolean; entrouText: string; saiuText: string; goalText: string | null }` — `label` = nome do mês com maiúscula ("Setembro"), com " de {ano}" quando o ano não é o de hoje; `current` = mês de hoje ("até agora", protótipo); `entrouText = 'Entrou {compact}'`, `saiuText = 'Saiu {compact}'` (copy); `goalText`: "Guardado este mês" → `'Guardado {compact}'`, "Tirado das metas" → `'Tirado das metas {compact}'`, sem linha → `null`.
  - `buildRelatorios(input: { period: Period; today: ISODate; profile: Profile; categories: Category[]; transactions: TxRow[]; goalMovements: GoalMovementRow[] }): RelatoriosView`:
    - `monthReports` para `[addMonths(from, −1), ...period.months]` (o mês antes do período só serve à comparação).
    - `summary` (RF-38, copy "Resumo"): do **último** mês do período: `['Em {mês}, entrou ', { value }, ' e saiu ', { value }, '.']` — `{mês}` = `monthName` minúsculo, com " de {ano}" fora do ano de hoje.
    - `changes` (RF-39, copy "Comparação"): `compareCategories(último.byCategory, anterior.byCategory)` (até 3); queda → `['Você gastou ', { value: compact(|delta|) }, ' a menos com {categoria} do que no mês passado.']`; alta → `['Seus gastos com {categoria} subiram ', { value }, ' em relação ao mês passado.']`; nome da categoria pelo id (`'Outros'` se não achar).
    - `chart` só com 2 ou mais meses (senão `null`), em ordem crescente.
    - `months` do mais recente para o mais antigo (protótipo "Mês a mês").
    - `categories` = `sumCategories` dos meses do período, com nome e `share` relativo ao maior (mesmo formato de `SeuMesView.categories`, para usar `CategoriesCard`).
    - `empty` quando a pessoa não tem nenhum registro confirmado (`effectiveDate` nulo em todos) nem movimento de meta.

- [ ] **Step 1: Testes que falham** — `src/features/relatorios/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { formatCompactBRL } from '@/domain/money'
import type { GoalMovementRow } from '@/features/metas/types'
import type { TxRow } from '@/features/registro/queries'
import { buildSeuMes } from '@/features/seu-mes/view-model'
import { resolvePeriod } from './period'
import { buildRelatorios, sentenceText } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'
const profile = { displayName: 'Camila', initialBalanceCents: 0 }
const categories = [
  { id: 'c3', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c1', name: 'Comer fora', defaultKey: 'comer_fora' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
]
let seq = 0
const row = (p: Partial<TxRow> & Pick<TxRow, 'amountCents' | 'occurredOn'>): TxRow => ({
  id: `t${++seq}`, kind: 'expense', categoryId: 'c3', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, cardId: null, cardDeleted: false, installmentPlanId: null,
  installmentNumber: null, installmentCount: null, goalId: null, ...p,
})
const income = (occurredOn: string) => row({ kind: 'income', categoryId: null, source: 'Salário', amountCents: 500000, occurredOn })
const move = (p: Pick<GoalMovementRow, 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  id: `m${++seq}`, goalId: 'g1', transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

// Protótipo Relatórios: julho saiu R$ 4.310, agosto R$ 3.720, setembro R$ 3.460.
const transactions = [
  income('2026-07-05'), row({ amountCents: 431000, occurredOn: '2026-07-10' }),
  income('2026-08-05'), row({ categoryId: 'c1', amountCents: 60000, occurredOn: '2026-08-10' }),
  row({ categoryId: 'c2', amountCents: 47000, occurredOn: '2026-08-11' }), row({ amountCents: 265000, occurredOn: '2026-08-12' }),
  income('2026-09-05'), row({ categoryId: 'c1', amountCents: 42000, occurredOn: '2026-09-10' }),
  row({ categoryId: 'c2', amountCents: 81000, occurredOn: '2026-09-11' }), row({ amountCents: 223000, occurredOn: '2026-09-12' }),
]
const goalMovements = [
  move({ kind: 'deposit', amountCents: 30000, occurredOn: '2026-08-10' }),
  move({ kind: 'withdraw', amountCents: 10000, occurredOn: '2026-09-02' }),
]
const build = (params: Parameters<typeof resolvePeriod>[0], tx = transactions, moves = goalMovements, t = today) =>
  buildRelatorios({ period: resolvePeriod(params, t), today: t, profile, categories, transactions: tx, goalMovements: moves })

describe('relatórios dos últimos 3 meses (protótipo)', () => {
  const v = build({})

  test('o que mudou: resumo do último mês e comparações em frases, antes dos gráficos (RF-38, RF-39)', () => {
    expect(v.empty).toBe(false)
    expect(sentenceText(v.summary)).toBe(`Em setembro, entrou ${brl('5.000')} e saiu ${brl('3.460')}.`)
    expect(v.summary.filter((p) => typeof p !== 'string')).toEqual([{ value: brl('5.000') }, { value: brl('3.460') }])
    expect(v.changes.map(sentenceText)).toEqual([
      `Você gastou ${brl('420')} a menos com Mercado do que no mês passado.`,
      `Seus gastos com Saúde subiram ${brl('340')} em relação ao mês passado.`,
      `Você gastou ${brl('180')} a menos com Comer fora do que no mês passado.`,
    ])
  })

  test('mês a mês: entrou, saiu e guardado, do mais recente para o mais antigo', () => {
    expect(v.months).toEqual([
      { month: '2026-09', label: 'Setembro', current: true, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('3.460')}`, goalText: `Tirado das metas ${brl('100')}` },
      { month: '2026-08', label: 'Agosto', current: false, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('3.720')}`, goalText: `Guardado ${brl('300')}` },
      { month: '2026-07', label: 'Julho', current: false, entrouText: `Entrou ${brl('5.000')}`, saiuText: `Saiu ${brl('4.310')}`, goalText: null },
    ])
  })

  test('gráfico "Entrou e saiu" em ordem crescente, com alturas relativas ao maior valor', () => {
    expect(v.chart?.map((b) => [b.label, b.entrouHeight, b.saiuHeight, b.saiuText])).toEqual([
      ['Julho', 100, 86, brl('4.310')],
      ['Agosto', 100, 74, brl('3.720')],
      ['Setembro', 100, 69, brl('3.460')],
    ])
  })

  test('para onde o dinheiro foi no período, somando os meses', () => {
    expect(v.categories.map((c) => [c.name, c.cents])).toEqual([['Mercado', 919000], ['Saúde', 128000], ['Comer fora', 102000]])
    expect(v.categories[0].share).toBe(1)
  })
})

test('um mês só: sem gráfico; comparação com o mês anterior mesmo fora do período', () => {
  const v = build({ periodo: 'este-mes' })
  expect(v.chart).toBeNull()
  expect(v.months).toHaveLength(1)
  expect(v.changes).toHaveLength(3)
})

test('meses de outro ano levam o ano; mais de 4 meses usam o nome curto no gráfico', () => {
  const v = build({ periodo: 'personalizado', de: '2025-11', ate: '2026-01' }, [], [move({ kind: 'deposit', amountCents: 100, occurredOn: '2025-11-02' })])
  expect(v.months.map((m) => m.label)).toEqual(['Janeiro', 'Dezembro de 2025', 'Novembro de 2025'])
  expect(sentenceText(v.summary)).toBe(`Em janeiro, entrou ${brl('0')} e saiu ${brl('0')}.`)
  expect(v.chart?.map((b) => [b.entrouHeight, b.saiuHeight])).toEqual([[0, 0], [0, 0], [0, 0]])
  expect(build({ periodo: 'personalizado', de: '2026-01', ate: '2026-06' }).chart?.map((b) => b.label)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'])
})

test('sem nenhum registro confirmado nem movimento de meta: vazio da copy', () => {
  expect(build({}, [], []).empty).toBe(true)
  expect(build({}, [row({ amountCents: 100, occurredOn: '2026-09-01', status: 'pending', dueOn: '2026-09-20' })], []).empty).toBe(true)
  expect(build({}, [], [move({ kind: 'deposit', amountCents: 100, occurredOn: '2026-09-01' })]).empty).toBe(false)
})

test('relatório de um mês bate com o Seu mês: meta, conta paga com atraso e conta a pagar (Review Focus 1)', () => {
  const tx = [
    income('2026-09-05'),
    row({ categoryId: 'c1', amountCents: 50000, occurredOn: '2026-09-06', goalId: 'g1', goalFundedCents: 20000 }),
    row({ categoryId: 'c2', amountCents: 12000, occurredOn: '2026-08-30', paidOn: '2026-09-03' }),
    row({ categoryId: 'c2', amountCents: 9000, occurredOn: '2026-09-25', status: 'pending', dueOn: '2026-09-25' }),
  ]
  const moves = [move({ kind: 'deposit', amountCents: 20000, occurredOn: '2026-08-10' }), move({ kind: 'use', amountCents: 20000, occurredOn: '2026-09-06' })]
  const seu = buildSeuMes({ month: '2026-09', today, profile, categories, transactions: tx, goals: [], goalMovements: moves, budgets: [] })
  const v = build({ periodo: 'este-mes' }, tx, moves)
  expect(v.months[0].entrouText).toBe(`Entrou ${formatCompactBRL(seu.summary.entrouCents)}`)
  expect(v.months[0].saiuText).toBe(`Saiu ${formatCompactBRL(seu.summary.saiuCents)}`)
  expect(v.categories).toEqual(seu.categories)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/relatorios/view-model.test.ts`
Expected: FAIL — `Failed to resolve import "./view-model"`.

- [ ] **Step 3: Implementação** — seguir Interfaces (funções puras). Nome curto: `shortMonthLabel(m)` sem o ponto e sem o ano, com a 1ª letra maiúscula.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/relatorios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/relatorios/view-model.ts src/features/relatorios/view-model.test.ts
git commit -m "feat(relatorios): resumo de cada mês, o que mudou, gráfico e categorias do período" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tela de relatórios — filtro, frases, gráfico e mês a mês

**Files:**
- Create: `src/features/relatorios/period-filter.tsx`, `src/features/relatorios/in-out-chart.tsx`, `src/features/relatorios/report-sections.tsx`, `src/app/(app)/relatorios/page.tsx`
- Test: `src/features/relatorios/period-filter.test.tsx`, `src/features/relatorios/in-out-chart.test.tsx`, `src/features/relatorios/report-sections.test.tsx`

**Interfaces:**
- Consumes: `Period`, `PERIOD_OPTIONS`, `periodHref`, `resolvePeriod` (Task 2); `RelatoriosView`, `ChartBar`, `MonthRow`, `Sentence`, `buildRelatorios` (Task 8); `CategoriesCard` (`@/features/seu-mes/categories-card`, sem mudança); `loadLedger`; `PageHeader`, `Card`, `Button`; `CHIP`; `todayInSaoPaulo`.
- Produces:
  - `PeriodFilter({ period, de, ate }: { period: Period; de: string; ate: string })` — `nav aria-label="Período"` com os 4 `Link` de `PERIOD_OPTIONS` em pílulas `min-h-11` (visual do protótipo; o ativo com `aria-current="page"`, borda `border-selected` 1.5 px e fundo `bg-brand-wash`), rolagem horizontal no celular sem cortar alvo. Com `period.key === 'personalizado'`: `form method="get" action="/relatorios"` com `input hidden periodo=personalizado`, `label` "De" + `input type="month" name="de"` e "Até" + `input type="month" name="ate"` (`min="2000-01"`, `max="2099-12"`, `defaultValue` = `de || period.from` e `ate || period.to`), botão "Ver período"; `period.error` → `p role="alert"` 14 px `text-amber-ink` sob os campos (nunca vermelho).
  - `WhatChanged({ summary, changes }: { summary: Sentence; changes: Sentence[] })` — `Card` `section aria-labelledby` com `h2` "O que mudou"; um `p` por frase (15 px, separador `border-line`), com cada `{ value }` em `strong className="num font-semibold text-ink"`.
  - `InOutChart({ bars }: { bars: ChartBar[] })` — `Card` `section aria-labelledby` com `h2` "Entrou e saiu"; legenda (quadrado `bg-brand` "Entrou", quadrado `bg-spend` "Saiu"); área das barras `aria-hidden="true"` (altura 180 px, uma coluna por mês; barra "Entrou" `bg-brand` com borda 1 px `border-brand-text-hover` para contraste 3:1; barra "Saiu" `bg-spend`; `style={{ height: '{n}%' }}`); rótulos dos meses abaixo (13 px, o último em 600 `text-ink`); `table className="sr-only"` com `caption` "Entrou e saiu por mês" e colunas "Mês", "Entrou", "Saiu" (`fullLabel`, `entrouText`, `saiuText`). Sem biblioteca.
  - `MonthByMonth({ months }: { months: MonthRow[] })` — `Card` `section aria-labelledby` com `h2` "Mês a mês"; um item por mês: `label` (15 px, `text-ink`) + " até agora" (13 px, `text-muted`) quando `current`, e à direita `saiuText` (`num`); abaixo, 14 px `text-muted`: `entrouText` e, se houver, ` · {goalText}`.
  - `/relatorios` — `searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>`; `resolvePeriod`; `loadLedger()`; `PageHeader title="Seus meses em perspectiva" backHref="/mais" backOnMobileOnly`; `PeriodFilter`; vazio → cartão tracejado com "Os relatórios aparecem depois de alguns registros. Seu primeiro retrato do mês está a poucos gastos de distância." + `Button href="/anotar"` "Anotar gasto"; senão, nesta ordem: `WhatChanged`, `InOutChart` (se `chart`), `MonthByMonth`, `CategoriesCard` (se houver categorias). Largura `max-w-[720px]`.

- [ ] **Step 1: Testes que falham**

`src/features/relatorios/period-filter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { PeriodFilter } from './period-filter'
import { resolvePeriod } from './period'

afterEach(() => cleanup())

test('quatro filtros da copy; o atual marcado (RF-40)', () => {
  render(<PeriodFilter period={resolvePeriod({}, '2026-09-28')} de="" ate="" />)
  const nav = screen.getByRole('navigation', { name: 'Período' })
  const links = within(nav).getAllByRole('link')
  expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Este mês', '/relatorios?periodo=este-mes'],
    ['Mês passado', '/relatorios?periodo=mes-passado'],
    ['Últimos 3 meses', '/relatorios?periodo=3-meses'],
    ['Personalizado', '/relatorios?periodo=personalizado'],
  ])
  expect(links[2].getAttribute('aria-current')).toBe('page')
  expect(links[0].getAttribute('aria-current')).toBeNull()
  expect(screen.queryByLabelText('De')).toBeNull()
})

test('personalizado: meses "De" e "Até" preenchidos e o aviso calmo quando o período não vale (Review Focus 5)', () => {
  const period = resolvePeriod({ periodo: 'personalizado', de: '2026-10', ate: '2026-09' }, '2026-09-28')
  render(<PeriodFilter period={period} de="2026-10" ate="2026-09" />)
  const de = screen.getByLabelText('De') as HTMLInputElement
  expect([de.type, de.name, de.value, de.min, de.max]).toEqual(['month', 'de', '2026-10', '2000-01', '2099-12'])
  expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Ver período' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('Escolha um período de até 12 meses.')
  expect((document.querySelector('input[type="hidden"][name="periodo"]') as HTMLInputElement).value).toBe('personalizado')
})
```

`src/features/relatorios/in-out-chart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { InOutChart } from './in-out-chart'

afterEach(() => cleanup())

test('barras só visuais; os números ficam numa tabela para leitor de tela (RNF-05)', () => {
  render(
    <InOutChart
      bars={[
        { month: '2026-08', label: 'Agosto', fullLabel: 'Agosto', entrouText: 'R$ 5.000', saiuText: 'R$ 3.720', entrouHeight: 100, saiuHeight: 74 },
        { month: '2026-09', label: 'Setembro', fullLabel: 'Setembro', entrouText: 'R$ 5.000', saiuText: 'R$ 3.460', entrouHeight: 100, saiuHeight: 69 },
      ]}
    />,
  )
  const section = screen.getByRole('region', { name: 'Entrou e saiu' })
  const table = within(section).getByRole('table', { name: 'Entrou e saiu por mês' })
  expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mês', 'Entrou', 'Saiu'])
  expect(within(table).getAllByRole('row')[2].textContent).toBe('SetembroR$ 5.000R$ 3.460')
  const bars = section.querySelector('[aria-hidden="true"]') as HTMLElement
  expect(bars.querySelectorAll('[style*="height: 74%"]')).toHaveLength(1)
})
```

`src/features/relatorios/report-sections.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MonthByMonth, WhatChanged } from './report-sections'

afterEach(() => cleanup())

test('O que mudou: frases com os valores em destaque', () => {
  render(
    <WhatChanged
      summary={['Em agosto, entrou ', { value: 'R$ 5.000' }, ' e saiu ', { value: 'R$ 3.720' }, '.']}
      changes={[['Você gastou ', { value: 'R$ 180' }, ' a menos com Comer fora do que no mês passado.']]}
    />,
  )
  const section = screen.getByRole('region', { name: 'O que mudou' })
  const ps = section.querySelectorAll('p')
  expect([...ps].map((p) => p.textContent)).toEqual([
    'Em agosto, entrou R$ 5.000 e saiu R$ 3.720.',
    'Você gastou R$ 180 a menos com Comer fora do que no mês passado.',
  ])
  expect([...section.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['R$ 5.000', 'R$ 3.720', 'R$ 180'])
})

test('Mês a mês: "até agora" no mês atual; entrou e guardado abaixo', () => {
  render(
    <MonthByMonth
      months={[
        { month: '2026-09', label: 'Setembro', current: true, entrouText: 'Entrou R$ 5.000', saiuText: 'Saiu R$ 3.460', goalText: 'Tirado das metas R$ 100' },
        { month: '2026-08', label: 'Agosto', current: false, entrouText: 'Entrou R$ 5.000', saiuText: 'Saiu R$ 3.720', goalText: null },
      ]}
    />,
  )
  const items = screen.getByRole('region', { name: 'Mês a mês' }).querySelectorAll('li')
  expect(items[0].textContent).toContain('Setembro')
  expect(items[0].textContent).toContain('até agora')
  expect(items[0].textContent).toContain('Saiu R$ 3.460')
  expect(items[0].textContent).toContain('Entrou R$ 5.000 · Tirado das metas R$ 100')
  expect(items[1].textContent).not.toContain('até agora')
  expect(items[1].textContent).not.toContain('·')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/relatorios`
Expected: FAIL — imports inexistentes.

- [ ] **Step 3: Implementação** — seguir Interfaces. Página:

```tsx
type Props = { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }

export default async function RelatoriosPage({ searchParams }: Props) {
  const params = await searchParams
  const today = todayInSaoPaulo()
  const period = resolvePeriod(params, today)
  const { profile, categories, transactions, goalMovements } = await loadLedger()
  const v = buildRelatorios({ period, today, profile, categories, transactions, goalMovements })
  // … cabeçalho, PeriodFilter (de/ate crus do endereço), vazio ou seções (Interfaces)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos PASS; build com `/relatorios`.

- [ ] **Step 5: Commit**

```bash
git add src/features/relatorios "src/app/(app)/relatorios"
git commit -m "feat(relatorios): tela de relatórios com filtro, frases, gráfico e mês a mês" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Navegação — Planejamento e Relatórios no menu lateral e em Mais

**Files:**
- Modify: `src/features/shell/nav-items.ts`, `src/app/(app)/mais/page.tsx`
- Test: `src/features/shell/nav-items.test.ts`, `src/features/shell/sidebar.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `Wallet`, `ChartColumn` (`lucide-react`, conferidos em `node_modules/lucide-react`); `ListCard`, `ListRow`, `RowLink`.
- Produces:
  - `PLANEJAMENTO: NavItem = { href: '/planejamento', label: 'Planejamento', icon: Wallet, match: ['/planejamento'] }`; `RELATORIOS: NavItem = { href: '/relatorios', label: 'Relatórios', icon: ChartColumn, match: ['/relatorios'] }`.
  - `SIDEBAR_ITEMS = [SEU_MES, EXTRATO, CONTAS, PLANEJAMENTO, METAS, CARTOES, RELATORIOS, Categorias, Configurações]` (ordem do protótipo Desktop, sem Família — Plano 7).
  - Item Mais da barra inferior: `match` ganha `'/planejamento'` e `'/relatorios'`. `BOTTOM_NAV_ITEMS` não muda. `isSheetRoute` não muda.
  - `/mais`: `RowLink` na ordem do protótipo Mais — Contas, Planejamento (`Wallet`), Cartões, Relatórios (`ChartColumn`), Categorias; o comentário passa a dizer que só falta Família (Plano 7).

- [ ] **Step 1: Testes que falham**

Em `nav-items.test.ts`: nos testes "Contas…" e "Cartões…", `SIDEBAR_ITEMS` passa a ser `['/inicio', '/extrato', '/contas', '/planejamento', '/metas', '/cartoes', '/relatorios', '/categorias', '/configuracoes']` (`BOTTOM_NAV_ITEMS` continua `['/inicio', '/extrato', '/metas', '/mais']`); acrescentar:

```ts
test('Planejamento e Relatórios: menu lateral na ordem do protótipo; no celular ficam em Mais; não são painéis', () => {
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  const planejamento = SIDEBAR_ITEMS.find((i) => i.href === '/planejamento')!
  expect(isActive('/planejamento', mais)).toBe(true)
  expect(isActive('/planejamento/editar', mais)).toBe(true)
  expect(isActive('/relatorios', mais)).toBe(true)
  expect(isActive('/planejamento/editar', planejamento)).toBe(true)
  expect(isActive('/planejamentos', planejamento)).toBe(false)
  for (const p of ['/planejamento', '/planejamento/editar', '/relatorios']) expect(isSheetRoute(p)).toBe(false)
})
```

Em `sidebar.test.tsx`: `['Seu mês', 'Extrato', 'Contas', 'Planejamento', 'Metas', 'Cartões', 'Relatórios', 'Categorias', 'Configurações']`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — menu lateral sem Planejamento e Relatórios.

- [ ] **Step 3: Implementação** — seguir Interfaces.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell "src/app/(app)/mais/page.tsx"
git commit -m "feat(shell): Planejamento e Relatórios no menu lateral e em Mais" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ponta a ponta, verificação completa e registro

**Files:**
- Create: `tests/e2e/plano6.spec.ts`
- Modify: `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo acima; `todayInSaoPaulo`, `addMonths`, `monthOf` (`src/domain/dates`), `monthName`, `dueDateIn` (`src/domain/recurrence`).
- Produces: 3 testes (celular: 2; desktop: 1) → 6 entradas em `npx playwright test --list` para este arquivo. Limpeza por worker com prefixo único (padrão de `tests/e2e/plano5.spec.ts`); nomes de papel exatos. Os dados de apoio são gravados pelo administrador direto nas tabelas `transactions` e `budgets` (nenhuma delas tem gatilho de guarda por data; o planejado respeita os `check` da tabela: mês no 1º dia).

- [ ] **Step 1: Escrever os testes de ponta a ponta** — `tests/e2e/plano6.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn, monthName } from '../../src/domain/recurrence'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
// Prefixo único por worker e por execução (celular e desktop rodam em paralelo):
// a varredura de limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p6-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const previous = addMonths(current, -1)

async function makeUser(name: string): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
  if (e2) throw e2
  return { id: data.user.id, email }
}

async function category(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

async function seedExpense(userId: string, key: string, cents: number, occurredOn: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: occurredOn,
  })
  if (error) throw error
}

async function seedIncome(userId: string, cents: number, occurredOn: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({ user_id: userId, kind: 'income', amount_cents: cents, source: 'Salário', occurred_on: occurredOn })
  if (error) throw error
}

async function seedBudget(userId: string, key: string, cents: number, month: string): Promise<void> {
  const { error } = await admin.from('budgets').insert({ user_id: userId, month: `${month}-01`, category_id: await category(userId, key), amount_cents: cents })
  if (error) throw error
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

// Linha do resumo do Seu mês (rótulo + valor).
const line = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')
const item = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
  const known = new Set(created)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith(RUN_PREFIX) && !known.has(u.id)) await admin.auth.admin.deleteUser(u.id)
    }
    if (data.users.length < 1000) break
    page += 1
  }
})

test('planejar o mês, ajustar o que passou e ver no Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 89000, today)
  await seedExpense(u.id, 'lazer', 32000, today)
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais', exact: true }).click()
  await page.getByRole('link', { name: 'Planejamento', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Quanto você quer usar este mês' })).toBeVisible()
  await expect(page.getByText('Você ainda não planejou este mês. Defina quanto quer usar em cada área e a Íris acompanha para você.')).toBeVisible()
  await page.getByRole('link', { name: 'Planejar meu mês', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Planejar meu mês' })).toBeVisible()
  await page.getByLabel('Mercado', { exact: true }).fill('1000')
  await page.getByLabel('Lazer', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Planejamento salvo. Agora é só acompanhar.')
  await expect(item(page, 'Mercado')).toContainText(`${brl('890')} de ${brl('1.000')}`)
  await expect(item(page, 'Mercado')).toContainText(`Ainda tem ${brl('110')} disponível.`)
  await expect(item(page, 'Lazer')).toContainText(`Passou ${brl('20')} do planejado.`)
  await expect(page.getByText('Você está dentro do planejado em 1 de 2 categorias.')).toBeVisible()

  await page.getByRole('link', { name: 'Ajustar valor de Lazer', exact: true }).click()
  await expect(page.getByLabel('Lazer', { exact: true })).toBeFocused()
  await page.getByLabel('Lazer', { exact: true }).fill('abc')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()
  await expect(page.getByText('Esse valor não parece certo. Use apenas números.')).toBeVisible()
  await expect(page.getByLabel('Lazer', { exact: true })).toHaveValue('abc')
  await page.getByLabel('Lazer', { exact: true }).fill('350')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()
  await expect(item(page, 'Lazer')).toContainText('Falta pouco para chegar ao que você planejou.')

  await page.getByRole('link', { name: 'Seu mês', exact: true }).click()
  const planejado = page.getByRole('region', { name: 'Planejado' })
  await expect(planejado).toContainText('Você está dentro do planejado em 2 de 2 categorias.')
  await expect(planejado.getByRole('link', { name: 'Ver planejamento', exact: true })).toBeVisible()
  await expect(line(page, 'Saiu')).toContainText(brl('1.210,00'))
})

test('repetir o planejamento do mês anterior', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await seedBudget(u.id, 'casa', 50000, previous)
  await seedBudget(u.id, 'transporte', 20000, previous)
  await entrar(page, u.email)

  await page.goto('/planejamento')
  const repetir = page.getByRole('button', { name: `Repetir o planejamento de ${monthName(Number(previous.slice(5)))}${previous.slice(0, 4) === current.slice(0, 4) ? '' : ` de ${previous.slice(0, 4)}`}`, exact: true })
  await repetir.click()
  await expect(page.getByRole('status')).toContainText('Planejamento salvo. Agora é só acompanhar.')
  await expect(item(page, 'Casa')).toContainText(`${brl('0')} de ${brl('500')}`)
  await expect(item(page, 'Transporte')).toContainText(`${brl('0')} de ${brl('200')}`)
  await expect(page.getByRole('button', { name: /^Repetir o planejamento/ })).toHaveCount(0)
})

test('desktop: relatórios pelo menu lateral, frases, mês a mês e período personalizado', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  await seedIncome(u.id, 500000, dueDateIn(previous, 5))
  await seedExpense(u.id, 'comer_fora', 60000, dueDateIn(previous, 10))
  await seedIncome(u.id, 500000, today)
  await seedExpense(u.id, 'comer_fora', 42000, today)
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Relatórios', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Seus meses em perspectiva' })).toBeVisible()
  const filtros = page.getByRole('navigation', { name: 'Período' })
  await expect(filtros.getByRole('link', { name: 'Últimos 3 meses', exact: true })).toHaveAttribute('aria-current', 'page')

  const mudou = page.getByRole('region', { name: 'O que mudou' })
  await expect(mudou).toContainText(`Em ${monthName(Number(current.slice(5)))}, entrou ${brl('5.000')} e saiu ${brl('420')}.`)
  await expect(mudou).toContainText(`Você gastou ${brl('180')} a menos com Comer fora do que no mês passado.`)
  const mesAMes = page.getByRole('region', { name: 'Mês a mês' })
  await expect(mesAMes).toContainText('até agora')
  await expect(mesAMes).toContainText(`Saiu ${brl('600')}`)
  await expect(page.getByRole('table', { name: 'Entrou e saiu por mês' })).toBeAttached()

  // Review Focus 1: o mesmo "Saiu" do Seu mês.
  await filtros.getByRole('link', { name: 'Mês passado', exact: true }).click()
  await expect(mudou).toContainText(`saiu ${brl('600')}.`)
  await page.goto(`/inicio?mes=${previous}`)
  await expect(line(page, 'Saiu')).toContainText(brl('600,00'))

  // Review Focus 5: período que não vale mostra o aviso e os últimos 3 meses.
  await page.goto('/relatorios?periodo=personalizado')
  await page.getByLabel('De', { exact: true }).fill(current)
  await page.getByLabel('Até', { exact: true }).fill(previous)
  await page.getByRole('button', { name: 'Ver período', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Escolha um período de até 12 meses.')
  await expect(page.getByRole('region', { name: 'Mês a mês' })).toContainText('até agora')
})
```

Nota: o e2e do desktop usa o dia 10 do mês anterior e hoje; o de celular usa hoje. Os dois primeiros testes dependem de o gasto semeado ser de hoje (mês atual).

- [ ] **Step 2: Conferir a lista e rodar**

Run: `npx playwright test --list tests/e2e/plano6.spec.ts`
Expected: 6 entradas (3 testes × 2 projetos; os `test.skip` de projeto são resolvidos ao rodar).

Run (com Docker): `npx supabase db reset && npm run test:db && npm run test:e2e`
Expected: PASS em todos os arquivos (`nucleo`, `plano2` … `plano6`). Sem Docker: registrar como pendente.

- [ ] **Step 3: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes unitários e de componentes passando; tipos, lint e build sem erros. Conferir textos: `grep -rniE "text-red|bg-red|!\"|orçamento|estour|déficit|despesa|limite máximo" src/features/planejamento src/features/relatorios "src/app/(app)/planejamento" "src/app/(app)/relatorios"` → sem resultados.

- [ ] **Step 4: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 6 — Planejamento e relatórios · concluído em {data}

**Entregue**
- Planejamento individual por categoria e mês: "{gasto} de {planejado}", "Ainda tem {valor} disponível.", "Falta pouco para chegar ao que você planejou." e "Passou {valor} do planejado." (âmbar, sem vermelho), total planejado e "Você está dentro do planejado em {n} de {total} categorias."; ajustar valor, planejar outra categoria, repetir o planejamento do mês anterior.
- O gasto do planejado é o mesmo de "Para onde seu dinheiro vai" (parte paga com meta fora; conta paga com atraso no mês em que foi paga).
- Excluir uma categoria leva o planejado dela para "Outros", somado.
- Seu mês com o bloco "Planejado" (mês atual, até 3 categorias).
- Relatórios: Este mês, Mês passado, Últimos 3 meses e Personalizado (até 12 meses); "O que mudou" em frases, gráfico "Entrou e saiu" com alternativa em texto, "Mês a mês" (entrou, saiu, guardado) e gastos por categoria no período — números iguais aos do Seu mês.
- Planejamento e Relatórios no menu lateral e em Mais.

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco ({n} testes em `plano6.test.ts`) e ponta a ponta (`plano6.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): {rodados | pendentes do Docker}.

**Pendências levadas a outros planos**
- Aviso "Você já usou boa parte do que planejou para {categoria}." (notificação "Planejado quase no limite") e resumo do mês fechado: Plano 8.
- Exportar o planejado no CSV: Plano 9.
- Relatórios e planejamento no desktop com layout de duas colunas: Plano 10.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 6` com a tabela da seção "Decisões tomadas neste plano" abaixo (numeração 75–93), e ao fim da seção de textos novos a linha `Plano 6: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-09-29-iris-plano-6-planejamento-relatorios.md\`.` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plano6.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): planejamento e relatórios; progresso e decisões do Plano 6" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica as sete migrações (`…_nucleo`, `…_categorias_e_onboarding`, `…_contas_e_recorrencias`, `…_nota_das_recorrencias`, `…_parcelas_e_cartoes`, `…_metas`, `…_planejamento`).
3. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras do planejado e dos relatórios (sempre as mesmas do Seu mês), formulários, ações (Supabase simulado com filtros conferidos) e componentes
- `npm run test:db` — privacidade do planejado, limites da tabela, salvar o mês, repetir, categoria excluída, exclusão de cadastro
- `npm run test:e2e` — fluxos no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| RF-22 definir valor planejado por categoria para o mês | Tasks 3, 4, 5, 6, 7, 11 |
| RF-23 "{gasto} de {planejado}" e estados dentro / perto / passou | Tasks 1, 4, 6, 7, 11 |
| RF-24 repetir o planejamento do mês anterior | Tasks 3, 4, 5, 7, 11 |
| RF-33 planejado mais relevante no Seu mês | Tasks 4, 7, 11 |
| RF-38 resumo de cada mês (entrou, saiu, guardado) | Tasks 2, 8, 9, 11 |
| RF-39 gastos por categoria e comparação com o mês anterior, em frases antes de gráficos | Tasks 2, 8, 9, 11 |
| RF-40 filtros este mês, mês passado, últimos 3 meses, personalizado (Q2: mensal e anual) | Tasks 2, 9, 11 |
| RN-01a / decisão 68: categorias e gasto do planejado batem com o "Saiu" | Tasks 1, 2, 8 |
| RN-27 excluir categoria: planejado vai para "Outros" | Task 3 |
| RNF-05 gráfico com alternativa em texto; estado não só por cor | Tasks 6, 9 |
| RNF-11 regras num lugar só | Tasks 1, 2 (domínio), 4 e 8 só chamam o domínio |
| Etapa 3 §6/§7 Planejamento e Relatórios em Mais e no menu lateral | Task 10 |
| Planejamento da família fora da v1 | Global Constraints (sem `family_id`) |
| Testes unitários, banco e ponta a ponta | Todas; Task 11 |

**Busca por marcadores proibidos:** nenhum "TBD", "a definir" ou "similar à Task N". Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 11, Step 4).

**Consistência de tipos e nomes:** `formatCompactBRL`/`NEAR_LIMIT_PERCENT`/`budgetState`/`budgetLines`/`withinCount`/`BudgetLine`/`BudgetState`/`PlannedCategory` (1 → 4, 6, 8); `monthReports`/`compareCategories`/`sumCategories`/`MonthReport`/`CategoryChange` (2 → 8); `resolvePeriod`/`Period`/`PeriodKey`/`PERIOD_OPTIONS`/`PERIOD_ERROR`/`periodHref`/`MAX_PERIOD_MONTHS` (2 → 8, 9); RPCs `set_month_budgets(p_month, p_category_ids, p_amounts)` e `repeat_previous_budgets(p_month)` (3 → 5); `BudgetRow`/`BUDGET_COLUMNS`/`toBudgetRow`/`loadBudgets` (4 → 7); `BudgetLineView`/`PlanejamentoView`/`buildPlanejamento`/`PlannedCardView`/`buildPlannedCard`/`PlanFormView`/`buildPlanForm` (4 → 6, 7); `parsePlanFields`/`PLAN_FIELD_PREFIX`/`MAX_PLAN_FIELDS`/`PLAN_INVALID` (5 → 6); `saveBudgets`/`repeatPreviousBudgets` (5 → 7); `BudgetLines`/`PlanForm`/`ProgressBar tone` (6 → 7); `SeuMesView.planned`/`PlannedCard` (7); `Sentence`/`sentenceText`/`ChartBar`/`MonthRow`/`RelatoriosView`/`buildRelatorios` (8 → 9); `PeriodFilter`/`WhatChanged`/`InOutChart`/`MonthByMonth` (9); `PLANEJAMENTO`/`RELATORIOS` (10).

**Review Focus → testes:** 1 → Task 1 (`o gasto é o mesmo…`), Task 2 (`cada mês usa as mesmas regras…`), Task 4 (dados do protótipo com meta, conta paga com atraso e a pagar), Task 8 (`relatório de um mês bate com o Seu mês…`), e2e 1 e 3; 2 → Task 3 (`excluir a categoria leva o planejado…`, `a soma em "Outros" nunca passa…`, `apagar direto…`); 3 → Task 3 (`repetir não sobrescreve nem duplica`), Task 5 (`categoria excluída em outra aba…`, `repetir sem nada novo…`), e2e 2; 4 → Task 3 (limites), Task 5 (`zero e em branco…`, `valor inválido…`), Task 6 (erro sob o campo), e2e 1; 5 → Task 2 (`período personalizado inválido…`, `mês passado em janeiro…`), Task 7 (`?mes` inválido vira o mês atual, pela `parseMonthKey`), Task 9 (aviso no filtro), e2e 3.

**Proporção:** SQL e testes vêm completos (são o contrato); componentes, páginas e ações vêm por assinatura, regras e textos exatos, com código só onde o teste não decide (as páginas carregam dados em paralelo).

---

## Conflitos encontrados na especificação

1. **Protótipo com estados que não seguem uma regra única:** na tela Planejamento, Mercado com 89% mostra "Falta pouco…" e Saúde com 90% mostra "Ainda tem R$ 90 disponível."; no Seu mês, o mesmo Mercado com 89% mostra "Ainda tem R$ 110 disponível.". Adotado: "perto do limite" a partir de 90% (inclusive quando o gasto é igual ao planejado); "passou" só acima do planejado (decisão 77). O total "4 de 6" do protótipo continua certo.
2. **Copy "Passou {valor} do planejado. Quer ajustar o valor deste mês?" × protótipo "Passou R$ 20 do planejado." + link "Ajustar valor":** usado o protótipo (a pergunta vira o link); o link aparece em toda categoria que passou (no protótipo, só na primeira) — decisão 78.
3. **RF-39 "em frases antes de gráficos" × protótipo Relatórios com o gráfico primeiro:** mantida a ordem do requisito aprovado: "O que mudou" antes de "Entrou e saiu" (decisão 85).
4. **Copy do Seu mês "Planejado: Você ainda tem {valor} para {categoria} este mês." × protótipo (bloco "Planejado" com "Você está dentro do planejado em {n} de {total} categorias." e linhas):** usado o protótipo; a frase da copy não aparece nesta versão (decisão 82).
5. **Protótipo "O que mudou" fala de agosto num período julho–setembro:** adotado o último mês do período (setembro, "até agora"), comparado com o anterior; é o que a copy "Este mês, você gastou {valor} a menos com {categoria}." descreve (decisão 86).
6. **Q2 (relatórios mensais e anuais) × copy com só quatro filtros:** o anual é o "Personalizado" com até 12 meses (ex.: janeiro a dezembro), sem filtro novo (decisão 84).
7. **RN-01a "nas categorias com a etiqueta":** categorias do planejado e dos relatórios mostram só a parte paga com o dinheiro do mês, como "Para onde seu dinheiro vai" (decisão 68, já em revisão).
8. **Etapa 3 §7 "Planejamento como bloco clicável no Seu mês":** o bloco só aparece quando o mês atual tem planejado (como "Meta em destaque" e "Próximas contas"); sem planejado, o caminho é Mais → Planejamento (decisão 82).
9. **Títulos da copy com "este mês" ("Quanto você quer usar este mês", vazio do planejamento, ajuda "O que é Planejado?"):** mantidos em qualquer mês; o mês escolhido aparece no seletor e em "Planejado para {mês}" (decisão 91).

---

## Decisões tomadas neste plano

| # | Decisão | Motivo |
|---|---|---|
| 75 | Planejado é por categoria e por mês, de R$ 0,01 até o limite do app; em branco ou zero = sem planejado. Qualquer mês de 2000 a 2099 pode ser planejado (nada é travado). Só categorias de gasto; sem planejado da família (fora da v1). | RF-22; etapa-3 §3.1 `budgets`; etapa-2 §6. |
| 76 | O "gasto" do planejado é o mesmo de "Para onde seu dinheiro vai": só a parte paga com o dinheiro do mês, conta paga no mês em que foi paga, parcelas no mês delas; conta a pagar não conta. | RN-01a, A1, decisões 2 e 68; RNF-11. |
| 77 | Estados: "passou do planejado" quando o gasto é maior que o planejado; "perto do limite" a partir de 90% (inclusive igual); senão "dentro". "Dentro do planejado em {n} de {total}" conta dentro e perto. | RF-23; protótipo (4 de 6) — conflito 1. |
| 78 | Planejamento mostra só as categorias planejadas, na ordem das categorias (Outros por último), com "{gasto} de {planejado}", barra (âmbar quando passou) e o estado em texto; "Ajustar valor" em toda categoria que passou; "Planejar outra categoria" abre o formulário. | Protótipo Planejamento; V5; conflito 2. |
| 79 | Planejar é uma página com um campo por categoria (o formulário do mês); salvar grava tudo de uma vez; só as categorias do formulário mudam; categoria excluída em outra aba é ignorada; "Ajustar valor" abre o mesmo formulário com o cursor na categoria. | Copy "Defina um valor para cada área"; um fluxo só, sem erro sem saída. |
| 80 | "Repetir o planejamento de {mês}" aparece quando o mês não tem planejado e o anterior tem; copia tudo do mês anterior, nunca sobrescreve; tocar duas vezes não duplica. | RF-24. |
| 81 | Excluir uma categoria leva o planejado dela para "Outros" no mesmo mês, somado ao que "Outros" já tinha (até o limite do app); apagar direto uma categoria com planejado é barrado pelo banco. | RN-27 e copy "Nada será apagado."; os gastos já vão para "Outros". |
| 82 | Seu mês ganha o bloco "Planejado" só no mês atual e só com planejado: "Você está dentro do planejado em {n} de {total} categorias." e até 3 categorias, as mais usadas (gasto ÷ planejado), empate pelo maior planejado e depois o nome; "Ver planejamento". Some sem planejado. | RF-33 e protótipo Main/Desktop; conflitos 4 e 8; mesmo padrão das decisões 40 e 70. |
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

## Textos novos

Fora da copy oficial e do protótipo aprovado; precisam da sua aprovação (13):

- Planejamento: "Salvar planejamento" · "Repetir o planejamento de {mês}" · "Deixe em branco o que não quiser planejar." · "Ajustar valor de {categoria}" (rótulo acessível do link "Ajustar valor") · "Uso do planejado em {categoria}" (rótulo acessível da barra)
- Relatórios: "Período" (rótulo acessível dos filtros) · "De" · "Até" · "Ver período" · "Escolha um período de até 12 meses." · "Entrou e saiu por mês" (legenda da tabela para leitor de tela) · "Guardado {valor}" · "Tirado das metas {valor}" (linha do mês em "Mês a mês")

Da copy oficial, do protótipo, dos requisitos aprovados ou já aprovados, usados aqui: "Planejamento", "Relatórios", "Quanto você quer usar este mês", "Defina um valor para cada área. A Íris mostra quanto ainda está disponível.", "{categoria} · {gasto} de {planejado}" (como "{gasto} de {planejado}"), "Ainda tem {valor} disponível.", "Falta pouco para chegar ao que você planejou.", "Passou {valor} do planejado.", "Ajustar valor", "Planejar meu mês", "Planejar outra categoria", "Planejado para {mês}", "Você está dentro do planejado em {n} de {total} categorias.", "Você ainda não planejou este mês. Defina quanto quer usar em cada área e a Íris acompanha para você.", "O que é "Planejado"? Quanto você decidiu usar em cada área este mês. Serve de referência, não é uma regra.", "Planejamento salvo. Agora é só acompanhar.", "Planejado", "Ver planejamento", "Seus meses em perspectiva", "Este mês", "Mês passado", "Últimos 3 meses", "Personalizado", "O que mudou", "Em {mês}, entrou {valor} e saiu {valor}.", "Você gastou {valor} a menos com {categoria} do que no mês passado.", "Seus gastos com {categoria} subiram {valor} em relação ao mês passado.", "Entrou e saiu", "Entrou", "Saiu", "Entrou {valor}", "Saiu {valor}", "Mês a mês", "até agora", "Mês", "Para onde seu dinheiro vai", "Os relatórios aparecem depois de alguns registros. Seu primeiro retrato do mês está a poucos gastos de distância.", "Anotar gasto", "Tirado das metas", "Voltar", "Esse valor não parece certo. Use apenas números.", "Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.".
