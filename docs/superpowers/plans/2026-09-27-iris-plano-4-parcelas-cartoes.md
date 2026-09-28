# Íris — Plano 4: Parcelas e cartões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa cadastra cartões ilustrativos (apelido, tipo, cor — nenhum número), escolhe o cartão com um toque no Anotar (o da última compra já vem marcado), vê em `/cartoes` quanto gastou com cada cartão no mês e abre os gastos dele no Extrato; anota uma compra "Foi parcelado" (total + nº de parcelas → uma parcela por mês, a 1ª no mês da compra), vê as parcelas, quita antecipadamente ou cancela por devolução. Excluir um cartão nunca muda valores: os gastos ficam como "Cartão excluído".

**Architecture:** Mesma base dos Planos 1–3. Duas tabelas novas — `cards` e `installment_plans` — e cinco colunas em `transactions` (`card_id`, `card_deleted`, `installment_plan_id`, `installment_number`, `installment_count`), com FKs compostas `(x_id, user_id)`. As parcelas são registros **confirmados** já datados nos meses seguintes (decisão 2: aparecem em "Saiu" do mês delas; o Saldo total só conta até hoje) — `summarizeMonth` não muda. Criar, quitar, devolver e excluir uma compra parcelada, e excluir um cartão, são funções SQL atômicas (`security invoker`, `search_path = ''`, usuário de `auth.uid()`). A divisão dos centavos e as datas das parcelas ficam puras em `src/domain/installments.ts` e têm espelho SQL (`installment_schedule`) conferido por teste de banco. O total por cartão é `spentByCard` em `src/domain/cards.ts` (mesma regra de mês de `effectiveDate`). Com cartão, `payment_method` fica vazio: o tipo vem do cartão (fonte única).

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-10 atalhos de cartão K6 A, RF-14, RF-58–61, RN-06–09, RN-29–32, terminologia §1.1), `docs/etapa-3-arquitetura.md` (§2 operações atômicas, §3.1 `transactions`/`installment_plans` — "centavos que sobram da divisão vão para a 1ª parcela", §3.2, §6 páginas), `docs/etapa-5-ui.md` (tokens, V6 cartão desenhado, textos aprovados "Como pagou?" · "Outra forma" · "A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão."), `docs/etapa-7-roteiro.md` (escopo do Plano 4), `docs/decisoes-para-revisao.md` (decisões 1–44, obrigatórias), protótipo aprovado (Cartões — celular, Novo cartão — celular, Anotar gasto — celular/desktop, Extrato "parcela 2 de 5", Mais, Desktop), copy oficial (Claude Doc: "Foi parcelado", "Marcar…", confirmações, sucesso e erros).

## Global Constraints

- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`). `params`/`searchParams` de página são `Promise` e precisam de `await`.
- Idioma pt-BR, moeda somente R$ (RN-28). Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor e de `(now() at time zone 'America/Sao_Paulo')::date` dentro do SQL. Nunca aceitar "hoje" vindo do navegador.
- Dinheiro sempre em **centavos inteiros**; máximo `MAX_CENTS = 9_999_999_999`. Texto → centavos só por `parseBRL`; centavos → texto por `formatBRL` (NBSP entre `R$` e o número).
- Mês efetivo de um registro = `effectiveDate(tx)` = `paid_on ?? occurred_on`, só `status = 'confirmed'` (A1 B, RN-06: compra no cartão conta no mês da compra). Parcela = gasto confirmado com a data do mês dela.
- **"Futura"** = parcela com `occurred_on` **depois de hoje** em Brasília. A parcela de hoje já contou.
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar; **nunca "Fatura"** (RN-30). "Cartão" só para o cartão ilustrativo. Tom calmo: sem vermelho de alerta, sem exclamação.
- Todo texto visível vem da copy oficial, do protótipo aprovado, dos textos já aprovados em `docs/decisoes-para-revisao.md`, ou da seção "Textos novos" no fim deste plano.
- Alvos de toque ≥ 44 px (`min-h-11`/`size-11`); texto 15–16 px no celular; contraste WCAG AA; confirmações usam `ConfirmAction` de `src/ui/confirm.tsx`.
- Banco: **nunca editar** migrações já aplicadas (`20260922000001_nucleo.sql`, `20260925000001_categorias_e_onboarding.sql`, `20260926000001_contas_e_recorrencias.sql`, `20260927000001_nota_das_recorrencias.sql`); tudo deste plano vai em **`supabase/migrations/20260928000001_parcelas_e_cartoes.sql`**. RLS ligada em toda tabela nova. FKs compostas `(x_id, user_id)` e `on delete no action`. Funções: `security invoker`, `set search_path = ''`, nomes com `public.`, checam `auth.uid()`, filtram por `user_id`; `revoke execute … from public, anon` + `grant execute … to authenticated`.
- Servidor: o id da pessoa vem **só** de `requireUser()`, chamado no começo de toda Server Action e loader; nunca do formulário. Zod no servidor; formulários usam `FormState` (`errorState`, `firstFieldErrors`, `readFields`) e mantêm o que foi digitado. `redirect()` nunca dentro de `try`.
- **Defesa em profundidade:** toda leitura, alteração ou exclusão por id filtra por `id` **e** `user_id` (além da RLS); ações que mudam situação filtram também a situação esperada. Os testes de Server Action usam fakes encadeáveis do Supabase que registram cada `.eq`/`.is` e **afirmam os filtros**. **Nunca remover** um filtro de segurança existente para um teste passar.
- Módulos `'use server'` exportam **somente funções async** (constantes e tipos ficam em outros arquivos).
- Leituras do histórico completo sempre por `loadLedger()` (paginada, gera ocorrências antes). Depois de gravar dinheiro: `refreshMoneyViews()` (`/inicio`, `/extrato`, `/contas` e, a partir da Task 7, `/cartoes`). Depois de mudar cartões (nome, tipo, cor, excluir): `revalidatePath('/', 'layout')`.
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Componentes que importam Server Actions mockam o módulo de ações. Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `next/cache` e `next/navigation`; relógio falso em `2026-09-30T15:00:00Z` (hoje = `2026-09-30`).
- Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`.
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como **pendente** em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem atrapalhar a pessoa e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Total que não divide certinho** — "R$ 100,00 em 3x": a pessoa espera que as parcelas somem exatamente R$ 100,00, sem um centavo a mais ou a menos, e o mesmo resultado no app e no banco. → `splitInstallments` na **Task 1** (`centavos que sobram vão para a 1ª…`) e `o banco divide igual ao app` na **Task 2**.
2. **Compra no dia 29, 30 ou 31** — "10x a partir de 31 de janeiro": fevereiro não tem dia 31; a parcela deve cair no último dia do mês (decisão 28), igual no app e no banco. → **Task 1** (`dia que o mês não tem…`) e **Task 2** (mesmo teste de espelho).
3. **Quitar ou devolver no dia de uma parcela** — a parcela de hoje já contou no mês e não pode sumir; só as de amanhã em diante saem. → **Task 1** (`isFutureInstallment`) e **Task 2** (`quitar: as futuras saem…`, `sem parcela futura não há o que quitar`).
4. **Excluir um cartão que tem gastos, parcelas e uma conta que se repete** — valores iguais, Extrato mostra "Cartão excluído", o Anotar não tenta marcar um cartão que não existe, a próxima conta vem sem cartão. → **Task 2** (`excluir cartão…`), **Task 7** (`último usado que não existe mais…`), **Task 11** (`cartão excluído aparece como…`), e2e na **Task 12**.
5. **Toque duplo, página velha ou endereço digitado** — quitar duas vezes, devolver depois de quitar, compra de outra pessoa, ou abrir `/extrato/{id}` de uma parcela para mudar só o valor dela: nada de pagar duas vezes, nada de parcelas que não somam o total. → **Task 2** (`quitar duas vezes…`, privacidade), **Task 8** (`parcela não é editada nem excluída sozinha…`), **Task 9** (ações), **Task 10** (página redireciona).

---

## Estrutura de arquivos

```
supabase/migrations/20260928000001_parcelas_e_cartoes.sql   NOVO: cards, installment_plans, colunas em transactions/recurrences, funções
tests/db/plano4.test.ts                                      NOVO: privacidade, regras, espelho do calendário, criar/quitar/devolver/excluir, excluir cartão
tests/e2e/plano4.spec.ts                                     NOVO: cartão + Anotar + total + excluir; parcelado + quitar; desktop devolução + filtro
src/
  domain/installments.ts (+ .test.ts)                        NOVO: splitInstallments, futuras, rótulo "parcela n de N"
  domain/cards.ts (+ .test.ts)                               NOVO: spentByCard (RN-30)
  domain/dates.ts (+ dates.test.ts)                          MOD: dayMonthYearLabel
  lib/refresh.ts                                             MOD: refreshMoneyViews inclui /cartoes
  features/
    registro/tx-row.ts (+ .test.ts)                          NOVO: TxRow, TX_COLUMNS, toTxRow (saem de queries.ts, + cartão e parcela)
    registro/queries.ts                                      MOD: usa tx-row; reexporta TxRow
    registro/schemas.ts (+ .test.ts)                         MOD: cardId no gasto; readInstallments
    registro/form-values.ts (+ .test.ts)                     MOD: cardId no registro editável
    registro/actions.ts (+ .test.ts)                         MOD: cartão, parcelado, parcelas protegidas
    registro/anotar-form.tsx (+ .test.tsx)                   MOD: "Como pagou?", "Foi parcelado"
    cartoes/types.ts (+ .test.ts)                            NOVO: CardRow, rótulos de tipo, paymentText
    cartoes/palette.ts (+ .test.ts)                          NOVO: 6 cores do protótipo
    cartoes/queries.ts                                       NOVO: loadCards, loadCard, loadLastCardId
    cartoes/schemas.ts (+ .test.ts)                          NOVO: cardSchema
    cartoes/actions.ts (+ .test.ts)                          NOVO: createCard, updateCard, deleteCard
    cartoes/view-model.ts (+ .test.ts)                       NOVO: buildCartoes
    cartoes/card-face.tsx, card-form.tsx, cards-list.tsx (+ testes)  NOVO
    parcelas/types.ts (+ .test.ts)                           NOVO: PlanRow, toPlanRow
    parcelas/queries.ts                                      NOVO: loadPurchase
    parcelas/view-model.ts (+ .test.ts)                      NOVO: buildPurchase
    parcelas/actions.ts (+ .test.ts)                         NOVO: settlePurchase, refundPurchase, deletePurchase
    parcelas/settle-form.tsx (+ .test.tsx)                   NOVO
    extrato/view-model.ts, filters-bar.tsx, extrato-list.tsx (+ testes)  MOD: filtro Cartão, cartão na linha, "parcela n de N", link da compra
    shell/nav-items.ts (+ nav-items.test.ts, nav.test.tsx, sidebar.test.tsx)  MOD: Cartões
  app/(app)/
    cartoes/page.tsx, cartoes/novo/page.tsx, cartoes/[id]/page.tsx          NOVO
    extrato/parcelas/[id]/page.tsx, extrato/parcelas/[id]/quitar/page.tsx  NOVO
    extrato/page.tsx, extrato/[id]/page.tsx, anotar/page.tsx, mais/page.tsx  MOD
docs/progresso.md, docs/decisoes-para-revisao.md             MOD no fim
```

**Rotas:** `/cartoes?mes=AAAA-MM`, `/cartoes/novo`, `/cartoes/{id}`, `/extrato?…&cartao={id}`, `/extrato/parcelas/{id}` (a compra), `/extrato/parcelas/{id}/quitar`.

---

### Task 1: Regras de parcelas e do total por cartão (domínio)

**Files:**
- Create: `src/domain/installments.ts`, `src/domain/cards.ts`
- Modify: `src/domain/dates.ts` (`dayMonthYearLabel`)
- Test: `src/domain/installments.test.ts`, `src/domain/cards.test.ts`, `src/domain/dates.test.ts` (acrescentar 1 teste)

**Interfaces:**
- Consumes: `addMonths`, `monthOf`, `isInMonth`, `dayMonthLabel`, `ISODate`, `MonthKey` (`./dates`); `dueDateIn` (`./recurrence`); `effectiveDate`, `LedgerTx`, `summarizeMonth` (`./summary`); `Cents`.
- Produces:
  - `dayMonthYearLabel(d: ISODate): string` — `'2027-02-28'` → `'28 de fevereiro de 2027'`.
  - `MIN_INSTALLMENTS = 2`, `MAX_INSTALLMENTS = 48` (espelham o CHECK da Task 2).
  - `interface Installment { number: number; amountCents: Cents; occurredOn: ISODate }`
  - `splitInstallments(totalCents: Cents, count: number, purchasedOn: ISODate): Installment[]` — 1ª no mês da compra, mesmo dia (ajustado ao tamanho do mês), centavos que sobram na 1ª.
  - `isFutureInstallment(occurredOn: ISODate, today: ISODate): boolean` — `occurredOn > today`.
  - `remainingInstallments(items: { occurredOn: ISODate; amountCents: Cents }[], today: ISODate): { count: number; cents: Cents }` — só as futuras.
  - `installmentBadge(number: number, count: number): string` — `'parcela 2 de 5'` (protótipo do Extrato).
  - `interface CardTx extends LedgerTx { cardId: string | null }`; `spentByCard(txs: CardTx[], month: MonthKey): Map<string, Cents>` — gastos confirmados com cartão cujo `effectiveDate` cai no mês; valor inteiro.

- [ ] **Step 1: Testes que falham** — criar `src/domain/installments.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentBadge, isFutureInstallment, remainingInstallments, splitInstallments,
} from './installments'
import { summarizeMonth, type LedgerTx } from './summary'

describe('dividir a compra em parcelas (RN-07)', () => {
  test('uma por mês, a 1ª no mês da compra, no mesmo dia', () => {
    expect(splitInstallments(30000, 3, '2026-09-10')).toEqual([
      { number: 1, amountCents: 10000, occurredOn: '2026-09-10' },
      { number: 2, amountCents: 10000, occurredOn: '2026-10-10' },
      { number: 3, amountCents: 10000, occurredOn: '2026-11-10' },
    ])
  })

  test('centavos que sobram vão para a 1ª; a soma é sempre o total (Review Focus 1)', () => {
    expect(splitInstallments(10000, 3, '2026-09-10').map((i) => i.amountCents)).toEqual([3334, 3333, 3333])
    const cases: [number, number][] = [[10000, 3], [99999, 7], [1234567, 12], [48, 48], [9_999_999_999, 48]]
    for (const [total, n] of cases) {
      const parts = splitInstallments(total, n, '2026-01-31')
      expect(parts).toHaveLength(n)
      expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(total)
      expect(parts.every((p) => Number.isInteger(p.amountCents) && p.amountCents > 0)).toBe(true)
      expect(Math.max(...parts.map((p) => p.amountCents)) - Math.min(...parts.map((p) => p.amountCents))).toBeLessThan(n)
    }
  })

  test('dia que o mês não tem cai no último dia; vira o ano (Review Focus 2)', () => {
    expect(splitInstallments(40000, 4, '2026-11-30').map((i) => i.occurredOn)).toEqual([
      '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28',
    ])
    expect(splitInstallments(30000, 3, '2027-12-31').map((i) => i.occurredOn)).toEqual(['2027-12-31', '2028-01-31', '2028-02-29'])
  })

  test('limites do número de parcelas', () => {
    expect(MIN_INSTALLMENTS).toBe(2)
    expect(MAX_INSTALLMENTS).toBe(48)
  })
})

describe('parcelas futuras (Review Focus 3)', () => {
  test('a de hoje já contou; só depois de hoje é futura', () => {
    expect(isFutureInstallment('2026-09-30', '2026-09-30')).toBe(false)
    expect(isFutureInstallment('2026-09-29', '2026-09-30')).toBe(false)
    expect(isFutureInstallment('2026-10-01', '2026-09-30')).toBe(true)
  })

  test('o que falta: quantas e quanto', () => {
    const parts = splitInstallments(50000, 5, '2026-07-30')
    expect(remainingInstallments(parts, '2026-09-30')).toEqual({ count: 2, cents: 20000 })
    expect(remainingInstallments(parts, '2026-11-30')).toEqual({ count: 0, cents: 0 })
  })

  test('rótulo do protótipo', () => {
    expect(installmentBadge(2, 5)).toBe('parcela 2 de 5')
  })
})

test('cada mês mostra a sua parcela em "Saiu"; o Saldo total só conta até hoje (decisão 2)', () => {
  const ledger: LedgerTx[] = splitInstallments(30000, 3, '2026-09-10').map((p) => ({
    kind: 'expense', amountCents: p.amountCents, occurredOn: p.occurredOn, status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0,
  }))
  const at = (month: string) => summarizeMonth({ month, today: '2026-09-30', initialBalanceCents: 0, transactions: ledger, goalMovements: [] })
  expect(at('2026-09').saiuCents).toBe(10000)
  expect(at('2026-10').saiuCents).toBe(10000)
  expect(at('2026-12').saiuCents).toBe(0)
  expect(at('2026-09').saldoTotalCents).toBe(-10000)
})
```

`src/domain/cards.test.ts`:

```ts
import { expect, test } from 'vitest'
import { spentByCard, type CardTx } from './cards'

const tx = (p: Partial<CardTx>): CardTx => ({
  kind: 'expense', amountCents: 1000, occurredOn: '2026-09-10', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, cardId: 'k1', ...p,
})

test('gasto no mês por cartão, com parcelas e pelo mês em que contou (RN-30, A1)', () => {
  const txs: CardTx[] = [
    tx({}),
    tx({ amountCents: 2500, occurredOn: '2026-09-30' }), // parcela do mês
    tx({ amountCents: 700, cardId: 'k2' }),
    tx({ amountCents: 9000, occurredOn: '2026-10-10' }), // parcela de outubro
    tx({ amountCents: 4000, occurredOn: '2026-08-20', dueOn: '2026-08-20', paidOn: '2026-09-02' }), // conta paga em setembro
    tx({ amountCents: 3000, occurredOn: '2026-09-25', dueOn: '2026-09-25', status: 'pending' }), // a pagar: não conta
    tx({ amountCents: 5000, cardId: null }),
    tx({ amountCents: 6000, goalFundedCents: 6000 }), // valor inteiro, mesmo pago com meta
  ]
  expect(Object.fromEntries(spentByCard(txs, '2026-09'))).toEqual({ k1: 1000 + 2500 + 4000 + 6000, k2: 700 })
  expect(Object.fromEntries(spentByCard(txs, '2026-11'))).toEqual({})
})
```

Em `src/domain/dates.test.ts` (importando `dayMonthYearLabel`):

```ts
test('dayMonthYearLabel escreve dia, mês e ano', () => {
  expect(dayMonthYearLabel('2027-02-28')).toBe('28 de fevereiro de 2027')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain`
