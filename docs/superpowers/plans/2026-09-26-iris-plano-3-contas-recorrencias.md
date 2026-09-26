# Íris — Plano 3: Contas e recorrências — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa cadastra contas e entradas que se repetem (todo mês ou todo ano) pelo Anotar ou por "Nova conta", vê em `/contas` o que está a pagar, pago e vencido no mês, marca uma conta como paga (pela lista ou pelo Seu mês) e confirma uma entrada a receber ajustando o valor; o "Disponível depois das contas" e o bloco "Próximas contas" refletem isso. Alterar ou encerrar uma recorrência nunca apaga o histórico.

**Architecture:** Mesma base dos Planos 1 e 2. Nova tabela `recurrences` (molde) e duas colunas em `transactions` (`recurrence_id`, `recurrence_period`) com índice único `(recurrence_id, recurrence_period)`: cada recorrência gera no máximo uma ocorrência por mês. A geração é a função SQL `generate_occurrences()` (security invoker, atômica, idempotente, com trava por linha), chamada por `loadLedger()` sempre que uma tela com números abre; `recurrences.generated_through` guarda o último mês gerado, então uma ocorrência paga e depois excluída nunca volta. Criar pelo Anotar, alterar e encerrar também são funções SQL atômicas. Regras de data (dia ajustado ao tamanho do mês, próximo vencimento, textos "vence em…") ficam puras em `src/domain/recurrence.ts`; a tela Contas é montada por uma função pura (`buildContas`). Marcar como paga = `status 'confirmed'` + `paid_on` = hoje em Brasília (A1: conta no mês do pagamento — `summarizeMonth` já faz isso por `effectiveDate`).

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-10/11 "se repete", RF-15–18, RN-03, RN-10–12, terminologia §1.1), `docs/etapa-3-arquitetura.md` (§3.1 `recurrences`, §3.2 "Disponível depois das contas", §5 "Gerar ocorrências", §6 `/contas`, §8.2 ciclo da conta, A1 B), `docs/etapa-5-ui.md` (tokens, V5 sem vermelho), `docs/etapa-7-roteiro.md` (escopo do Plano 3), `docs/decisoes-para-revisao.md` (decisões 1–26), protótipo aprovado (telas Contas, Seu mês — bloco "Próximas contas", Anotar, Registrar entrada, Desktop), copy oficial (Claude Doc).

## Global Constraints

- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`). `params`/`searchParams` de página são `Promise` e precisam de `await`.
- Idioma pt-BR, moeda somente R$ (RN-28). Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor e de `(now() at time zone 'America/Sao_Paulo')::date` dentro do SQL. Nunca aceitar "hoje" vindo do navegador.
- Dinheiro sempre em **centavos inteiros**; máximo `MAX_CENTS = 9_999_999_999`. Texto → centavos só por `parseBRL`; centavos → texto por `formatBRL` (NBSP entre `R$` e o número; negativo com `−`).
- "Mês" = mês do calendário (A2). Mês efetivo de um registro = `effectiveDate(tx)` = `paid_on ?? occurred_on`, só `status = 'confirmed'` (A1 B: conta paga com atraso conta no mês em que foi paga). Registros `pending` nunca entram em Entrou/Saiu/Saldo total nem no Extrato.
- Conta (a pagar) = `kind = 'expense'` com `due_on` preenchido. Entrada a receber = `kind = 'income'`, `status = 'pending'`. Ocorrência pendente: `status 'pending'`, `due_on` = `occurred_on` = vencimento, `paid_on` nulo (CHECK `status_dates` já existe).
- Termos fixos: "cadastro" = acesso; **"conta" = só conta a pagar** (nunca entrada, nunca conta bancária, nem em `aria-label`). "Vencida" é um estado calmo: sem vermelho, sem "atrasada", sem exclamação (V5).
- Todo texto visível vem da copy oficial, do protótipo aprovado ou da seção "Textos novos" no fim deste plano.
- Alvos de toque ≥ 44 px; texto 15–16 px no celular; contraste WCAG AA; confirmações usam `ConfirmAction`/`ConfirmPanel` de `src/ui/confirm.tsx` (portal, `role="alertdialog"`, foco no cancelar, `Esc` fecha).
- Banco: **nunca editar** migrações anteriores (`20260922000001_nucleo.sql`, `20260925000001_categorias_e_onboarding.sql`); tudo deste plano vai em `supabase/migrations/20260926000001_contas_e_recorrencias.sql`. RLS ligada em toda tabela nova. FKs para dados da pessoa são compostas `(x_id, user_id)` e `on delete no action` (padrão do Plano 1). Funções SQL: `security invoker`, `set search_path = ''`, nomes qualificados com `public.`, checam `auth.uid()` e filtram por `user_id`; `revoke execute … from public, anon` + `grant execute … to authenticated`.
- Servidor: `requireUser()` (memoizado com `cache()`) no começo de toda Server Action e loader; Zod no servidor; formulários usam `FormState` (`errorState`, `firstFieldErrors`, `readFields`) e mantêm o que foi digitado. `redirect()` nunca dentro de `try`.
- **Defesa em profundidade:** toda leitura, alteração ou exclusão por id filtra por `id` **e** `user_id` (além da RLS), e ações que mudam situação filtram também a situação esperada (ex.: `.eq('status', 'pending')`). Os testes de Server Action usam fakes encadeáveis do Supabase que registram cada `.eq`/`.is` e **afirmam os filtros** (padrão de `src/features/registro/actions.test.ts`).
- Leituras do histórico completo sempre por `loadLedger()` (paginada por `fetchAllPages`, 1.000 por página). `loadLedger()` chama `ensureOccurrences()` antes de ler.
- Depois de gravar dinheiro: `refreshMoneyViews()` (novo, `src/lib/refresh.ts`) = `revalidatePath('/inicio')`, `('/extrato')`, `('/contas')`. Depois de mudar categorias: `revalidatePath('/', 'layout')` (já existe).
- Aviso de sucesso entre páginas: `setFlash(texto)`; retorno para a página de origem só por `safeReturnPath` (lista fechada de caminhos; nada de redirecionamento aberto).
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Componentes que importam Server Actions mockam o módulo de ações. Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `next/cache` e `next/navigation`; relógio falso em `2026-09-30T15:00:00Z` (hoje = `2026-09-30`).
- Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`.
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como pendente em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem atrapalhar a pessoa e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Conta que volta sozinha ou aparece duas vezes** — duas telas abrindo ao mesmo tempo, recarregar a página, ou uma conta paga e depois excluída no Extrato: a pessoa espera ver cada conta uma vez só, e nunca ver de volta algo que excluiu. → testes de banco na **Task 2** (`abrir de novo não duplica`, `conta paga e excluída não volta`) e ponta a ponta na **Task 13**.
2. **Vencimento no dia 29, 30 ou 31** — "Aluguel dia 31" em fevereiro, abril; "IPVA 29 de fevereiro" em ano não bissexto: deve vencer no último dia do mês, igual no app e no banco. → testes na **Task 1** (`dueDateIn`, `nextDueOnOrAfter`) e na **Task 2** (`o banco ajusta o dia igual ao app`).
3. **Excluir uma categoria usada por uma conta que se repete** — sem cuidado, a chave estrangeira bloquearia `delete_category` e a pessoa veria "Algo não saiu como esperado". A conta deve ir para "Outros" junto com os gastos. → teste de banco na **Task 2**.
4. **"Marcar como paga" tocado duas vezes, numa conta já paga, de outra pessoa, ou com `volta` adulterado** — nada de pagar duas vezes, nada de tela de erro, nada de sair da Íris por um endereço injetado. → testes na **Task 5**.
5. **Editar no Extrato a data de uma conta já paga** — a data que conta é o dia do pagamento; se a edição mudasse só o vencimento escondido, a pessoa salvaria e nada mudaria na tela. → teste na **Task 8**.

---

## Estrutura de arquivos

```
supabase/migrations/20260926000001_contas_e_recorrencias.sql   NOVO: recurrences, colunas em transactions, geração, criar/alterar/encerrar, delete_category
tests/db/plano3.test.ts                                        NOVO: privacidade, geração idempotente, ajuste de dia, editar/encerrar, categoria
tests/e2e/plano3.spec.ts                                       NOVO: conta que se repete → paga; entrada → Recebi; vencida calma; encerrar
src/
  domain/dates.ts (+ dates.test.ts)                            MOD: dayMonthLabel
  domain/recurrence.ts (+ recurrence.test.ts)                  NOVO: dia ajustado, próximo vencimento, textos de prazo, rótulos
  lib/refresh.ts                                               NOVO: refreshMoneyViews (inclui /contas)
  ui/chip.ts                                                   NOVO: classe dos chips (Anotar e Nova conta)
  ui/list.tsx (+ list.test.tsx)                                MOD: RowLink ganha `detail` (linha de baixo)
  ui/text-field.tsx                                            MOD: inputMode 'numeric'
  features/
    contas/types.ts (+ types.test.ts)                          NOVO: RecurrenceRow, toRecurrenceRow
    contas/occurrences.ts (+ occurrences.test.ts)              NOVO: ensureOccurrences
    contas/queries.ts                                          NOVO: loadRecurrences, loadRecurrence
    contas/view-model.ts (+ view-model.test.ts)                NOVO: buildContas, parseContasTab, txName
    contas/return-path.ts (+ return-path.test.ts)              NOVO: safeReturnPath
    contas/schemas.ts (+ schemas.test.ts)                      NOVO: Nova conta e edição de recorrência
    contas/actions.ts (+ actions.test.ts)                      NOVO: markBillPaid, confirmIncome, createBill, updateRecurrence, endRecurrence
    contas/pay-button.tsx                                      NOVO: PayBillButton (confirmação "Marcar {conta} como paga?")
    contas/contas-sections.tsx (+ contas-sections.test.tsx)    NOVO: ContasTabs, BillsList, IncomeList, RecurringList
    contas/recurrence-form.tsx (+ recurrence-form.test.tsx)    NOVO: Nova conta / editar recorrência
    contas/receive-form.tsx (+ receive-form.test.tsx)          NOVO: Recebi com valor ajustável
    registro/schemas.ts (+ schemas.test.ts)                    MOD: amountField exportado, parseRepeat
    registro/labels.ts                                         MOD: INCOME_SOURCES
    registro/actions.ts (+ actions.test.ts)                    MOD: criar com repetição (RPC); editar conta paga muda paid_on
    registro/anotar-form.tsx (+ anotar-form.test.tsx)          MOD: "É uma conta que se repete" / "Isso se repete"
    registro/queries.ts                                        MOD: loadLedger chama ensureOccurrences
    seu-mes/view-model.ts (+ view-model.test.ts)               MOD: upcoming (Próximas contas)
    seu-mes/upcoming-bills.tsx (+ upcoming-bills.test.tsx)     NOVO
    shell/nav-items.ts (+ nav-items.test.ts, nav.test.tsx, sidebar.test.tsx)  MOD: Contas
  app/(app)/
    contas/page.tsx                                            NOVO
    contas/nova/page.tsx                                       NOVO
    contas/recorrencia/[id]/page.tsx                           NOVO: editar / encerrar
    contas/receber/[id]/page.tsx                               NOVO: painel Recebi
    inicio/page.tsx                                            MOD: bloco Próximas contas
    mais/page.tsx                                              MOD: Contas
    extrato/[id]/page.tsx                                      MOD: conta paga edita o dia do pagamento
docs/progresso.md, docs/decisoes-para-revisao.md               MOD no fim
```

**Rotas:** `/contas?mes=AAAA-MM&aba=a-pagar|pagas|vencidas` (aba padrão `a-pagar`), `/contas/nova`, `/contas/recorrencia/{id}`, `/contas/receber/{id}` (painel, sem barra inferior).

---

### Task 1: Regras de data das recorrências (domínio)

**Files:**
- Modify: `src/domain/dates.ts` (exportar `dayMonthLabel`; `dayLabel` passa a usá-la)
- Create: `src/domain/recurrence.ts`
- Test: `src/domain/recurrence.test.ts`, `src/domain/dates.test.ts` (acrescentar 1 teste)

**Interfaces:**
- Consumes: `addMonths`, `monthOf`, `ISODate`, `MonthKey` de `./dates`.
- Produces:
  - `dayMonthLabel(d: ISODate): string` — `'2026-09-10'` → `'10 de setembro'`.
  - `type Frequency = 'monthly' | 'yearly'`
  - `interface RecurrenceRule { frequency: Frequency; dueDay: number; dueMonth: number | null }`
  - `CATCH_UP_MONTHS = 3` (espelha o SQL da Task 2)
  - `monthName(month: number): string` — `1` → `'janeiro'`
  - `daysInMonth(m: MonthKey): number`
  - `dueDateIn(m: MonthKey, day: number): ISODate` — dia maior que o mês vira o último dia
  - `occursIn(rule: RecurrenceRule, m: MonthKey): boolean`
  - `nextDueOnOrAfter(rule: RecurrenceRule, from: ISODate): ISODate`
  - `daysUntil(from: ISODate, to: ISODate): number`
  - `relativeDue(dueOn: ISODate, today: ISODate): string` — `'hoje'` · `'amanhã'` · `'em {n} dias'` (só para `dueOn >= today`)
  - `dueText(dueOn: ISODate, today: ISODate): string` — `'vence hoje'` · `'vence amanhã'` · `'vence em {n} dias'` · `'venceu em {d de mês}'`
  - `recurrenceLabel(rule: RecurrenceRule): string` — `'Todo mês · dia 25'` · `'Todo ano · janeiro'`

- [ ] **Step 1: Testes que falham** — criar `src/domain/recurrence.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  CATCH_UP_MONTHS, daysInMonth, daysUntil, dueDateIn, dueText, monthName, nextDueOnOrAfter, occursIn,
  recurrenceLabel, relativeDue, type RecurrenceRule,
} from './recurrence'

const monthly = (dueDay: number): RecurrenceRule => ({ frequency: 'monthly', dueDay, dueMonth: null })
const yearly = (dueDay: number, dueMonth: number): RecurrenceRule => ({ frequency: 'yearly', dueDay, dueMonth })

describe('dia de vencimento ajustado ao mês (Review Focus 2)', () => {
  test('tamanho dos meses, com ano bissexto', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
  })

  test('dia 31 vira o último dia de meses mais curtos', () => {
    expect(dueDateIn('2027-02', 31)).toBe('2027-02-28')
    expect(dueDateIn('2028-02', 31)).toBe('2028-02-29')
    expect(dueDateIn('2026-04', 31)).toBe('2026-04-30')
    expect(dueDateIn('2026-10', 31)).toBe('2026-10-31')
    expect(dueDateIn('2026-10', 5)).toBe('2026-10-05')
  })

  test('29 de fevereiro anual cai em 28 em ano não bissexto', () => {
    expect(nextDueOnOrAfter(yearly(29, 2), '2026-09-30')).toBe('2027-02-28')
    expect(nextDueOnOrAfter(yearly(29, 2), '2027-03-01')).toBe('2028-02-29')
  })
})

describe('próximo vencimento a partir de hoje', () => {
  test('mensal: hoje conta; dia que já passou vai para o mês seguinte', () => {
    expect(nextDueOnOrAfter(monthly(30), '2026-09-30')).toBe('2026-09-30')
    expect(nextDueOnOrAfter(monthly(25), '2026-09-30')).toBe('2026-10-25')
    expect(nextDueOnOrAfter(monthly(31), '2026-09-30')).toBe('2026-09-30')
    expect(nextDueOnOrAfter(monthly(10), '2026-12-15')).toBe('2027-01-10')
  })

  test('anual: este ano se ainda não passou, senão o ano que vem', () => {
    expect(nextDueOnOrAfter(yearly(10, 1), '2026-09-30')).toBe('2027-01-10')
    expect(nextDueOnOrAfter(yearly(15, 10), '2026-09-30')).toBe('2026-10-15')
  })

  test('anual só acontece no mês dele', () => {
    expect(occursIn(yearly(10, 1), '2027-01')).toBe(true)
    expect(occursIn(yearly(10, 1), '2026-09')).toBe(false)
    expect(occursIn(monthly(10), '2026-09')).toBe(true)
  })

  test('recupera no máximo 3 meses de quem ficou sem abrir', () => {
    expect(CATCH_UP_MONTHS).toBe(3)
  })
})

describe('textos de prazo, sempre calmos', () => {
  test('dias até o vencimento', () => {
    expect(daysUntil('2026-09-30', '2026-10-03')).toBe(3)
    expect(daysUntil('2026-09-30', '2026-09-28')).toBe(-2)
  })

  test('relativeDue e dueText', () => {
    expect(relativeDue('2026-09-30', '2026-09-30')).toBe('hoje')
    expect(relativeDue('2026-10-01', '2026-09-30')).toBe('amanhã')
    expect(relativeDue('2026-10-03', '2026-09-30')).toBe('em 3 dias')
    expect(dueText('2026-09-30', '2026-09-30')).toBe('vence hoje')
    expect(dueText('2026-10-01', '2026-09-30')).toBe('vence amanhã')
    expect(dueText('2026-10-08', '2026-09-30')).toBe('vence em 8 dias')
    expect(dueText('2026-09-10', '2026-09-30')).toBe('venceu em 10 de setembro')
    expect(dueText('2026-09-10', '2026-09-30')).not.toMatch(/atrasad/i)
  })

  test('rótulos das recorrências (protótipo)', () => {
    expect(monthName(1)).toBe('janeiro')
    expect(recurrenceLabel(monthly(25))).toBe('Todo mês · dia 25')
    expect(recurrenceLabel(yearly(10, 1))).toBe('Todo ano · janeiro')
  })
})
```