Expected: FAIL — `Failed to resolve import "./installments"` / `"./cards"` e `dayMonthYearLabel is not a function`.

- [ ] **Step 3: Implementação**

`dates.ts`: `dayMonthYearLabel(d) = \`${dayMonthLabel(d)} de ${d.slice(0, 4)}\``. `cards.ts`: percorre `txs`, soma `amountCents` quando `kind === 'expense' && cardId !== null && effectiveDate(t)` está no mês. `installments.ts` — o único algoritmo que os testes não fixam por completo:

```ts
export function splitInstallments(totalCents: Cents, count: number, purchasedOn: ISODate): Installment[] {
  const base = Math.floor(totalCents / count)
  const rest = totalCents - base * count // etapa-3 §3.1: o que sobra vai para a 1ª
  const day = Number(purchasedOn.slice(8, 10))
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    amountCents: base + (i === 0 ? rest : 0),
    occurredOn: dueDateIn(addMonths(monthOf(purchasedOn), i), day),
  }))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/installments.ts src/domain/installments.test.ts src/domain/cards.ts src/domain/cards.test.ts src/domain/dates.ts src/domain/dates.test.ts
git commit -m "feat(domain): divisão das parcelas, parcelas futuras e gasto por cartão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Banco — cartões, compras parceladas e funções atômicas

**Files:**
- Create: `supabase/migrations/20260928000001_parcelas_e_cartoes.sql`
- Test: `tests/db/plano4.test.ts`

**Interfaces:**
- Consumes: `public.touch_updated_at()`, `public.occurrence_due_on(date, integer)`, `public.categories`, `public.transactions`, `public.recurrences` (com `note`, migração `20260927000001`), `tests/db/helpers.ts`, `splitInstallments` (Task 1), `dueDateIn`, `todayInSaoPaulo`, `monthOf`, `addMonths`.
- Produces (usados pelas Tasks 3–12):
  - Tabela `public.cards (id, user_id, nickname, kind 'credit'|'debit', color 'green'|'purple'|'blue'|'orange'|'graphite'|'pink', created_at, updated_at)`.
  - Tabela `public.installment_plans (id, user_id, total_cents, installment_count, purchased_on, status 'active'|'settled'|'refunded', closed_on, created_at, updated_at)`.
  - `public.transactions` ganha `card_id uuid`, `card_deleted boolean` (padrão `false`), `installment_plan_id uuid`, `installment_number smallint`, `installment_count smallint`. Parcela: `installment_number` e `installment_count` preenchidos. Restante quitado: `installment_plan_id` preenchido, número e total nulos.
  - `public.recurrences` ganha `card_id uuid`.
  - `installment_schedule(p_total_cents bigint, p_count integer, p_purchased_on date) returns table (installment_no integer, cents bigint, on_date date)`.
  - `create_installment_purchase(p_amount_cents bigint, p_count integer, p_category_id uuid, p_note text, p_card_id uuid, p_payment_method text, p_purchased_on date) returns uuid` (id da compra).
  - `settle_installments(p_plan_id uuid, p_amount_cents bigint) returns uuid` (id do gasto único).
  - `refund_installments(p_plan_id uuid) returns void`.
  - `delete_installment_purchase(p_plan_id uuid) returns void`.
  - `delete_card(p_card_id uuid) returns void`.
  - `create_recurring_transaction(…mesmos 8…, p_card_id uuid default null) returns uuid` (chamadas antigas sem `p_card_id` continuam funcionando).
  - Mensagens de erro: `'Parcelas inválidas.'`, `'Data inválida.'`, `'Categoria não encontrada.'`, `'Cartão não encontrado.'`, `'Compra não encontrada.'`, `'Nenhuma parcela futura.'`, `'Valor inválido.'`.

Mapeamento da especificação (§3.1 `installment_plans`): dono → `user_id`; família → Plano 7; descrição/categoria → ficam nas parcelas (`note`/`category_id`), não se repetem na compra (evita duas fontes e mantém `delete_category` sem mudança); valor_total → `total_cents`; nº_parcelas → `installment_count`; data_compra → `purchased_on`; situação ativo/quitado/devolvido → `status active/settled/refunded` + `closed_on`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano4.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn } from '../../src/domain/recurrence'
import { splitInstallments } from '../../src/domain/installments'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()
const current = monthOf(today)
const day = Number(today.slice(8, 10))

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newCard(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('cards')
    .insert({ user_id: user.id, nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', ...p })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

type PurchaseInput = { amount?: number; count?: number; purchasedOn?: string; cardId?: string | null; note?: string | null; paymentMethod?: string | null }

async function purchase(user: TestUser, p: PurchaseInput = {}): Promise<string> {
  const compras = await categoryId(user, 'compras')
  const { data, error } = await user.client.rpc('create_installment_purchase', {
    p_amount_cents: p.amount ?? 30000, p_count: p.count ?? 3, p_category_id: compras, p_note: p.note === undefined ? 'Tênis' : p.note,
    p_card_id: p.cardId ?? null, p_payment_method: p.paymentMethod ?? null, p_purchased_on: p.purchasedOn ?? today,
  })
  if (error) throw error
  return data as string
}

async function planRows(user: TestUser, planId: string) {
  const { data, error } = await user.client
    .from('transactions')
    .select('id, amount_cents, occurred_on, status, note, category_id, payment_method, card_id, card_deleted, installment_number, installment_count')
    .eq('installment_plan_id', planId)
    .order('installment_number', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

async function plan(user: TestUser, planId: string) {
  const { data, error } = await user.client
    .from('installment_plans').select('total_cents, installment_count, purchased_on, status, closed_on').eq('id', planId).maybeSingle()
  if (error) throw error
  return data
}

// Compra de 2 meses atrás em 5x: parcelas em -2, -1, este mês (até hoje) e duas futuras.
const twoMonthsAgo = () => dueDateIn(addMonths(current, -2), day)

describe('privacidade dos cartões e das compras', () => {
  test('ninguém vê nem altera o cartão de outra pessoa', async () => {
    const id = await newCard(a)
    const { data: seen } = await b.client.from('cards').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: changed } = await b.client.from('cards').update({ nickname: 'X' }).eq('id', id).select()
    expect(changed).toEqual([])
  })

  test('ninguém anota gasto com o cartão de outra pessoa', async () => {
    const card = await newCard(a)
    const outros = await categoryId(b, 'outros')
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, card_id: card,
    })
    expect(error?.code).toBe('23503')
  })

  test('ninguém cria compra parcelada com cartão ou categoria de outra pessoa', async () => {
    const card = await newCard(a)
    const withCard = await b.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(b, 'compras'), p_note: null,
      p_card_id: card, p_payment_method: null, p_purchased_on: today,
    })
    expect(withCard.error?.message).toContain('Cartão não encontrado.')
    const withCategory = await b.client.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: await categoryId(a, 'compras'), p_note: null,
      p_card_id: null, p_payment_method: null, p_purchased_on: today,
    })
    expect(withCategory.error?.message).toContain('Categoria não encontrada.')
  })

  test('ninguém vê, quita, devolve ou exclui a compra de outra pessoa (Review Focus 5)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    const { data: seen } = await b.client.from('installment_plans').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: rows } = await b.client.from('transactions').select('id').eq('installment_plan_id', id)
    expect(rows).toEqual([])
    for (const [fn, args] of [
      ['settle_installments', { p_plan_id: id, p_amount_cents: 100 }],
      ['refund_installments', { p_plan_id: id }],
      ['delete_installment_purchase', { p_plan_id: id }],
    ] as const) {
      const { error } = await b.client.rpc(fn, args)
      expect(error?.message).toContain('Compra não encontrada.')
    }
    expect(await planRows(a, id)).toHaveLength(5)
  })

  test('ninguém exclui o cartão de outra pessoa', async () => {
    const card = await newCard(a)
    const { error } = await b.client.rpc('delete_card', { p_card_id: card })
    expect(error?.message).toContain('Cartão não encontrado.')
    const { data } = await a.client.from('cards').select('id').eq('id', card)
    expect(data).toHaveLength(1)
  })

  test('quem não entrou não cria compras', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('create_installment_purchase', {
      p_amount_cents: 300, p_count: 3, p_category_id: null, p_note: null, p_card_id: null, p_payment_method: null, p_purchased_on: today,
    })
    expect(error).not.toBeNull()
  })
})

describe('regras nos registros', () => {
  test('cartão só em gasto e sem outra forma de pagamento (decisão 47)', async () => {
    const card = await newCard(a)
    const outros = await categoryId(a, 'outros')
    const income = await a.client.from('transactions').insert({ user_id: a.id, kind: 'income', amount_cents: 100, occurred_on: today, card_id: card })
    expect(income.error?.code).toBe('23514')
    const both = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, card_id: card, payment_method: 'pix',
    })
    expect(both.error?.code).toBe('23514')
  })

  test('número de parcela sem compra é recusado', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 100, category_id: outros, occurred_on: today, installment_number: 1, installment_count: 2,
    })
    expect(error?.code).toBe('23514')
  })
})

describe('calendário das parcelas', () => {
  test('o banco divide igual ao app (Review Focus 1 e 2)', async () => {
    const cases: [number, number, string][] = [[10000, 3, '2026-01-31'], [99999, 7, '2027-12-31'], [40000, 4, '2026-11-30'], [48, 48, '2026-05-15']]
    for (const [total, count, on] of cases) {
      const { data, error } = await a.client.rpc('installment_schedule', { p_total_cents: total, p_count: count, p_purchased_on: on })
      expect(error).toBeNull()
      const got = (data as { installment_no: number; cents: number; on_date: string }[])
        .sort((x, y) => x.installment_no - y.installment_no)
        .map((r) => ({ number: r.installment_no, amountCents: Number(r.cents), occurredOn: r.on_date }))
      expect(got).toEqual(splitInstallments(total, count, on))
    }
  })
})

describe('criar compra parcelada (RN-07)', () => {
  test('uma parcela confirmada por mês, a 1ª no mês da compra, somando o total', async () => {
    const id = await purchase(a, { amount: 10000, count: 3 })
    const rows = await planRows(a, id)
    expect(rows.map((r) => [r.installment_number, Number(r.amount_cents), r.occurred_on])).toEqual(
      splitInstallments(10000, 3, today).map((p) => [p.number, p.amountCents, p.occurredOn]),
    )
    expect(rows.every((r) => r.status === 'confirmed' && r.installment_count === 3 && r.note === 'Tênis')).toBe(true)
    expect(await plan(a, id)).toMatchObject({ installment_count: 3, purchased_on: today, status: 'active', closed_on: null })
    expect(Number((await plan(a, id))!.total_cents)).toBe(10000)
  })

  test('com cartão, a forma de pagamento fica vazia', async () => {
    const card = await newCard(a)
    const id = await purchase(a, { cardId: card, paymentMethod: 'pix' })
    const rows = await planRows(a, id)
    expect(rows.every((r) => r.card_id === card && r.payment_method === null)).toBe(true)
  })

  test('recusa data futura, 1 ou 49 parcelas e valor menor que o número de parcelas', async () => {
    const compras = await categoryId(a, 'compras')
    const call = (p: Record<string, unknown>) =>
      a.client.rpc('create_installment_purchase', {
        p_amount_cents: 30000, p_count: 3, p_category_id: compras, p_note: null, p_card_id: null, p_payment_method: null, p_purchased_on: today, ...p,
      })
    expect((await call({ p_purchased_on: dueDateIn(addMonths(current, 1), 1) })).error?.message).toContain('Data inválida.')
    expect((await call({ p_count: 1 })).error?.message).toContain('Parcelas inválidas.')
    expect((await call({ p_count: 49 })).error?.message).toContain('Parcelas inválidas.')
    expect((await call({ p_amount_cents: 5, p_count: 10 })).error?.message).toContain('Parcelas inválidas.')
  })
})

describe('quitar antecipadamente (RN-08)', () => {
  test('quitar: as futuras saem e o valor pago entra hoje, com a mesma categoria, nota e cartão (Review Focus 3)', async () => {
    const card = await newCard(a)
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000, cardId: card })
    const { data: txId, error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
    const rows = await planRows(a, id)
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3, null])
    expect(rows[3]).toMatchObject({ id: txId, occurred_on: today, status: 'confirmed', note: 'Tênis', card_id: card, category_id: await categoryId(a, 'compras'), installment_count: null })
    expect(Number(rows[3].amount_cents)).toBe(18000)
    expect(await plan(a, id)).toMatchObject({ status: 'settled', closed_on: today })
  })

  test('quitar duas vezes, ou devolver depois de quitar, não faz nada (Review Focus 5)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    const again = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    expect(again.error?.message).toContain('Compra não encontrada.')
    const refund = await a.client.rpc('refund_installments', { p_plan_id: id })
    expect(refund.error?.message).toContain('Compra não encontrada.')
    expect(await planRows(a, id)).toHaveLength(4)
  })

  test('sem parcela futura não há o que quitar; nada muda', async () => {
    const id = await purchase(a, { purchasedOn: dueDateIn(addMonths(current, -1), day), count: 2, amount: 20000 })
    const { error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 100 })
    expect(error?.message).toContain('Nenhuma parcela futura.')
    expect(await planRows(a, id)).toHaveLength(2)
    expect(await plan(a, id)).toMatchObject({ status: 'active' })
  })

  test('valor quitado precisa ser maior que zero', async () => {
    const id = await purchase(a)
    const { error } = await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 0 })
    expect(error?.message).toContain('Valor inválido.')
  })
})

describe('devolução e exclusão da compra', () => {
  test('devolução: as futuras saem; as que já contaram ficam (RN-09)', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    const { error } = await a.client.rpc('refund_installments', { p_plan_id: id })
    expect(error).toBeNull()
    expect((await planRows(a, id)).map((r) => r.installment_number)).toEqual([1, 2, 3])
    expect(await plan(a, id)).toMatchObject({ status: 'refunded', closed_on: today })
  })

  test('excluir a compra apaga as parcelas e o restante quitado', async () => {
    const id = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000 })
    await a.client.rpc('settle_installments', { p_plan_id: id, p_amount_cents: 20000 })
    const { error } = await a.client.rpc('delete_installment_purchase', { p_plan_id: id })
    expect(error).toBeNull()
    expect(await planRows(a, id)).toEqual([])
    expect(await plan(a, id)).toBeNull()
  })
})

describe('excluir cartão (RN-32, Review Focus 4)', () => {
  test('gastos ficam como "Cartão excluído", valores iguais; a conta que se repete segue sem cartão', async () => {
    const card = await newCard(a)
    const mercado = await categoryId(a, 'mercado')
    const { data: tx, error: e1 } = await a.client
      .from('transactions').insert({ user_id: a.id, kind: 'expense', amount_cents: 12000, category_id: mercado, occurred_on: today, card_id: card })
      .select('id').single()
    if (e1) throw e1
    const planId = await purchase(a, { purchasedOn: twoMonthsAgo(), count: 5, amount: 50000, cardId: card })
    const { data: rec, error: e2 } = await a.client
      .from('recurrences').insert({
        user_id: a.id, kind: 'expense', name: 'Streaming', amount_cents: 3990, category_id: mercado, card_id: card,
        frequency: 'monthly', due_day: day, starts_on: `${addMonths(current, 1)}-01`,
      })
      .select('id').single()
    if (e2) throw e2

    const { error } = await a.client.rpc('delete_card', { p_card_id: card })
    expect(error).toBeNull()

    const { data: after } = await a.client.from('transactions').select('amount_cents, card_id, card_deleted').eq('id', tx.id).single()
    expect(after).toMatchObject({ card_id: null, card_deleted: true })
    expect(Number(after!.amount_cents)).toBe(12000)
    const rows = await planRows(a, planId)
    expect(rows.every((r) => r.card_id === null && r.card_deleted)).toBe(true)
    expect(rows.reduce((s, r) => s + Number(r.amount_cents), 0)).toBe(50000)
    const { data: recAfter } = await a.client.from('recurrences').select('card_id').eq('id', rec.id).single()
    expect(recAfter?.card_id).toBeNull()
    const { data: cards } = await a.client.from('cards').select('id').eq('id', card)
    expect(cards).toEqual([])

    // Quitar depois de excluir o cartão: o restante também fica como "Cartão excluído".
    await a.client.rpc('settle_installments', { p_plan_id: planId, p_amount_cents: 20000 })
    const settled = (await planRows(a, planId)).at(-1)
    expect(settled).toMatchObject({ installment_number: null, card_id: null, card_deleted: true })
  })
})

describe('conta que se repete com cartão (decisão 58)', () => {
  test('a primeira e as próximas levam o cartão; a forma de pagamento fica vazia', async () => {
    const card = await newCard(a)
    const mercado = await categoryId(a, 'mercado')
    const { data: txId, error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'expense', p_amount_cents: 3990, p_category_id: mercado, p_source: null, p_note: 'Streaming',
      p_payment_method: 'credit', p_occurred_on: today, p_frequency: 'monthly', p_card_id: card,
    })
    expect(error).toBeNull()
    const { data: first } = await a.client.from('transactions').select('card_id, payment_method, recurrence_id').eq('id', txId).single()
    expect(first).toMatchObject({ card_id: card, payment_method: null })
    const { data: rec } = await a.client.from('recurrences').select('card_id, payment_method').eq('id', first!.recurrence_id).single()
    expect(rec).toEqual({ card_id: card, payment_method: null })

    const { data: other, error: e2 } = await a.client
      .from('recurrences').insert({
        user_id: a.id, kind: 'expense', name: 'Academia', amount_cents: 9000, category_id: mercado, card_id: card,
        frequency: 'monthly', due_day: day, starts_on: `${current}-01`,
      })
      .select('id').single()
    if (e2) throw e2
    await a.client.rpc('generate_occurrences')
    const { data: occ } = await a.client.from('transactions').select('card_id, status').eq('recurrence_id', other.id)
    expect(occ).toEqual([{ card_id: card, status: 'pending' }])
  })

  test('chamada sem p_card_id (Plano 3) continua funcionando', async () => {
    const { error } = await a.client.rpc('create_recurring_transaction', {
      p_kind: 'income', p_amount_cents: 100, p_category_id: null, p_source: 'Freela', p_note: null,
      p_payment_method: null, p_occurred_on: today, p_frequency: 'monthly',
    })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano4.test.ts`
Expected: FAIL — `relation "public.cards" does not exist` (sem Docker: `fetch failed`; registrar como pendente e seguir; `npx tsc --noEmit` precisa passar).

- [ ] **Step 3: Implementação** — criar `supabase/migrations/20260928000001_parcelas_e_cartoes.sql`:

```sql
-- Plano 4: parcelas e cartões (RF-14, RF-58–61, RN-06–09, RN-29–32, K6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.

-- 1. Cartões ilustrativos: só apelido, tipo e cor (RN-29). Nenhum número, nem parcial.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30 and nickname = btrim(nickname)),
  kind text not null check (kind in ('credit', 'debit')),
  color text not null check (color in ('green', 'purple', 'blue', 'orange', 'graphite', 'pink')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index cards_user_idx on public.cards (user_id, created_at);

create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();

alter table public.cards enable row level security;

create policy cards_own on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Compra parcelada (RN-07). As parcelas são registros confirmados em
--    transactions; categoria e nota ficam nelas (uma fonte só).
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  total_cents bigint not null check (total_cents > 0 and total_cents <= 9999999999),
  installment_count smallint not null check (installment_count between 2 and 48),
  purchased_on date not null,
  status text not null default 'active' check (status in ('active', 'settled', 'refunded')),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_total_covers_count check (total_cents >= installment_count),
  constraint installment_closed_on_when_closed check ((status = 'active') = (closed_on is null)),
  unique (id, user_id)
);

create index installment_plans_user_idx on public.installment_plans (user_id);

create trigger installment_plans_touch before update on public.installment_plans
  for each row execute function public.touch_updated_at();

alter table public.installment_plans enable row level security;

create policy installment_plans_own on public.installment_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Registros ganham cartão e parcela. Com cartão, payment_method fica vazio:
--    o tipo (crédito/débito) vem do cartão. Cartão excluído: card_id vazio e
--    card_deleted = true (RN-32), valores intactos.
alter table public.transactions
  add column card_id uuid,
  add column card_deleted boolean not null default false,
  add column installment_plan_id uuid,
  add column installment_number smallint,
  add column installment_count smallint,
  add constraint card_only_on_expense check (card_id is null or kind = 'expense'),
  add constraint card_without_payment_method check (card_id is null or payment_method is null),
  add constraint card_deleted_has_no_card check (not (card_deleted and card_id is not null)),
  add constraint installment_number_pair check ((installment_number is null) = (installment_count is null)),
  add constraint installment_number_needs_plan check (installment_number is null or installment_plan_id is not null),
  add constraint installment_number_range check (installment_number is null or installment_number between 1 and installment_count),
  add constraint installment_only_confirmed_expense check (installment_plan_id is null or (kind = 'expense' and status = 'confirmed')),
  add constraint transactions_card_fk foreign key (card_id, user_id)
    references public.cards (id, user_id) on delete no action,
  add constraint transactions_installment_fk foreign key (installment_plan_id, user_id)
    references public.installment_plans (id, user_id) on delete no action;

create unique index transactions_installment_number_uidx
  on public.transactions (installment_plan_id, installment_number) where installment_number is not null;
create index transactions_card_idx on public.transactions (card_id) where card_id is not null;
create index transactions_installment_plan_idx on public.transactions (installment_plan_id) where installment_plan_id is not null;

-- 4. Conta que se repete anotada com cartão: as próximas levam o mesmo cartão.
alter table public.recurrences
  add column card_id uuid,
  add constraint recurrence_card_only_on_expense check (card_id is null or kind = 'expense'),
  add constraint recurrence_card_without_payment_method check (card_id is null or payment_method is null),
  add constraint recurrences_card_fk foreign key (card_id, user_id)
    references public.cards (id, user_id) on delete no action;

-- 5. Calendário das parcelas. Mesma regra de splitInstallments
--    (src/domain/installments.ts): 1ª no mês da compra, mesmo dia ajustado ao
--    tamanho do mês, centavos que sobram na 1ª (etapa-3 §3.1).
create function public.installment_schedule(p_total_cents bigint, p_count integer, p_purchased_on date)
returns table (installment_no integer, cents bigint, on_date date)
language sql immutable set search_path = '' as $$
  select
    n,
    p_total_cents / p_count + case when n = 1 then p_total_cents % p_count else 0 end,
    public.occurrence_due_on(
      ((p_purchased_on - (extract(day from p_purchased_on)::int - 1)) + make_interval(months => n - 1))::date,
      extract(day from p_purchased_on)::int
    )
  from generate_series(1, p_count) as n
$$;

-- 6. "Foi parcelado" no Anotar: a compra e todas as parcelas nascem juntas.
--    Data da compra até hoje (Brasília).
create function public.create_installment_purchase(
  p_amount_cents bigint, p_count integer, p_category_id uuid, p_note text,
  p_card_id uuid, p_payment_method text, p_purchased_on date
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_plan uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
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
    occurred_on, installment_plan_id, installment_number, installment_count
  )
  select
    v_uid, 'expense', s.cents, p_category_id, nullif(btrim(p_note), ''),
    case when p_card_id is null then p_payment_method end, p_card_id,
    s.on_date, v_plan, s.installment_no, p_count
  from public.installment_schedule(p_amount_cents, p_count, p_purchased_on) s;

  return v_plan;
end;
$$;

-- 7. Quitar antecipadamente (RN-08): as parcelas depois de hoje saem e o valor
--    pago entra como um gasto único hoje, com a categoria, a nota e o cartão da
--    compra. O "for update" faz um toque duplo esperar e falhar sem pagar duas vezes.
create function public.settle_installments(p_plan_id uuid, p_amount_cents bigint) returns uuid
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

  select t.category_id, t.note, t.payment_method, t.card_id, t.card_deleted into v_first
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
    occurred_on, installment_plan_id
  ) values (
    v_uid, 'expense', p_amount_cents, v_first.category_id, v_first.note, v_first.payment_method,
    v_first.card_id, v_first.card_deleted, v_today, p_plan_id
  ) returning id into v_tx;

  update public.installment_plans p set status = 'settled', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;

  return v_tx;
end;
$$;

-- 8. Devolução (RN-09): as parcelas depois de hoje saem; as que já contaram ficam.
create function public.refund_installments(p_plan_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
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

  delete from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid
      and t.installment_number is not null and t.occurred_on > v_today;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma parcela futura.';
  end if;

  update public.installment_plans p set status = 'refunded', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;
end;
$$;

-- 9. Excluir a compra inteira (engano ao anotar): parcelas, restante quitado e a compra.
create function public.delete_installment_purchase(p_plan_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.installment_plans p where p.id = p_plan_id and p.user_id = v_uid for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  delete from public.transactions t where t.installment_plan_id = p_plan_id and t.user_id = v_uid;
  delete from public.installment_plans p where p.id = p_plan_id and p.user_id = v_uid;
end;
$$;

-- 10. Excluir cartão (RN-32): os gastos ficam como "Cartão excluído" com os
--     mesmos valores; contas que se repetem seguem sem cartão; o apelido some.
create function public.delete_card(p_card_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.cards k where k.id = p_card_id and k.user_id = v_uid for update;
  if not found then
    raise exception 'Cartão não encontrado.';
  end if;
  update public.transactions t set card_id = null, card_deleted = true
    where t.card_id = p_card_id and t.user_id = v_uid;
  update public.recurrences r set card_id = null
    where r.card_id = p_card_id and r.user_id = v_uid;
  delete from public.cards k where k.id = p_card_id and k.user_id = v_uid;
end;
$$;

-- 11. Conta que se repete pelo Anotar, agora com cartão (p_card_id opcional:
--     chamadas do Plano 3 sem ele continuam valendo). Corpo igual ao da
--     migração 20260927000001, mais card_id; com cartão, payment_method vazio.
drop function public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text);

create function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text, p_card_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
  v_payment text := case when p_card_id is null then p_payment_method end;
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
    if p_card_id is not null then
      raise exception 'Cartão não encontrado.';
    end if;
    v_name := coalesce(nullif(btrim(p_source), ''), 'Entrada');
  end if;

  insert into public.recurrences (
    user_id, kind, name, amount_cents, category_id, source, payment_method, card_id,
    frequency, due_day, due_month, starts_on, generated_through, note
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, v_payment, p_card_id,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period, nullif(left(v_note, 140), '')
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, v_payment, p_card_id,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period
  ) returning id into v_tx;

  return v_tx;
end;
$$;

-- 12. Ocorrências levam o cartão da recorrência. Corpo igual ao da migração
--     20260927000001, mais card_id.
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

revoke execute on function
  public.installment_schedule(bigint, integer, date),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date),
  public.settle_installments(uuid, bigint),
  public.refund_installments(uuid),
  public.delete_installment_purchase(uuid),
  public.delete_card(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid)
from public, anon;

grant execute on function
  public.installment_schedule(bigint, integer, date),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date),
  public.settle_installments(uuid, bigint),
  public.refund_installments(uuid),
  public.delete_installment_purchase(uuid),
  public.delete_card(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS (`rls`, `plano2`, `plano3` e `plano4`). Sem Docker: registrar "pendente" e conferir `npx tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000001_parcelas_e_cartoes.sql tests/db/plano4.test.ts
git commit -m "feat(db): cartões, compras parceladas, quitar, devolver e excluir cartão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Linhas do banco e leituras (registros, cartões, compras)

**Files:**
- Create: `src/features/registro/tx-row.ts`, `src/features/cartoes/types.ts`, `src/features/cartoes/palette.ts`, `src/features/cartoes/queries.ts`, `src/features/parcelas/types.ts`, `src/features/parcelas/queries.ts`
- Modify: `src/features/registro/queries.ts` (tira `TxRow`/`TxRawRow`/`TX_COLUMNS`/`toTxRow` para `tx-row.ts` e reexporta `export type { TxRow } from './tx-row'`)
- Modify (só o ajudante `row` dos testes, porque `TxRow` ganhou campos): `src/features/contas/view-model.test.ts`, `src/features/extrato/view-model.test.ts`, `src/features/seu-mes/view-model.test.ts` — acrescentar aos padrões de `row(...)`: `cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null`.
- Test: `src/features/registro/tx-row.test.ts`, `src/features/cartoes/types.test.ts`, `src/features/cartoes/palette.test.ts`, `src/features/parcelas/types.test.ts`

**Interfaces:**
- Consumes: colunas da Task 2; `CategorizedTx` (`@/domain/breakdown`); `PAYMENT_LABELS` (`@/features/registro/labels`); `requireUser`, `createClient`.
- Produces:
  - `tx-row.ts` (puro, sem `server-only`): `interface TxRow extends CategorizedTx { id; source; note; paymentMethod; createdAt; cardId: string | null; cardDeleted: boolean; installmentPlanId: string | null; installmentNumber: number | null; installmentCount: number | null }`, `type TxRawRow`, `TX_COLUMNS = 'id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at, card_id, card_deleted, installment_plan_id, installment_number, installment_count'`, `toTxRow(t: TxRawRow): TxRow`.
  - `cartoes/types.ts`: `type CardKind = 'credit' | 'debit'`; `type CardColor = 'green' | 'purple' | 'blue' | 'orange' | 'graphite' | 'pink'`; `CARD_KINDS: readonly CardKind[] = ['credit', 'debit']`; `CARD_KIND_LABELS: Record<CardKind, string>` (`Crédito`, `Débito`); `interface CardRow { id: string; nickname: string; kind: CardKind; color: CardColor }`; `type CardRawRow`; `CARD_COLUMNS = 'id, nickname, kind, color'`; `toCardRow(r: CardRawRow): CardRow`; `DELETED_CARD = 'Cartão excluído'`; `paymentText(tx: Pick<TxRow, 'cardId' | 'cardDeleted' | 'paymentMethod'>, cards: CardRow[]): string | null` — apelido do cartão → `DELETED_CARD` se `cardDeleted` → rótulo da forma (`PAYMENT_LABELS`) → `null`.
  - `cartoes/palette.ts`: `CARD_COLORS: readonly { key: CardColor; label: string; gradient: string; swatch: string }[]` (6 cores do protótipo, nesta ordem); `cardColor(key: CardColor): (typeof CARD_COLORS)[number]` (desconhecida → a primeira).
  - `cartoes/queries.ts` (`server-only`): `loadCards(): Promise<CardRow[]>` (filtro `user_id`, ordem `created_at`, `id`); `loadCard(id: string): Promise<CardRow | null>` (filtros `id`, `user_id`); `loadLastCardId(): Promise<string | null>` — `card_id` do gasto confirmado mais recente da pessoa (`kind = 'expense'`, `status = 'confirmed'`, ordem `created_at` desc, `id`, `limit(1)`), ou `null`.
  - `parcelas/types.ts`: `type PlanStatus = 'active' | 'settled' | 'refunded'`; `interface PlanRow { id: string; totalCents: number; count: number; purchasedOn: ISODate; status: PlanStatus; closedOn: ISODate | null }`; `type PlanRawRow`; `PLAN_COLUMNS = 'id, total_cents, installment_count, purchased_on, status, closed_on'`; `toPlanRow(r: PlanRawRow): PlanRow`.
  - `parcelas/queries.ts` (`server-only`): `loadPurchase(id: string): Promise<{ plan: PlanRow; rows: TxRow[] } | null>` — em paralelo: a compra (filtros `id`, `user_id`, `maybeSingle`) e seus registros (filtros `installment_plan_id`, `user_id`); compra inexistente → `null`; erro do banco → `throw`.

- [ ] **Step 1: Testes que falham**

`src/features/registro/tx-row.test.ts`:

```ts
import { expect, test } from 'vitest'
import { TX_COLUMNS, toTxRow, type TxRawRow } from './tx-row'

const raw: TxRawRow = {
  id: 't1', kind: 'expense', amount_cents: '10000', category_id: 'c1', source: null, note: 'Tênis', payment_method: null,
  occurred_on: '2026-10-10', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-09-10T12:00:00Z',
  card_id: 'k1', card_deleted: false, installment_plan_id: 'p1', installment_number: 2, installment_count: 3,
}

test('converte a linha do banco com cartão e parcela', () => {
  expect(toTxRow(raw)).toEqual({
    id: 't1', kind: 'expense', amountCents: 10000, categoryId: 'c1', source: null, note: 'Tênis', paymentMethod: null,
    occurredOn: '2026-10-10', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, createdAt: '2026-09-10T12:00:00Z',
    cardId: 'k1', cardDeleted: false, installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 3,
  })
})

test('registro comum: sem cartão e sem parcela', () => {
  const row = toTxRow({ ...raw, card_id: null, card_deleted: true, installment_plan_id: null, installment_number: null, installment_count: null })
  expect(row).toMatchObject({ cardId: null, cardDeleted: true, installmentPlanId: null, installmentNumber: null, installmentCount: null })
})

test('as colunas lidas incluem cartão e parcela', () => {
  for (const c of ['card_id', 'card_deleted', 'installment_plan_id', 'installment_number', 'installment_count']) expect(TX_COLUMNS).toContain(c)
})
```

`src/features/cartoes/types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CARD_KIND_LABELS, DELETED_CARD, paymentText, toCardRow } from './types'

const cards = [toCardRow({ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple' })]

test('converte a linha do banco', () => {
  expect(cards[0]).toEqual({ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple' })
  expect(CARD_KIND_LABELS).toEqual({ credit: 'Crédito', debit: 'Débito' })
})

test('como pagou: apelido do cartão, "Cartão excluído" ou a forma de pagamento (decisão 47)', () => {
  expect(paymentText({ cardId: 'k1', cardDeleted: false, paymentMethod: null }, cards)).toBe('Nubank pessoal')
  expect(paymentText({ cardId: null, cardDeleted: true, paymentMethod: null }, cards)).toBe(DELETED_CARD)
  expect(DELETED_CARD).toBe('Cartão excluído')
  expect(paymentText({ cardId: null, cardDeleted: false, paymentMethod: 'pix' }, cards)).toBe('Pix')
  expect(paymentText({ cardId: null, cardDeleted: false, paymentMethod: null }, cards)).toBeNull()
})
```

`src/features/cartoes/palette.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CARD_COLORS, cardColor } from './palette'
import type { CardColor } from './types'

test('as 6 cores do protótipo, na ordem, com os nomes lidos por leitor de tela', () => {
  expect(CARD_COLORS.map((c) => [c.key, c.label])).toEqual([
    ['green', 'Verde'], ['purple', 'Roxo'], ['blue', 'Azul'], ['orange', 'Laranja'], ['graphite', 'Grafite'], ['pink', 'Rosa'],
  ])
  expect(cardColor('purple').gradient).toBe('linear-gradient(135deg, #7a3fb0 0%, #4a1f73 55%, #2a1245 100%)')
  expect(cardColor('purple').swatch).toBe('#5b2a86')
  expect(cardColor('x' as CardColor)).toBe(CARD_COLORS[0])
})
```

`src/features/parcelas/types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { toPlanRow } from './types'

test('converte a compra do banco', () => {
  expect(toPlanRow({ id: 'p1', total_cents: '50000', installment_count: 5, purchased_on: '2026-07-30', status: 'settled', closed_on: '2026-09-30' })).toEqual({
    id: 'p1', totalCents: 50000, count: 5, purchasedOn: '2026-07-30', status: 'settled', closedOn: '2026-09-30',
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/tx-row.test.ts src/features/cartoes src/features/parcelas`
Expected: FAIL — `Failed to resolve import "./tx-row"` / `"./types"` / `"./palette"`.

- [ ] **Step 3: Implementação**

- `tx-row.ts`: mover o que já existe em `registro/queries.ts` e acrescentar as 5 colunas; `amount_cents: number | string` e `installment_number`/`installment_count` passam por `Number(...)` quando não nulos. `queries.ts` importa de `./tx-row` e mantém `export type { TxRow } from './tx-row'` (quem já importa `TxRow` de `@/features/registro/queries` não muda).
- `palette.ts` (valores do protótipo "Cartões — celular" / "Novo cartão — celular" / "Anotar gasto"):

| key | label | gradient | swatch |
|---|---|---|---|
| green | Verde | `linear-gradient(135deg, #3f7d1c 0%, #122801 55%, #0f1e3a 100%)` | `#3f7d1c` |
| purple | Roxo | `linear-gradient(135deg, #7a3fb0 0%, #4a1f73 55%, #2a1245 100%)` | `#5b2a86` |
| blue | Azul | `linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #0f1e3a 100%)` | `#1d4ed8` |
| orange | Laranja | `linear-gradient(135deg, #c2410c 0%, #9a3412 55%, #6b230a 100%)` | `#c2410c` |
| graphite | Grafite | `linear-gradient(135deg, #525252 0%, #262626 55%, #171717 100%)` | `#404040` |
| pink | Rosa | `linear-gradient(135deg, #be185d 0%, #9d174d 55%, #500724 100%)` | `#9d174d` |