e acrescentar em `src/domain/dates.test.ts` (importando `dayMonthLabel`):

```ts
test('dayMonthLabel escreve dia e mês por extenso', () => {
  expect(dayMonthLabel('2026-09-10')).toBe('10 de setembro')
  expect(dayMonthLabel('2027-01-01')).toBe('1 de janeiro')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/recurrence.test.ts src/domain/dates.test.ts`
Expected: FAIL — `Failed to resolve import "./recurrence"` e `dayMonthLabel is not a function`.

- [ ] **Step 3: Implementação**

Em `src/domain/dates.ts`, exportar `dayMonthLabel(d) = dayMonthFmt.format(toUTC(d))` e trocar a última linha de `dayLabel` por `return dayMonthLabel(d)`.

Criar `src/domain/recurrence.ts`. `monthName` usa `Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })` sobre `Date.UTC(2000, month - 1, 1)`; `daysInMonth` usa `new Date(Date.UTC(y, mo, 0)).getUTCDate()`; `daysUntil` subtrai `Date.parse(\`${d}T00:00:00Z\`)` e divide por `86_400_000` com `Math.round`. Algoritmo do próximo vencimento (o único que os testes não determinam por completo):

```ts
export function dueDateIn(m: MonthKey, day: number): ISODate {
  return `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`
}

export function nextDueOnOrAfter(rule: RecurrenceRule, from: ISODate): ISODate {
  const first: MonthKey =
    rule.frequency === 'monthly' ? monthOf(from) : `${from.slice(0, 4)}-${String(rule.dueMonth).padStart(2, '0')}`
  const due = dueDateIn(first, rule.dueDay)
  if (due >= from) return due
  return dueDateIn(addMonths(first, rule.frequency === 'monthly' ? 1 : 12), rule.dueDay)
}

export function dueText(dueOn: ISODate, today: ISODate): string {
  return dueOn < today ? `venceu em ${dayMonthLabel(dueOn)}` : `vence ${relativeDue(dueOn, today)}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain`
Expected: PASS (todos os arquivos de `src/domain`).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates.ts src/domain/dates.test.ts src/domain/recurrence.ts src/domain/recurrence.test.ts
git commit -m "feat(domain): regras de vencimento das recorrências (dia ajustado, próximo vencimento, textos de prazo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Banco — recorrências, geração idempotente, criar/alterar/encerrar

**Files:**
- Create: `supabase/migrations/20260926000001_contas_e_recorrencias.sql`
- Test: `tests/db/plano3.test.ts`

**Interfaces:**
- Consumes: `public.touch_updated_at()`, `public.categories`, `public.transactions`, `tests/db/helpers.ts` (`newUser`, `removeUsers`, `categoryId`, `admin`, `url`, `publishable`), `dueDateIn`/`CATCH_UP_MONTHS` (Task 1), `todayInSaoPaulo`, `monthOf`, `addMonths`, `addDays`.
- Produces (usados pelas Tasks 3–8):
  - Tabela `public.recurrences (id, user_id, kind, name, amount_cents, category_id, source, payment_method, frequency, due_day, due_month, starts_on, ended_on, generated_through, created_at, updated_at)`.
  - `public.transactions` ganha `recurrence_id uuid`, `recurrence_period date` (1º dia do mês da ocorrência).
  - RPC `generate_occurrences() returns integer` (sem argumentos).
  - RPC `create_recurring_transaction(p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text, p_payment_method text, p_occurred_on date, p_frequency text) returns uuid`.
  - RPC `update_recurrence(p_id uuid, p_name text, p_amount_cents bigint, p_category_id uuid, p_source text, p_due_day integer) returns void`.
  - RPC `end_recurrence(p_id uuid) returns void`.
  - Função `occurrence_due_on(p_period date, p_day integer) returns date` (executável por `authenticated`, usada nos testes).
  - `delete_category(p_category_id uuid)` passa a mover também as recorrências para "Outros".

Mapeamento da especificação (§3.1): dono → `user_id`; família → Plano 7 (coluna entra lá); tipo → `kind`; valor → `amount_cents`; categoria/origem → `category_id`/`source`; descrição → `name`; frequência → `frequency`; dia → `due_day`; mês → `due_month`; início → `starts_on`; fim → `ended_on`; ativa → `ended_on is null`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano3.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { addDays, addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn } from '../../src/domain/recurrence'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()
const current = monthOf(today)
const period = (m: string) => `${m}-01`
const day = Number(today.slice(8, 10))

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newRecurrence(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const casa = await categoryId(user, 'casa')
  const { data, error } = await user.client
    .from('recurrences')
    .insert({
      user_id: user.id, kind: 'expense', name: 'Luz', amount_cents: 18000, category_id: casa,
      frequency: 'monthly', due_day: day, due_month: null, starts_on: today, ...p,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function occurrences(user: TestUser, recurrenceId: string) {
  const { data, error } = await user.client
    .from('transactions')
    .select('id, status, due_on, occurred_on, paid_on, note, amount_cents, recurrence_period')
    .eq('recurrence_id', recurrenceId)
    .order('recurrence_period')
  if (error) throw error
  return data
}

async function generate(user: TestUser) {
  const { data, error } = await user.client.rpc('generate_occurrences')
  if (error) throw error
  return data as number
}

describe('privacidade das recorrências', () => {
  test('ninguém vê nem altera a recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const { data: seen } = await b.client.from('recurrences').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: changed } = await b.client.from('recurrences').update({ amount_cents: 1 }).eq('id', id).select()
    expect(changed).toEqual([])
  })

  test('ninguém liga um registro à recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'income', amount_cents: 100, occurred_on: today, recurrence_id: id, recurrence_period: period(current),
    })
    expect(error?.code).toBe('23503')
  })

  test('ninguém altera nem encerra pela função a recorrência de outra pessoa', async () => {
    const id = await newRecurrence(a)
    const upd = await b.client.rpc('update_recurrence', {
      p_id: id, p_name: 'X', p_amount_cents: 1, p_category_id: null, p_source: null, p_due_day: 1,
    })
    expect(upd.error?.message).toContain('Recorrência não encontrada.')
    const end = await b.client.rpc('end_recurrence', { p_id: id })
    expect(end.error?.message).toContain('Recorrência não encontrada.')
  })

  test('quem não entrou não gera ocorrências', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('generate_occurrences')
    expect(error).not.toBeNull()
  })
})

describe('gerar ocorrências (Review Focus 1 e 2)', () => {
  test('gera a do mês atual como a pagar, com o dia ajustado ao mês', async () => {
    const id = await newRecurrence(a, { due_day: 31, starts_on: period(current) })
    await generate(a)
    const due = dueDateIn(current, 31)
    expect(await occurrences(a, id)).toEqual([
      expect.objectContaining({ status: 'pending', due_on: due, occurred_on: due, paid_on: null, note: 'Luz', amount_cents: 18000, recurrence_period: period(current) }),
    ])
  })

  test('abrir de novo não duplica, nem com várias telas ao mesmo tempo', async () => {
    const id = await newRecurrence(a)
    await generate(a)
    await generate(a)
    await Promise.all([generate(a), generate(a), generate(a)])
    expect(await occurrences(a, id)).toHaveLength(1)
  })

  test('conta paga e depois excluída não volta', async () => {
    const id = await newRecurrence(a)
    await generate(a)
    const [occ] = await occurrences(a, id)
    const paid = await a.client.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', occ.id).select('id')
    expect(paid.data).toHaveLength(1)
    await a.client.from('transactions').delete().eq('id', occ.id)
    await generate(a)
    expect(await occurrences(a, id)).toEqual([])
  })

  test('anual só gera no mês do vencimento', async () => {
    const otherMonth = Number(addMonths(current, 1).slice(5))
    const later = await newRecurrence(a, { frequency: 'yearly', due_month: otherMonth, due_day: 10, starts_on: period(current) })
    const now = await newRecurrence(a, { frequency: 'yearly', due_month: Number(current.slice(5)), due_day: 10, starts_on: period(current) })
    await generate(a)
    expect(await occurrences(a, later)).toEqual([])
    expect((await occurrences(a, now)).map((o) => o.due_on)).toEqual([dueDateIn(current, 10)])
  })

  test('quem ficou meses sem abrir recebe no máximo 3 meses de contas', async () => {
    const id = await newRecurrence(a, { due_day: 5, starts_on: period(addMonths(current, -8)) })
    await a.client.from('recurrences').update({ generated_through: period(addMonths(current, -6)) }).eq('id', id)
    await generate(a)
    expect((await occurrences(a, id)).map((o) => o.recurrence_period)).toEqual([
      period(addMonths(current, -2)), period(addMonths(current, -1)), period(current),
    ])
  })

  test('recorrência que começa no mês que vem ainda não gera', async () => {
    const id = await newRecurrence(a, { starts_on: period(addMonths(current, 1)) })
    await generate(a)
    expect(await occurrences(a, id)).toEqual([])
  })

  test('o banco ajusta o dia igual ao app', async () => {
    for (const [m, d] of [['2027-02', 31], ['2028-02', 30], ['2026-04', 31], ['2026-01', 15]] as const) {
      const { data, error } = await a.client.rpc('occurrence_due_on', { p_period: `${m}-01`, p_day: d })
      expect(error).toBeNull()
      expect(data).toBe(dueDateIn(m, d))
    }
  })
})

describe('criar pelo Anotar', () => {
  test('o gasto de hoje é a primeira ocorrência, já paga; as próximas vêm depois', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 9900, p_category_id: mercado, p_source: null, p_note: null,
      p_payment_method: 'pix', p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('status, due_on, paid_on, recurrence_id, recurrence_period').eq('id', txId).single()
    expect(tx).toMatchObject({ status: 'confirmed', due_on: today, paid_on: today, recurrence_period: period(current) })
    const { data: rec } = await a.client.from('recurrences').select('name, due_day, due_month, generated_through').eq('id', tx!.recurrence_id).single()
    expect(rec).toEqual({ name: 'Mercado', due_day: day, due_month: null, generated_through: period(current) })
    await generate(a)
    expect(await occurrences(a, tx!.recurrence_id)).toHaveLength(1)
  })

  test('não aceita categoria de outra pessoa', async () => {
    const casaA = await categoryId(a, 'casa')
    const { error } = await b.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 100, p_category_id: casaA, p_source: null, p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error?.message).toContain('Categoria não encontrada.')
  })

  test('entrada usa a origem como nome', async () => {
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 500000, p_category_id: null, p_source: 'Salário', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('recurrence_id').eq('id', txId).single()
    const { data: rec } = await a.client.from('recurrences').select('name, kind').eq('id', tx!.recurrence_id).single()
    expect(rec).toEqual({ name: 'Salário', kind: 'income' })
  })
})

describe('alterar e encerrar (RF-18)', () => {
  async function seeded() {
    const id = await newRecurrence(a, { due_day: day, starts_on: period(addMonths(current, -2)) })
    const casa = await categoryId(a, 'casa')
    const base = { user_id: a.id, kind: 'expense', amount_cents: 18000, category_id: casa, note: 'Luz', recurrence_id: id }
    const prev = addMonths(current, -1)
    const old = addMonths(current, -2)
    const next = addMonths(current, 1)
    const { error } = await a.client.from('transactions').insert([
      { ...base, occurred_on: dueDateIn(old, day), status: 'confirmed', due_on: dueDateIn(old, day), paid_on: dueDateIn(old, day), recurrence_period: period(old) },
      { ...base, occurred_on: dueDateIn(prev, day), status: 'pending', due_on: dueDateIn(prev, day), recurrence_period: period(prev) },
      { ...base, occurred_on: today, status: 'pending', due_on: today, recurrence_period: period(current) },
      { ...base, occurred_on: dueDateIn(next, day), status: 'pending', due_on: dueDateIn(next, day), recurrence_period: period(next) },
    ])
    if (error) throw error
    await a.client.from('recurrences').update({ generated_through: period(next) }).eq('id', id)
    return { id, old, prev, next }
  }

  test('alterar muda só as ainda não vencidas; pagas e vencidas ficam como estavam', async () => {
    const { id } = await seeded()
    const casa = await categoryId(a, 'casa')
    const { error } = await a.client.rpc('update_recurrence', {
      p_id: id, p_name: 'Energia', p_amount_cents: 20000, p_category_id: casa, p_source: null, p_due_day: day,
    })
    expect(error).toBeNull()
    const rows = await occurrences(a, id)
    expect(rows.map((r) => [r.status, r.amount_cents, r.note])).toEqual([
      ['confirmed', 18000, 'Luz'],
      ['pending', 18000, 'Luz'],
      ['pending', 20000, 'Energia'],
      ['pending', 20000, 'Energia'],
    ])
  })

  test('novo dia que cairia antes de hoje não mexe na data da ocorrência deste mês', async () => {
    if (day === 1) return // não existe dia anterior a hoje neste mês
    const { id } = await seeded()
    const casa = await categoryId(a, 'casa')
    await a.client.rpc('update_recurrence', { p_id: id, p_name: 'Luz', p_amount_cents: 18000, p_category_id: casa, p_source: null, p_due_day: 1 })
    const rows = await occurrences(a, id)
    expect(rows[2].due_on).toBe(today)
    expect(rows[3].due_on).toBe(dueDateIn(addMonths(current, 1), 1))
  })

  test('encerrar tira as futuras, guarda o histórico e para de gerar', async () => {
    const { id, next } = await seeded()
    const { error } = await a.client.rpc('end_recurrence', { p_id: id })
    expect(error).toBeNull()
    const rows = await occurrences(a, id)
    expect(rows.map((r) => r.recurrence_period)).not.toContain(period(next))
    expect(rows).toHaveLength(3)
    const { data: rec } = await a.client.from('recurrences').select('ended_on').eq('id', id).single()
    expect(rec?.ended_on).toBe(today)
    await generate(a)
    expect(await occurrences(a, id)).toHaveLength(3)
    const again = await a.client.rpc('end_recurrence', { p_id: id })
    expect(again.error?.message).toContain('Recorrência não encontrada.')
  })
})

describe('excluir categoria usada por conta que se repete (Review Focus 3)', () => {
  test('a conta vai para "Outros" junto com os gastos', async () => {
    const { data: cat, error: e1 } = await a.client.from('categories').insert({ user_id: a.id, name: 'Academia' }).select('id').single()
    if (e1) throw e1
    const id = await newRecurrence(a, { category_id: cat.id, name: 'Academia' })
    await generate(a)
    const { error } = await a.client.rpc('delete_category', { p_category_id: cat.id })
    expect(error).toBeNull()
    const outros = await categoryId(a, 'outros')
    const { data: rec } = await a.client.from('recurrences').select('category_id').eq('id', id).single()
    expect(rec?.category_id).toBe(outros)
  })
})

test('ocorrência pendente sem vencimento é recusada (regra já existente)', async () => {
  const { error } = await a.client.from('transactions').insert({ user_id: a.id, kind: 'income', amount_cents: 100, occurred_on: addDays(today, 1), status: 'pending' })
  expect(error?.code).toBe('23514')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano3.test.ts`