- `cartoes/queries.ts` e `parcelas/queries.ts`: `import 'server-only'`, `requireUser()` primeiro, filtros descritos em Interfaces, `throw` em erro do banco. `loadPurchase` ordena os registros por `installment_number` (`{ ascending: true, nullsFirst: false }`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS; sem erros de tipo (os três ajudantes `row` de teste já têm os campos novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/tx-row.ts src/features/registro/tx-row.test.ts src/features/registro/queries.ts src/features/cartoes src/features/parcelas src/features/contas/view-model.test.ts src/features/extrato/view-model.test.ts src/features/seu-mes/view-model.test.ts
git commit -m "feat: linhas e leituras de cartões, parcelas e compras" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cadastrar, editar e excluir cartão (Server Actions)

**Files:**
- Create: `src/features/cartoes/schemas.ts`, `src/features/cartoes/actions.ts`
- Test: `src/features/cartoes/schemas.test.ts`, `src/features/cartoes/actions.test.ts`

**Interfaces:**
- Consumes: `CARD_KINDS`, `CardKind`, `CardColor` (Task 3), `CARD_COLORS` (Task 3), RPC `delete_card` e tabela `cards` (Task 2), `requireUser`, `createClient`, `setFlash`, `errorState`/`firstFieldErrors`/`readFields`.
- Produces:
  - `cardSchema` — entrada `{ nickname, kind, color }` → `{ nickname: string; kind: CardKind; color: CardColor }`. Apelido: `trim`, `'Falta o nome.'` vazio, `'Use até 30 caracteres.'`; tipo desconhecido → `'credit'`; cor desconhecida → `'green'`.
  - `createCard(_: FormState, fd: FormData): Promise<FormState>` — `insert` em `cards` `{ user_id, nickname, kind, color }`; aviso `'Cartão criado.'`; vai para `/cartoes`.
  - `updateCard(_: FormState, fd: FormData): Promise<FormState>` — `update { nickname, kind, color }` com filtros `id`, `user_id`, `.select('id')`; 1 linha → `'Alterações salvas.'` e `/cartoes`; 0 linha ou id inválido → `SAVE_FAILED` mantendo o que foi digitado.
  - `deleteCard(fd: FormData): Promise<void>` — `rpc('delete_card', { p_card_id })`; aviso `'Cartão excluído.'`; vai para `/cartoes`; erro → `/cartoes/{id}?erro=1`; id inválido → `/cartoes` sem chamar o banco.
  - Depois de gravar: `revalidatePath('/', 'layout')` (o apelido aparece no Anotar, Extrato e Cartões).

- [ ] **Step 1: Testes que falham**

`src/features/cartoes/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { cardSchema } from './schemas'

test('apelido, tipo e cor', () => {
  expect(cardSchema.parse({ nickname: '  Nubank pessoal ', kind: 'debit', color: 'purple' })).toEqual({ nickname: 'Nubank pessoal', kind: 'debit', color: 'purple' })
})

test('mensagens do apelido', () => {
  expect(cardSchema.safeParse({ nickname: ' ', kind: 'credit', color: 'green' }).error?.issues[0].message).toBe('Falta o nome.')
  expect(cardSchema.safeParse({ nickname: 'x'.repeat(31), kind: 'credit', color: 'green' }).error?.issues[0].message).toBe('Use até 30 caracteres.')
})

test('tipo e cor desconhecidos viram o padrão', () => {
  expect(cardSchema.parse({ nickname: 'Inter', kind: 'pix', color: 'red' })).toEqual({ nickname: 'Inter', kind: 'credit', color: 'green' })
})
```

`src/features/cartoes/actions.test.ts`:

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

function fakeSupabase(s: { rows?: number; error?: unknown; insertError?: unknown; rpcError?: unknown } = {}) {
  function builder(op: string, table: string, payload?: unknown) {
    const filters: Record<string, unknown> = {}
    const b = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return b
      },
      select: async () => {
        calls.push({ op: `${op}:${table}`, filters, payload })
        if (s.error) return { data: null, error: s.error }
        return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
      },
    }
    return b
  }
  return {
    from: (table: string) => ({
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
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.restoreAllMocks())

describe('createCard', () => {
  test('guarda só apelido, tipo e cor, da própria pessoa (RN-29)', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.createCard({ status: 'idle' }, form({ nickname: 'Nubank pessoal', kind: 'credit', color: 'purple', user_id: 'outra' })))
    expect(url).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'insert:cards', filters: {}, payload: { user_id: 'u1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Cartão criado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('sem apelido: não grava e mantém o que foi escolhido', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.createCard({ status: 'idle' }, form({ nickname: '', kind: 'debit', color: 'pink' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { nickname: 'Falta o nome.' }, values: { kind: 'debit', color: 'pink' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { message: 'x' } })
    const state = await actions.createCard({ status: 'idle' }, form({ nickname: 'Inter', kind: 'debit', color: 'orange' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { nickname: 'Inter' } })
  })
})

describe('updateCard', () => {
  test('altera só o cartão da própria pessoa', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.updateCard({ status: 'idle' }, form({ id: ID, nickname: 'Inter', kind: 'debit', color: 'orange' })))
    expect(url).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'update:cards', filters: { id: ID, user_id: 'u1' }, payload: { nickname: 'Inter', kind: 'debit', color: 'orange' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('cartão de outra pessoa, excluído ou id inválido não grava', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateCard({ status: 'idle' }, form({ id, nickname: 'Inter', kind: 'debit', color: 'orange' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { nickname: 'Inter' } })
    }
    expect(calls.map((c) => c.filters)).toEqual([{ id: ID, user_id: 'u1' }])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteCard', () => {
  test('exclui pela função atômica e avisa', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteCard(form({ id: ID })))).toBe('/cartoes')
    expect(calls).toEqual([{ op: 'rpc:delete_card', filters: {}, payload: { p_card_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Cartão excluído.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('falha volta para o cartão com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Cartão não encontrado.' } })
    expect(await redirectOf(actions.deleteCard(form({ id: ID })))).toBe(`/cartoes/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para Cartões sem chamar o banco', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteCard(form({ id: 'x' })))).toBe('/cartoes')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/cartoes/schemas.test.ts src/features/cartoes/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"` / `"./actions"`.

- [ ] **Step 3: Implementação**

- `schemas.ts`: `nickname: z.string().trim().min(1, { error: 'Falta o nome.' }).max(30, { error: 'Use até 30 caracteres.' })`, `kind: z.enum(['credit', 'debit']).catch('credit')`, `color: z.enum(['green', 'purple', 'blue', 'orange', 'graphite', 'pink']).catch('green')` (a lista vem de `CARD_COLORS.map((c) => c.key)`).
- `actions.ts` (`'use server'`, só funções async; `SAVE_FAILED` e `CARD_FIELDS = ['nickname', 'kind', 'color']` são constantes locais não exportadas): `requireUser()` primeiro; id validado com `z.uuid()`; `redirect()` fora de `try`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/cartoes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cartoes/schemas.ts src/features/cartoes/schemas.test.ts src/features/cartoes/actions.ts src/features/cartoes/actions.test.ts
git commit -m "feat(cartoes): cadastrar, editar e excluir cartão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tela Cartões — montagem, cartão desenhado, formulário e lista

**Files:**
- Create: `src/features/cartoes/view-model.ts`, `src/features/cartoes/card-face.tsx`, `src/features/cartoes/card-form.tsx`, `src/features/cartoes/cards-list.tsx`
- Test: `src/features/cartoes/view-model.test.ts`, `src/features/cartoes/card-face.test.tsx`, `src/features/cartoes/card-form.test.tsx`, `src/features/cartoes/cards-list.test.tsx`

**Interfaces:**
- Consumes: `spentByCard` (Task 1), `monthName` (`@/domain/recurrence`), `monthLabel`, `CardRow`/`CARD_KIND_LABELS`/`CardKind`/`CardColor` (Task 3), `CARD_COLORS`/`cardColor` (Task 3), `TxRow`, `Button`, `FormAlert`, `Money`, `idle`/`FormState`.
- Produces:
  - `interface CartoesItem { card: CardRow; spentCents: Cents; spentLabel: string; gastosHref: string }`; `interface CartoesView { month: MonthKey; label: string; items: CartoesItem[] }`.
  - `buildCartoes(input: { month: MonthKey; cards: CardRow[]; transactions: TxRow[] }): CartoesView` — `label = monthLabel(month)`; `spentLabel = 'Gasto neste cartão em {monthName}'` (nunca "Fatura", RN-30); `gastosHref = '/extrato?mes={month}&cartao={id}'` (mesma ordem de parâmetros que `extratoHref` produz na Task 11).
  - `CardFace({ nickname, kind, color }: { nickname: string; kind: CardKind; color: CardColor })` — `div` `data-testid="card-face"`, altura 196 px, `rounded-hero`, texto branco, `style={{ backgroundImage: cardColor(color).gradient }}`, sombra `0 8px 24px rgba(18,40,1,.12)`; mostra apelido (20 px, 600, `truncate`), selo com `CARD_KIND_LABELS[kind]`, o "chip" (40×30, `rgba(255,255,255,.22)`) e "Íris" (13 px). Nenhum número.
  - `CardForm({ action, card }: { action: (s: FormState, fd: FormData) => Promise<FormState>; card?: CardRow })` — `'use client'`; mostra `CardFace` ao vivo com o que está sendo escolhido; campos: "Como você chama esse cartão?" (`nickname`, `maxLength 30`, `autoComplete="off"`), grupo "Tipo" (rádios `kind`: "Crédito"/"Débito", segmentado igual ao `FrequencyField`), grupo "Cor" (rádios `color`, uma bolinha de 44 px por cor com o nome em `sr-only`; marcada = anel `ring-2 ring-selected ring-offset-2`); texto "A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão."; botão "Salvar cartão" (criar) ou "Salvar alterações" (editar). Padrões: `credit`, `green`. Na edição, `input hidden id`. Erros sob o campo; `err.message` em `FormAlert`; mantém o que foi digitado.
  - `CardsList({ items }: { items: CartoesItem[] })` — cada item é `<article aria-label={apelido}>` com: `CardFace` dentro de um link para `/cartoes/{id}` com nome acessível `Editar cartão {apelido}`; faixa branca (`rounded-card border border-line bg-card px-4 py-3.5`) com `spentLabel` (14 px, `text-muted`), o valor (`Money`, 20 px, 700, `text-ink`) e o link "Ver gastos" (`gastosHref`, `min-h-11`). Lista vazia: cartão tracejado com "Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês." e `Button href="/cartoes/novo"` "Adicionar".

- [ ] **Step 1: Testes que falham**

`src/features/cartoes/view-model.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import { buildCartoes } from './view-model'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'occurredOn'>): TxRow => ({
  kind: 'expense', categoryId: 'c1', source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, cardId: null, cardDeleted: false,
  installmentPlanId: null, installmentNumber: null, installmentCount: null, ...p,
})
const cards = [
  { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const },
  { id: 'k2', nickname: 'Inter', kind: 'debit' as const, color: 'orange' as const },
]

test('cada cartão com o gasto do mês, parcelas incluídas, e o caminho para os gastos (RF-59)', () => {
  const transactions = [
    row({ id: 'a', amountCents: 120000, occurredOn: '2026-09-05', cardId: 'k1' }),
    row({ id: 'b', amountCents: 8450, occurredOn: '2026-09-20', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 5 }),
    row({ id: 'c', amountCents: 8450, occurredOn: '2026-10-20', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 3, installmentCount: 5 }),
    row({ id: 'd', amountCents: 5000, occurredOn: '2026-09-10', paymentMethod: 'pix' }),
  ]
  const v = buildCartoes({ month: '2026-09', cards, transactions })
  expect(v.label).toBe('setembro de 2026')
  expect(v.items.map((i) => [i.card.nickname, i.spentCents, i.spentLabel, i.gastosHref])).toEqual([
    ['Nubank pessoal', 128450, 'Gasto neste cartão em setembro', '/extrato?mes=2026-09&cartao=k1'],
    ['Inter', 0, 'Gasto neste cartão em setembro', '/extrato?mes=2026-09&cartao=k2'],
  ])
  expect(v.items.map((i) => i.spentLabel).join(' ')).not.toMatch(/fatura/i)
})
```

`src/features/cartoes/card-face.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CardFace } from './card-face'

afterEach(() => cleanup())

test('cartão desenhado: apelido, tipo, "Íris" e a cor; nenhum número', () => {
  render(<CardFace nickname="Nubank pessoal" kind="credit" color="purple" />)
  const face = screen.getByTestId('card-face')
  expect(face.textContent).toContain('Nubank pessoal')
  expect(face.textContent).toContain('Crédito')
  expect(face.textContent).toContain('Íris')
  expect(face.textContent).not.toMatch(/\d/)
  expect(face.style.backgroundImage).toContain('#7a3fb0')
})
```

`src/features/cartoes/card-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { CardForm } = await import('./card-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Novo cartão: apelido, tipo, cor, aviso de privacidade e prévia ao vivo', () => {
  render(<CardForm action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  const nickname = screen.getByLabelText('Como você chama esse cartão?') as HTMLInputElement
  expect(nickname.maxLength).toBe(30)
  expect(screen.getByRole('radio', { name: 'Crédito' })).toHaveProperty('checked', true)
  const cores = screen.getByRole('group', { name: 'Cor' })
  expect(within(cores).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['green', 'purple', 'blue', 'orange', 'graphite', 'pink'])
  expect(within(cores).getByRole('radio', { name: 'Verde' })).toHaveProperty('checked', true)
  expect(screen.getByText('A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão.')).toBeTruthy()

  fireEvent.change(nickname, { target: { value: 'C6 viagens' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Débito' }))
  fireEvent.click(within(cores).getByRole('radio', { name: 'Azul' }))
  const face = screen.getByTestId('card-face')
  expect(face.textContent).toContain('C6 viagens')
  expect(face.textContent).toContain('Débito')
  expect(face.style.backgroundImage).toContain('#2563eb')
  expect(screen.getByRole('button', { name: 'Salvar cartão' })).toBeTruthy()
})

test('editar: vem preenchido, com o id escondido e "Salvar alterações"', () => {
  render(<CardForm action={action} card={{ id: 'k2', nickname: 'Inter', kind: 'debit', color: 'orange' }} />)
  expect((screen.getByLabelText('Como você chama esse cartão?') as HTMLInputElement).value).toBe('Inter')
  expect(screen.getByRole('radio', { name: 'Débito' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Laranja' })).toHaveProperty('checked', true)
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('k2')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erro no apelido aparece no campo e o resto continua escolhido', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { nickname: 'Falta o nome.' }, values: { nickname: '', kind: 'debit', color: 'pink' } },
    vi.fn(),
    false,
  ])
  render(<CardForm action={action} />)
  expect(screen.getByText('Falta o nome.')).toBeTruthy()
  expect(screen.getByRole('radio', { name: 'Débito' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Rosa' })).toHaveProperty('checked', true)
})
```

`src/features/cartoes/cards-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CardsList } from './cards-list'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)

test('cada cartão: editar, "Gasto neste cartão em {mês}" e "Ver gastos"', () => {
  render(
    <CardsList
      items={[{
        card: { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit', color: 'purple' },
        spentCents: 128450, spentLabel: 'Gasto neste cartão em setembro', gastosHref: '/extrato?mes=2026-09&cartao=k1',
      }]}
    />,
  )
  const card = screen.getByRole('article', { name: 'Nubank pessoal' })
  expect(within(card).getByRole('link', { name: 'Editar cartão Nubank pessoal' }).getAttribute('href')).toBe('/cartoes/k1')
  expect(card.textContent).toContain('Gasto neste cartão em setembro')
  expect(card.textContent).toContain(`R$${NBSP}1.284,50`)
  expect(within(card).getByRole('link', { name: 'Ver gastos' }).getAttribute('href')).toBe('/extrato?mes=2026-09&cartao=k1')
})

test('sem cartões: convite calmo para adicionar', () => {
  render(<CardsList items={[]} />)
  expect(screen.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Adicionar' }).getAttribute('href')).toBe('/cartoes/novo')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/cartoes`
Expected: FAIL — `Failed to resolve import "./view-model"` / `"./card-face"` / `"./card-form"` / `"./cards-list"`.

- [ ] **Step 3: Implementação** — seguir Interfaces. Em `CardForm`, apelido, tipo e cor ficam em `useState` (valores iniciais: `err?.values` → `card` → padrões) para a prévia; o `<form key={err ? err.submission : 'idle'}>` segue o padrão do `RecurrenceForm`. Cada cor: `<label className="relative flex size-11 cursor-pointer rounded-full has-[:checked]:ring-2 has-[:checked]:ring-selected has-[:checked]:ring-offset-2 has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]" style={{ backgroundImage: gradient }}><input type="radio" name="color" value={key} className="sr-only" /><span className="sr-only">{label}</span></label>`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/cartoes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cartoes/view-model.ts src/features/cartoes/view-model.test.ts src/features/cartoes/card-face.tsx src/features/cartoes/card-face.test.tsx src/features/cartoes/card-form.tsx src/features/cartoes/card-form.test.tsx src/features/cartoes/cards-list.tsx src/features/cartoes/cards-list.test.tsx
git commit -m "feat(cartoes): cartão desenhado, formulário e lista com o gasto do mês" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Páginas de Cartões e navegação

**Files:**
- Create: `src/app/(app)/cartoes/page.tsx`, `src/app/(app)/cartoes/novo/page.tsx`, `src/app/(app)/cartoes/[id]/page.tsx`
- Modify: `src/features/shell/nav-items.ts`, `src/app/(app)/mais/page.tsx`
- Test: `src/features/shell/nav-items.test.ts`, `src/features/shell/nav.test.tsx`, `src/features/shell/sidebar.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `loadLedger`, `loadCards`/`loadCard` (Task 3), `buildCartoes`/`CardsList`/`CardForm` (Task 5), `createCard`/`updateCard`/`deleteCard` (Task 4), `MonthNav` (`basePath`), `PageHeader`, `Button`, `ConfirmAction`, `FormAlert`, `parseMonthKey`, `monthOf`, `todayInSaoPaulo`.
- Produces:
  - Item `{ href: '/cartoes', label: 'Cartões', icon: CreditCard, match: ['/cartoes'] }`: no menu lateral logo depois de Contas (ordem do protótipo Desktop); "Mais" (celular) casa também com `/cartoes`; linha "Cartões" em `/mais` depois de Contas. Barra inferior sem mudança. Nenhuma rota de cartões é painel (`isSheetRoute` falso); `/extrato/parcelas/{id}` também não.
  - `/cartoes` — cabeçalho "Cartões" (Voltar para `/mais` só no celular) com botão verde "Adicionar" (ícone `Plus`, `/cartoes/novo`); `MonthNav basePath="/cartoes"` só quando há cartões; `CardsList`; rodapé "A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão." só quando há cartões (a lista vazia já convida).
  - `/cartoes/novo` — `PageHeader` "Novo cartão" (volta a `/cartoes`) + `CardForm action={createCard}`.
  - `/cartoes/[id]` — id inválido ou cartão inexistente → `notFound()`; `PageHeader` com o apelido; `?erro=1` → `FormAlert` "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; `CardForm action={updateCard} card={card}`; `ConfirmAction` "Excluir" → título `Excluir o cartão "{apelido}"?`, corpo `Os gastos feitos com ele continuam no histórico como "Cartão excluído". Os valores não mudam.`, "Excluir" · "Cancelar", `deleteCard`, `fields={{ id }}`.
  - Seu mês **não** ganha bloco de cartões (RF-61): `inicio/page.tsx` não muda.

- [ ] **Step 1: Testes que falham**

Em `sidebar.test.tsx`, a lista esperada passa a ser:

```ts
expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Contas', 'Cartões', 'Categorias', 'Configurações'])
```

Em `nav-items.test.ts`, substituir a primeira linha do teste de Contas por `expect(SIDEBAR_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/contas', '/cartoes', '/categorias', '/configuracoes'])` e acrescentar:

```ts
test('Cartões: menu lateral depois de Contas; no celular dentro de Mais; nada disso é painel', () => {
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual(['/inicio', '/extrato', '/mais'])
  expect(isActive('/cartoes', mais)).toBe(true)
  expect(isActive('/cartoes/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', mais)).toBe(true)
  for (const p of ['/cartoes', '/cartoes/novo', '/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) expect(isSheetRoute(p)).toBe(false)
  const extrato = SIDEBAR_ITEMS.find((i) => i.href === '/extrato')!
  expect(isActive('/extrato/parcelas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', extrato)).toBe(true)
})
```

Em `nav.test.tsx`, o laço do teste "…ficam dentro de Mais" passa a ser `for (const p of ['/mais', '/contas', '/contas/nova', '/cartoes', '/cartoes/novo', '/categorias', '/categorias/nova', '/configuracoes/nome'])`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — menu sem "Cartões"; `isActive('/cartoes', mais)` é `false`.

- [ ] **Step 3: Implementação**

- `nav-items.ts`: constante `CARTOES` com `CreditCard` (lucide); `SIDEBAR_ITEMS = [SEU_MES, EXTRATO, CONTAS, CARTOES, …]`; `match` do "Mais" = `['/mais', '/contas', '/cartoes', '/categorias', '/configuracoes']`.
- `mais/page.tsx`: `RowLink href="/cartoes" title="Cartões"` com `CreditCard` logo depois de Contas; atualizar o comentário (faltam Planejamento, Relatórios, Família).
- `cartoes/page.tsx`:

```tsx
export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const today = todayInSaoPaulo()
  const { mes } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const [{ transactions }, cards] = await Promise.all([loadLedger(), loadCards()])
  const v = buildCartoes({ month, cards, transactions })
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7">
      <div className="flex items-center gap-2">
        <div className="flex-1"><PageHeader title="Cartões" backHref="/mais" backOnMobileOnly /></div>
        <Button href="/cartoes/novo" className="min-h-11 gap-1.5 px-3.5 text-[15px]"><Plus className="size-[18px]" aria-hidden="true" />Adicionar</Button>
      </div>
      {cards.length > 0 && <MonthNav month={month} label={v.label} basePath="/cartoes" />}
      <CardsList items={v.items} />
      {cards.length > 0 && <p className="text-sm text-muted">A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão.</p>}
    </main>
  )
}
```

- `cartoes/novo` e `cartoes/[id]` seguem `categorias/nova/page.tsx` e `categorias/[id]/page.tsx` (validação `z.uuid()`, `notFound()`, `Promise.all` de `params`/`searchParams`, largura `max-w-[560px]`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos PASS; build com `/cartoes`, `/cartoes/novo`, `/cartoes/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/cartoes" "src/app/(app)/mais/page.tsx" src/features/shell
git commit -m "feat(cartoes): telas Cartões, Novo cartão e editar; Cartões na navegação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Anotar — "Como pagou?" com um toque por cartão (K6 A)

**Files:**
- Modify: `src/features/registro/schemas.ts` (`cardId` no gasto), `src/features/registro/form-values.ts` (`cardId`), `src/features/registro/actions.ts` (criar/editar com cartão), `src/features/registro/anotar-form.tsx`, `src/lib/refresh.ts`, `src/app/(app)/anotar/page.tsx`, `src/app/(app)/extrato/[id]/page.tsx`
- Test: `src/features/registro/schemas.test.ts`, `src/features/registro/form-values.test.ts`, `src/features/registro/actions.test.ts`, `src/features/registro/anotar-form.test.tsx` (acrescentar e ajustar)

**Interfaces:**
- Consumes: `CardRow` (Task 3), `cardColor` (Task 3), `loadCards`/`loadLastCardId` (Task 3), `CHIP`, RPC `create_recurring_transaction(…, p_card_id)` (Task 2).
- Produces:
  - `makeExpenseSchema(today)` aceita `cardId` (opcional): uuid válido → `cardId`; qualquer outra coisa → `null`. Com cartão, a saída tem `paymentMethod: null` (decisão 47). Saída: `{ amountCents, categoryId, note, paymentMethod, cardId, occurredOn }`.
  - `EditableRecord` ganha `cardId?: string | null`; `recordToFormValues` devolve também `cardId` (`''` sem cartão).
  - `createTransaction` (gasto): `insert` ganha `card_id` (e `payment_method: null` com cartão); a RPC de repetição recebe `p_card_id` (`null` sem cartão). Entrada: a RPC recebe `p_card_id: null`.
  - `updateTransaction` (gasto): payload ganha `card_id`; `card_deleted: false` só quando a pessoa escolheu um cartão ou uma forma de pagamento (senão a marca "Cartão excluído" continua).
  - `refreshMoneyViews()` revalida também `/cartoes`.
  - `AnotarForm` ganha props opcionais `cards?: CardRow[]` (padrão `[]`) e `lastCardId?: string | null` (padrão `null`). Gasto com cartões: `<fieldset>` "Como pagou?" entre "Com o quê?" e "Quando?", rádios `name="cardId"` — um chip por cartão (bolinha `cardColor(c.color).swatch` de 20×14 `aria-hidden` + apelido) e o chip tracejado "Outra forma" (`value=""`). Marcado de início: `err.values.cardId` → na edição, o cartão do registro → ao criar, `lastCardId`; se o id não está entre os cartões, "Outra forma". Com um cartão marcado, o `<select>` "Forma de pagamento" de Mais detalhes some. Sem cartões ou em entrada, nada muda.
  - `/anotar` carrega `cards` e `lastCardId`; `/extrato/[id]` carrega `cards` e passa `cardId: tx.cardId` no registro.

- [ ] **Step 1: Testes que falham (e ajustes dos existentes)**

Ajustes em testes existentes (as saídas agora têm o cartão):
- `schemas.test.ts:30` → `toEqual({ amountCents: 14230, categoryId: cat, occurredOn: today, note: 'café', paymentMethod: null, cardId: null })`.
- `form-values.test.ts:19` → o objeto esperado ganha `cardId: ''`.
- `actions.test.ts`: payload do teste "gasto movido para o mês anterior…" passa a ser `{ amount_cents: 15000, category_id: CAT, note: 'feira', payment_method: 'pix', card_id: null, card_deleted: false, occurred_on: '2026-08-15' }`; os dois payloads com `paid_on` (conta paga) ganham `card_id: null`; os dois payloads de `create_recurring_transaction` ganham `p_card_id: null`.

Em `src/features/registro/schemas.test.ts`:

```ts
test('gasto com cartão: a forma de pagamento fica vazia; id que não é de cartão é ignorado (decisão 47)', () => {
  const CARD = '9c1e3f2a-5b7d-4e8a-9c21-7d4e5f6a8b91'
  const s = makeExpenseSchema(today)
  const base = { amount: '10', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: 'pix' }
  expect(s.parse({ ...base, cardId: CARD })).toMatchObject({ cardId: CARD, paymentMethod: null })
  expect(s.parse({ ...base, cardId: '' })).toMatchObject({ cardId: null, paymentMethod: 'pix' })
  expect(s.parse({ ...base, cardId: 'nao-e-id' })).toMatchObject({ cardId: null, paymentMethod: 'pix' })
})
```

Em `src/features/registro/form-values.test.ts`:

```ts
test('registro com cartão leva o cartão para o formulário', () => {
  expect(recordToFormValues({ ...base, cardId: 'k1' }, '2026-09-30').cardId).toBe('k1')
})
```

Em `src/features/registro/actions.test.ts` (usa o `fakeCreate` do Plano 3 e o `fakeSupabase` de edição):

```ts
const CARD = '9c1e3f2a-5b7d-4e8a-9c21-7d4e5f6a8b91'

describe('gasto com cartão (K6 A)', () => {
  test('grava o cartão e deixa a forma de pagamento vazia', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix', cardId: CARD })))
    expect(calls).toEqual([
      {
        op: 'insert:transactions',
        filters: {},
        payload: { user_id: 'u1', kind: 'expense', amount_cents: 12000, category_id: CAT, note: null, payment_method: null, card_id: CARD, occurred_on: '2026-09-30' },
      },
    ])
    expect(h.revalidatePath).toHaveBeenCalledWith('/cartoes')
  })

  test('"Outra forma": sem cartão, vale a forma escolhida', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: 'pix', cardId: '' })))
    expect(calls[0].payload).toMatchObject({ card_id: null, payment_method: 'pix' })
  })

  test('conta que se repete com cartão leva o cartão para a função', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ kind: 'expense', amount: '39,90', categoryId: CAT, when: 'today', date: '', note: 'Streaming', paymentMethod: '', cardId: CARD, repeats: 'on', frequency: 'monthly' })))
    expect(calls[0]).toMatchObject({ op: 'rpc:create_recurring_transaction', payload: { p_card_id: CARD, p_payment_method: null } })
  })

  test('editar: trocar para um cartão tira a marca "Cartão excluído"; não escolher nada a mantém', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', cardId: CARD })))
    expect(calls[0].payload).toMatchObject({ card_id: CARD, payment_method: null, card_deleted: false })
    calls.length = 0
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, amount: '120', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '', cardId: '' })))
    expect(calls[0].payload).not.toHaveProperty('card_deleted')
    expect(calls[0].payload).toMatchObject({ card_id: null, payment_method: null })
  })
})
```

Em `src/features/registro/anotar-form.test.tsx` (importar `within`):

```tsx
const cards = [
  { id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const },
  { id: 'k2', nickname: 'Inter', kind: 'debit' as const, color: 'orange' as const },
]

describe('Como pagou? (K6 A)', () => {
  test('sem cartões, não aparece e a forma de pagamento continua em Mais detalhes', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.queryByRole('group', { name: 'Como pagou?' })).toBeNull()
    expect(screen.getByLabelText('Forma de pagamento')).toBeTruthy()
  })

  test('um toque por cartão, o último usado já marcado, e "Outra forma" que desmarca', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" />)
    const group = screen.getByRole('group', { name: 'Como pagou?' })
    expect(within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['k1', 'k2', ''])
    expect(within(group).getByRole('radio', { name: 'Inter' })).toHaveProperty('checked', true)
    expect((within(group).getByRole('radio', { name: 'Inter' }) as HTMLInputElement).name).toBe('cardId')
    expect(screen.queryByLabelText('Forma de pagamento')).toBeNull()
    fireEvent.click(within(group).getByRole('radio', { name: 'Outra forma' }))
    expect(within(group).getByRole('radio', { name: 'Inter' })).toHaveProperty('checked', false)
    expect(screen.getByLabelText('Forma de pagamento')).toBeTruthy()
  })

  test('último usado que não existe mais: "Outra forma" marcada (Review Focus 4)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="excluido" />)
    expect(screen.getByRole('radio', { name: 'Outra forma' })).toHaveProperty('checked', true)
  })

  test('na edição vem o cartão do registro, não o último usado', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today, cardId: 'k1' }
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" record={gasto} />)
    expect(screen.getByRole('radio', { name: 'Nubank pessoal' })).toHaveProperty('checked', true)
  })

  test('depois de um erro, o cartão escolhido continua marcado', () => {
    mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, message: 'x', values: { amount: '10', cardId: 'k1' } }, vi.fn(), false])
    render(<AnotarForm kind="expense" categories={categories} today={today} cards={cards} lastCardId="k2" />)
    expect(screen.getByRole('radio', { name: 'Nubank pessoal' })).toHaveProperty('checked', true)
  })

  test('entrada não mostra cartões', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} cards={cards} lastCardId="k1" />)
    expect(screen.queryByRole('group', { name: 'Como pagou?' })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro`
Expected: FAIL — saída do schema sem `cardId`; `Unable to find role="group" and name "Como pagou?"`; payload sem `card_id`; `/cartoes` não revalidado.

- [ ] **Step 3: Implementação**

- `schemas.ts`: no `makeExpenseSchema`, campo `cardId: z.string().optional().transform((s) => (s && z.uuid().safeParse(s).success ? s : null))`; no `transform` final, `paymentMethod: rest.cardId ? null : rest.paymentMethod`.
- `form-values.ts`: `cardId?: string | null` em `EditableRecord`; `cardId: r.cardId ?? ''` no retorno.
- `refresh.ts`: acrescentar `revalidatePath('/cartoes')`.
- `actions.ts`: `EXPENSE_FIELDS` ganha `'cardId'` (também em `ALL_FIELDS`). Nenhum filtro existente sai.
- `anotar-form.tsx`: `const [cardId, setCardId] = useState(initialCardId)` (regra acima); rádios controlados (`checked`/`onChange`), com `CHIP` e a classe extra `gap-2` (cartões) / `border-dashed` ("Outra forma"); bloco do `<select>` renderizado só com `cardId === ''`.
- `anotar/page.tsx`: `const [categories, cards, lastCardId] = await Promise.all([loadCategories(), loadCards(), loadLastCardId()])`. `extrato/[id]/page.tsx`: `loadCards()` no mesmo `Promise.all`, `cardId: tx.cardId` no `record`, `cards={cards}` no formulário.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro && npx tsc --noEmit`
Expected: PASS; sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro src/lib/refresh.ts "src/app/(app)/anotar/page.tsx" "src/app/(app)/extrato/[id]/page.tsx"
git commit -m "feat(registro): Como pagou? com um toque por cartão no Anotar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Anotar — "Foi parcelado"; parcelas protegidas na edição

**Files:**
- Modify: `src/features/registro/schemas.ts` (`readInstallments`, mensagens), `src/features/registro/actions.ts`, `src/features/registro/anotar-form.tsx`
- Test: `src/features/registro/schemas.test.ts`, `src/features/registro/actions.test.ts`, `src/features/registro/anotar-form.test.tsx` (acrescentar e ajustar)

**Interfaces:**
- Consumes: `MIN_INSTALLMENTS`/`MAX_INSTALLMENTS` (Task 1), RPC `create_installment_purchase` (Task 2), `parseRepeat`.
- Produces:
  - `INSTALLMENT_MESSAGES = { range: 'Escolha de 2 a 48 parcelas.', tooSmall: 'Valor pequeno demais para tantas parcelas.', oneOption: 'Escolha só uma opção: se repete ou parcelado.' } as const` (em `schemas.ts`, não no módulo `'use server'`).
  - `readInstallments(values: { parcelado: string; installments: string }): { count: number | null; error: string | null }` — `parcelado !== 'on'` → `{ count: null, error: null }`; senão só aceita `/^\d{1,2}$/` entre 2 e 48, senão `error: INSTALLMENT_MESSAGES.range`.
  - `createTransaction` (gasto, só ao criar): com `parcelado`, na ordem: erro do schema → erro de `readInstallments` → se repete junto (`oneOption`) → valor menor que o nº de parcelas (`tooSmall`) → data depois de hoje (`date: 'Escolha o dia.'`) → `rpc('create_installment_purchase', { p_amount_cents, p_count, p_category_id, p_note, p_card_id, p_payment_method, p_purchased_on })`. Aviso "Anotado. Seu mês já está atualizado."; vai para `/inicio`; erro da função → `SAVE_FAILED` mantendo tudo.
  - `updateTransaction` e `deleteTransaction` filtram também `.is('installment_plan_id', null)`: parcela e restante quitado nunca são alterados nem excluídos sozinhos (decisão 54). Os filtros existentes (`id`, `user_id`, `status`) ficam.
  - Formulário (gasto, só ao criar): dentro de "Mais detalhes", depois de "É uma conta que se repete", a caixa `name="parcelado" value="on"` "Foi parcelado" (copy). Marcada, mostra "Em quantas parcelas?" (`id`/`name="installments"`, `inputMode="numeric"`, `maxLength={2}`) com a dica `O valor em "Quanto foi?" é o total da compra.` e o erro do campo. As duas caixas nunca ficam marcadas juntas: marcar uma desmarca a outra (estado único `extra: 'repeat' | 'installments' | null`). `hasDetails` inclui `v.parcelado`.

- [ ] **Step 1: Testes que falham (e ajustes)**

Ajustes em `actions.test.ts`: acrescentar ao `makeBuilder` o método `is(col, val) { filters[col] = val; return builder }`; os filtros esperados de `update:transactions` e `delete:transactions` passam a incluir `installment_plan_id: null` (ex.: `{ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null }`). No `fakeSupabase`, acrescentar a opção `installment?: boolean`: quando verdadeira, `update` e `delete` com o filtro `installment_plan_id: null` devolvem `data: []` (simula o banco).

Em `src/features/registro/schemas.test.ts`:

```ts
test('readInstallments: só vale com "Foi parcelado" marcado, de 2 a 48', () => {
  expect(readInstallments({ parcelado: '', installments: '3' })).toEqual({ count: null, error: null })
  expect(readInstallments({ parcelado: 'on', installments: '3' })).toEqual({ count: 3, error: null })
  expect(readInstallments({ parcelado: 'on', installments: '48' })).toEqual({ count: 48, error: null })
  for (const bad of ['', '1', '49', 'dez', '2.5', '-3', '003']) {
    expect(readInstallments({ parcelado: 'on', installments: bad })).toEqual({ count: null, error: 'Escolha de 2 a 48 parcelas.' })
  }
})
```

Em `src/features/registro/actions.test.ts`:

```ts
describe('createTransaction parcelado (RN-07)', () => {
  const base = { kind: 'expense', amount: '300', categoryId: CAT, when: 'today', date: '', note: 'Tênis', paymentMethod: '', cardId: CARD, parcelado: 'on', installments: '3' }

  test('cria a compra e todas as parcelas de uma vez, com o total e o nº de parcelas', async () => {
    h.supabase = fakeCreate()
    const url = await redirectOf(createTransaction({ status: 'idle' }, form(base)))
    expect(url).toBe('/inicio')
    expect(calls).toEqual([
      {
        op: 'rpc:create_installment_purchase',
        filters: {},
        payload: { p_amount_cents: 30000, p_count: 3, p_category_id: CAT, p_note: 'Tênis', p_card_id: CARD, p_payment_method: null, p_purchased_on: '2026-09-30' },
      },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/cartoes')
  })

  test('nº de parcelas fora de 2 a 48 pede de novo e mantém o que foi digitado', async () => {
    h.supabase = fakeCreate()
    for (const bad of ['', '1', '49', 'dez']) {
      const state = await createTransaction({ status: 'idle' }, form({ ...base, installments: bad }))
      expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Escolha de 2 a 48 parcelas.' }, values: { parcelado: 'on', installments: bad, amount: '300' } })
    }
    expect(calls).toEqual([])
  })

  test('valor menor que o nº de parcelas', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, amount: '0,05', installments: '10' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Valor pequeno demais para tantas parcelas.' } })
    expect(calls).toEqual([])
  })

  test('parcelado e se repete juntos (formulário adulterado) não gravam nada (decisão 50)', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, repeats: 'on', frequency: 'monthly' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { installments: 'Escolha só uma opção: se repete ou parcelado.' } })
    expect(calls).toEqual([])
  })

  test('compra parcelada não tem data futura', async () => {
    h.supabase = fakeCreate()
    const state = await createTransaction({ status: 'idle' }, form({ ...base, when: 'other', date: '2026-10-05' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { date: 'Escolha o dia.' } })
    expect(calls).toEqual([])
  })

  test('falha na função mantém tudo o que foi digitado', async () => {
    h.supabase = fakeCreate({ rpcError: { message: 'x' } })
    const state = await createTransaction({ status: 'idle' }, form(base))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { parcelado: 'on', installments: '3', cardId: CARD } })
  })

  test('"Foi parcelado" desmarcado ignora o número', async () => {
    h.supabase = fakeCreate()
    await redirectOf(createTransaction({ status: 'idle' }, form({ ...base, parcelado: '', installments: '3' })))
    expect(calls.map((c) => c.op)).toEqual(['insert:transactions'])
  })
})

describe('parcela não é editada nem excluída sozinha (Review Focus 5, decisão 54)', () => {
  test('editar uma parcela pelo endereço não grava', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', installment: true })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '1', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls[0].filters).toMatchObject({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null })
  })

  test('excluir uma parcela pelo endereço não apaga nada', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', installment: true, deleted: [{ occurred_on: '2026-09-30' }] })
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
```

Em `src/features/registro/anotar-form.test.tsx`:

```tsx
describe('Foi parcelado (só gasto, só ao criar)', () => {
  test('dentro de Mais detalhes; marcado pede o nº de parcelas e explica o total', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const box = screen.getByLabelText('Foi parcelado') as HTMLInputElement
    expect(box.closest('details')).not.toBeNull()
    expect(box.name).toBe('parcelado')
    expect(screen.queryByLabelText('Em quantas parcelas?')).toBeNull()
    fireEvent.click(box)
    const count = screen.getByLabelText('Em quantas parcelas?') as HTMLInputElement
    expect(count.name).toBe('installments')
    expect(count.getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText('O valor em "Quanto foi?" é o total da compra.')).toBeTruthy()
  })

  test('parcelado e se repete nunca ficam marcados juntos (decisão 50)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    fireEvent.click(screen.getByLabelText('É uma conta que se repete'))
    expect(screen.getByRole('radio', { name: 'Todo mês' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Foi parcelado'))
    expect(screen.getByLabelText('É uma conta que se repete')).toHaveProperty('checked', false)
    expect(screen.queryByRole('radio', { name: 'Todo mês' })).toBeNull()
    fireEvent.click(screen.getByLabelText('É uma conta que se repete'))
    expect(screen.getByLabelText('Foi parcelado')).toHaveProperty('checked', false)
    expect(screen.queryByLabelText('Em quantas parcelas?')).toBeNull()
  })

  test('depois de um erro, continua marcado, com o número e a mensagem', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { installments: 'Escolha de 2 a 48 parcelas.' }, values: { amount: '300', parcelado: 'on', installments: '60' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    expect((screen.getByLabelText('Em quantas parcelas?') as HTMLInputElement).value).toBe('60')
    expect(screen.getByText('Escolha de 2 a 48 parcelas.')).toBeTruthy()
  })

  test('não existe na edição nem na entrada', () => {
    const gasto = { id: 'r1', kind: 'expense' as const, amountCents: 100, categoryId: '1', source: null, note: null, paymentMethod: null, occurredOn: today }
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(screen.queryByLabelText('Foi parcelado')).toBeNull()
    cleanup()
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.queryByLabelText('Foi parcelado')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro`
Expected: FAIL — `readInstallments is not a function`; `Unable to find a label with the text of: Foi parcelado`; `insert:transactions` onde se esperava `rpc:create_installment_purchase`; filtros sem `installment_plan_id`.

- [ ] **Step 3: Implementação**

- `schemas.ts`: `readInstallments` e `INSTALLMENT_MESSAGES` como em Interfaces (a faixa vem de `MIN_INSTALLMENTS`/`MAX_INSTALLMENTS`).
- `actions.ts`: `INSTALLMENT_FIELDS = ['parcelado', 'installments'] as const`; no gasto, `readFields(fd, [...EXPENSE_FIELDS, ...REPEAT_FIELDS, ...INSTALLMENT_FIELDS])`; a ordem de checagens de Interfaces; em `updateTransaction` e `deleteTransaction`, `.is('installment_plan_id', null)` logo depois dos `.eq` existentes.
- `anotar-form.tsx`: `RepeatOption` passa a receber `on`/`onToggle` (a entrada usa um `useState` próprio); novo `InstallmentOption({ on, onToggle, initialCount, error })` com a caixa no mesmo estilo de `RepeatOption` e o campo `h-11 w-28 rounded-control border border-control px-3 text-base` (`aria-describedby="installments-hint"` e, com erro, `installments-error`). Estado único `extra`, inicial `v.parcelado === 'on' ? 'installments' : v.repeats === 'on' ? 'repeat' : null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro`
Expected: PASS (inclusive os testes dos Planos 1–3, com os filtros ajustados).

- [ ] **Step 5: Commit**

```bash
git add src/features/registro
git commit -m "feat(registro): Foi parcelado no Anotar; parcela não é editada nem excluída sozinha" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A compra parcelada — montagem e ações (quitar, devolver, excluir)

**Files:**
- Create: `src/features/parcelas/view-model.ts`, `src/features/parcelas/actions.ts`
- Test: `src/features/parcelas/view-model.test.ts`, `src/features/parcelas/actions.test.ts`

**Interfaces:**
- Consumes: `PlanRow` (Task 3), `TxRow`, `Category`, `CardRow`/`paymentText` (Task 3), `remainingInstallments` (Task 1), `txName` (`@/features/contas/view-model`), `dayMonthLabel`, `dayMonthYearLabel`, `formatBRL`, `amountField`, RPCs `settle_installments`/`refund_installments`/`delete_installment_purchase` (Task 2), `refreshMoneyViews`, `setFlash`.
- Produces:
  - `interface PurchaseRow { id: string; title: string; detail: string; amountCents: Cents }`
  - `interface PurchaseView { id: string; title: string; totalText: string; payment: string | null; remainingText: string | null; statusText: string | null; canClose: boolean; remainingCents: Cents; rows: PurchaseRow[] }`
  - `buildPurchase(input: { plan: PlanRow; rows: TxRow[]; categories: Category[]; cards: CardRow[]; today: ISODate }): PurchaseView` — `title = txName(1ª parcela)` (nota, senão categoria, senão "Outros"); `totalText = '{total} em {n} parcelas'`; `payment = paymentText(1ª parcela, cards)`; linhas: parcelas por número (`Parcela {n} de {N}` · `dayMonthYearLabel`), depois o restante quitado (`Restante quitado`); só com `status 'active'`: `remainingText = 'Faltam {n} parcelas: {valor}.'` (`'Falta 1 parcela: {valor}.'`; `null` se não há futura) e `canClose = n > 0`; `statusText`: `'Quitada em {d de mês}.'` / `'Devolvida em {d de mês}.'` / `null`.
  - `settlePurchase(_: FormState, fd: FormData): Promise<FormState>` — campos `id`, `amount`; `rpc('settle_installments', { p_plan_id, p_amount_cents })`; aviso "Parcelas quitadas. Seu mês já está atualizado."; vai para `/extrato/parcelas/{id}`; valor inválido → erro no campo; id inválido ou erro da função → `SAVE_FAILED` mantendo o valor.
  - `refundPurchase(fd: FormData): Promise<void>` — `rpc('refund_installments', { p_plan_id })`; aviso "Parcelas canceladas. Seu mês já está atualizado."; vai para `/extrato/parcelas/{id}`; erro → `/extrato/parcelas/{id}?erro=1`; id inválido → `/extrato`.
  - `deletePurchase(fd: FormData): Promise<void>` — `rpc('delete_installment_purchase', { p_plan_id })`; aviso "Excluído. Seu mês já está atualizado." (texto do Plano 2); vai para `/extrato`; erro → `/extrato/parcelas/{id}?erro=1`; id inválido → `/extrato`.
  - As três chamam `requireUser()` primeiro e `refreshMoneyViews()` depois de gravar. O filtro por pessoa é o `auth.uid()` dentro de cada função SQL (Task 2).

- [ ] **Step 1: Testes que falham**

`src/features/parcelas/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import type { PlanRow } from './types'
import { buildPurchase } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'amountCents' | 'occurredOn'>): TxRow => ({
  kind: 'expense', categoryId: 'c1', source: null, note: 'Tênis', paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: '2026-07-10T12:00:00Z', cardId: 'k1', cardDeleted: false,
  installmentPlanId: 'p1', installmentNumber: null, installmentCount: null, ...p,
})
const inst = (n: number, occurredOn: string, extra: Partial<TxRow> = {}) =>
  row({ id: `i${n}`, amountCents: 10000, occurredOn, installmentNumber: n, installmentCount: 5, ...extra })