Expected: FAIL — `relation "public.recurrences" does not exist` (ou, sem Docker, `fetch failed`: registrar como pendente e seguir; `npx tsc --noEmit` precisa passar).

- [ ] **Step 3: Implementação** — criar `supabase/migrations/20260926000001_contas_e_recorrencias.sql`:

```sql
-- Plano 3: contas e recorrências (RF-15–18, RN-10–12, A1).
-- As migrações anteriores não são editadas; tudo muda aqui.

-- 1. O molde de cada conta ou entrada que se repete.
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  category_id uuid,
  source text check (source is null or char_length(source) <= 40),
  payment_method text check (payment_method in ('pix', 'cash', 'boleto', 'debit', 'credit', 'other')),
  frequency text not null check (frequency in ('monthly', 'yearly')),
  due_day smallint not null check (due_day between 1 and 31),
  due_month smallint check (due_month between 1 and 12),
  starts_on date not null,
  ended_on date,
  -- Último mês (dia 1) já gerado. Uma ocorrência paga e excluída depois nunca volta,
  -- porque a geração só olha meses depois deste.
  generated_through date check (generated_through is null or extract(day from generated_through) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_expense_has_category check ((kind = 'expense') = (category_id is not null)),
  constraint recurrence_month_when_yearly check ((frequency = 'yearly') = (due_month is not null)),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete no action
);

create index recurrences_user_active_idx on public.recurrences (user_id) where ended_on is null;
create index recurrences_category_idx on public.recurrences (category_id);

create trigger recurrences_touch before update on public.recurrences
  for each row execute function public.touch_updated_at();

alter table public.recurrences enable row level security;

create policy recurrences_own on public.recurrences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Cada ocorrência sabe de qual recorrência e de qual mês ela é. O índice único
--    garante no banco que a mesma conta nunca aparece duas vezes no mesmo mês.
alter table public.transactions
  add column recurrence_id uuid,
  add column recurrence_period date,
  add constraint recurrence_period_pair check ((recurrence_id is null) = (recurrence_period is null)),
  add constraint recurrence_period_month_start check (recurrence_period is null or extract(day from recurrence_period) = 1),
  add constraint transactions_recurrence_fk foreign key (recurrence_id, user_id)
    references public.recurrences (id, user_id) on delete no action;

create unique index transactions_recurrence_period_uidx on public.transactions (recurrence_id, recurrence_period);
create index transactions_user_status_due_idx on public.transactions (user_id, status, due_on);

-- 3. Dia de vencimento dentro de um mês: dia maior que o mês vira o último dia
--    (31 em fevereiro → 28 ou 29). Mesma regra de dueDateIn em src/domain/recurrence.ts.
create function public.occurrence_due_on(p_period date, p_day integer) returns date
language sql immutable set search_path = '' as $$
  select make_date(
    extract(year from p_period)::int,
    extract(month from p_period)::int,
    least(p_day, extract(day from (date_trunc('month', p_period::timestamp) + interval '1 month - 1 day'))::int)
  )
$$;

-- 4. Gerar as ocorrências "a pagar"/"a receber" até o mês atual (Brasília).
--    Idempotente: o "for update" trava cada recorrência (duas telas abrindo juntas
--    esperam uma pela outra e a segunda já não encontra nada a gerar) e o índice
--    único é a rede de segurança. Quem ficou meses sem abrir recebe no máximo os
--    3 últimos meses (CATCH_UP_MONTHS em src/domain/recurrence.ts).
create function public.generate_occurrences() returns integer
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
          user_id, kind, amount_cents, category_id, source, note, payment_method,
          occurred_on, status, due_on, recurrence_id, recurrence_period
        ) values (
          v_uid, r.kind, r.amount_cents, r.category_id, r.source, r.name, r.payment_method,
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

-- 5. "É uma conta que se repete" / "Isso se repete" no Anotar: o registro de hoje
--    é a primeira ocorrência e a recorrência nasce junto, tudo ou nada.
--    Data até hoje → já paga/recebida; data futura (só gasto) → a pagar.
create function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
  v_name text;
  v_rec uuid;
  v_tx uuid;
  v_done boolean := p_occurred_on <= v_today;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  if p_kind = 'expense' then
    select c.name into v_name from public.categories c where c.id = p_category_id and c.user_id = v_uid;
    if v_name is null then
      raise exception 'Categoria não encontrada.';
    end if;
    v_name := coalesce(v_note, v_name);
  else
    v_name := coalesce(nullif(btrim(p_source), ''), 'Entrada');
  end if;

  insert into public.recurrences (
    user_id, kind, name, amount_cents, category_id, source, payment_method,
    frequency, due_day, due_month, starts_on, generated_through
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, p_payment_method,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, p_payment_method,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period
  ) returning id into v_tx;

  return v_tx;
end;
$$;

-- 6. Alterar (RF-18): muda o molde e as ocorrências ainda não vencidas
--    (due_on >= hoje). Pagas e vencidas ficam como estavam. O novo dia só é
--    aplicado se não cair antes de hoje. Frequência e mês não mudam aqui.
create function public.update_recurrence(
  p_id uuid, p_name text, p_amount_cents bigint, p_category_id uuid, p_source text, p_due_day integer
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  select rc.kind into v_kind from public.recurrences rc
    where rc.id = p_id and rc.user_id = v_uid and rc.ended_on is null
    for update;
  if not found then
    raise exception 'Recorrência não encontrada.';
  end if;

  update public.recurrences rc set
    name = p_name,
    amount_cents = p_amount_cents,
    category_id = case when v_kind = 'expense' then p_category_id end,
    source = case when v_kind = 'income' then p_source end,
    due_day = p_due_day
  where rc.id = p_id and rc.user_id = v_uid;

  update public.transactions t set
    amount_cents = p_amount_cents,
    note = p_name,
    category_id = case when v_kind = 'expense' then p_category_id end,
    source = case when v_kind = 'income' then p_source end,
    due_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.due_on end,
    occurred_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.occurred_on end
  where t.recurrence_id = p_id and t.user_id = v_uid and t.status = 'pending' and t.due_on >= v_today;
end;
$$;

-- 7. Encerrar (RF-18): as próximas deixam de ser criadas e as que venceriam
--    depois de hoje somem. O histórico (pagas) e as de hoje ou vencidas ficam.
create function public.end_recurrence(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  update public.recurrences rc set ended_on = v_today
    where rc.id = p_id and rc.user_id = v_uid and rc.ended_on is null;
  if not found then
    raise exception 'Recorrência não encontrada.';
  end if;

  delete from public.transactions t
    where t.recurrence_id = p_id and t.user_id = v_uid and t.status = 'pending' and t.due_on > v_today;
end;
$$;

-- 8. Excluir categoria (RN-27) agora também leva as contas que se repetem
--    para "Outros"; sem isso a chave estrangeira barraria a exclusão.
--    (create or replace mantém dono e permissões da função.)
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

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function
  public.occurrence_due_on(date, integer),
  public.generate_occurrences(),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text),
  public.update_recurrence(uuid, text, bigint, uuid, text, integer),
  public.end_recurrence(uuid)
from public, anon;

grant execute on function
  public.occurrence_due_on(date, integer),
  public.generate_occurrences(),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text),
  public.update_recurrence(uuid, text, bigint, uuid, text, integer),
  public.end_recurrence(uuid)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS (`rls.test.ts`, `plano2.test.ts` e `plano3.test.ts`). Sem Docker: registrar "pendente" e conferir `npx tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260926000001_contas_e_recorrencias.sql tests/db/plano3.test.ts
git commit -m "feat(db): recorrências, geração idempotente de ocorrências, criar/alterar/encerrar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gerar ao abrir e ler recorrências

**Files:**
- Create: `src/features/contas/types.ts`, `src/features/contas/occurrences.ts`, `src/features/contas/queries.ts`
- Modify: `src/features/registro/queries.ts` (`loadLedger` chama `ensureOccurrences` antes de ler)
- Test: `src/features/contas/types.test.ts`, `src/features/contas/occurrences.test.ts`

**Interfaces:**
- Consumes: RPC `generate_occurrences` e tabela `recurrences` (Task 2); `RecurrenceRule`, `Frequency` (Task 1); `requireUser`, `createClient`.
- Produces:
  - `interface RecurrenceRow extends RecurrenceRule { id: string; kind: 'income' | 'expense'; name: string; amountCents: number; categoryId: string | null; source: string | null; startsOn: ISODate; endedOn: ISODate | null }`
  - `type RecurrenceRawRow` (colunas cruas), `RECURRENCE_COLUMNS = 'id, kind, name, amount_cents, category_id, source, frequency, due_day, due_month, starts_on, ended_on'`
  - `toRecurrenceRow(r: RecurrenceRawRow): RecurrenceRow`
  - `ensureOccurrences(supabase: { rpc: (fn: string) => PromiseLike<{ error: unknown }> }): Promise<void>` — nunca lança; falha só vai para `console.error` (a tela abre com o que já existe).
  - `loadRecurrences(): Promise<RecurrenceRow[]>` — só ativas (`ended_on is null`), filtro `user_id`, ordem por `name`.
  - `loadRecurrence(id: string): Promise<RecurrenceRow | null>` — filtros `id`, `user_id`, `ended_on is null`.

- [ ] **Step 1: Testes que falham**

`src/features/contas/types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { toRecurrenceRow } from './types'

test('converte a linha do banco (bigint vem como texto ou número)', () => {
  expect(
    toRecurrenceRow({
      id: 'r1', kind: 'expense', name: 'Luz', amount_cents: '18000', category_id: 'c1', source: null,
      frequency: 'yearly', due_day: 10, due_month: 1, starts_on: '2027-01-10', ended_on: null,
    }),
  ).toEqual({
    id: 'r1', kind: 'expense', name: 'Luz', amountCents: 18000, categoryId: 'c1', source: null,
    frequency: 'yearly', dueDay: 10, dueMonth: 1, startsOn: '2027-01-10', endedOn: null,
  })
})
```

`src/features/contas/occurrences.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { ensureOccurrences } from './occurrences'

afterEach(() => vi.restoreAllMocks())

test('pede ao banco para gerar as ocorrências do mês', async () => {
  const rpc = vi.fn(async () => ({ error: null }))
  await ensureOccurrences({ rpc })
  expect(rpc).toHaveBeenCalledWith('generate_occurrences')
})

test('falha na geração não derruba a tela', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(ensureOccurrences({ rpc: async () => ({ error: { message: 'x' } }) })).resolves.toBeUndefined()
  await expect(ensureOccurrences({ rpc: async () => { throw new Error('rede') } })).resolves.toBeUndefined()
  expect(log).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/contas`
Expected: FAIL — `Failed to resolve import "./types"` / `"./occurrences"`.

- [ ] **Step 3: Implementação**

- `types.ts`: tipos e `toRecurrenceRow` (usa `Number(...)` em `amount_cents`, `due_day`, `due_month`; `due_month` nulo continua `null`). Sem `server-only` (é puro).
- `occurrences.ts`: `try { const { error } = await supabase.rpc('generate_occurrences'); if (error) console.error('generate_occurrences', error) } catch (e) { console.error('generate_occurrences', e) }`.
- `queries.ts` (`import 'server-only'`): as duas leituras, com `.eq('user_id', user.id)` e `.is('ended_on', null)`; `loadRecurrence` também `.eq('id', id)` e `.maybeSingle<RecurrenceRawRow>()`; erro do banco → `throw`.
- `registro/queries.ts`: em `loadLedger`, depois de `const supabase = await createClient()`, `await ensureOccurrences(supabase)` e só então o `Promise.all` atual. Comentário: "Contas e entradas que se repetem aparecem ao abrir qualquer tela com números (etapa-3 §5)".

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/contas && npx tsc --noEmit`
Expected: PASS; sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/features/contas/types.ts src/features/contas/types.test.ts src/features/contas/occurrences.ts src/features/contas/occurrences.test.ts src/features/contas/queries.ts src/features/registro/queries.ts
git commit -m "feat(contas): gerar ocorrências ao abrir e ler recorrências" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Montagem da tela Contas (função pura)

**Files:**
- Create: `src/features/contas/view-model.ts`
- Test: `src/features/contas/view-model.test.ts`

**Interfaces:**
- Consumes: `summarizeMonth` (`@/domain/summary`), `dueDateIn`/`relativeDue`/`recurrenceLabel`/`monthName` (Task 1), `dayMonthLabel`, `monthLabel`, `monthOf`, `isInMonth`, `formatBRL`, `TxRow`/`Category`/`Profile` (`@/features/registro/queries`), `RecurrenceRow` (Task 3).
- Produces:
  - `type ContasTab = 'a-pagar' | 'pagas' | 'vencidas'`; `parseContasTab(v: string | undefined): ContasTab` (desconhecido → `'a-pagar'`).
  - `txName(tx: TxRow, categories: Category[]): string` — `note` → (gasto) nome da categoria ou `'Outros'` / (entrada) `source` ou `'Entrada'`.
  - `interface ContasItem { id: string; name: string; amountCents: number; caption: string }`
  - `interface RecurringItem { id: string; name: string; caption: string; amountCents: number }`
  - `interface ContasView { month: MonthKey; label: string; isCurrentMonth: boolean; tab: ContasTab; counts: Record<ContasTab, number>; aPagarLabel: string; aPagarCents: number; disponivelDepoisCents: number; bills: ContasItem[]; incomes: ContasItem[]; recurringBills: RecurringItem[]; recurringIncomes: RecurringItem[] }`
  - `buildContas(input: { month: MonthKey; today: ISODate; tab: ContasTab; profile: Profile; categories: Category[]; transactions: TxRow[]; recurrences: RecurrenceRow[] }): ContasView`

Regras (mês M, hoje T, atual = `monthOf(T) === M`): "no escopo" = `pending` com `dueOn` em M, ou (se atual) `dueOn` antes de M (decisão 1). A pagar = conta no escopo com `dueOn >= T`, por vencimento crescente, legenda `{valor} · vence dia {d} · {relativeDue}`. Vencidas = conta no escopo com `dueOn < T`, por vencimento, legenda `{valor} · venceu em {d de mês}`. Pagas = conta (`expense` com `dueOn`) `confirmed` com `paidOn` em M, pagamento mais recente primeiro, legenda `{valor} · paga em {d de mês}`. Entradas a receber = entradas `pending` no escopo, legenda `{valor} · previsto para dia {d}` (em M) ou `{valor} · previsto para {d de mês}` (mês anterior). `aPagarCents`/`disponivelDepoisCents` vêm de `summarizeMonth` (uma regra só). `aPagarLabel` = `A pagar em {monthName}`. Recorrentes: ativas, separadas por tipo, ordem alfabética `pt-BR`, legenda `recurrenceLabel`.

- [ ] **Step 1: Testes que falham** — `src/features/contas/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { buildContas, parseContasTab, txName } from './view-model'
import type { TxRow } from '@/features/registro/queries'
import type { RecurrenceRow } from './types'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})
const bill = (id: string, note: string, cents: number, dueOn: string, extra: Partial<TxRow> = {}) =>
  row({ id, kind: 'expense', amountCents: cents, occurredOn: dueOn, dueOn, status: 'pending', note, categoryId: 'c1', ...extra })
const categories = [{ id: 'c1', name: 'Casa', defaultKey: 'casa' }]
const profile = { displayName: 'Camila', initialBalanceCents: 0 }
const rec = (p: Partial<RecurrenceRow> & Pick<RecurrenceRow, 'id' | 'name'>): RecurrenceRow => ({
  kind: 'expense', amountCents: 18000, categoryId: 'c1', source: null, frequency: 'monthly', dueDay: 25, dueMonth: null,
  startsOn: '2026-09-25', endedOn: null, ...p,
})