const categories = [{ id: 'c1', name: 'Compras', defaultKey: 'compras' }]
const cards = [{ id: 'k1', nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const }]
const plan: PlanRow = { id: 'p1', totalCents: 50000, count: 5, purchasedOn: '2026-07-10', status: 'active', closedOn: null }
const five = [inst(1, '2026-07-10'), inst(2, '2026-08-10'), inst(3, '2026-09-10'), inst(4, '2026-10-10'), inst(5, '2026-11-10')]
const today = '2026-09-30'

describe('buildPurchase (RF-14)', () => {
  test('compra ativa: total, cartão, o que falta e as parcelas', () => {
    const v = buildPurchase({ plan, rows: five, categories, cards, today })
    expect(v).toMatchObject({
      id: 'p1', title: 'Tênis', totalText: `${brl('500,00')} em 5 parcelas`, payment: 'Nubank pessoal',
      remainingText: `Faltam 2 parcelas: ${brl('200,00')}.`, statusText: null, canClose: true, remainingCents: 20000,
    })
    expect(v.rows.map((r) => [r.title, r.detail, r.amountCents])).toEqual([
      ['Parcela 1 de 5', '10 de julho de 2026', 10000],
      ['Parcela 2 de 5', '10 de agosto de 2026', 10000],
      ['Parcela 3 de 5', '10 de setembro de 2026', 10000],
      ['Parcela 4 de 5', '10 de outubro de 2026', 10000],
      ['Parcela 5 de 5', '10 de novembro de 2026', 10000],
    ])
  })

  test('uma só falta: singular', () => {
    expect(buildPurchase({ plan, rows: five, categories, cards, today: '2026-10-10' }).remainingText).toBe(`Falta 1 parcela: ${brl('100,00')}.`)
  })

  test('parcela de hoje já contou; sem futura, nada a quitar (Review Focus 3)', () => {
    const v = buildPurchase({ plan, rows: five, categories, cards, today: '2026-11-10' })
    expect(v).toMatchObject({ remainingText: null, canClose: false, remainingCents: 0 })
  })

  test('quitada: restante no fim, sem ações', () => {
    const rows = [...five.slice(0, 3), row({ id: 'q', amountCents: 18000, occurredOn: '2026-09-30' })]
    const v = buildPurchase({ plan: { ...plan, status: 'settled', closedOn: '2026-09-30' }, rows, categories, cards, today })
    expect(v).toMatchObject({ statusText: 'Quitada em 30 de setembro.', remainingText: null, canClose: false })
    expect(v.rows.at(-1)).toEqual({ id: 'q', title: 'Restante quitado', detail: '30 de setembro de 2026', amountCents: 18000 })
  })

  test('devolvida', () => {
    const v = buildPurchase({ plan: { ...plan, status: 'refunded', closedOn: '2026-09-30' }, rows: five.slice(0, 3), categories, cards, today })
    expect(v).toMatchObject({ statusText: 'Devolvida em 30 de setembro.', canClose: false })
    expect(v.rows).toHaveLength(3)
  })

  test('sem nota usa a categoria; cartão excluído aparece assim', () => {
    const rows = five.map((r) => ({ ...r, note: null, cardId: null, cardDeleted: true }))
    expect(buildPurchase({ plan, rows, categories, cards, today })).toMatchObject({ title: 'Compras', payment: 'Cartão excluído' })
  })
})
```

`src/features/parcelas/actions.test.ts` (mesmo cabeçalho de mocks, `RedirectSignal`, `redirectOf`, `form`, `ID`, `SAVE_FAILED`, relógio falso e `beforeEach` de `src/features/cartoes/actions.test.ts`):

```ts
function fakeSupabase(s: { rpcError?: unknown } = {}) {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      return { data: null, error: s.rpcError ?? null }
    },
  }
}