const transactions: TxRow[] = [
  row({ id: 'sal', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
  bill('luz', 'Luz', 18000, '2026-09-25'),
  bill('net', 'Internet', 12000, '2026-09-28'),
  bill('esc', 'Escola de inglês', 30000, '2026-09-30'),
  bill('agua', 'Água', 9000, '2026-09-10'),
  bill('gas', 'Gás', 7000, '2026-08-20'),
  bill('ipva', 'IPVA', 50000, '2026-09-15', { status: 'confirmed', paidOn: '2026-09-16' }),
  bill('tv', 'TV', 5000, '2026-08-28', { status: 'confirmed', paidOn: '2026-09-02' }),
  row({ id: 'fre', kind: 'income', amountCents: 80000, occurredOn: '2026-09-30', dueOn: '2026-09-30', status: 'pending', note: 'Freela mensal' }),
]
const base = { month: '2026-09', today: '2026-09-22', profile, categories, transactions, recurrences: [] }

describe('buildContas', () => {
  test('a pagar: ainda não vencidas, por data, com o prazo do protótipo', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['Luz', `${brl('180,00')} · vence dia 25 · em 3 dias`],
      ['Internet', `${brl('120,00')} · vence dia 28 · em 6 dias`],
      ['Escola de inglês', `${brl('300,00')} · vence dia 30 · em 8 dias`],
    ])
    expect(v.counts).toEqual({ 'a-pagar': 3, pagas: 2, vencidas: 2 })
  })

  test('vencidas: calmas, incluindo a do mês passado ainda não paga (decisão 1)', () => {
    const v = buildContas({ ...base, tab: 'vencidas' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['Gás', `${brl('70,00')} · venceu em 20 de agosto`],
      ['Água', `${brl('90,00')} · venceu em 10 de setembro`],
    ])
    expect(v.bills.map((b) => b.caption).join(' ')).not.toMatch(/atrasad/i)
  })

  test('pagas: pelo mês do pagamento (A1), a mais recente primeiro', () => {
    const v = buildContas({ ...base, tab: 'pagas' })
    expect(v.bills.map((b) => [b.name, b.caption])).toEqual([
      ['IPVA', `${brl('500,00')} · paga em 16 de setembro`],
      ['TV', `${brl('50,00')} · paga em 2 de setembro`],
    ])
  })

  test('resumo usa a mesma regra do Seu mês', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.aPagarLabel).toBe('A pagar em setembro')
    expect(v.aPagarCents).toBe(18000 + 12000 + 30000 + 9000 + 7000)
    expect(v.disponivelDepoisCents).toBe(500000 - 50000 - 5000 - v.aPagarCents)
  })

  test('entradas a receber com "previsto para dia"', () => {
    const v = buildContas({ ...base, tab: 'a-pagar' })
    expect(v.incomes.map((i) => [i.id, i.name, i.caption])).toEqual([['fre', 'Freela mensal', `${brl('800,00')} · previsto para dia 30`]])
  })

  test('mês passado: o que ficou sem pagar aparece como vencida, nada a pagar', () => {
    const v = buildContas({ ...base, month: '2026-08', tab: 'vencidas' })
    expect(v.isCurrentMonth).toBe(false)
    expect(v.counts['a-pagar']).toBe(0)
    expect(v.bills.map((b) => b.name)).toEqual(['Gás'])
  })

  test('contas e entradas que se repetem ficam separadas; encerradas somem', () => {
    const v = buildContas({
      ...base,
      tab: 'a-pagar',
      recurrences: [
        rec({ id: 'r1', name: 'Luz' }),
        rec({ id: 'r2', name: 'IPVA', frequency: 'yearly', dueDay: 10, dueMonth: 1 }),
        rec({ id: 'r3', name: 'Freela', kind: 'income', categoryId: null, dueDay: 30 }),
        rec({ id: 'r4', name: 'Academia', endedOn: '2026-09-01' }),
      ],
    })
    expect(v.recurringBills.map((r) => [r.name, r.caption])).toEqual([
      ['IPVA', 'Todo ano · janeiro'],
      ['Luz', 'Todo mês · dia 25'],
    ])
    expect(v.recurringIncomes.map((r) => [r.name, r.caption])).toEqual([['Freela', 'Todo mês · dia 30']])
  })
})

test('parseContasTab aceita só as três abas', () => {
  expect(parseContasTab('pagas')).toBe('pagas')
  expect(parseContasTab('vencidas')).toBe('vencidas')
  expect(parseContasTab('x')).toBe('a-pagar')
  expect(parseContasTab(undefined)).toBe('a-pagar')
})

test('txName: nota, senão categoria/origem', () => {
  expect(txName(row({ id: 'a', kind: 'expense', amountCents: 1, occurredOn: '2026-09-01', categoryId: 'c1' }), categories)).toBe('Casa')
  expect(txName(row({ id: 'b', kind: 'expense', amountCents: 1, occurredOn: '2026-09-01', categoryId: 'zz' }), categories)).toBe('Outros')
  expect(txName(row({ id: 'c', kind: 'income', amountCents: 1, occurredOn: '2026-09-01' }), categories)).toBe('Entrada')
  expect(txName(row({ id: 'd', kind: 'income', amountCents: 1, occurredOn: '2026-09-01', source: 'Freela' }), categories)).toBe('Freela')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/contas/view-model.test.ts`
Expected: FAIL — `Failed to resolve import "./view-model"`.

- [ ] **Step 3: Implementação** — `buildContas` e auxiliares em `src/features/contas/view-model.ts` seguindo as regras acima; `summarizeMonth({ month, today, initialBalanceCents: profile.initialBalanceCents, transactions, goalMovements: [] })`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/contas/view-model.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/contas/view-model.ts src/features/contas/view-model.test.ts
git commit -m "feat(contas): montagem da tela Contas (a pagar, pagas, vencidas, a receber, que se repetem)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Marcar como paga e "Recebi" (Server Actions)

**Files:**
- Create: `src/lib/refresh.ts`, `src/features/contas/return-path.ts`, `src/features/contas/actions.ts`
- Modify: `src/features/registro/schemas.ts` (exportar o campo de valor como `amountField`)
- Test: `src/features/contas/return-path.test.ts`, `src/features/contas/actions.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `createClient`, `setFlash`, `errorState`/`firstFieldErrors`/`readFields`/`FormState`, `todayInSaoPaulo`, `monthOf`, `formatBRL`, `amountField` (este passo o exporta de `@/features/registro/schemas`).
- Produces:
  - `refreshMoneyViews(): void` em `src/lib/refresh.ts` — `revalidatePath('/inicio')`, `('/extrato')`, `('/contas')`.
  - `safeReturnPath(raw: string): string` — só aceita `/inicio` e `/contas`, com `?mes=AAAA-MM` e `&aba=a-pagar|pagas|vencidas` opcionais; qualquer outra coisa → `'/contas'`.
  - `markBillPaid(fd: FormData): Promise<void>` — campos `id`, `volta`. Atualiza `{ status: 'confirmed', paid_on: hoje }` com filtros `id`, `user_id`, `kind = 'expense'`, `status = 'pending'`; 1 linha → aviso "Conta marcada como paga."; 0 linha (já paga) → volta sem aviso; erro do banco → `/contas?erro=1`.
  - `confirmIncome(_: FormState, fd: FormData): Promise<FormState>` — campos `id`, `amount`. Atualiza `{ status: 'confirmed', paid_on: hoje, amount_cents }` com filtros `id`, `user_id`, `kind = 'income'`, `status = 'pending'`; aviso "Anotado. Mais {valor} no seu mês." (copy do Plano 1); vai para `/contas?mes={mês de hoje}`.
  - `SAVE_FAILED` (mesmo texto do registro) nas ações de formulário.

- [ ] **Step 1: Testes que falham**

`src/features/contas/return-path.test.ts`:

```ts
import { expect, test } from 'vitest'
import { safeReturnPath } from './return-path'

test('volta só para o Seu mês ou para Contas (Review Focus 4)', () => {
  expect(safeReturnPath('/inicio')).toBe('/inicio')
  expect(safeReturnPath('/contas')).toBe('/contas')
  expect(safeReturnPath('/contas?mes=2026-09')).toBe('/contas?mes=2026-09')
  expect(safeReturnPath('/contas?mes=2026-09&aba=vencidas')).toBe('/contas?mes=2026-09&aba=vencidas')
  for (const bad of ['//evil.com', 'https://evil.com', '/contas?mes=2026-09&x=1', '/extrato', '/contas/../entrar', '', '/inicio?mes=2026-13']) {
    expect(safeReturnPath(bad)).toBe('/contas')
  }
})
```

`src/features/contas/actions.test.ts` (a Task 6 acrescenta mais `describe` neste arquivo):

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []

// Fake encadeável: cada `.eq`/`.is` registra o filtro; `.select()` ou `.maybeSingle()` resolvem.
function fakeSupabase(s: { rows?: number; error?: unknown; kind?: 'income' | 'expense' | null; rpcError?: unknown; insertError?: unknown } = {}) {
  function builder(op: string, table: string, payload?: unknown) {
    const filters: Record<string, unknown> = {}
    const b = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return b
      },
      is(col: string, val: unknown) {
        filters[col] = val
        return b
      },
      select: async () => {
        calls.push({ op: `${op}:${table}`, filters, payload })
        if (s.error) return { data: null, error: s.error }
        return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
      },
      maybeSingle: async () => {
        calls.push({ op: `read:${table}`, filters })
        return { data: s.kind ? { kind: s.kind } : null, error: null }
      },
    }
    return b
  }
  return {
    from: (table: string) => ({
      select: () => builder('read', table),
      update: (payload: unknown) => builder('update', table, payload),
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, filters: {}, payload })
        return { error: s.insertError ?? null }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: null, error: s.rpcError ?? null }
    },
  }
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  throw new Error('esperava um redirecionamento')
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const CAT = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const NBSP = String.fromCharCode(0xa0)
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.useRealTimers())

describe('markBillPaid', () => {
  test('marca como paga hoje, só se for conta pendente da própria pessoa, e volta de onde veio', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/inicio' })))
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'update:transactions',
        filters: { id: ID, user_id: 'u1', kind: 'expense', status: 'pending' },
        payload: { status: 'confirmed', paid_on: '2026-09-30' },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Conta marcada como paga.')
    for (const path of ['/inicio', '/extrato', '/contas']) expect(h.revalidatePath).toHaveBeenCalledWith(path)
  })

  test('toque duplo ou conta já paga: nada muda e não aparece erro (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    const url = await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/contas?mes=2026-09&aba=vencidas' })))
    expect(url).toBe('/contas?mes=2026-09&aba=vencidas')
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('endereço de volta adulterado vai para Contas', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.markBillPaid(form({ id: ID, volta: '//evil.com' })))).toBe('/contas')
  })

  test('id inválido não grava nada', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.markBillPaid(form({ id: 'nao-e-id', volta: '/inicio' })))).toBe('/inicio')
    expect(calls).toEqual([])
  })

  test('falha no banco mostra o aviso de erro em Contas', async () => {
    h.supabase = fakeSupabase({ error: { message: 'falhou' } })
    expect(await redirectOf(actions.markBillPaid(form({ id: ID, volta: '/inicio' })))).toBe('/contas?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('confirmIncome (RF-17)', () => {
  test('confirma com o valor ajustado e conta hoje', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '750' })))
    expect(url).toBe('/contas?mes=2026-09')
    expect(calls).toEqual([
      {
        op: 'update:transactions',
        filters: { id: ID, user_id: 'u1', kind: 'income', status: 'pending' },
        payload: { status: 'confirmed', paid_on: '2026-09-30', amount_cents: 75000 },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith(`Anotado. Mais R$${NBSP}750,00 no seu mês.`)
  })

  test('valor vazio pede o valor e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } })
    expect(calls).toEqual([])
  })

  test('entrada que já não está a receber: avisa sem perder o valor', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    const state = await actions.confirmIncome({ status: 'idle' }, form({ id: ID, amount: '750' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '750' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/contas/return-path.test.ts src/features/contas/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./return-path"` / `"./actions"`.

- [ ] **Step 3: Implementação**

- `src/features/registro/schemas.ts`: renomear a constante `amount` para `export const amountField` (mesmas mensagens) e usá-la nos dois schemas (`amount: amountField`).
- `src/lib/refresh.ts`: `refreshMoneyViews()` com os três `revalidatePath`.
- `src/features/contas/return-path.ts`:

```ts
const ALLOWED = /^\/(inicio|contas)(\?mes=20\d{2}-(0[1-9]|1[0-2])(&aba=(a-pagar|pagas|vencidas))?)?$/

export function safeReturnPath(raw: string): string {
  return ALLOWED.test(raw) ? raw : '/contas'
}
```

- `src/features/contas/actions.ts` (`'use server'`): `markBillPaid` e `confirmIncome` como descritos em Interfaces; id validado com `z.uuid()`; `confirmIncome` valida `z.object({ amount: amountField })` sobre `readFields(fd, ['amount'])`; `redirect()` sempre fora de `try`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/contas src/features/registro`
Expected: PASS (os testes de registro continuam passando com `amountField`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/refresh.ts src/features/contas/return-path.ts src/features/contas/return-path.test.ts src/features/contas/actions.ts src/features/contas/actions.test.ts src/features/registro/schemas.ts
git commit -m "feat(contas): marcar conta como paga e confirmar entrada a receber" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Nova conta, alterar e encerrar recorrência (Server Actions)

**Files:**
- Create: `src/features/contas/schemas.ts`
- Modify: `src/features/contas/actions.ts`
- Test: `src/features/contas/schemas.test.ts`, `src/features/contas/actions.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `amountField` (Task 5), `nextDueOnOrAfter`, `Frequency` (Task 1), RPCs `update_recurrence`/`end_recurrence` e tabela `recurrences` (Task 2), `refreshMoneyViews`, `SAVE_FAILED`.
- Produces:
  - `billSchema` — entrada `{ name, amount, categoryId, frequency, dueDay, dueMonth }` (strings) → `{ name: string; amountCents: number; categoryId: string; frequency: Frequency; dueDay: number; dueMonth: number | null }`. Mensagens: `'Falta o nome.'`, `'Use até 40 caracteres.'`, `'Escolha uma categoria para esse gasto.'`, `'Escolha o dia.'` (dia fora de 1–31), `'Escolha o mês.'` (anual sem mês 1–12). `frequency` desconhecida → `'monthly'`.
  - `makeRecurrenceEditSchema(kind: 'income' | 'expense')` — `{ name, amount, categoryId | source, dueDay }` → `{ name: string; amountCents: number; categoryId: string | null; source: string | null; dueDay: number }` (origem vazia → `null`, até 40).
  - `createBill(_: FormState, fd: FormData): Promise<FormState>` — insere em `recurrences` `{ user_id, kind: 'expense', name, amount_cents, category_id, frequency, due_day, due_month, starts_on: nextDueOnOrAfter(regra, hoje) }`; aviso "Conta criada."; vai para `/contas`. A ocorrência do mês aparece quando `/contas` abre (`loadLedger` → `generate_occurrences`).
  - `updateRecurrence(_: FormState, fd: FormData): Promise<FormState>` — lê o tipo no banco (`select('kind')` com `id`, `user_id`, `ended_on is null`), valida pelo tipo, chama `rpc('update_recurrence', { p_id, p_name, p_amount_cents, p_category_id, p_source, p_due_day })`; aviso "Alterações salvas."; vai para `/contas`.
  - `endRecurrence(fd: FormData): Promise<void>` — `rpc('end_recurrence', { p_id })`; aviso "Encerrada. O histórico continua no Extrato."; vai para `/contas`; erro → `/contas/recorrencia/{id}?erro=1`.

- [ ] **Step 1: Testes que falham**

`src/features/contas/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { billSchema, makeRecurrenceEditSchema } from './schemas'

const CAT = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const ok = { name: '  Luz ', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }

test('Nova conta mensal', () => {
  expect(billSchema.parse(ok)).toEqual({ name: 'Luz', amountCents: 18000, categoryId: CAT, frequency: 'monthly', dueDay: 25, dueMonth: null })
})

test('anual precisa do mês', () => {
  const r = billSchema.safeParse({ ...ok, frequency: 'yearly', dueMonth: '' })
  expect(r.success).toBe(false)
  expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([['dueMonth', 'Escolha o mês.']])
  expect(billSchema.parse({ ...ok, frequency: 'yearly', dueMonth: '1' })).toMatchObject({ frequency: 'yearly', dueMonth: 1 })
})

test('mensagens dos campos', () => {
  const r = billSchema.safeParse({ ...ok, name: ' ', amount: '', categoryId: '', dueDay: '32' })
  expect(Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]))).toEqual({
    name: 'Falta o nome.', amount: 'Falta o valor.', categoryId: 'Escolha uma categoria para esse gasto.', dueDay: 'Escolha o dia.',
  })
  expect(billSchema.safeParse({ ...ok, name: 'x'.repeat(41) }).error?.issues[0].message).toBe('Use até 40 caracteres.')
  for (const bad of ['0', 'dez', '2.5', '']) expect(billSchema.safeParse({ ...ok, dueDay: bad }).success).toBe(false)
})

test('frequência desconhecida vira mensal', () => {
  expect(billSchema.parse({ ...ok, frequency: 'semanal' }).frequency).toBe('monthly')
})

test('edição de entrada: origem vazia vira nula; categoria não entra', () => {
  expect(makeRecurrenceEditSchema('income').parse({ name: 'Freela', amount: '800', source: '', categoryId: CAT, dueDay: '30' })).toEqual({
    name: 'Freela', amountCents: 80000, categoryId: null, source: null, dueDay: 30,
  })
  expect(makeRecurrenceEditSchema('expense').parse({ name: 'Luz', amount: '200', categoryId: CAT, dueDay: '10' })).toEqual({
    name: 'Luz', amountCents: 20000, categoryId: CAT, source: null, dueDay: 10,
  })
})
```

Acrescentar em `src/features/contas/actions.test.ts`:

```ts
describe('createBill', () => {
  test('cria a conta; a primeira vence na próxima data a partir de hoje', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(
      actions.createBill({ status: 'idle' }, form({ name: 'Luz', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' })),
    )
    expect(url).toBe('/contas')
    expect(calls).toEqual([
      {
        op: 'insert:recurrences',
        filters: {},
        payload: {
          user_id: 'u1', kind: 'expense', name: 'Luz', amount_cents: 18000, category_id: CAT,
          frequency: 'monthly', due_day: 25, due_month: null, starts_on: '2026-10-25',
        },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Conta criada.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/contas')
  })

  test('anual em 29 de fevereiro começa no último dia de fevereiro (Review Focus 2)', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.createBill({ status: 'idle' }, form({ name: 'IPVA', amount: '500', categoryId: CAT, frequency: 'yearly', dueDay: '29', dueMonth: '2' })))
    expect(calls[0].payload).toMatchObject({ frequency: 'yearly', due_day: 29, due_month: 2, starts_on: '2027-02-28' })
  })

  test('erro de campo não grava nada e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.createBill({ status: 'idle' }, form({ name: '', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' }, values: { amount: '180' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { code: '23503' } })
    const state = await actions.createBill({ status: 'idle' }, form({ name: 'Luz', amount: '180', categoryId: CAT, frequency: 'monthly', dueDay: '25', dueMonth: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Luz' } })
  })
})

describe('updateRecurrence', () => {
  test('o tipo vem do banco; altera pela função atômica', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    const url = await redirectOf(actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Energia', amount: '200', categoryId: CAT, source: 'Freela', dueDay: '10' })))
    expect(url).toBe('/contas')
    expect(calls).toEqual([
      { op: 'read:recurrences', filters: { id: ID, user_id: 'u1', ended_on: null } },
      {
        op: 'rpc:update_recurrence',
        filters: {},
        payload: { p_id: ID, p_name: 'Energia', p_amount_cents: 20000, p_category_id: CAT, p_source: null, p_due_day: 10 },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('entrada ignora categoria enviada pelo formulário', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    await redirectOf(actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Freela', amount: '800', categoryId: CAT, source: 'Freela', dueDay: '30' })))
    expect(calls[1].payload).toMatchObject({ p_category_id: null, p_source: 'Freela' })
  })

  test('recorrência encerrada, de outra pessoa ou id inválido não grava', async () => {
    h.supabase = fakeSupabase({ kind: null })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateRecurrence({ status: 'idle' }, form({ id, name: 'Luz', amount: '10', categoryId: CAT, dueDay: '5' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '10' } })
    }
    expect(calls.filter((c) => c.op.startsWith('rpc:'))).toEqual([])
  })

  test('falha na função avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', rpcError: { message: 'Recorrência não encontrada.' } })
    const state = await actions.updateRecurrence({ status: 'idle' }, form({ id: ID, name: 'Luz', amount: '10', categoryId: CAT, dueDay: '5' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
  })
})

describe('endRecurrence', () => {
  test('encerra e avisa que o histórico continua', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.endRecurrence(form({ id: ID })))).toBe('/contas')
    expect(calls).toEqual([{ op: 'rpc:end_recurrence', filters: {}, payload: { p_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Encerrada. O histórico continua no Extrato.')
  })

  test('falha volta para a recorrência com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.endRecurrence(form({ id: ID })))).toBe(`/contas/recorrencia/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para Contas sem chamar o banco', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.endRecurrence(form({ id: 'x' })))).toBe('/contas')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/contas/schemas.test.ts src/features/contas/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"` e `actions.createBill is not a function`.

- [ ] **Step 3: Implementação**

- `schemas.ts`: `nameField = z.string().trim().min(1, { error: 'Falta o nome.' }).max(40, { error: 'Use até 40 caracteres.' })`; `dayField` aceita só `/^\d{1,2}$/` entre 1 e 31 (senão `'Escolha o dia.'`); `billSchema` é `z.object({...}).transform(...)` que valida `dueMonth` só quando `frequency === 'yearly'` (issue com `path: ['dueMonth']`); `frequency: z.enum(['monthly', 'yearly']).catch('monthly')`. `makeRecurrenceEditSchema` monta o objeto por tipo e normaliza a saída para sempre ter `categoryId` e `source`.
- `actions.ts`: `BILL_FIELDS = ['name', 'amount', 'categoryId', 'frequency', 'dueDay', 'dueMonth']`, `EDIT_FIELDS = ['name', 'amount', 'categoryId', 'source', 'dueDay']`. Todas com `requireUser()` primeiro, `refreshMoneyViews()` depois de gravar, `redirect()` fora de `try`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/contas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/contas/schemas.ts src/features/contas/schemas.test.ts src/features/contas/actions.ts src/features/contas/actions.test.ts
git commit -m "feat(contas): nova conta, alterar e encerrar recorrência" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Anotar — "É uma conta que se repete" e "Isso se repete"

**Files:**
- Create: `src/ui/chip.ts`, `src/ui/frequency-field.tsx`
- Modify: `src/features/registro/schemas.ts` (`parseRepeat`), `src/features/registro/labels.ts` (`INCOME_SOURCES`), `src/features/registro/actions.ts` (`createTransaction` com repetição; `refreshMoneyViews` de `@/lib/refresh`), `src/features/registro/anotar-form.tsx`
- Test: `src/features/registro/schemas.test.ts`, `src/features/registro/actions.test.ts`, `src/features/registro/anotar-form.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: RPC `create_recurring_transaction` (Task 2), `Frequency` (Task 1), `refreshMoneyViews` (Task 5).
- Produces:
  - `CHIP: string` (classe dos chips, movida de `anotar-form.tsx` sem mudança).
  - `INCOME_SOURCES = ['Salário', 'Freela', 'Presente', 'Outros'] as const`.
  - `parseRepeat(repeats: string, frequency: string): Frequency | null` — `'on'` → `'yearly'` se `frequency === 'yearly'`, senão `'monthly'`; qualquer outra coisa → `null`.
  - `FrequencyField({ value, onChange, legend, hideLegend }: { value: Frequency; onChange: (f: Frequency) => void; legend: string; hideLegend?: boolean })` — dois rádios `name="frequency"` ("Todo mês" `monthly`, "Todo ano" `yearly`) em segmentado (visual do protótipo Registrar entrada).
  - Formulário do Anotar (só ao criar, nunca na edição): gasto → dentro de "Mais detalhes", caixa `name="repeats" value="on"` com rótulo "É uma conta que se repete"; entrada → depois de "Quando?", caixa com rótulo "Isso se repete". Marcada, mostra `FrequencyField` (legenda escondida "Com que frequência?"), padrão "Todo mês".
  - `createTransaction` com repetição chama `rpc('create_recurring_transaction', { p_kind, p_amount_cents, p_category_id, p_source, p_note, p_payment_method, p_occurred_on, p_frequency })` em vez do `insert`; sem repetição, igual ao Plano 2. Avisos iguais ao Plano 2.

- [ ] **Step 1: Testes que falham**

Em `src/features/registro/schemas.test.ts` (importando `parseRepeat`):

```ts
test('parseRepeat: só "on" repete; padrão todo mês', () => {
  expect(parseRepeat('on', 'yearly')).toBe('yearly')
  expect(parseRepeat('on', 'monthly')).toBe('monthly')
  expect(parseRepeat('on', '')).toBe('monthly')
  expect(parseRepeat('', 'yearly')).toBeNull()
})
```

Em `src/features/registro/actions.test.ts`: importar também `createTransaction` (`const { createTransaction, updateTransaction, deleteTransaction } = await import('./actions')`) e acrescentar:

```ts
function fakeCreate(s: { rpcError?: unknown } = {}) {
  return {
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, filters: {}, payload })
        return { error: null }
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: 'novo-id', error: s.rpcError ?? null }
    },
  }
}

describe('createTransaction com repetição', () => {
  test('gasto que se repete cria recorrência e primeira ocorrência de uma vez', async () => {
    h.supabase = fakeCreate()
    const url = await redirectOf(
      createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: 'Internet', paymentMethod: 'boleto', repeats: 'on', frequency: 'monthly' })),
    )
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'rpc:create_recurring_transaction',
        filters: {},
        payload: {
          p_kind: 'expense', p_amount_cents: 12000, p_category_id: CAT, p_source: null, p_note: 'Internet',
          p_payment_method: 'boleto', p_occurred_on: '2026-09-30', p_frequency: 'monthly',
        },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/contas')
  })

  test('entrada que se repete todo ano', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'income', amount: '800', source: 'Freela', when: 'today', date: '', repeats: 'on', frequency: 'yearly' })))
    expect(calls[0].payload).toEqual({
      p_kind: 'income', p_amount_cents: 80000, p_category_id: null, p_source: 'Freela', p_note: null,
      p_payment_method: null, p_occurred_on: '2026-09-30', p_frequency: 'yearly',
    })
  })

  test('sem repetição continua um registro simples', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '10', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' })))
    expect(calls.map((c) => c.op)).toEqual(['insert:transactions'])
  })

  test('falha na função mantém o que foi digitado, inclusive a repetição', async () => {
    h.supabase = fakeCreate({ rpcError: { message: 'x' } })
    const state = await createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', repeats: 'on', frequency: 'yearly' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { repeats: 'on', frequency: 'yearly' } })
  })
})
```

Em `src/features/registro/anotar-form.test.tsx`:

```tsx
describe('se repete (só ao criar)', () => {
  test('gasto: opção dentro de Mais detalhes; marcada mostra Todo mês / Todo ano', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const box = screen.getByLabelText('É uma conta que se repete') as HTMLInputElement
    expect(box.closest('details')).not.toBeNull()
    expect(box.name).toBe('repeats')
    expect(screen.queryByRole('radio', { name: 'Todo mês' })).toBeNull()
    fireEvent.click(box)
    expect(screen.getByRole('radio', { name: 'Todo mês' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', false)
    expect(screen.getByRole('group', { name: 'Com que frequência?' })).toBeTruthy()
  })

  test('entrada: "Isso se repete" fora de detalhes', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.getByLabelText('Isso se repete').closest('details')).toBeNull()
  })

  test('depois de um erro, a repetição escolhida continua marcada e visível', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, message: 'x', values: { amount: '120', repeats: 'on', frequency: 'yearly' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    expect(screen.getByLabelText('É uma conta que se repete')).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', true)
  })

  test('na edição não existe a opção', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today }
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(screen.queryByLabelText('É uma conta que se repete')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro`
Expected: FAIL — `parseRepeat is not a function`; `Unable to find a label with the text of: É uma conta que se repete`; `insert:transactions` onde se esperava `rpc:create_recurring_transaction`.

- [ ] **Step 3: Implementação**

- `ui/chip.ts`: `export const CHIP = '…'` (string idêntica à constante `chip` atual); `anotar-form.tsx` passa a importá-la.
- `labels.ts`: `INCOME_SOURCES`; `anotar-form.tsx` troca `SOURCES` por ela.
- `ui/frequency-field.tsx` (`'use client'`): `<fieldset>` com `<legend className={hideLegend ? 'sr-only' : 'mb-2.5 text-[15px] font-medium'}>`; o grupo com o segmentado do protótipo (`grid grid-cols-2 gap-1 rounded-panel bg-sunken p-1`; opção marcada via `has-[:checked]:bg-card has-[:checked]:font-semibold has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(18,40,1,.08)]`; foco visível com o anel verde de `CHIP`); rádios `sr-only`, controlados por `value`/`onChange`; cada opção com `min-h-11`.
- `anotar-form.tsx`: componente interno `RepeatOption({ label, initialOn, initialFrequency })` com `useState` para ligado e frequência; caixa `className="size-[22px] accent-[#6cbf38]"` dentro de `<label className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink">`. Renderizar só quando `!record`, com `initialOn = v.repeats === 'on'` e `initialFrequency = v.frequency === 'yearly' ? 'yearly' : 'monthly'`. Gasto: dentro de `<details>` depois de "Forma de pagamento"; `hasDetails` passa a ser `Boolean(v.note || v.paymentMethod || v.repeats)`. Entrada: bloco com `border-y border-line py-3.5` depois de "Quando?".
- `actions.ts` (registro): `REPEAT_FIELDS = ['repeats', 'frequency'] as const`; `createTransaction` lê `readFields(fd, [...EXPENSE_FIELDS, ...REPEAT_FIELDS])` (ou `INCOME_FIELDS`) e, se `parseRepeat(values.repeats, values.frequency)` não for nulo, chama a RPC; erro → `errorState({ message: SAVE_FAILED, values })`. Trocar a função local `refreshMoneyViews` pela de `@/lib/refresh` (em todas as ações do arquivo).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro src/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/chip.ts src/ui/frequency-field.tsx src/features/registro
git commit -m "feat(registro): anotar gasto ou entrada que se repete (todo mês ou todo ano)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Extrato — editar a data de uma conta paga muda o dia do pagamento

**Files:**
- Modify: `src/features/registro/actions.ts` (`updateTransaction`), `src/app/(app)/extrato/[id]/page.tsx`
- Test: `src/features/registro/actions.test.ts` (acrescentar)

**Interfaces:**
- Consumes: pré-leitura existente `select('kind, status, paid_on')` (id + user_id).
- Produces: `updateTransaction` grava a data do formulário em `paid_on` quando o registro já tem `paid_on` (conta paga ou entrada recebida) e em `occurred_on` nos demais; volta para `/extrato?mes={mês da data salva}`. A página de edição passa `occurredOn: tx.paidOn ?? tx.occurredOn` ao formulário.

- [ ] **Step 1: Teste que falha** — acrescentar no `describe('updateTransaction')`:

```ts
test('conta paga: a data editada é o dia do pagamento, não o vencimento (Review Focus 5)', async () => {
  h.supabase = fakeSupabase({ kind: 'expense', paidOn: '2026-10-02' })
  const url = await redirectOf(
    updateTransaction({ status: 'idle' }, form({ id: ID, amount: '180', categoryId: CAT, when: 'other', date: '2026-09-29', note: 'Luz', paymentMethod: '' })),
  )
  expect(url).toBe('/extrato?mes=2026-09')
  expect(calls[0].payload).toEqual({ amount_cents: 18000, category_id: CAT, note: 'Luz', payment_method: null, paid_on: '2026-09-29' })
  expect(calls[0].filters).toEqual({ id: ID, user_id: 'u1', status: 'confirmed' })
})

test('entrada recebida de uma recorrência: também muda o dia em que entrou', async () => {
  h.supabase = fakeSupabase({ kind: 'income', paidOn: '2026-09-28' })
  await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '750', source: 'Freela', when: 'yesterday', date: '' })))
  expect(calls[0].payload).toEqual({ amount_cents: 75000, source: 'Freela', paid_on: '2026-09-29' })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/actions.test.ts`
Expected: FAIL — payload com `occurred_on: '2026-09-29'` em vez de `paid_on`, e redirecionamento para `/extrato?mes=2026-10`.

- [ ] **Step 3: Implementação** — em `updateTransaction`, `const dateColumn = existing.paid_on ? 'paid_on' : 'occurred_on'` e `[dateColumn]: d.occurredOn` nos dois `update`; o redirecionamento final vira `/extrato?mes=${monthOf(occurredOn)}` (a data salva agora é sempre a efetiva). Atualizar o comentário. Na página `extrato/[id]`, `occurredOn: tx.paidOn ?? tx.occurredOn` no `record`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro`
Expected: PASS (os testes do Plano 2 continuam iguais).

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/actions.ts src/features/registro/actions.test.ts "src/app/(app)/extrato/[id]/page.tsx"
git commit -m "fix(extrato): editar a data de conta paga muda o dia do pagamento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Peças da tela Contas (abas, listas, "Marcar como paga")

**Files:**
- Modify: `src/ui/list.tsx` (`RowLink` ganha `detail`)
- Create: `src/features/contas/pay-button.tsx`, `src/features/contas/contas-sections.tsx`
- Test: `src/ui/list.test.tsx` (acrescentar), `src/features/contas/contas-sections.test.tsx`

**Interfaces:**
- Consumes: `ConfirmAction` (`@/ui/confirm`), `ListSection`/`ListCard`/`ListRow`/`RowLink`, `markBillPaid` (Task 5), `ContasTab`/`ContasItem`/`RecurringItem` (Task 4), `formatBRL`.
- Produces:
  - `RowLink` aceita `detail?: string` (linha menor **abaixo** do título, como no protótipo "Contas que se repetem").
  - `PayBillButton({ id, name, back, short }: { id: string; name: string; back: string; short?: boolean })` — gatilho "Marcar como paga" (ou "Paga" com `short`), nome acessível `Marcar {nome} como paga`; confirmação `Marcar {nome} como paga?` com "Marcar como paga" · "Agora não"; campos ocultos `id` e `volta`.
  - `contasHref(month: MonthKey, tab: ContasTab): string` — `/contas?mes=…` (+ `&aba=…` fora de `a-pagar`).
  - `ContasTabs({ month, tab, counts })` — `<nav aria-label="Situação das contas">` com três links "A pagar · n", "Pagas · n", "Vencidas · n" e `aria-current="page"` na atual.
  - `BillsList({ tab, bills, back })` — lista; em `a-pagar` e `vencidas` cada linha tem `PayBillButton short`; vazia mostra `EMPTY_BILLS[tab]`: "Nenhuma conta a pagar neste mês." · "Nenhuma conta paga neste mês." · "Nenhuma conta vencida.".
  - `IncomeList({ items })` — `ListSection` "Entradas a receber"; cada linha com link "Recebi" (`/contas/receber/{id}`, nome acessível `Recebi {nome}`).
  - `RecurringList({ title, items, empty })` — `ListSection` com `RowLink` para `/contas/recorrencia/{id}`, `detail` = legenda, `value` = valor formatado; vazia mostra `empty`.

- [ ] **Step 1: Testes que falham**

Em `src/ui/list.test.tsx`:

```tsx
test('RowLink mostra o detalhe abaixo do título', () => {
  render(<ListCard><ListRow><RowLink href="/contas/recorrencia/r1" title="Luz" detail="Todo mês · dia 25" /></ListRow></ListCard>)
  const link = screen.getByRole('link', { name: /Luz/ })
  const texts = Array.from(link.querySelectorAll('span span')).map((s) => s.textContent)
  expect(texts).toEqual(['Luz', 'Todo mês · dia 25'])
})
```

`src/features/contas/contas-sections.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./actions', () => ({ markBillPaid: vi.fn() }))
const { BillsList, ContasTabs, IncomeList, RecurringList, contasHref } = await import('./contas-sections')

afterEach(() => cleanup())

const luz = { id: 'luz', name: 'Luz', amountCents: 18000, caption: 'R$ 180,00 · vence dia 25 · em 3 dias' }

test('abas com contagem, link e aba atual', () => {
  render(<ContasTabs month="2026-09" tab="vencidas" counts={{ 'a-pagar': 3, pagas: 4, vencidas: 0 }} />)
  const nav = screen.getByRole('navigation', { name: 'Situação das contas' })
  expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['A pagar · 3', '/contas?mes=2026-09'],
    ['Pagas · 4', '/contas?mes=2026-09&aba=pagas'],
    ['Vencidas · 0', '/contas?mes=2026-09&aba=vencidas'],
  ])
  expect(screen.getByRole('link', { name: 'Vencidas · 0' }).getAttribute('aria-current')).toBe('page')
  expect(contasHref('2026-09', 'a-pagar')).toBe('/contas?mes=2026-09')
})