describe('settlePurchase (RN-08)', () => {
  test('quita com o valor pago e volta para a compra', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '180' })))
    expect(url).toBe(`/extrato/parcelas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:settle_installments', filters: {}, payload: { p_plan_id: ID, p_amount_cents: 18000 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Parcelas quitadas. Seu mês já está atualizado.')
    for (const path of ['/inicio', '/extrato', '/contas', '/cartoes']) expect(h.revalidatePath).toHaveBeenCalledWith(path)
  })

  test('valor vazio pede o valor', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } })
    expect(calls).toEqual([])
  })

  test('toque duplo, compra de outra pessoa ou já quitada: avisa sem perder o valor (Review Focus 5)', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Compra não encontrada.' } })
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: ID, amount: '180' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '180' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido não chama o banco', async () => {
    h.supabase = fakeSupabase()
    const state = await actions.settlePurchase({ status: 'idle' }, form({ id: 'x', amount: '180' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
  })
})

describe('refundPurchase (RN-09)', () => {
  test('cancela as futuras e volta para a compra', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.refundPurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:refund_installments', filters: {}, payload: { p_plan_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Parcelas canceladas. Seu mês já está atualizado.')
  })

  test('falha volta para a compra com aviso de erro; id inválido vai para o Extrato', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.refundPurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}?erro=1`)
    expect(await redirectOf(actions.refundPurchase(form({ id: 'x' })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deletePurchase', () => {
  test('exclui a compra inteira e volta ao Extrato', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deletePurchase(form({ id: ID })))).toBe('/extrato')
    expect(calls).toEqual([{ op: 'rpc:delete_installment_purchase', filters: {}, payload: { p_plan_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('falha volta para a compra com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'x' } })
    expect(await redirectOf(actions.deletePurchase(form({ id: ID })))).toBe(`/extrato/parcelas/${ID}?erro=1`)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/parcelas`
Expected: FAIL — `Failed to resolve import "./view-model"` / `"./actions"`.

- [ ] **Step 3: Implementação** — `view-model.ts` puro, seguindo Interfaces (parcelas: `installmentNumber !== null`, ordenadas; restante: `installmentNumber === null`). `actions.ts` com `'use server'`, só funções async; `SAVE_FAILED` local não exportado; `z.uuid()` no id; `z.object({ amount: amountField })` sobre `readFields(fd, ['amount'])`; `redirect()` fora de `try`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/parcelas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/parcelas/view-model.ts src/features/parcelas/view-model.test.ts src/features/parcelas/actions.ts src/features/parcelas/actions.test.ts
git commit -m "feat(parcelas): montagem da compra, quitar, devolver e excluir" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Telas da compra parcelada e "Quitar antecipadamente"

**Files:**
- Create: `src/features/parcelas/settle-form.tsx`, `src/app/(app)/extrato/parcelas/[id]/page.tsx`, `src/app/(app)/extrato/parcelas/[id]/quitar/page.tsx`
- Modify: `src/app/(app)/extrato/[id]/page.tsx` (parcela → compra)
- Test: `src/features/parcelas/settle-form.test.tsx`

**Interfaces:**
- Consumes: `loadPurchase` (Task 3), `loadCategories`, `loadCards` (Task 3), `buildPurchase`/`settlePurchase`/`refundPurchase`/`deletePurchase` (Task 9), `centsToInput`, `PageHeader`, `ListSection`/`ListCard`/`ListRow`, `Money`, `Button`, `ConfirmAction`, `FormAlert`.
- Produces:
  - `SettleForm({ id, amountCents }: { id: string; amountCents: number })` — igual ao `ReceiveForm` do Plano 3, com a ação `settlePurchase`, rótulo "Quanto foi?" (copy do gasto), valor inicial `centsToInput(amountCents)`, `input hidden id` e o botão "Quitar parcelas" (desativado enquanto salva).
  - `/extrato/parcelas/[id]` — id inválido ou compra inexistente → `notFound()`; `PageHeader` com `v.title` (volta a `/extrato`); `?erro=1` → `FormAlert` "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; resumo `data-testid="compra-resumo"` (cartão branco: `totalText`, `payment`, `remainingText`, `statusText`, cada um numa linha quando existe); `ListSection` "Parcelas" com uma linha por `v.rows` (título, detalhe e valor); com `v.canClose`: `Button href="/extrato/parcelas/{id}/quitar" variant="secondary"` "Quitar antecipadamente" e `ConfirmAction` "Cancelar por devolução" → título "Cancelar as parcelas por devolução?", corpo "As parcelas que ainda não chegaram deixam de existir. As que já contaram continuam no seu histórico.", "Cancelar parcelas" · "Agora não", `refundPurchase`, `fields={{ id }}`; sempre: `ConfirmAction` "Excluir" → título "Excluir esta compra?", corpo "Todas as parcelas saem do seu histórico. Seu mês será recalculado.", "Excluir" · "Cancelar", `deletePurchase`.
  - `/extrato/parcelas/[id]/quitar` — compra inexistente → `notFound()`; sem `canClose` → `redirect('/extrato/parcelas/{id}')`; `PageHeader` "Quitar antecipadamente" (volta à compra); parágrafo `{v.remainingText} Se pagou outro valor, é só ajustar.`; `SettleForm id amountCents={v.remainingCents}`.
  - `/extrato/[id]` de uma parcela ou do restante quitado → `redirect('/extrato/parcelas/{installmentPlanId}')` (fora de `try`), antes do formulário.

- [ ] **Step 1: Teste que falha** — `src/features/parcelas/settle-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ settlePurchase: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { SettleForm } = await import('./settle-form')
const { settlePurchase } = await import('./actions')
const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('vem com o que falta para a pessoa ajustar', () => {
  render(<SettleForm id="p1" amountCents={20000} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(settlePurchase)
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('200,00')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('p1')
  expect(screen.getByRole('button', { name: 'Quitar parcelas' })).toHaveProperty('disabled', false)
})

test('erro mantém o valor digitado; botão trava enquanto salva (toque duplo)', () => {
  mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } }, vi.fn(), false])
  const { rerender } = render(<SettleForm id="p1" amountCents={20000} />)
  expect(screen.getByText('Falta o valor.')).toBeTruthy()
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('')
  mockUseActionState.mockReturnValueOnce([{ status: 'idle' }, vi.fn(), true])
  rerender(<SettleForm id="p1" amountCents={20000} />)
  expect(screen.getByRole('button', { name: 'Quitar parcelas' })).toHaveProperty('disabled', true)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/parcelas/settle-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./settle-form"`.

- [ ] **Step 3: Implementação** — `settle-form.tsx` copia a estrutura do `ReceiveForm` (campo grande, `FormAlert`, `Button h-[52px]`). A página da compra:

```tsx
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function CompraParceladaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const [purchase, categories, cards] = await Promise.all([loadPurchase(id), loadCategories(), loadCards()])
  if (!purchase) notFound()
  const v = buildPurchase({ ...purchase, categories, cards, today: todayInSaoPaulo() })
  const secondary = 'flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas'
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={v.title} backHref="/extrato" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <section data-testid="compra-resumo" className="flex flex-col gap-1.5 rounded-card border border-line bg-card p-4 text-[15px] shadow-card">
        <p className="text-[17px] font-semibold text-ink">{v.totalText}</p>
        {v.payment && <p>{v.payment}</p>}
        {v.remainingText && <p>{v.remainingText}</p>}
        {v.statusText && <p>{v.statusText}</p>}
      </section>
      <ListSection title="Parcelas">
        <ListCard>
          {v.rows.map((r) => (
            <ListRow key={r.id}>
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5"><span className="text-[15px] text-ink">{r.title}</span><span className="text-[13px] text-muted">{r.detail}</span></span>
                <Money cents={r.amountCents} className="num shrink-0 text-[15px] font-medium text-ink" />
              </div>
            </ListRow>
          ))}
        </ListCard>
      </ListSection>
      {v.canClose && (
        <>
          <Button href={`/extrato/parcelas/${v.id}/quitar`} variant="secondary" className="min-h-12">Quitar antecipadamente</Button>
          <ConfirmAction
            trigger="Cancelar por devolução" triggerClassName={secondary}
            title="Cancelar as parcelas por devolução?"
            body="As parcelas que ainda não chegaram deixam de existir. As que já contaram continuam no seu histórico."
            confirmLabel="Cancelar parcelas" cancelLabel="Agora não" action={refundPurchase} fields={{ id: v.id }}
          />
        </>
      )}
      <ConfirmAction
        trigger="Excluir" triggerClassName={secondary}
        title="Excluir esta compra?" body="Todas as parcelas saem do seu histórico. Seu mês será recalculado."
        confirmLabel="Excluir" cancelLabel="Cancelar" action={deletePurchase} fields={{ id: v.id }}
      />
    </main>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos PASS; build com `/extrato/parcelas/[id]` e `/extrato/parcelas/[id]/quitar`.

- [ ] **Step 5: Commit**

```bash
git add src/features/parcelas/settle-form.tsx src/features/parcelas/settle-form.test.tsx "src/app/(app)/extrato/parcelas" "src/app/(app)/extrato/[id]/page.tsx"
git commit -m "feat(parcelas): tela da compra, quitar antecipadamente e devolução" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Extrato — filtro por cartão, cartão e parcela em cada linha

**Files:**
- Modify: `src/features/extrato/view-model.ts`, `src/features/extrato/filters-bar.tsx`, `src/features/extrato/extrato-list.tsx`, `src/app/(app)/extrato/page.tsx`
- Test: `src/features/extrato/view-model.test.ts`, `src/features/extrato/filters-bar.test.tsx`, `src/features/extrato/extrato-list.test.tsx` (acrescentar e ajustar)

**Interfaces:**
- Consumes: `CardRow`/`paymentText`/`DELETED_CARD` (Task 3), `installmentBadge` (Task 1), `loadCards`.
- Produces:
  - `ExtratoFilters` ganha `cardId: string | null`. `parseExtratoFilters` lê `cartao` (uuid; senão `null`); cartão ou categoria implicam `kind: 'expense'`.
  - `extratoParams`: `mes`; `categoria` se houver, senão `tipo` só quando **não** há cartão; `cartao` se houver; `q` se houver (ordem fixa — `'/extrato?mes=2026-09&cartao=k1'` é o mesmo endereço que `buildCartoes` monta).
  - `buildExtrato` recebe `cards: CardRow[]` (obrigatório); cartão que não existe é ignorado (`filters.cardId = null`); filtra `t.cardId === cardId`; a busca usa `paymentText(t, cards)` no lugar do rótulo da forma (acha pelo apelido e por "Cartão excluído"). `ExtratoView` ganha `cardName: string | null`.
  - `ExtratoRow` ganha `href: string` e `badge: string | null`. Gasto: `subtitle = paymentText(t, cards)`; parcela → `badge = installmentBadge(n, N)` e `href = '/extrato/parcelas/{planId}'`; restante quitado → `badge = 'restante das parcelas'`, mesmo `href`; os demais → `href = '/extrato/{id}'`, `badge = null`.
  - `FiltersBar` recebe também `cards: CardRow[]` e `cardName: string | null`. Com cartões, um terceiro menu `<details role="group" aria-label="Cartão">` (mesmo visual do de Categoria; resumo = apelido escolhido ou "Cartão"), cada apelido é link que liga/desliga o cartão mantendo categoria e busca. "Entradas"/"Gastos" limpam categoria **e** cartão; "Gastos" só aparece marcado sem categoria e sem cartão. A busca leva `cartao` escondido.
  - `ExtratoList` usa `r.href`; mostra o selo (`rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-inactive`, protótipo do Extrato) ao lado do subtítulo; "Limpar filtros" limpa também o cartão.
  - `extrato/page.tsx` carrega `loadCards()` junto com `loadLedger()`.

- [ ] **Step 1: Testes que falham (e ajustes)**

Ajustes: em `view-model.test.ts`, o ajudante `f` ganha `cardId: null` e `build` passa `cards: []`; comparações de linhas inteiras ganham `href: '/extrato/{id}'` e `badge: null`. Em `filters-bar.test.tsx` e `extrato-list.test.tsx`, os objetos de filtros ganham `cardId: null`, as linhas ganham `href`/`badge`, e `FiltersBar` recebe `cards={[]} cardName={null}`.

Em `src/features/extrato/view-model.test.ts`:

```ts
const K1 = '44444444-4444-4444-8444-444444444444'
const cards = [{ id: K1, nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const }]
const withCards: TxRow[] = [
  row({ id: 'c1', kind: 'expense', amountCents: 12000, occurredOn: '2026-09-20', categoryId: MERCADO, cardId: K1 }),
  row({ id: 'c2', kind: 'expense', amountCents: 10000, occurredOn: '2026-09-10', categoryId: SAUDE, note: 'Óculos', cardId: K1, installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 5 }),
  row({ id: 'c3', kind: 'expense', amountCents: 18000, occurredOn: '2026-09-15', categoryId: SAUDE, note: 'Óculos', cardDeleted: true, installmentPlanId: 'p2' }),
  row({ id: 'c4', kind: 'expense', amountCents: 3000, occurredOn: '2026-09-12', categoryId: MERCADO, paymentMethod: 'pix' }),
]
const buildWith = (p: Partial<ExtratoFilters>) => buildExtrato({ filters: f(p), today, categories, transactions: withCards, cards })

describe('cartões e parcelas no Extrato (RF-60, RF-14)', () => {
  test('lê e escreve o filtro de cartão; cartão implica gastos', () => {
    expect(parseExtratoFilters({ cartao: K1, tipo: 'entradas' }, today)).toEqual(f({ kind: 'expense', cardId: K1 }))
    expect(parseExtratoFilters({ cartao: 'x' }, today)).toEqual(f())
    expect(extratoHref(f({ kind: 'expense', cardId: K1 }))).toBe(`/extrato?mes=2026-09&cartao=${K1}`)
    expect(extratoHref(f({ kind: 'expense', categoryId: MERCADO, cardId: K1, q: 'x' }))).toBe(`/extrato?mes=2026-09&categoria=${MERCADO}&cartao=${K1}&q=x`)
  })

  test('filtra pelo cartão; cartão desconhecido é ignorado', () => {
    const v = buildWith({ kind: 'expense', cardId: K1 })
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c1', 'c2'])
    expect(v.cardName).toBe('Nubank pessoal')
    const unknown = buildWith({ kind: 'expense', cardId: '55555555-5555-4555-8555-555555555555' })
    expect(unknown.filters.cardId).toBeNull()
    expect(unknown.cardName).toBeNull()
  })

  test('cada linha: cartão (ou "Cartão excluído", ou a forma), selo da parcela e link da compra (Review Focus 4)', () => {
    const rows = Object.fromEntries(buildWith({}).groups.flatMap((g) => g.rows).map((r) => [r.id, r]))
    expect(rows.c1).toMatchObject({ subtitle: 'Nubank pessoal', badge: null, href: '/extrato/c1' })
    expect(rows.c2).toMatchObject({ title: 'Saúde · Óculos', subtitle: 'Nubank pessoal', badge: 'parcela 2 de 5', href: '/extrato/parcelas/p1' })
    expect(rows.c3).toMatchObject({ subtitle: 'Cartão excluído', badge: 'restante das parcelas', href: '/extrato/parcelas/p2' })
    expect(rows.c4).toMatchObject({ subtitle: 'Pix', badge: null })
  })

  test('busca acha pelo apelido do cartão e por "Cartão excluído"', () => {
    expect(buildWith({ q: 'nubank' }).groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c1', 'c2'])
    expect(buildWith({ q: 'excluido' }).groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c3'])
  })
})
```

Em `src/features/extrato/filters-bar.test.tsx`:

```tsx
const K1 = '44444444-4444-4444-8444-444444444444'
const cards = [{ id: K1, nickname: 'Nubank pessoal', kind: 'credit' as const, color: 'purple' as const }]

test('filtro Cartão só com cartões; liga e desliga mantendo a categoria; Gastos limpa o cartão', () => {
  const { rerender } = render(<FiltersBar filters={{ month: '2026-09', kind: null, categoryId: null, cardId: null, q: '' }} categories={categories} categoryName={null} cards={[]} cardName={null} />)
  expect(screen.queryByRole('group', { name: 'Cartão' })).toBeNull()
  rerender(<FiltersBar filters={{ month: '2026-09', kind: 'expense', categoryId: MERCADO, cardId: K1, q: '' }} categories={categories} categoryName="Mercado" cards={cards} cardName="Nubank pessoal" />)
  const group = screen.getByRole('group', { name: 'Cartão' })
  expect(group.querySelector('summary')?.textContent).toContain('Nubank pessoal')
  const link = within(group).getByRole('link', { name: 'Nubank pessoal' })
  expect(link.getAttribute('aria-current')).toBe('true')
  expect(link.getAttribute('href')).toBe(`/extrato?mes=2026-09&categoria=${MERCADO}`)
  expect(screen.getByRole('link', { name: 'Gastos' }).getAttribute('href')).toBe('/extrato?mes=2026-09&tipo=gastos')
  expect((screen.getByRole('search').querySelector('input[name="cartao"]') as HTMLInputElement).value).toBe(K1)
  expect(within(group).getByRole('link', { name: 'Nubank pessoal' }).className).toContain('min-h-11')
})
```

Em `src/features/extrato/extrato-list.test.tsx`:

```tsx
test('parcela: selo do protótipo e link para a compra', () => {
  render(
    <ExtratoList
      view={{
        ...base,
        groups: [{ date: '2026-09-22', label: 'Hoje', rows: [{ id: 't9', kind: 'expense', title: 'Compras · tênis', subtitle: 'Nubank pessoal', cents: 8450, href: '/extrato/parcelas/p1', badge: 'parcela 2 de 5' }] }],
      }}
    />,
  )
  const link = screen.getByRole('link', { name: /Compras · tênis/ })
  expect(link.getAttribute('href')).toBe('/extrato/parcelas/p1')
  expect(link.textContent).toContain('Nubank pessoal')
  expect(link.textContent).toContain('parcela 2 de 5')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/extrato`
Expected: FAIL — `cartao` ignorado; linhas sem `href`/`badge`; sem o grupo "Cartão".

- [ ] **Step 3: Implementação** — seguir Interfaces; `toRow` recebe `cards`. Em `extrato/page.tsx`: `const [{ categories, transactions }, cards] = await Promise.all([loadLedger(), loadCards()])`, `buildExtrato({ filters, today, categories, transactions, cards })` e `<FiltersBar … cards={cards} cardName={view.cardName} />`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/extrato && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/extrato "src/app/(app)/extrato/page.tsx"
git commit -m "feat(extrato): filtro por cartão, cartão e parcela em cada registro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Ponta a ponta, verificação completa e registro

**Files:**
- Create: `tests/e2e/plano4.spec.ts`
- Modify: `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo acima; `todayInSaoPaulo`, `addMonths`, `monthOf`, `dayMonthLabel` (`src/domain/dates`), `monthName`, `dueDateIn` (`src/domain/recurrence`), `splitInstallments` (`src/domain/installments`).
- Produces: 3 testes (celular: 2; desktop: 1) → 6 entradas em `npx playwright test --list` para este arquivo. Limpeza por worker com prefixo único (padrão de `tests/e2e/plano3.spec.ts`); nomes de papel exatos.

- [ ] **Step 1: Escrever os testes de ponta a ponta** — `tests/e2e/plano4.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, dayMonthLabel, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn, monthName } from '../../src/domain/recurrence'
import { splitInstallments } from '../../src/domain/installments'

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
const RUN_PREFIX = `e2e-p4-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const next = addMonths(current, 1)
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

async function addCard(userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('cards').insert({ user_id: userId, ...row }).select('id').single()
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

// Rádios escondidos (chips, tipo, cor): clica no rótulo que contém o rádio com esse nome exato.
async function pick(page: Page, name: string): Promise<void> {
  await page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click()
}

const saiu = (page: Page) => page.getByText('Saiu', { exact: true }).locator('..')

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

test('cartão: cadastrar, anotar com um toque, ver o total e excluir sem mudar valores', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais', exact: true }).click()
  await page.getByRole('link', { name: 'Cartões', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cartões' })).toBeVisible()
  await expect(page.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeVisible()
  await page.getByRole('link', { name: 'Adicionar', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Novo cartão' })).toBeVisible()
  await page.getByLabel('Como você chama esse cartão?').fill('Nubank pessoal')
  await pick(page, 'Roxo')
  await expect(page.getByTestId('card-face')).toContainText('Nubank pessoal')
  await page.getByRole('button', { name: 'Salvar cartão', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Cartão criado.')
  const cartao = page.getByRole('article', { name: 'Nubank pessoal' })
  await expect(cartao).toContainText(`Gasto neste cartão em ${monthName(Number(current.slice(5)))}`)
  await expect(cartao).toContainText(brl('0,00'))

  // Sem gasto anterior, "Outra forma" vem marcada; um toque escolhe o cartão.
  await page.goto('/anotar')
  const comoPagou = page.getByRole('group', { name: 'Como pagou?' })
  await expect(comoPagou.getByRole('radio', { name: 'Outra forma', exact: true })).toBeChecked()
  await page.getByLabel('Quanto foi?').fill('120')
  await pick(page, 'Mercado')
  await pick(page, 'Nubank pessoal')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(page.locator('main')).not.toContainText('Gasto neste cartão') // RF-61

  // O cartão do último gasto já vem marcado.
  await page.goto('/anotar')
  await expect(page.getByRole('group', { name: 'Como pagou?' }).getByRole('radio', { name: 'Nubank pessoal', exact: true })).toBeChecked()

  await page.goto('/cartoes')
  await expect(page.getByRole('article', { name: 'Nubank pessoal' })).toContainText(brl('120,00'))
  await page.getByRole('article', { name: 'Nubank pessoal' }).getByRole('link', { name: 'Ver gastos', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/extrato\\?mes=${current}&cartao=`))
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('Mercado')
  await expect(hoje).toContainText('Nubank pessoal')

  // Excluir o cartão: o gasto continua, com o mesmo valor, como "Cartão excluído" (Review Focus 4).
  await page.goto('/cartoes')
  await page.getByRole('link', { name: 'Editar cartão Nubank pessoal', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nubank pessoal' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Excluir o cartão "Nubank pessoal"?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Cartão excluído.')
  await expect(page.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeVisible()

  await page.goto('/extrato')
  const depois = page.getByRole('region', { name: 'Hoje' })
  await expect(depois).toContainText('Cartão excluído')
  await expect(depois).toContainText(brl('120,00'))
  await page.goto('/inicio')
  await expect(saiu(page)).toContainText(brl('120,00'))
  await page.goto('/anotar')
  await expect(page.getByRole('group', { name: 'Como pagou?' })).toHaveCount(0)
})

test('parcelado: anotar em 3x, cada mês com a sua parcela, quitar o restante', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await entrar(page, u.email)

  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('300')
  await pick(page, 'Compras')
  await page.getByText('Mais detalhes', { exact: true }).click()
  await page.getByLabel('Uma nota, se quiser').fill('Tênis')
  await page.getByLabel('Foi parcelado').check()
  await page.getByLabel('Em quantas parcelas?').fill('3')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(saiu(page)).toContainText(brl('100,00'))
  await page.goto(`/inicio?mes=${next}`)
  await expect(saiu(page)).toContainText(brl('100,00'))

  await page.goto('/extrato')
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('parcela 1 de 3')
  await hoje.getByRole('link', { name: /^Compras · Tênis/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tênis' })).toBeVisible()
  const resumo = page.getByTestId('compra-resumo')
  await expect(resumo).toContainText(`${brl('300,00')} em 3 parcelas`)
  await expect(resumo).toContainText(`Faltam 2 parcelas: ${brl('200,00')}.`)

  await page.getByRole('link', { name: 'Quitar antecipadamente', exact: true }).click()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('200,00')
  await page.getByLabel('Quanto foi?').fill('180')
  await page.getByRole('button', { name: 'Quitar parcelas', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Parcelas quitadas. Seu mês já está atualizado.')
  await expect(page.getByTestId('compra-resumo')).toContainText(`Quitada em ${dayMonthLabel(today)}.`)
  await expect(page.getByRole('region', { name: 'Parcelas' })).toContainText('Restante quitado')
  await expect(page.getByRole('link', { name: 'Quitar antecipadamente', exact: true })).toHaveCount(0)

  await page.goto('/inicio')
  await expect(saiu(page)).toContainText(brl('280,00'))
  await page.goto(`/extrato?mes=${next}`)
  await expect(page.getByText('Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.')).toBeVisible()
})

test('desktop: Cartões no menu lateral, gastos do cartão no Extrato e devolução', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  const compras = await categoryOf(u.id, 'compras')
  const card = await addCard(u.id, { nickname: 'Inter', kind: 'debit', color: 'orange' })
  // Compra do mês passado em 4x: parcela 2 neste mês (até hoje), 3 e 4 futuras.
  const purchasedOn = dueDateIn(addMonths(current, -1), day)
  const { data: plan, error } = await admin
    .from('installment_plans').insert({ user_id: u.id, total_cents: 40000, installment_count: 4, purchased_on: purchasedOn }).select('id').single()
  if (error) throw error
  const { error: e2 } = await admin.from('transactions').insert(
    splitInstallments(40000, 4, purchasedOn).map((p) => ({
      user_id: u.id, kind: 'expense', amount_cents: p.amountCents, category_id: compras, note: 'Cadeira', card_id: card,
      occurred_on: p.occurredOn, installment_plan_id: plan.id, installment_number: p.number, installment_count: 4,
    })),
  )
  if (e2) throw e2
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Cartões', exact: true }).click()
  await expect(page).toHaveURL(/\/cartoes$/)
  const inter = page.getByRole('article', { name: 'Inter' })
  await expect(inter).toContainText(brl('100,00'))
  await inter.getByRole('link', { name: 'Ver gastos', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Cartão' })).toContainText('Inter')
  const linha = page.getByRole('link', { name: /^Compras · Cadeira/ })
  await expect(linha).toContainText('parcela 2 de 4')
  await linha.click()

  await expect(page.getByRole('heading', { level: 1, name: 'Cadeira' })).toBeVisible()
  await expect(page.getByTestId('compra-resumo')).toContainText(`Faltam 2 parcelas: ${brl('200,00')}.`)
  await page.getByRole('button', { name: 'Cancelar por devolução', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Cancelar as parcelas por devolução?' }).getByRole('button', { name: 'Cancelar parcelas', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Parcelas canceladas. Seu mês já está atualizado.')
  await expect(page.getByTestId('compra-resumo')).toContainText(`Devolvida em ${dayMonthLabel(today)}.`)
  await expect(page.getByRole('region', { name: 'Parcelas' }).getByRole('listitem')).toHaveCount(2)

  await page.goto(`/cartoes?mes=${next}`)
  await expect(page.getByRole('article', { name: 'Inter' })).toContainText(brl('0,00'))
  await page.goto('/cartoes')
  await expect(page.getByRole('article', { name: 'Inter' })).toContainText(brl('100,00'))
})
```

- [ ] **Step 2: Conferir a lista e rodar**

Run: `npx playwright test --list tests/e2e/plano4.spec.ts`
Expected: 6 entradas (3 testes × 2 projetos; os `test.skip` de projeto são resolvidos ao rodar).

Run (com Docker): `npx supabase db reset && npm run test:db && npm run test:e2e`
Expected: PASS em todos os arquivos (`nucleo`, `plano2`, `plano3`, `plano4`). Sem Docker: registrar como pendente.

- [ ] **Step 3: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes unitários e de componentes passando; tipos, lint e build sem erros. Conferir textos: `grep -rniE "fatura|text-red|bg-red" src/features/cartoes src/features/parcelas "src/app/(app)/cartoes" "src/app/(app)/extrato/parcelas"` → sem resultados.

- [ ] **Step 4: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 4 — Parcelas e cartões · concluído em {data}

**Entregue**
- Cartões ilustrativos (apelido, tipo, cor; nenhum número): cadastrar, editar, excluir; "Gasto neste cartão em {mês}" com navegação entre meses e "Ver gastos".
- Anotar: "Como pagou?" com um toque por cartão (o do último gasto já marcado) e "Outra forma"; "Foi parcelado" com o número de parcelas.
- Compra parcelada: uma parcela por mês, a 1ª no mês da compra, centavos que sobram na 1ª; ver as parcelas, quitar antecipadamente (valor ajustável), cancelar por devolução, excluir a compra.
- Extrato: filtro por cartão, cartão (ou "Cartão excluído") e "parcela n de N" em cada registro. Seu mês sem bloco de cartões (RF-61).
- Cartões no menu lateral (desktop) e em Mais (celular).

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco ({n} testes em `plano4.test.ts`) e ponta a ponta (`plano4.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): {rodados | pendentes do Docker}.

**Pendências levadas a outros planos**
- Parcelado da família e cartão em gasto da família (RN-31): Plano 7.
- Exportar o cartão e a compra parcelada no CSV: Plano 9.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 4` com a tabela da seção "Decisões tomadas neste plano" abaixo (numeração 45–59), e ao fim da seção de textos novos a linha `Plano 4: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-09-27-iris-plano-4-parcelas-cartoes.md\`.` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plano4.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): parcelas e cartões; progresso e decisões do Plano 4" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica as cinco migrações (`…_nucleo`, `…_categorias_e_onboarding`, `…_contas_e_recorrencias`, `…_nota_das_recorrencias`, `…_parcelas_e_cartoes`).
3. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras, formulários, ações (Supabase simulado com filtros conferidos) e componentes
- `npm run test:db` — privacidade de cartões e compras, calendário das parcelas, quitar/devolver/excluir, excluir cartão
- `npm run test:e2e` — fluxos no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| RN-29 cartão só com apelido, tipo, cor; RLS; FK composta em `transactions` | Tasks 2, 3, 4 |
| RF-58 Cartões: cadastrar, editar, excluir; em Mais (celular) e no menu lateral (desktop) | Tasks 4, 5, 6 |
| RN-30 / RF-59 "Gasto neste cartão em {mês}", com parcelas, navegação entre meses, "Ver gastos" | Tasks 1, 5, 6 |
| RN-31 cartões individuais e privados | Task 2 (RLS e testes); família: Plano 7 |
| RN-32 excluir cartão: "Cartão excluído", valores iguais | Tasks 2, 3, 11, 12 |
| RF-60 filtro por cartão no Extrato | Task 11 |
| RF-61 Seu mês sem bloco de cartões | Task 6 (sem mudança em `/inicio`), Task 12 (asserção) |
| RF-10 / K6 A atalhos de um toque, último usado marcado, "Outra forma" | Task 7 |
| RN-06 compra no cartão no mês da compra | `effectiveDate` existente; Task 1 (`spentByCard`) |
| RN-07 parcelado: total + nº → uma por mês, 1ª no mês da compra; centavos na 1ª | Tasks 1, 2, 8 |
| RN-08 quitar antecipadamente | Tasks 2, 9, 10 |
| RN-09 devolução | Tasks 2, 9, 10 |
| RF-14 ver as parcelas geradas | Tasks 9, 10, 11 |
| Parcelado × recorrência; parcelado não é da família | Task 8 (decisão 50) |
| Editar/excluir uma parcela no Extrato | Tasks 8, 10 (decisão 54) |
| Testes unitários, banco e ponta a ponta | Todas; Task 12 |

**Busca por marcadores proibidos:** nenhum "TBD", "a definir" ou "similar à Task N". Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 12, Step 4).

**Consistência de tipos e nomes:** `splitInstallments`/`isFutureInstallment`/`remainingInstallments`/`installmentBadge`/`MIN_INSTALLMENTS`/`MAX_INSTALLMENTS` (1 → 2, 8, 9, 11, 12); `spentByCard`/`CardTx` (1 → 5); `dayMonthYearLabel` (1 → 9); `TxRow` com `cardId`/`cardDeleted`/`installmentPlanId`/`installmentNumber`/`installmentCount` (3 → 5, 7, 9, 11); `CardRow`/`CardKind`/`CardColor`/`CARD_KIND_LABELS`/`DELETED_CARD`/`paymentText`/`CARD_COLORS`/`cardColor` (3 → 4, 5, 7, 9, 11); `loadCards`/`loadCard`/`loadLastCardId` (3 → 6, 7, 10, 11); `PlanRow`/`loadPurchase` (3 → 9, 10); `createCard`/`updateCard`/`deleteCard` (4 → 6); `buildCartoes`/`CartoesItem`/`CardFace`/`CardForm`/`CardsList` (5 → 6); `readInstallments`/`INSTALLMENT_MESSAGES` (8); `buildPurchase`/`settlePurchase`/`refundPurchase`/`deletePurchase` (9 → 10); `SettleForm` (10); RPCs `installment_schedule(p_total_cents, p_count, p_purchased_on)`, `create_installment_purchase(p_amount_cents, p_count, p_category_id, p_note, p_card_id, p_payment_method, p_purchased_on)`, `settle_installments(p_plan_id, p_amount_cents)`, `refund_installments(p_plan_id)`, `delete_installment_purchase(p_plan_id)`, `delete_card(p_card_id)`, `create_recurring_transaction(…, p_card_id)` (2 → 4, 7, 8, 9). Endereço dos gastos do cartão `/extrato?mes={m}&cartao={id}`: igual em `buildCartoes` (5) e `extratoParams` (11).

**Review Focus → testes:** 1 → Task 1 (`centavos que sobram…`), Task 2 (`o banco divide igual ao app`); 2 → Task 1 (`dia que o mês não tem…`), Task 2 (mesmo espelho); 3 → Task 1 (`a de hoje já contou…`), Task 2 (`quitar: as futuras saem…`, `sem parcela futura…`), Task 9 (`parcela de hoje já contou…`); 4 → Task 2 (`excluir cartão…`), Task 7 (`último usado que não existe mais…`), Task 11 (`cada linha: cartão…`), Task 12 (e2e 1); 5 → Task 2 (privacidade, `quitar duas vezes…`), Task 8 (`parcela não é editada nem excluída sozinha`), Task 9 (`toque duplo…`), Task 10 (botão trava; página redireciona).

**Proporção:** SQL e testes vêm completos (são o contrato); componentes e ações vêm por assinatura, regras e textos exatos, com código só onde o teste não decide (divisão das parcelas, página da compra, página Cartões).

---

## Conflitos encontrados na especificação

1. **Etapa 3 §3.1 `installment_plans` tem família, descrição e categoria:** família fica para o Plano 7; descrição e categoria ficam só nas parcelas (uma fonte; excluir categoria continua simples) — decisão 59.
2. **RN-08 "o valor quitado entra como um gasto único":** a copy não diz se o valor pode diferir do que falta. A tela de quitar vem com o que falta e deixa ajustar (desconto ou juros) — decisão 52.
3. **K6 A "o último usado pré-selecionado":** lido como "a escolha do último gasto anotado" (cartão dele, ou "Outra forma"), para não atribuir ao cartão, sem a pessoa perceber, um gasto pago de outro jeito — decisão 48. A leitura literal ("o último cartão usado, sempre") também é possível; fica para sua revisão.
4. **Protótipo "Novo cartão" é painel que sobe; RF-13 permite editar qualquer registro:** Novo cartão/editar são páginas (padrão de Categorias e Nova conta), no visual do protótipo; parcelas não são editadas uma a uma — decisões 54 e 57.
5. **Protótipo do menu lateral mostra Planejamento e Metas entre Contas e Cartões:** ainda não existem; Cartões entra logo depois de Contas.
6. **A copy oficial só tem "Foi parcelado" para este plano:** os demais textos (tela da compra, quitar, devolver, excluir cartão, erros) estão em "Textos novos".

---

## Decisões tomadas neste plano

| # | Decisão | Motivo |
|---|---|---|
| 45 | Cartão guarda só apelido (até 30 caracteres), tipo (Crédito ou Débito) e uma de 6 cores do protótipo (Verde, Roxo, Azul, Laranja, Grafite, Rosa). Padrão: Crédito, Verde. Dois cartões podem ter o mesmo apelido. | RN-29; o apelido precisa caber no chip do Anotar. |
| 46 | Excluir um cartão o apaga de vez (o apelido não fica guardado). Gastos, parcelas e restante quitado ficam como "Cartão excluído", com os mesmos valores; contas que se repetem com ele seguem sem cartão. Tudo de uma vez. | RN-32 e o mínimo de dados guardados (LGPD). |
| 47 | Gasto com cartão não guarda forma de pagamento: o tipo vem do cartão. O Extrato mostra o apelido (ou "Cartão excluído") no lugar da forma, e a busca acha pelo apelido. Mudar o tipo de um cartão vale para todos os gastos dele. | Uma fonte só; nunca "Crédito" num gasto de cartão de débito. |
| 48 | "Como pagou?" aparece no Anotar só para quem tem cartões. Vem marcada a escolha do último gasto anotado: o cartão dele, ou "Outra forma" se foi pago de outro jeito ou com um cartão excluído. "Outra forma" desmarca o cartão e mostra "Forma de pagamento" em Mais detalhes (escondida enquanto um cartão está marcado). Na edição, vem o cartão do registro. | K6 A sem atribuir ao cartão, sem a pessoa perceber, um gasto pago de outro jeito. |
| 49 | Parcelado: "Quanto foi?" é o total; de 2 a 48 parcelas; centavos que sobram vão para a 1ª; cada parcela é um gasto no mesmo dia dos meses seguintes (dia 29–31 ajustado, decisão 28). A data da compra vai até hoje; numa compra antiga, as parcelas que já passaram contam nos meses delas. | RN-07 e etapa 3 §3.1; permite anotar uma compra que já está na parcela 4. |
| 50 | Parcelado e "se repete" não andam juntos (marcar um desmarca o outro). Parcelado só em gasto e só ao anotar; parcelado da família fica para o Plano 7. | Uma compra parcelada não é uma conta mensal. |
| 51 | Parcela "futura" é a de depois de hoje (Brasília); a parcela de hoje já contou. | Quitar ou devolver no dia da parcela não apaga o que já saiu do mês. |
| 52 | Quitar antecipadamente abre uma tela com o valor que falta, que a pessoa pode ajustar (desconto ou juros). As parcelas futuras saem e o valor entra como um gasto único de hoje, com a mesma categoria, nota e cartão. Uma vez só; sem parcela futura, a opção não aparece. | RN-08 ("o valor quitado"); quitar costuma ter desconto. |
| 53 | Devolução: as parcelas futuras saem; as que já contaram ficam. A Íris não cria uma entrada de reembolso (se algo voltou, anota-se como entrada). | RN-09. |
| 54 | Parcelas não são editadas uma a uma. No Extrato, tocar numa parcela (ou no restante quitado) abre a compra: as parcelas, quitar, devolver e excluir a compra inteira. Para mudar valor, número de parcelas, categoria ou cartão, exclua e anote de novo. | As parcelas precisam sempre somar o total da compra. |
| 55 | "Gasto neste cartão em {mês}" = gastos com o cartão no mês em que contam (RN-06, A1), com parcelas e restante quitado, pelo valor inteiro. Contas a pagar com cartão só entram quando pagas. Nunca "Fatura". | RN-30. |
| 56 | "Ver gastos" abre o Extrato no mês e no cartão. O filtro "Cartão" do Extrato só aparece para quem tem cartões e combina com categoria e busca; "Entradas" e "Gastos" limpam o cartão. | RF-59 e RF-60 com uma tela só. |
| 57 | Cartões no menu lateral logo depois de Contas e em Mais depois de Contas; Novo cartão e editar são páginas no visual do protótipo. O Seu mês não ganha bloco de cartões. | Protótipo, RF-58 e RF-61; mesmo padrão de Categorias e Nova conta. |
| 58 | Conta que se repete anotada com cartão: as próximas vêm com o mesmo cartão. "Nova conta" (Contas) não pede cartão. | Assinaturas costumam cair sempre no mesmo cartão. |
| 59 | A compra parcelada não guarda categoria e nota à parte: vêm das parcelas. Excluir uma categoria leva as parcelas para "Outros" como qualquer gasto. | Uma fonte só; RN-27 sem regra nova. |

## Textos novos

Fora da copy oficial e do protótipo aprovado; precisam da sua aprovação (32):

- Cartões: "Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês." · "Editar cartão {apelido}" (rótulo acessível do cartão desenhado) · "Cartão criado." · "Cartão excluído." (aviso) · "Cartão excluído" (no lugar do apelido nos registros) · `Excluir o cartão "{apelido}"?` · `Os gastos feitos com ele continuam no histórico como "Cartão excluído". Os valores não mudam.`
- Extrato: "Cartão" (filtro) · "restante das parcelas" (selo)
- Anotar: "Em quantas parcelas?" · `O valor em "Quanto foi?" é o total da compra.` · "Escolha de 2 a 48 parcelas." · "Valor pequeno demais para tantas parcelas." · "Escolha só uma opção: se repete ou parcelado."
- Compra parcelada: "{valor} em {n} parcelas" · "Faltam {n} parcelas: {valor}." / "Falta 1 parcela: {valor}." · "Quitada em {dia de mês}." · "Devolvida em {dia de mês}." · "Parcelas" (título da lista) · "Parcela {n} de {total}" · "Restante quitado" · "Quitar antecipadamente" · "Cancelar por devolução" · "Cancelar as parcelas por devolução?" · "As parcelas que ainda não chegaram deixam de existir. As que já contaram continuam no seu histórico." · "Cancelar parcelas" · "Excluir esta compra?" · "Todas as parcelas saem do seu histórico. Seu mês será recalculado." · "Quitar parcelas" · "Se pagou outro valor, é só ajustar." · "Parcelas quitadas. Seu mês já está atualizado." · "Parcelas canceladas. Seu mês já está atualizado."
- Datas por extenso com ano ("10 de outubro de 2026") nas linhas das parcelas (formato, não texto novo).

Da copy oficial, do protótipo ou já aprovados, usados aqui: "Foi parcelado", "Como pagou?", "Outra forma", "A Íris guarda só o apelido, o tipo e a cor. Nenhum número do cartão.", "Cartões", "Adicionar", "Novo cartão", "Como você chama esse cartão?", "Tipo", "Crédito", "Débito", "Cor", "Verde", "Roxo", "Azul", "Laranja", "Grafite", "Rosa", "Salvar cartão", "Gasto neste cartão em {mês}", "Ver gastos", "parcela {n} de {total}", "Quanto foi?", "Falta o nome.", "Use até {n} caracteres.", "Falta o valor.", "Escolha o dia.", "Alterações salvas.", "Excluir", "Cancelar", "Agora não", "Anotado. Seu mês já está atualizado.", "Excluído. Seu mês já está atualizado.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.", "Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.".