test('a pagar: "Paga" abre a confirmação da copy, com id e volta', () => {
  render(<BillsList tab="a-pagar" bills={[luz]} back="/contas?mes=2026-09" />)
  expect(screen.getByText(luz.caption)).toBeTruthy()
  const pay = screen.getByRole('button', { name: 'Marcar Luz como paga' })
  expect(pay.textContent).toBe('Paga')
  fireEvent.click(pay)
  const dialog = screen.getByRole('alertdialog', { name: 'Marcar Luz como paga?' })
  expect(within(dialog).getByRole('button', { name: 'Marcar como paga' }).getAttribute('type')).toBe('submit')
  expect(within(dialog).getByRole('button', { name: 'Agora não' })).toBeTruthy()
  const hidden = Object.fromEntries(Array.from(dialog.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]))
  expect(hidden).toEqual({ id: 'luz', volta: '/contas?mes=2026-09' })
})

test('vencida aparece calma: sem vermelho e sem "atrasada"', () => {
  const agua = { id: 'agua', name: 'Água', amountCents: 9000, caption: 'R$ 90,00 · venceu em 10 de setembro' }
  const { container } = render(<BillsList tab="vencidas" bills={[agua]} back="/contas" />)
  expect(container.innerHTML).not.toMatch(/red|error|atrasad/i)
  expect(screen.getByRole('button', { name: 'Marcar Água como paga' })).toBeTruthy()
})

test('pagas não têm botão; listas vazias têm texto próprio', () => {
  const { rerender } = render(<BillsList tab="pagas" bills={[{ ...luz, caption: 'R$ 180,00 · paga em 25 de setembro' }]} back="/contas" />)
  expect(screen.queryByRole('button')).toBeNull()
  rerender(<BillsList tab="a-pagar" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta a pagar neste mês.')).toBeTruthy()
  rerender(<BillsList tab="pagas" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta paga neste mês.')).toBeTruthy()
  rerender(<BillsList tab="vencidas" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta vencida.')).toBeTruthy()
})

test('entradas a receber levam ao painel "Recebi"', () => {
  render(<IncomeList items={[{ id: 'fre', name: 'Freela mensal', amountCents: 80000, caption: 'R$ 800,00 · previsto para dia 30' }]} />)
  const region = screen.getByRole('region', { name: 'Entradas a receber' })
  const link = within(region).getByRole('link', { name: 'Recebi Freela mensal' })
  expect(link.textContent).toBe('Recebi')
  expect(link.getAttribute('href')).toBe('/contas/receber/fre')
})

test('contas que se repetem abrem a edição; vazia mostra o texto', () => {
  const { rerender } = render(
    <RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={[{ id: 'r1', name: 'Luz', caption: 'Todo mês · dia 25', amountCents: 18000 }]} />,
  )
  const link = within(screen.getByRole('region', { name: 'Contas que se repetem' })).getByRole('link', { name: /Luz/ })
  expect(link.getAttribute('href')).toBe('/contas/recorrencia/r1')
  expect(link.textContent).toContain('Todo mês · dia 25')
  rerender(<RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={[]} />)
  expect(screen.getByText('Nenhuma conta que se repete ainda.')).toBeTruthy()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/list.test.tsx src/features/contas/contas-sections.test.tsx`
Expected: FAIL — texto do detalhe ausente e `Failed to resolve import "./contas-sections"`.

- [ ] **Step 3: Implementação**

- `list.tsx`: em `RowLink`, depois do `<span>` do título, `{detail && <span className="text-[13px] text-muted">{detail}</span>}`.
- `pay-button.tsx`: `ConfirmAction` com `trigger={short ? 'Paga' : 'Marcar como paga'}`, `triggerAriaLabel={\`Marcar ${name} como paga\`}`, `triggerClassName="shrink-0 rounded-control border border-control bg-card px-3 text-sm font-semibold text-ink hover:bg-canvas"`, `title={\`Marcar ${name} como paga?\`}`, `confirmLabel="Marcar como paga"`, `cancelLabel="Agora não"`, `action={markBillPaid}`, `fields={{ id, volta: back }}`.
- `contas-sections.tsx`: abas no estilo do segmentado do Anotar (`grid grid-cols-3 gap-1 rounded-panel bg-sunken p-1`, links `min-h-11`); linha de conta = `<div className="flex min-h-16 items-center gap-3 py-2">` com nome (`text-[15px] text-ink`), legenda (`text-[13px] text-muted`) e o botão; lista vazia = `<p className="rounded-card border border-dashed border-line bg-card p-5 text-[15px]">`. Link "Recebi" com o mesmo estilo do botão "Paga".

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/ui src/features/contas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/list.tsx src/ui/list.test.tsx src/features/contas/pay-button.tsx src/features/contas/contas-sections.tsx src/features/contas/contas-sections.test.tsx
git commit -m "feat(contas): abas, listas e confirmação de marcar como paga" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Formulários — Nova conta, editar recorrência e "Recebi"

**Files:**
- Modify: `src/ui/text-field.tsx` (`inputMode` aceita `'numeric'`)
- Create: `src/features/contas/recurrence-form.tsx`, `src/features/contas/receive-form.tsx`
- Test: `src/features/contas/recurrence-form.test.tsx`, `src/features/contas/receive-form.test.tsx`

**Interfaces:**
- Consumes: `TextField`, `FormAlert`, `Button`, `CHIP`, `FrequencyField` (Task 7), `INCOME_SOURCES`, `centsToInput` (`@/features/registro/form-values`), `monthName`, `RecurrenceRow` (Task 3), `Category`, `createBill`/`updateRecurrence`/`confirmIncome` (Tasks 5–6), `idle`/`FormState`.
- Produces:
  - `RecurrenceForm({ kind, categories, action, recurrence }: { kind: 'expense' | 'income'; categories: Category[]; action: (s: FormState, fd: FormData) => Promise<FormState>; recurrence?: RecurrenceRow })`. Campos: "Nome" (`name`), "Valor" (`amount`, decimal), gasto → chips "Com o quê?" (`categoryId`); entrada → chips "De onde veio?" (`source`); **só ao criar**: `FrequencyField` com legenda visível "Com que frequência?" e, se "Todo ano", `<select id="dueMonth" name="dueMonth">` rotulado "Mês" com os 12 meses (`monthName`); dia: "Vence dia" (gasto) ou "Chega dia" (entrada), `dueDay`, numérico. **Na edição**: `input hidden id`, e a frequência aparece só como texto ("Todo mês" ou `Todo ano · {mês}`). Botão "Salvar conta" (criar) ou "Salvar alterações" (editar). Erros de campo sob cada campo; `err.message` em `FormAlert`; mantém o que foi digitado.
  - `ReceiveForm({ id, amountCents }: { id: string; amountCents: number })` — `useActionState(confirmIncome, idle)`; campo "Quanto entrou?" (`amount`, mesmo visual grande do Anotar) preenchido com `centsToInput(amountCents)`; `input hidden id`; botão "Confirmar entrada" desativado enquanto salva.

- [ ] **Step 1: Testes que falham**

`src/features/contas/recurrence-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { RecurrenceForm } = await import('./recurrence-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()
const categories = [{ id: 'c1', name: 'Casa', defaultKey: 'casa' }, { id: 'c2', name: 'Mercado', defaultKey: 'mercado' }]

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Nova conta: nome, valor, categoria, frequência, dia; anual pede o mês', () => {
  render(<RecurrenceForm kind="expense" categories={categories} action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  expect(screen.getByLabelText('Nome')).toBeTruthy()
  expect(screen.getByLabelText('Valor').getAttribute('inputmode')).toBe('decimal')
  expect(screen.getByRole('radio', { name: 'Casa' })).toBeTruthy()
  expect(screen.getByLabelText('Vence dia').getAttribute('inputmode')).toBe('numeric')
  expect(screen.getByRole('radio', { name: 'Todo mês' })).toHaveProperty('checked', true)
  expect(screen.queryByLabelText('Mês')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Todo ano' }))
  const month = screen.getByLabelText('Mês') as HTMLSelectElement
  expect(within(month).getAllByRole('option').slice(1).map((o) => o.textContent)).toHaveLength(12)
  expect(within(month).getByRole('option', { name: 'janeiro' }).getAttribute('value')).toBe('1')
  expect(screen.getByRole('button', { name: 'Salvar conta' })).toBeTruthy()
})

test('editar entrada: origem e dia preenchidos, frequência só como texto', () => {
  render(
    <RecurrenceForm
      kind="income"
      categories={categories}
      action={action}
      recurrence={{ id: 'r3', kind: 'income', name: 'Freela', amountCents: 80000, categoryId: null, source: 'Freela', frequency: 'monthly', dueDay: 30, dueMonth: null, startsOn: '2026-09-30', endedOn: null }}
    />,
  )
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Freela')
  expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('800,00')
  expect(screen.getByRole('radio', { name: 'Freela' })).toHaveProperty('checked', true)
  expect((screen.getByLabelText('Chega dia') as HTMLInputElement).value).toBe('30')
  expect(screen.queryByRole('radio', { name: 'Todo ano' })).toBeNull()
  expect(screen.getByText('Todo mês')).toBeTruthy()
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('r3')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erros aparecem nos campos e o que foi digitado continua', () => {
  mockUseActionState.mockReturnValueOnce([
    {
      status: 'error', submission: 1,
      fieldErrors: { name: 'Falta o nome.', dueMonth: 'Escolha o mês.' },
      values: { name: '', amount: '180', categoryId: 'c2', frequency: 'yearly', dueDay: '10', dueMonth: '' },
    },
    vi.fn(),
    false,
  ])
  render(<RecurrenceForm kind="expense" categories={categories} action={action} />)
  expect(screen.getByText('Falta o nome.')).toBeTruthy()
  expect(screen.getByText('Escolha o mês.')).toBeTruthy()
  expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('180')
  expect(screen.getByRole('radio', { name: 'Mercado' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', true)
})
```

`src/features/contas/receive-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ confirmIncome: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { ReceiveForm } = await import('./receive-form')
const { confirmIncome } = await import('./actions')
const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('vem com o valor previsto para a pessoa ajustar', () => {
  render(<ReceiveForm id="fre" amountCents={80000} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(confirmIncome)
  expect((screen.getByLabelText('Quanto entrou?') as HTMLInputElement).value).toBe('800,00')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('fre')
  expect(screen.getByRole('button', { name: 'Confirmar entrada' })).toHaveProperty('disabled', false)
})

test('erro mostra a mensagem e mantém o valor digitado; botão trava enquanto salva', () => {
  mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } }, vi.fn(), false])
  const { rerender } = render(<ReceiveForm id="fre" amountCents={80000} />)
  expect(screen.getByText('Falta o valor.')).toBeTruthy()
  expect((screen.getByLabelText('Quanto entrou?') as HTMLInputElement).value).toBe('')
  mockUseActionState.mockReturnValueOnce([{ status: 'idle' }, vi.fn(), true])
  rerender(<ReceiveForm id="fre" amountCents={80000} />)
  expect(screen.getByRole('button', { name: 'Confirmar entrada' })).toHaveProperty('disabled', true)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/contas/recurrence-form.test.tsx src/features/contas/receive-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./recurrence-form"` / `"./receive-form"`.

- [ ] **Step 3: Implementação**

- `text-field.tsx`: `inputMode?: 'text' | 'decimal' | 'email' | 'numeric'`.
- `recurrence-form.tsx` (`'use client'`): valores iniciais = `err?.values` ou, na edição, `{ name, amount: centsToInput(amountCents), categoryId, source, dueDay: String(dueDay) }`; `useState<Frequency>` inicial `v.frequency === 'yearly' ? 'yearly' : 'monthly'`; `<form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-5">`. O `<select>` de mês começa com `<option value="">` vazio (texto vazio) seguido de `1..12` com `monthName(n)`. Chips com `CHIP` e rádios `sr-only`, iguais ao Anotar. Erros com `id="{campo}-error"` e `aria-describedby`.
- `receive-form.tsx` (`'use client'`): mesmo campo grande de valor do `AnotarForm` (classes do `#amount`), `FormAlert` para `err.message`, `Button type="submit" disabled={pending} className="h-[52px]"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/contas src/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/text-field.tsx src/features/contas/recurrence-form.tsx src/features/contas/recurrence-form.test.tsx src/features/contas/receive-form.tsx src/features/contas/receive-form.test.tsx
git commit -m "feat(contas): formulários de nova conta, editar recorrência e Recebi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Páginas de Contas e navegação

**Files:**
- Create: `src/app/(app)/contas/page.tsx`, `src/app/(app)/contas/nova/page.tsx`, `src/app/(app)/contas/recorrencia/[id]/page.tsx`, `src/app/(app)/contas/receber/[id]/page.tsx`
- Modify: `src/features/shell/nav-items.ts`, `src/app/(app)/mais/page.tsx`
- Test: `src/features/shell/nav-items.test.ts`, `src/features/shell/nav.test.tsx`, `src/features/shell/sidebar.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `loadLedger`, `loadCategories`, `loadTransaction` (registro), `loadRecurrences`/`loadRecurrence` (Task 3), `buildContas`/`parseContasTab`/`txName` (Task 4), `ContasTabs`/`BillsList`/`IncomeList`/`RecurringList`/`contasHref` (Task 9), `RecurrenceForm`/`ReceiveForm` (Task 10), `createBill`/`updateRecurrence`/`endRecurrence` (Tasks 5–6), `MonthNav` (`basePath`, `query`), `PageHeader`, `Button`, `Money`, `ConfirmAction`, `FormAlert`, `SheetClose`, `dayMonthLabel`.
- Produces:
  - Item de navegação `{ href: '/contas', label: 'Contas', icon: CalendarDays, match: ['/contas'] }`: no menu lateral logo depois de Extrato; "Mais" (barra do celular) passa a casar também com `/contas`; linha "Contas" em `/mais` antes de "Categorias". Barra inferior sem mudança.
  - `isSheetRoute('/contas/receber/{id}') === true` (painel sem barra inferior).
  - `/contas` — cabeçalho "Contas" (Voltar para `/mais` só no celular) com botão "Nova conta" (`/contas/nova`); `MonthNav basePath="/contas"` com `query` `{ aba }` fora de `a-pagar`; `?erro=1` mostra `FormAlert` "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; abas; resumo `data-testid="contas-resumo"` (cartão verde claro: `aPagarLabel` + valor, "Disponível depois" + valor); `BillsList` com `back = contasHref(month, tab)`; `IncomeList` só se houver itens; `RecurringList` "Contas que se repetem" (vazio: "Nenhuma conta que se repete ainda.") e, só se houver, "Entradas que se repetem".
  - `/contas/nova` — `PageHeader` "Nova conta" (volta a `/contas`) + `RecurrenceForm kind="expense" action={createBill}`.
  - `/contas/recorrencia/[id]` — id inválido ou recorrência inexistente/encerrada → `notFound()`; `PageHeader` com o nome; `?erro=1` → `FormAlert`; `RecurrenceForm` em edição com `updateRecurrence`; `ConfirmAction` "Encerrar" → título `Encerrar "{nome}"?`, corpo "As próximas não serão criadas. O que já foi pago continua no Extrato.", "Encerrar" · "Cancelar", `endRecurrence`, `fields={{ id }}`.
  - `/contas/receber/[id]` — painel (mesmo layout de `extrato/[id]`); só entrada `pending` da pessoa (`loadTransaction` já filtra `user_id`), senão `notFound()`; título = `txName(tx, [])`; legenda `previsto para {d de mês}`; `SheetClose href="/contas"`; `ReceiveForm`.

- [ ] **Step 1: Testes que falham** — ajustar os testes da navegação:

Em `sidebar.test.tsx`, a lista esperada passa a ser:

```ts
expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Contas', 'Categorias', 'Configurações'])
```

Em `nav-items.test.ts`:

```ts
test('Contas: menu lateral depois de Extrato; no celular fica dentro de Mais', () => {
  expect(SIDEBAR_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/contas', '/categorias', '/configuracoes'])
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/mais'])
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(isActive('/contas', mais)).toBe(true)
  expect(isActive('/contas/recorrencia/abc', mais)).toBe(true)
})

test('painel "Recebi" cobre a tela; a lista de contas não', () => {
  expect(isSheetRoute('/contas/receber/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/contas')).toBe(false)
  expect(isSheetRoute('/contas/receber')).toBe(false)
  expect(isSheetRoute('/contas/nova')).toBe(false)
})
```

Em `nav.test.tsx`, o laço do teste "Categorias e Configurações ficam dentro de Mais" passa a ser `for (const p of ['/mais', '/contas', '/contas/nova', '/categorias', '/categorias/nova', '/configuracoes/nome'])`, e o laço do teste "barra inferior fica escondida…" ganha `'/contas/receber/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — lista do menu sem "Contas"; `isSheetRoute('/contas/receber/…')` é `false`.

- [ ] **Step 3: Implementação**

- `nav-items.ts`: item `CONTAS` (ícone `CalendarDays` do lucide), inserido em `SIDEBAR_ITEMS`; `match` do "Mais" = `['/mais', '/contas', '/categorias', '/configuracoes']`; em `isSheetRoute`, `if (/^\/contas\/receber\/[^/]+$/.test(pathname)) return true`.
- `mais/page.tsx`: primeira linha do `ListCard` de navegação `RowLink href="/contas" title="Contas"` com `CalendarDays`; atualizar o comentário (Contas já existe).
- `contas/page.tsx`:

```tsx
export default async function ContasPage({ searchParams }: { searchParams: Promise<{ mes?: string; aba?: string; erro?: string }> }) {
  const today = todayInSaoPaulo()
  const { mes, aba, erro } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const tab = parseContasTab(aba)
  // loadLedger gera as ocorrências do mês antes de ler (Task 3).
  const [{ profile, categories, transactions }, recurrences] = await Promise.all([loadLedger(), loadRecurrences()])
  const v = buildContas({ month, today, tab, profile, categories, transactions, recurrences })
  const back = contasHref(month, tab)
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7">
      <div className="flex items-center gap-2">
        <div className="flex-1"><PageHeader title="Contas" backHref="/mais" backOnMobileOnly /></div>
        <Button href="/contas/nova" variant="secondary" className="min-h-11 px-4 text-sm">Nova conta</Button>
      </div>
      <MonthNav month={month} label={v.label} basePath="/contas" query={tab === 'a-pagar' ? {} : { aba: tab }} />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <ContasTabs month={month} tab={tab} counts={v.counts} />
      <section data-testid="contas-resumo" className="flex flex-col gap-2 rounded-card border border-brand-wash-border bg-brand-wash p-4">
        <div className="flex justify-between"><span>{v.aPagarLabel}</span><Money cents={v.aPagarCents} className="font-semibold text-ink" /></div>
        <div className="flex justify-between"><span>Disponível depois</span><Money cents={v.disponivelDepoisCents} className="font-semibold text-brand-ink" /></div>
      </section>
      <BillsList tab={tab} bills={v.bills} back={back} />
      {v.incomes.length > 0 && <IncomeList items={v.incomes} />}
      <RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={v.recurringBills} />
      {v.recurringIncomes.length > 0 && <RecurringList title="Entradas que se repetem" empty="" items={v.recurringIncomes} />}
    </main>
  )
}
```

- As outras três páginas seguem o padrão de `categorias/[id]/page.tsx` (validação `z.uuid()`, `notFound()`, `Promise.all` de `params`/`searchParams`) e de `extrato/[id]/page.tsx` (painel com `data-sheet`, `SheetClose`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos os testes PASS; sem erros de tipo e de lint; build com as rotas `/contas`, `/contas/nova`, `/contas/recorrencia/[id]`, `/contas/receber/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/contas" "src/app/(app)/mais/page.tsx" src/features/shell
git commit -m "feat(contas): telas de Contas, Nova conta, editar recorrência e Recebi; Contas na navegação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Seu mês — "Próximas contas"

**Files:**
- Modify: `src/features/seu-mes/view-model.ts`, `src/app/(app)/inicio/page.tsx`
- Create: `src/features/seu-mes/upcoming-bills.tsx`
- Test: `src/features/seu-mes/view-model.test.ts` (acrescentar), `src/features/seu-mes/upcoming-bills.test.tsx`

**Interfaces:**
- Consumes: `dueText` (Task 1), `txName` (Task 4), `PayBillButton` (Task 9), `Money`.
- Produces:
  - `SeuMesView.upcoming: { id: string; name: string; amountCents: number; dueText: string }[]` — só no mês atual; contas `pending` com vencimento até o fim do mês (inclui vencidas de meses anteriores), por vencimento crescente, no máximo 3. Em outros meses, `[]`.
  - `UpcomingBills({ items }: { items: SeuMesView['upcoming'] })` — `<section aria-labelledby="proximas-contas">` com título "Próximas contas", link "Ver todas" (`/contas`), cada linha "**{nome}** {dueText}", valor e `PayBillButton` (rótulo completo "Marcar como paga", `back="/inicio"`).
  - `/inicio` mostra o bloco depois da coluna do maior gasto/Saldo total, só quando `v.upcoming.length > 0`.

- [ ] **Step 1: Testes que falham**

Em `src/features/seu-mes/view-model.test.ts`:

```ts
test('Próximas contas: vencidas primeiro, até 3, só no mês atual', () => {
  const bill = (id: string, note: string, dueOn: string, extra: Partial<TxRow> = {}) =>
    row({ id, kind: 'expense', amountCents: 1000, occurredOn: dueOn, dueOn, status: 'pending', note, categoryId: 'c1', ...extra })
  const transactions = [
    bill('luz', 'Luz', '2026-09-25'),
    bill('agua', 'Água', '2026-09-10'),
    bill('gas', 'Gás', '2026-08-20'),
    bill('net', 'Internet', '2026-09-28'),
    bill('out', 'Outubro', '2026-10-05'),
    bill('paga', 'Paga', '2026-09-23', { status: 'confirmed', paidOn: '2026-09-21' }),
    row({ id: 'fre', kind: 'income', amountCents: 80000, occurredOn: '2026-09-24', dueOn: '2026-09-24', status: 'pending' }),
  ]
  const profile = { displayName: 'C', initialBalanceCents: 0 }
  const v = buildSeuMes({ month: '2026-09', today: '2026-09-22', profile, categories, transactions })
  expect(v.upcoming.map((u) => [u.name, u.dueText])).toEqual([
    ['Gás', 'venceu em 20 de agosto'],
    ['Água', 'venceu em 10 de setembro'],
    ['Luz', 'vence em 3 dias'],
  ])
  expect(buildSeuMes({ month: '2026-08', today: '2026-09-22', profile, categories, transactions }).upcoming).toEqual([])
})
```

`src/features/seu-mes/upcoming-bills.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('@/features/contas/actions', () => ({ markBillPaid: vi.fn() }))
const { UpcomingBills } = await import('./upcoming-bills')

afterEach(() => cleanup())

test('bloco do protótipo: nome, prazo, valor, "Marcar como paga" e "Ver todas"', () => {
  render(<UpcomingBills items={[{ id: 'luz', name: 'Luz', amountCents: 18000, dueText: 'vence em 3 dias' }]} />)
  const region = screen.getByRole('region', { name: 'Próximas contas' })
  expect(region.textContent).toContain('Luz vence em 3 dias')
  expect(region.textContent).toContain('180,00')
  const pay = within(region).getByRole('button', { name: 'Marcar Luz como paga' })
  expect(pay.textContent).toBe('Marcar como paga')
  expect(within(region).getByRole('link', { name: 'Ver todas' }).getAttribute('href')).toBe('/contas')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/seu-mes`
Expected: FAIL — `v.upcoming` indefinido; `Failed to resolve import "./upcoming-bills"`.

- [ ] **Step 3: Implementação** — em `buildSeuMes`, `upcoming` filtra `t.kind === 'expense' && t.status === 'pending' && t.dueOn !== null && monthOf(t.dueOn) <= month` quando `month === monthOf(today)`, ordena por `dueOn`, corta em 3 e mapeia `{ id, name: txName(t, categories), amountCents, dueText: dueText(t.dueOn, today) }`. `UpcomingBills` usa as classes do `Card` (`rounded-card border border-line bg-card p-5 shadow-card`) numa `<section>` própria (para ter o `aria-labelledby`); título `<h2 id="proximas-contas" className="text-[17px] font-semibold text-ink">`; "Ver todas" com o estilo de link verde (`text-sm font-medium text-brand-text`); cada linha `<p><strong className="font-medium text-ink">{name}</strong>{' '}{dueText}</p>` (o espaço é o que faz o texto ler "Luz vence em 3 dias"). Em `inicio/page.tsx`, `{v.upcoming.length > 0 && <UpcomingBills items={v.upcoming} />}` antes de `CategoriesCard`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/seu-mes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/seu-mes "src/app/(app)/inicio/page.tsx"
git commit -m "feat(seu-mes): bloco Próximas contas com marcar como paga" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ponta a ponta, verificação completa e registro

**Files:**
- Create: `tests/e2e/plano3.spec.ts`
- Modify: `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo acima; `todayInSaoPaulo`, `addDays`, `addMonths`, `monthOf`, `dayMonthLabel` (`src/domain/dates`), `monthName` (`src/domain/recurrence`).
- Produces: 3 testes (celular: 2; desktop: 1) → 6 entradas em `npx playwright test --list` para este arquivo.

- [ ] **Step 1: Escrever os testes de ponta a ponta** — `tests/e2e/plano3.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addDays, addMonths, dayMonthLabel, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { monthName } from '../../src/domain/recurrence'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
const NBSP = String.fromCharCode(0xa0)
const RUN_PREFIX = 'e2e-p3-'
const today = todayInSaoPaulo()
const day = Number(today.slice(8, 10))

async function makeUser(name: string): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
  if (e2) throw e2
  return { id: data.user.id, email }
}

async function categoryOf(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

async function addTx(userId: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('transactions').insert({ user_id: userId, ...row })
  if (error) throw error
}

async function addRecurrence(userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('recurrences').insert({ user_id: userId, ...row }).select('id').single()
  if (error) throw error
  return data.id
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

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

test('conta que se repete: criar, aparece a pagar, marcar como paga pelo Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await addTx(u.id, { kind: 'income', amount_cents: 100000, source: 'Salário', occurred_on: today })
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais' }).click()
  await page.getByRole('link', { name: 'Contas' }).click()
  await expect(page.getByRole('heading', { name: 'Contas' })).toBeVisible()
  await page.getByRole('link', { name: 'Nova conta' }).click()
  await page.getByLabel('Nome').fill('Luz')
  await page.getByLabel('Valor').fill('180')
  await page.getByText('Casa', { exact: true }).click()
  await page.getByLabel('Vence dia').fill(String(day))
  await page.getByRole('button', { name: 'Salvar conta' }).click()

  await expect(page.getByRole('status')).toContainText('Conta criada.')
  await expect(page.getByRole('link', { name: 'A pagar · 1' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(`R$${NBSP}180,00 · vence dia ${day} · hoje`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contas que se repetem' })).toContainText(`Todo mês · dia ${day}`)
  const resumo = page.getByTestId('contas-resumo')
  await expect(resumo).toContainText(`R$${NBSP}180,00`)
  await expect(resumo).toContainText(`R$${NBSP}820,00`)

  // Recarregar não cria outra ocorrência (Review Focus 1).
  await page.reload()
  await expect(page.getByRole('link', { name: 'A pagar · 1' })).toBeVisible()

  await page.goto('/inicio')
  const proximas = page.getByRole('region', { name: 'Próximas contas' })
  await expect(proximas).toContainText('Luz vence hoje')
  await expect(page.getByText('Disponível depois das contas').locator('..')).toContainText(`R$${NBSP}820,00`)
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}1.000,00`)

  await proximas.getByRole('button', { name: 'Marcar Luz como paga' }).click()
  await page.getByRole('alertdialog', { name: 'Marcar Luz como paga?' }).getByRole('button', { name: 'Marcar como paga' }).click()
  await expect(page.getByRole('status')).toContainText('Conta marcada como paga.')
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}820,00`)
  await expect(page.getByText('Disponível depois das contas').locator('..')).toContainText(`R$${NBSP}820,00`)
  await expect(page.getByRole('region', { name: 'Próximas contas' })).toHaveCount(0)

  await page.goto('/contas?aba=pagas')
  await expect(page.getByText(`R$${NBSP}180,00 · paga em ${dayMonthLabel(today)}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'A pagar · 0' })).toBeVisible()
})

test('entrada que se repete: Recebi com valor ajustado; Anotar com "Isso se repete"', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await addRecurrence(u.id, {
    kind: 'income', name: 'Freela', amount_cents: 80000, source: 'Freela', frequency: 'monthly', due_day: day, starts_on: today,
  })
  await entrar(page, u.email)

  await page.goto('/contas')
  const receber = page.getByRole('region', { name: 'Entradas a receber' })
  await expect(receber).toContainText(`R$${NBSP}800,00 · previsto para dia ${day}`)
  await receber.getByRole('link', { name: 'Recebi Freela' }).click()
  await expect(page.getByLabel('Quanto entrou?')).toHaveValue('800,00')
  await page.getByLabel('Quanto entrou?').fill('750')
  await page.getByRole('button', { name: 'Confirmar entrada' }).click()
  await expect(page.getByRole('status')).toContainText(`Anotado. Mais R$${NBSP}750,00 no seu mês.`)
  await expect(page.getByRole('region', { name: 'Entradas a receber' })).toHaveCount(0)

  await page.goto('/inicio')
  await expect(page.getByText('Entrou', { exact: true }).locator('..')).toContainText(`R$${NBSP}750,00`)

  await page.goto('/anotar?tipo=entrada')
  await page.getByLabel('Quanto entrou?').fill('5000')
  await page.getByText('Salário', { exact: true }).click()
  await page.getByLabel('Isso se repete').check()
  await page.getByText('Todo ano', { exact: true }).click()
  await page.getByRole('button', { name: 'Salvar entrada' }).click()
  await expect(page.getByRole('status')).toContainText('Anotado.')

  await page.goto('/contas')
  const entradas = page.getByRole('region', { name: 'Entradas que se repetem' })
  await expect(entradas).toContainText('Salário')
  await expect(entradas).toContainText(`Todo ano · ${monthName(Number(today.slice(5, 7)))}`)
})

test('desktop: Contas no menu lateral; vencida aparece calma; encerrar mantém o histórico', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  const casa = await categoryOf(u.id, 'casa')
  const yesterday = addDays(today, -1)
  await addTx(u.id, { kind: 'expense', amount_cents: 12000, category_id: casa, note: 'Internet', occurred_on: yesterday, due_on: yesterday, status: 'pending' })
  await addRecurrence(u.id, {
    kind: 'expense', name: 'Academia', amount_cents: 9000, category_id: casa, frequency: 'monthly', due_day: 5,
    starts_on: `${addMonths(monthOf(today), 1)}-05`,
  })
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Contas' }).click()
  await expect(page).toHaveURL(/\/contas$/)
  await page.getByRole('link', { name: 'Vencidas · 1' }).click()
  await expect(page.getByText(`R$${NBSP}120,00 · venceu em ${dayMonthLabel(yesterday)}`)).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/atrasad/i)

  await page.getByRole('link', { name: /Academia/ }).click()
  await expect(page.getByRole('heading', { name: 'Academia' })).toBeVisible()
  await page.getByRole('button', { name: 'Encerrar' }).click()
  await page.getByRole('alertdialog', { name: 'Encerrar "Academia"?' }).getByRole('button', { name: 'Encerrar' }).click()
  await expect(page.getByRole('status')).toContainText('Encerrada. O histórico continua no Extrato.')
  await expect(page.getByRole('region', { name: 'Contas que se repetem' })).toContainText('Nenhuma conta que se repete ainda.')
})
```

- [ ] **Step 2: Conferir a lista e rodar**

Run: `npx playwright test --list tests/e2e/plano3.spec.ts`
Expected: 6 entradas (3 testes × 2 projetos; os `test.skip` de projeto são resolvidos ao rodar).

Run (com Docker): `npx supabase db reset && npm run test:db && npm run test:e2e`
Expected: PASS em todos os arquivos (`nucleo`, `plano2`, `plano3`). Sem Docker: registrar como pendente.

- [ ] **Step 3: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes unitários e de componentes passando; tipos, lint e build sem erros. Conferir no código que nenhum texto novo usa "atrasad", "conta" para entrada/acesso, ou vermelho de alerta: `grep -rniE "atrasad|text-red|bg-red" src/features/contas src/features/seu-mes src/app/\(app\)/contas` → sem resultados.

- [ ] **Step 4: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 3 — Contas e recorrências · concluído em {data}

**Entregue**
- Contas e entradas que se repetem (todo mês ou todo ano), criadas pelo Anotar ("É uma conta que se repete", "Isso se repete") ou por "Nova conta".
- Contas: a pagar, pagas e vencidas por mês, "A pagar em {mês}" e "Disponível depois", entradas a receber com "Recebi" (valor ajustável), contas e entradas que se repetem (alterar e encerrar sem apagar o histórico).
- Marcar como paga pela lista ou pelo Seu mês ("Próximas contas"); conta paga com atraso conta no mês em que foi paga (A1).
- Ocorrências geradas ao abrir o app, sem duplicar; dia 29–31 ajustado ao tamanho do mês.
- Contas no menu lateral (desktop) e em Mais (celular).

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco ({n} testes em `plano3.test.ts`) e ponta a ponta (`plano3.spec.ts`: 3 testes — celular: 2, desktop: 1): {rodados | pendentes do Docker}.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 3` com a tabela da seção "Decisões tomadas neste plano" abaixo (numeração 27–44), e ao fim da seção de textos novos a linha `Plano 3: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-09-26-iris-plano-3-contas-recorrencias.md\`.` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plano3.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): contas e recorrências; progresso e decisões do Plano 3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica as três migrações (`…_nucleo`, `…_categorias_e_onboarding`, `…_contas_e_recorrencias`).
3. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras, formulários, ações (Supabase simulado com filtros conferidos) e componentes
- `npm run test:db` — privacidade, geração idempotente, ajuste de dia, alterar/encerrar, categorias
- `npm run test:e2e` — fluxos no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| Tabela `recurrences` (dono, tipo, valor, categoria/origem, nome, frequência, dia, mês, início, fim, ativa), RLS, FKs compostas | Task 2 |
| `transactions.recurrence_id` + índice; ocorrência única por mês (`recurrence_period`) | Task 2 |
| Geração idempotente ao abrir o app (mês atual; anual no seu mês), dia 29–31 ajustado | Tasks 1, 2, 3 |
| Ocorrência pendente: `pending`, `due_on`, `occurred_on` = vencimento | Task 2 |
| RN-11 conta só sai do Disponível quando paga; A1 no mês do pagamento | Tasks 5, 12 (via `summarizeMonth` existente), 13 |
| RN-12 entrada a receber só conta quando confirmada; RF-17 ajustar o valor | Tasks 5, 10, 11, 13 |
| RF-16 marcar como paga pela lista e pelo Seu mês (notificação: Plano 8) | Tasks 5, 9, 12 |
| RF-10/11 "se repete" no Anotar (Todo mês / Todo ano) | Task 7 |
| "Nova conta" em /contas | Tasks 6, 10, 11 |
| RF-18 alterar (só as ainda não vencidas) e encerrar sem apagar histórico | Tasks 2, 6, 10, 11 |
| RF-15 /contas: abas A pagar / Pagas / Vencidas, "A pagar em {mês}", "Disponível depois", "Entradas a receber", "Contas que se repetem" | Tasks 4, 9, 11 |
| Seu mês: "Próximas contas" + "Ver todas"; "Disponível depois das contas" já calculado | Task 12 |
| Contas no menu lateral e em Mais; barra inferior igual | Task 11 |
| Extrato: pagas no dia do pagamento; pendentes fora; edição de conta paga coerente | Task 8 (o resto já vale por `effectiveDate`) |
| Categoria excluída com conta que se repete | Task 2 |
| Testes unitários, de componente, banco e ponta a ponta | Todas; Task 13 |
| Textos novos listados | Seção "Textos novos" |

**Busca por marcadores proibidos:** nenhum "TBD", "a definir" ou "similar à Task N". Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 13, Step 4), que são valores da execução.

**Consistência de tipos e nomes:** `RecurrenceRule`/`Frequency`/`dueDateIn`/`nextDueOnOrAfter`/`relativeDue`/`dueText`/`recurrenceLabel`/`monthName`/`dayMonthLabel` (1 → 2, 4, 6, 10, 12, 13); `RecurrenceRow`/`toRecurrenceRow`/`loadRecurrences`/`loadRecurrence` (3 → 4, 10, 11); `ensureOccurrences` (3); `ContasTab`/`ContasItem`/`RecurringItem`/`buildContas`/`parseContasTab`/`txName` (4 → 9, 11, 12); `refreshMoneyViews` (5 → 6, 7); `amountField` (5 → 6, 7 — renomeado de `amount` em `registro/schemas.ts`); `safeReturnPath` (5); `markBillPaid`/`confirmIncome`/`createBill`/`updateRecurrence`/`endRecurrence` (5–6 → 9–12); `parseRepeat`/`CHIP`/`INCOME_SOURCES`/`FrequencyField` (7 → 10); `PayBillButton`/`contasHref` (9 → 11, 12); RPCs `generate_occurrences()`, `create_recurring_transaction(p_kind, p_amount_cents, p_category_id, p_source, p_note, p_payment_method, p_occurred_on, p_frequency)`, `update_recurrence(p_id, p_name, p_amount_cents, p_category_id, p_source, p_due_day)`, `end_recurrence(p_id)` (2 → 3, 6, 7).

**Review Focus → testes:** 1 → Task 2 (`abrir de novo não duplica…`, `conta paga e depois excluída não volta`) e Task 13 (recarregar); 2 → Task 1 (`dia de vencimento ajustado ao mês`), Task 2 (`o banco ajusta o dia igual ao app`), Task 6 (`anual em 29 de fevereiro…`); 3 → Task 2 (`a conta vai para "Outros"…`); 4 → Task 5 (`toque duplo…`, `endereço de volta adulterado…`, `return-path.test.ts`); 5 → Task 8 (`conta paga: a data editada é o dia do pagamento…`).

**Proporção:** SQL e testes vêm completos (são o contrato); componentes e ações vêm por assinatura, regras e textos exatos, com código só onde o teste não decide (algoritmo de próximo vencimento, `safeReturnPath`, página `/contas`).

---

## Conflitos encontrados na especificação

1. **Etapa 3 §5 (gerar todo dia às 00h05 e ao abrir o app) × roteiro (tarefas agendadas no Plano 8):** aqui só "ao abrir o app"; a tarefa diária entra no Plano 8 chamando a mesma lógica. Até lá, quem fica mais de 2 meses sem abrir recebe só os 3 últimos meses (decisão 29).
2. **Etapa 3 §3.1 lista "fim" e "ativa" separados:** implementado como `ended_on` (fim); "ativa" = `ended_on` vazio, para não existirem dois campos que podem se contradizer. `generated_through` foi acrescentado (controle da geração).
3. **Terminologia ("conta" = só a pagar) × uma tela "Contas" que também lista entradas a receber:** mantido o nome aprovado da tela; as entradas aparecem com os rótulos próprios "Entradas a receber" (protótipo) e "Entradas que se repetem" (novo), nunca como "conta". "Nova conta" cria só contas; entrada que se repete nasce no Registrar entrada.
4. **Copy "{conta} vence em {n} dias." só cobre n ≥ 2:** para hoje, amanhã e vencidas foram necessários textos novos ("vence hoje", "vence amanhã", "venceu em {dia}").
5. **Protótipo usa "Paga" no botão da lista; a copy aprovada diz "Marcar como paga":** na lista de Contas, "Paga" (protótipo) com nome acessível "Marcar {conta} como paga"; no Seu mês, "Marcar como paga" (copy e protótipo do Seu mês).
6. **RF-16 inclui marcar como paga pela notificação:** fica para o Plano 8 (push).
7. **Roteiro: "criar conta recorrente" seria desenhada no início do plano:** a tela "Nova conta" segue o visual aprovado (formulário igual ao Anotar, segmentado Todo mês / Todo ano do protótipo Registrar entrada) — registrado para revisão (decisão 32).
8. **Família em `recurrences` (etapa 3 §3.1, RN-20):** a coluna e as regras de conta da família entram no Plano 7.

---

## Decisões tomadas neste plano

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

## Textos novos

Fora da copy oficial e do protótipo aprovado; precisam da sua aprovação:

- Anotar: "Com que frequência?" (rótulo do grupo Todo mês / Todo ano; visível em Nova conta, lido por leitor de tela no Anotar)
- Prazos: "vence hoje" · "vence amanhã" · "venceu em {dia de mês}" · "vence dia {d} · hoje" / "· amanhã" (a forma "vence dia {d} · em {n} dias" e "vence em {n} dias" são do protótipo e da copy) · "paga em {dia de mês}" · "previsto para {dia de mês}" (quando é de outro mês; "previsto para dia {d}" é do protótipo)
- Contas, listas vazias: "Nenhuma conta a pagar neste mês." · "Nenhuma conta paga neste mês." · "Nenhuma conta vencida." · "Nenhuma conta que se repete ainda."
- Contas: "Entradas que se repetem" (título) · "Situação das contas" (rótulo acessível das abas) · "Recebi {nome}" (rótulo acessível do link "Recebi") · "Marcar {conta} como paga" (rótulo acessível do botão "Paga"; mesmo texto da confirmação sem "?")
- Nova conta / editar: "Nome" (já aprovado em Categorias) · "Valor" · "Vence dia" · "Chega dia" · "Mês" · "Salvar conta" · "Falta o nome." · "Escolha o mês." · "Conta criada."
- Encerrar: "Encerrar" · "Encerrar "{nome}"?" · "As próximas não serão criadas. O que já foi pago continua no Extrato." · "Encerrada. O histórico continua no Extrato."
- Recebi: "Confirmar entrada"
- Nome padrão de entrada que se repete sem origem: "Entrada" (já usado no Seu mês desde o Plano 1)

Da copy oficial ou do protótipo, usados aqui: "Contas", "Nova conta", "A pagar · {n}", "Pagas · {n}", "Vencidas · {n}", "A pagar em {mês}", "Disponível depois", "Entradas a receber", "Recebi", "Contas que se repetem", "Todo mês · dia {d}", "Todo ano · {mês}", "Paga", "Próximas contas", "Ver todas", "{conta} vence em {n} dias", "Marcar {conta} como paga?", "Marcar como paga", "Agora não", "Conta marcada como paga.", "É uma conta que se repete", "Isso se repete", "Todo mês", "Todo ano", "Quanto entrou?", "Anotado. Mais {valor} no seu mês.", "Alterações salvas.", "Cancelar".
