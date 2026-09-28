# Íris — Plano 5: Metas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa cria uma meta (nome, valor, prazo opcional), guarda dinheiro nela (sai do Disponível do mês), tira dinheiro (volta ao Disponível do mês atual, nunca mais do que a meta tem), usa o dinheiro da meta num gasto com categoria (a parte paga pela meta não sai do "Saiu"; se o gasto for maior, só a diferença sai do mês; se for menor, a Íris pergunta se devolve a sobra), vê o progresso (quanto falta, percentual, quanto guardar por mês até o prazo), comemora na medida quando a meta fica completa e exclui a meta sem apagar o histórico. Metas entra na barra inferior e no menu lateral; o Seu mês ganha "Meta em destaque" e a linha "Guardado este mês" / "Tirado das metas" passa a funcionar de verdade.

**Architecture:** Mesma base dos Planos 1–4. Duas tabelas novas — `goals` (meta, com `status` `active`/`used` e exclusão suave por `deleted_on`) e `goal_movements` (livro-razão da meta: `deposit`, `withdraw`, `use`, `return_on_exit`) — e duas colunas em `transactions` (`goal_id`, `goal_funded_cents`), todas com FKs compostas `(x_id, user_id)`. O Guardado de uma meta é sempre **calculado** (soma dos movimentos), nunca guardado pronto; um gatilho no banco impede que qualquer movimento deixe a meta negativa, mesmo gravado direto na tabela. Guardar, tirar, usar, desfazer um uso e excluir a meta são funções SQL atômicas (`security invoker`, `search_path = ''`, usuário de `auth.uid()`, meta travada com `for update`). As fórmulas do mês **já existem** em `src/domain/summary.ts` (`summarizeMonth` recebe `goalMovements` e `goalFundedCents`); este plano só as alimenta com dados reais e acrescenta as regras puras da meta em `src/domain/goals.ts` (guardado, progresso, sugestão por mês, divisão do uso, marcos), com espelho SQL da divisão do uso conferido por teste de banco.

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-25–30, RF-32–34, RN-01, RN-01a, RN-05, RN-13–16, RNF-11, terminologia §1.1), `docs/etapa-3-arquitetura.md` (§2 operações atômicas, §3.1 `goals`/`goal_movements`/`transactions.meta`/`valor_pago_com_meta`, §3.2 fórmulas, §6 `/metas` e `/metas/{id}` e ações que sobem por cima, §7 A5 barra inferior, §8.3 fluxo "Usar o dinheiro da meta", decisão A6 A), `docs/etapa-5-ui.md` (tokens, alvos, sem vermelho), `docs/etapa-7-roteiro.md` (escopo do Plano 5; telas não desenhadas seguem o protótipo e o manual), `docs/decisoes-para-revisao.md` (decisões 1–59, obrigatórias; a 12 manda Metas para a barra inferior neste plano), protótipo aprovado (Metas, Meta — Viagem para Salvador, Usar o dinheiro da meta, Sobra da meta, Estados "Meta concluída" e "Metas sem nada ainda", Seu mês "Meta em destaque", Extrato "Guardado na meta", Desktop), copy oficial (Claude Doc "Íris — Documento-base de comunicação": seção Metas, estados vazios, sucesso, confirmação de exclusão, erros).

## Global Constraints

- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (Next 16 tem mudanças incompatíveis; `AGENTS.md`). `params`/`searchParams` de página são `Promise` e precisam de `await`.
- Idioma pt-BR, moeda somente R$. Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor e de `(now() at time zone 'America/Sao_Paulo')::date` dentro do SQL. Nunca aceitar "hoje" vindo do navegador. Guardar, tirar, usar e excluir acontecem **hoje**.
- Dinheiro sempre em **centavos inteiros**; máximo `MAX_CENTS = 9_999_999_999` (valor da meta, cada movimento, e o guardado de uma meta). Texto → centavos só por `parseBRL` (via `amountField`); centavos → texto por `formatBRL` (NBSP entre `R$` e o número).
- **Nunca se tira de uma meta mais do que ela tem**: a função recusa e o gatilho `goal_movements_guard` recusa também a gravação direta na tabela.
- "Usar o dinheiro" é **uma operação atômica**: gasto + movimento `use` + meta `used` juntos, ou nada. A parte paga pela meta fica em `transactions.goal_funded_cents` e fica fora do "Saiu" (RN-01a, já implementado em `summarizeMonth`); o movimento `use` reduz o Saldo total e o Guardado (já implementado). Nunca contar esse gasto duas vezes (RNF-11).
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar; "Guardado" = dinheiro em metas. Tom calmo: sem vermelho de alerta, sem exclamação; comemoração só na meta completa e na metade do caminho (copy).
- Todo texto visível vem da copy oficial, do protótipo aprovado, dos textos já aprovados em `docs/decisoes-para-revisao.md`, ou da seção "Textos novos" no fim deste plano.
- Alvos de toque ≥ 44 px (`min-h-11`/`size-11`); texto 15–16 px no celular; contraste WCAG AA; confirmações usam `ConfirmAction` de `src/ui/confirm.tsx`.
- Banco: **nunca editar** migrações já aplicadas (`20260922000001_nucleo.sql`, `20260925000001_categorias_e_onboarding.sql`, `20260926000001_contas_e_recorrencias.sql`, `20260927000001_nota_das_recorrencias.sql`, `20260928000001_parcelas_e_cartoes.sql`); tudo deste plano vai em **`supabase/migrations/20260929000001_metas.sql`**. RLS ligada em toda tabela nova. FKs compostas `(x_id, user_id)` e `on delete no action`. Funções: `security invoker`, `set search_path = ''`, nomes com `public.`, checam `auth.uid()`, filtram por `user_id`, limitam todas as entradas (valor entre 1 e `9999999999`, ids nulos recusados); `revoke execute … from public, anon` + `grant execute … to authenticated`. A função do gatilho: `revoke execute … from public, anon, authenticated`.
- Servidor: o id da pessoa vem **só** de `requireUser()`, chamado no começo de toda Server Action e loader; nunca do formulário. Zod no servidor; formulários usam `FormState` (`errorState`, `firstFieldErrors`, `readFields`) e mantêm o que foi digitado. `redirect()` nunca dentro de `try`.
- **Defesa em profundidade:** toda leitura, alteração ou exclusão por id filtra por `id` **e** `user_id` (além da RLS); leituras e alterações de meta filtram também `deleted_on is null`. Os testes de Server Action usam fakes encadeáveis do Supabase que registram cada `.eq`/`.is` e **afirmam os filtros**. **Nunca remover** um filtro de segurança existente para um teste passar.
- Módulos `'use server'` exportam **somente funções async** (constantes e tipos ficam em outros arquivos).
- Leituras do histórico completo sempre por `loadLedger()` (paginada, gera ocorrências antes), que a partir da Task 3 devolve também `goalMovements`. Depois de gravar dinheiro: `refreshMoneyViews()` (`/inicio`, `/extrato`, `/contas`, `/cartoes` e, a partir da Task 10, `/metas` com subpáginas).
- Testes de componente: primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Componentes que importam Server Actions mockam o módulo de ações. Server Actions mockam `@/lib/supabase/server`, `@/lib/flash`, `next/cache` e `next/navigation`; relógio falso em `2026-09-28T15:00:00Z` (hoje = `2026-09-28`) quando a ação usa a data.
- Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`.
- Metas da família são do **Plano 7**: aqui só ganchos triviais (a seção "Só suas" na lista; `goal_movements.user_id` já é "quem guardou"; o tipo `return_on_exit` já aceito pelo banco e pelo domínio). Nenhuma coluna `family_id` neste plano.
- Shell: Git Bash (POSIX). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker, confira com `npx tsc --noEmit` e `npx playwright test --list`, marque a execução como **pendente** em `docs/progresso.md` — **nunca** enfraqueça, pule ou apague um teste.

## Review Focus

Cinco situações que mais podem atrapalhar a pessoa e que o escopo não cobria explicitamente; cada uma tem teste na tarefa dona:

1. **Toque duplo ou duas abas** — tocar duas vezes em "Tirar dinheiro" com todo o guardado, ou "Devolver" a sobra em duas abas: a pessoa espera tirar uma vez só, nunca deixar a meta negativa nem ganhar dinheiro do nada. → **Task 2** (`dois pedidos ao mesmo tempo não tiram duas vezes`, `tirar direto na tabela também respeita o guardado`), **Task 7** (`devolver a sobra quando ela já foi devolvida…`).
2. **Gasto maior, igual ou menor que o guardado** — "R$ 3.400 com R$ 3.000 guardados": a meta paga R$ 3.000, só R$ 400 saem do Disponível, e o gasto nunca conta duas vezes no Saldo total; "R$ 2.300 com R$ 2.480": sobram exatamente R$ 180,00. → **Task 1** (`splitGoalUse…`, `guardar em agosto e usar em setembro…`), **Task 2** (`o banco divide o uso igual ao app`), **Task 5** (Seu mês), e2e na **Task 12**.
3. **Excluir uma meta que tem dinheiro e histórico** — agosto continua mostrando "Guardado este mês", o que estava guardado volta ao Disponível de hoje ("Tirado das metas"), o Saldo total não muda e a meta não volta a aparecer. → **Task 1** (`excluir a meta…`), **Task 2** (`excluir: o guardado volta hoje…`), **Task 4** (lista sem excluídas), e2e na **Task 12**.
4. **Tirar mais do que a meta tem** — digitar R$ 500 numa meta com R$ 180: a pessoa espera uma mensagem calma que diga quanto dá para tirar, com o valor digitado ainda no campo. → **Task 2** (recusa), **Task 7** (`tirar mais do que tem mostra quanto a meta tem…`), e2e na **Task 12**.
5. **Página velha ou endereço digitado** — abrir `/metas/{id}` de uma meta excluída ou de outra pessoa, guardar numa meta já usada, ou abrir `/extrato/{id}` de um gasto pago com meta para mudar só o valor dele: nada de meta fantasma, nada de uso que não bate com o gasto. → **Task 2** (privacidade, `guardar numa meta usada…`), **Task 7** (ações), **Task 10** (páginas redirecionam), **Task 11** (`gasto pago com meta não é editado nem excluído pelo Extrato`).

---

## Estrutura de arquivos

```
supabase/migrations/20260929000001_metas.sql                 NOVO: goals, goal_movements, colunas em transactions, gatilho, funções
tests/db/plano5.test.ts                                      NOVO: privacidade, regras, guardar/tirar, usar, desfazer uso, excluir
tests/e2e/plano5.spec.ts                                     NOVO: criar + guardar + tirar; usar + sobra; desktop concluída + excluir
src/
  domain/goals.ts (+ .test.ts)                               NOVO: goalBalance, goalProgress, monthlySuggestion, splitGoalUse, crossedMilestone
  domain/dates.ts (+ dates.test.ts)                          MOD: monthsBetween, shortMonthLabel
  domain/money.ts (+ money.test.ts)                          MOD: formatWholeBRL
  lib/refresh.ts                                             MOD: refreshMoneyViews inclui /metas
  ui/progress-bar.tsx (+ .test.tsx)                          NOVO: barra de progresso acessível
  features/
    registro/tx-row.ts (+ .test.ts)                          MOD: goalId, goalFundedCents lido do banco
    registro/queries.ts                                      MOD: loadLedger devolve goalMovements
    registro/actions.ts (+ .test.ts)                         MOD: gasto pago com meta protegido
    metas/types.ts (+ .test.ts)                              NOVO: GoalRow, GoalMovementRow, conversões
    metas/queries.ts                                         NOVO: loadGoals, loadGoal, fetchGoalMovements
    metas/view-model.ts (+ .test.ts)                         NOVO: summarizeGoal, buildMetas, buildGoalDetail, pickFeatured
    metas/schemas.ts (+ .test.ts)                            NOVO: makeGoalSchema, makeUseSchema
    metas/actions.ts (+ .test.ts)                            NOVO: createGoal, updateGoal, deleteGoal
    metas/movement-actions.ts (+ .test.ts)                   NOVO: depositToGoal, withdrawFromGoal, spendFromGoal, returnLeftover, deleteGoalUse
    metas/metas-list.tsx, goal-form.tsx, goal-detail.tsx (+ testes)       NOVO
    metas/move-form.tsx, use-form.tsx, leftover-prompt.tsx (+ testes)      NOVO
    seu-mes/view-model.ts (+ .test.ts), featured-goal.tsx (+ .test.tsx)   MOD/NOVO: números com metas, "Meta em destaque"
    contas/view-model.ts (+ .test.ts)                        MOD: Disponível depois com metas
    extrato/view-model.ts, extrato-list.tsx (+ testes)       MOD: "Guardado na meta"/"Tirado da meta", "pago com a meta {meta}"
    shell/nav-items.ts (+ nav-items.test.ts, nav.test.tsx, sidebar.test.tsx)  MOD: Metas
  app/(app)/
    metas/page.tsx, metas/nova/page.tsx                                   NOVO
    metas/[id]/page.tsx, metas/[id]/editar/page.tsx                       NOVO
    metas/[id]/guardar, tirar, usar, sobra (page.tsx cada)                NOVO (painéis)
    inicio/page.tsx, contas/page.tsx, extrato/page.tsx, extrato/[id]/page.tsx, mais/page.tsx  MOD
docs/progresso.md, docs/decisoes-para-revisao.md             MOD no fim
```

**Rotas:** `/metas`, `/metas/nova`, `/metas/{id}`, `/metas/{id}/editar`, `/metas/{id}/guardar`, `/metas/{id}/tirar`, `/metas/{id}/usar`, `/metas/{id}/sobra`. As quatro últimas são painéis que sobem (`isSheetRoute`).

**Modelo (etapa-3 §3.1 → banco):** `goals` = id, dono (`user_id`), nome (`name`), valor_alvo (`target_cents`), prazo (`deadline`, 1º dia do mês), situação ativa/usada (`status active|used` + `used_on`; "concluída" é calculada: guardado ≥ valor — decisão 63), família → Plano 7, exclusão suave (`deleted_on`, RN-16). `goal_movements` = id, meta (`goal_id`), pessoa (`user_id`), tipo (`deposit|withdraw|use|return_on_exit`), valor (`amount_cents`), data (`occurred_on`), gasto relacionado (`transaction_id`, só em `use`). `transactions` ganha meta (`goal_id`) e valor_pago_com_meta (`goal_funded_cents`, padrão 0).

---

### Task 1: Regras da meta (domínio)

**Files:**
- Create: `src/domain/goals.ts`
- Modify: `src/domain/dates.ts` (`monthsBetween`, `shortMonthLabel`), `src/domain/money.ts` (`formatWholeBRL`)
- Test: `src/domain/goals.test.ts`, `src/domain/dates.test.ts` (acrescentar 2 testes), `src/domain/money.test.ts` (acrescentar 1 teste)

**Interfaces:**
- Consumes: `Cents`, `formatBRL` (`./money`); `monthOf`, `ISODate`, `MonthKey` (`./dates`); `GoalMovement`, `GoalMovementKind`, `LedgerTx`, `summarizeMonth` (`./summary`, sem mudança).
- Produces:
  - `monthsBetween(from: MonthKey, to: MonthKey): number` — `('2026-09', '2027-03')` → `6`; negativo quando `to` vem antes.
  - `shortMonthLabel(m: MonthKey): string` — `'2027-03'` → `'mar. 2027'` (abreviações fixas: `jan. fev. mar. abr. mai. jun. jul. ago. set. out. nov. dez.`; protótipo "até mar. 2027").
  - `formatWholeBRL(cents: Cents): string` — reais inteiros arredondados para cima, milhar com ponto: `25400` → `'R$ 254'`, `125401` → `'R$ 1.255'` (NBSP depois de `R$`).
  - `MAX_GOAL_NAME = 40`.
  - `goalBalance(moves: Pick<GoalMovement, 'kind' | 'amountCents'>[]): Cents` — `deposit` soma; `withdraw`, `use`, `return_on_exit` subtraem.
  - `interface GoalProgress { percent: number; remainingCents: Cents; complete: boolean }`; `goalProgress(balanceCents: Cents, targetCents: Cents): GoalProgress` — `percent = min(100, floor(balance × 100 / target))`; `remainingCents = max(0, target − balance)`; `complete = balance >= target`.
  - `monthlySuggestion(input: { remainingCents: Cents; deadline: MonthKey | null; today: ISODate }): Cents | null` — `null` sem prazo, com `remainingCents = 0` ou com prazo antes do mês de hoje; senão `ceil(remaining / max(1, monthsBetween(monthOf(today), deadline)))` arredondado **para cima** ao real inteiro (múltiplo de 100).
  - `interface GoalUseSplit { fundedCents: Cents; fromMonthCents: Cents; leftoverCents: Cents }`; `splitGoalUse(amountCents: Cents, balanceCents: Cents): GoalUseSplit` — `funded = min(amount, balance)`, `fromMonth = amount − funded`, `leftover = balance − funded` (RN-15, 15a, 15b).
  - `type GoalMilestone = 'half' | 'complete' | null`; `crossedMilestone(beforeCents: Cents, afterCents: Cents, targetCents: Cents): GoalMilestone` — `'complete'` quando `before < target <= after`; senão `'half'` quando `before * 2 < target <= after * 2`; senão `null`.

- [ ] **Step 1: Testes que falham** — criar `src/domain/goals.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { MAX_GOAL_NAME, crossedMilestone, goalBalance, goalProgress, monthlySuggestion, splitGoalUse } from './goals'
import { formatWholeBRL } from './money'
import { summarizeMonth, type GoalMovement, type LedgerTx } from './summary'

const NBSP = String.fromCharCode(0xa0)

describe('guardado de uma meta', () => {
  test('guardar soma; tirar, usar e devolver na saída subtraem', () => {
    expect(
      goalBalance([
        { kind: 'deposit', amountCents: 230000 },
        { kind: 'deposit', amountCents: 30000 },
        { kind: 'withdraw', amountCents: 12000 },
        { kind: 'use', amountCents: 5000 },
        { kind: 'return_on_exit', amountCents: 1000 },
      ]),
    ).toBe(242000)
    expect(goalBalance([])).toBe(0)
  })

  test('nome da meta vai até 40 caracteres', () => {
    expect(MAX_GOAL_NAME).toBe(40)
  })
})

describe('progresso (RF-29)', () => {
  test('exemplo do protótipo: R$ 2.480 de R$ 4.000 = 62%, faltam R$ 1.520', () => {
    expect(goalProgress(248000, 400000)).toEqual({ percent: 62, remainingCents: 152000, complete: false })
  })

  test('arredonda para baixo e para em 100%; passar do valor também é completa', () => {
    expect(goalProgress(399999, 400000)).toEqual({ percent: 99, remainingCents: 1, complete: false })
    expect(goalProgress(400000, 400000)).toEqual({ percent: 100, remainingCents: 0, complete: true })
    expect(goalProgress(500000, 400000)).toEqual({ percent: 100, remainingCents: 0, complete: true })
    expect(goalProgress(0, 1000000)).toEqual({ percent: 0, remainingCents: 1000000, complete: false })
  })
})

describe('quanto guardar por mês (RF-29)', () => {
  test('protótipo: faltam R$ 1.520 até março de 2027, em setembro de 2026 → cerca de R$ 254 por mês', () => {
    const s = monthlySuggestion({ remainingCents: 152000, deadline: '2027-03', today: '2026-09-28' })
    expect(s).toBe(25400)
    expect(formatWholeBRL(s!)).toBe(`R$${NBSP}254`)
  })

  test('prazo neste mês: tudo o que falta, em reais inteiros para cima', () => {
    expect(monthlySuggestion({ remainingCents: 10050, deadline: '2026-09', today: '2026-09-28' })).toBe(10100)
  })

  test('sem prazo, prazo que já passou ou nada faltando: sem sugestão', () => {
    expect(monthlySuggestion({ remainingCents: 152000, deadline: null, today: '2026-09-28' })).toBeNull()
    expect(monthlySuggestion({ remainingCents: 152000, deadline: '2026-08', today: '2026-09-28' })).toBeNull()
    expect(monthlySuggestion({ remainingCents: 0, deadline: '2027-03', today: '2026-09-28' })).toBeNull()
  })
})

describe('usar o dinheiro da meta (RN-15)', () => {
  test('gasto maior: a meta paga o que tem, a diferença sai do mês (RN-15a)', () => {
    expect(splitGoalUse(340000, 300000)).toEqual({ fundedCents: 300000, fromMonthCents: 40000, leftoverCents: 0 })
  })

  test('gasto igual: a meta paga tudo e zera', () => {
    expect(splitGoalUse(300000, 300000)).toEqual({ fundedCents: 300000, fromMonthCents: 0, leftoverCents: 0 })
  })

  test('gasto menor: a sobra fica na meta — protótipo "Sobraram R$ 180,00" (RN-15b)', () => {
    expect(splitGoalUse(230000, 248000)).toEqual({ fundedCents: 230000, fromMonthCents: 0, leftoverCents: 18000 })
  })
})

describe('marcos da meta (RF-30)', () => {
  test('metade do caminho e meta completa, uma vez só', () => {
    expect(crossedMilestone(100000, 200000, 400000)).toBe('half')
    expect(crossedMilestone(190000, 400000, 400000)).toBe('complete')
    expect(crossedMilestone(100000, 450000, 400000)).toBe('complete')
    expect(crossedMilestone(250000, 300000, 400000)).toBeNull()
    expect(crossedMilestone(400000, 410000, 400000)).toBeNull()
    expect(crossedMilestone(0, 199999, 400000)).toBeNull()
  })
})

describe('os números do mês com metas (RNF-11)', () => {
  const tx = (p: Partial<LedgerTx>): LedgerTx => ({
    kind: 'expense', amountCents: 0, occurredOn: '2026-09-01', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, ...p,
  })

  test('guardar em agosto e usar em setembro: o gasto nunca sai duas vezes (Review Focus 2)', () => {
    const split = splitGoalUse(340000, 300000)
    const transactions: LedgerTx[] = [
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-08-05' }),
      tx({ amountCents: 340000, occurredOn: '2026-09-15', goalFundedCents: split.fundedCents }),
    ]
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 300000, occurredOn: '2026-08-10' },
      { kind: 'use', amountCents: split.fundedCents, occurredOn: '2026-09-15' },
    ]
    const at = (month: string) => summarizeMonth({ month, today: '2026-09-28', initialBalanceCents: 0, transactions, goalMovements })
    expect(at('2026-08').goalLine).toEqual({ label: 'Guardado este mês', amountCents: 300000 })
    expect(at('2026-08').disponivelCents).toBe(200000)
    expect(at('2026-09').saiuCents).toBe(40000)
    expect(at('2026-09').goalLine).toBeNull()
    expect(at('2026-09').disponivelCents).toBe(-40000)
    expect(at('2026-09').saldoTotalCents).toBe(500000 - 340000)
    expect(at('2026-09').guardadoTotalCents).toBe(0)
  })

  test('excluir a meta: agosto continua "Guardado"; o que estava guardado volta hoje (A6, RN-16, Review Focus 3)', () => {
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 50000, occurredOn: '2026-08-10' },
      { kind: 'withdraw', amountCents: 50000, occurredOn: '2026-09-28' },
    ]
    const at = (month: string) => summarizeMonth({ month, today: '2026-09-28', initialBalanceCents: 0, transactions: [], goalMovements })
    expect(at('2026-08').goalLine).toEqual({ label: 'Guardado este mês', amountCents: 50000 })
    expect(at('2026-09').goalLine).toEqual({ label: 'Tirado das metas', amountCents: 50000 })
    expect(at('2026-09').disponivelCents).toBe(50000)
    expect(at('2026-09').saldoTotalCents).toBe(0)
    expect(at('2026-09').guardadoTotalCents).toBe(0)
  })
})
```

Em `src/domain/dates.test.ts` (importando `monthsBetween`, `shortMonthLabel`):

```ts
test('monthsBetween conta meses entre dois meses', () => {
  expect(monthsBetween('2026-09', '2027-03')).toBe(6)
  expect(monthsBetween('2026-09', '2026-09')).toBe(0)
  expect(monthsBetween('2026-09', '2026-08')).toBe(-1)
})

test('shortMonthLabel abrevia o mês como no protótipo', () => {
  expect(shortMonthLabel('2027-03')).toBe('mar. 2027')
  expect(shortMonthLabel('2026-05')).toBe('mai. 2026')
  expect(shortMonthLabel('2026-12')).toBe('dez. 2026')
})
```

Em `src/domain/money.test.ts` (importando `formatWholeBRL`):

```ts
test('formatWholeBRL mostra reais inteiros, arredondando para cima', () => {
  const NBSP = String.fromCharCode(0xa0)
  expect(formatWholeBRL(25400)).toBe(`R$${NBSP}254`)
  expect(formatWholeBRL(125401)).toBe(`R$${NBSP}1.255`)
  expect(formatWholeBRL(0)).toBe(`R$${NBSP}0`)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain`
Expected: FAIL — `Failed to resolve import "./goals"`, `monthsBetween is not a function`, `formatWholeBRL is not a function`.

- [ ] **Step 3: Implementação** — seguir as Interfaces. `formatWholeBRL`: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 })` sobre `Math.ceil(cents / 100)`, espaços trocados por NBSP (como `formatBRL`). `monthlySuggestion`: `Math.ceil(Math.ceil(remaining / months) / 100) * 100`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/goals.ts src/domain/goals.test.ts src/domain/dates.ts src/domain/dates.test.ts src/domain/money.ts src/domain/money.test.ts
git commit -m "feat(domain): regras da meta — guardado, progresso, sugestão por mês, uso e marcos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Banco — metas, movimentos e funções atômicas

**Files:**
- Create: `supabase/migrations/20260929000001_metas.sql`
- Test: `tests/db/plano5.test.ts`

**Interfaces:**
- Consumes: `public.touch_updated_at()`, `public.transactions`, `public.categories`, `tests/db/helpers.ts`, `splitGoalUse` (Task 1), `todayInSaoPaulo`.
- Produces (usados pelas Tasks 3–12):
  - Tabela `public.goals (id, user_id, name, target_cents, deadline, status 'active'|'used', used_on, deleted_on, created_at, updated_at)`. Sem política de exclusão (a meta nunca é apagada de verdade).
  - Tabela `public.goal_movements (id, user_id, goal_id, kind 'deposit'|'withdraw'|'use'|'return_on_exit', amount_cents, occurred_on, transaction_id, created_at)`. Políticas: ver e gravar os próprios; excluir **só** `use`; sem alteração.
  - `public.transactions` ganha `unique (id, user_id)`, `goal_id uuid`, `goal_funded_cents bigint not null default 0`.
  - Gatilho `goal_movements_guard` (antes de gravar movimento): meta da pessoa, não excluída; `deposit` só em meta `active`; nenhum movimento deixa o guardado negativo; guardado nunca passa de `9999999999`.
  - `goal_balance(p_goal_id uuid) returns bigint` (0 para meta de outra pessoa).
  - `deposit_to_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint` (guardado depois).
  - `withdraw_from_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint` (guardado depois; vale para meta `active` ou `used`).
  - `use_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid) returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)`.
  - `delete_goal_use(p_transaction_id uuid) returns uuid` (id da meta).
  - `delete_goal(p_goal_id uuid) returns void`.
  - Mensagens de erro: `'Meta não encontrada.'`, `'Valor inválido.'`, `'Valor maior que o guardado.'`, `'Meta sem dinheiro guardado.'`, `'Categoria não encontrada.'`, `'Gasto não encontrado.'`.

- [ ] **Step 1: Testes de banco que falham** — criar `tests/db/plano5.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { todayInSaoPaulo } from '../../src/domain/dates'
import { splitGoalUse } from '../../src/domain/goals'

let a: TestUser
let b: TestUser
const today = todayInSaoPaulo()

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newGoal(user: TestUser, p: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('goals')
    .insert({ user_id: user.id, name: 'Viagem para Salvador', target_cents: 400000, ...p })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function deposit(user: TestUser, goalId: string, cents: number): Promise<number> {
  const { data, error } = await user.client.rpc('deposit_to_goal', { p_goal_id: goalId, p_amount_cents: cents })
  if (error) throw error
  return Number(data)
}

async function balance(user: TestUser, goalId: string): Promise<number> {
  const { data, error } = await user.client.rpc('goal_balance', { p_goal_id: goalId })
  if (error) throw error
  return Number(data)
}

async function goal(user: TestUser, id: string) {
  const { data, error } = await user.client.from('goals').select('status, used_on, deleted_on').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function movements(user: TestUser, goalId: string) {
  const { data, error } = await user.client
    .from('goal_movements')
    .select('id, kind, amount_cents, occurred_on, transaction_id')
    .eq('goal_id', goalId)
    .order('created_at')
  if (error) throw error
  return data.map((m) => ({ ...m, amount_cents: Number(m.amount_cents) }))
}

type UseResult = { tx_id: string; funded_cents: number; leftover_cents: number }

async function useGoal(user: TestUser, goalId: string, cents: number): Promise<UseResult> {
  const { data, error } = await user.client.rpc('use_goal', {
    p_goal_id: goalId, p_amount_cents: cents, p_category_id: await categoryId(user, 'lazer'),
  })
  if (error) throw error
  const row = (data as UseResult[])[0]
  return { tx_id: row.tx_id, funded_cents: Number(row.funded_cents), leftover_cents: Number(row.leftover_cents) }
}

describe('privacidade das metas', () => {
  test('ninguém vê nem altera a meta ou os movimentos de outra pessoa', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { data: seen } = await b.client.from('goals').select('id').eq('id', id)
    expect(seen).toEqual([])
    const { data: moves } = await b.client.from('goal_movements').select('id').eq('goal_id', id)
    expect(moves).toEqual([])
    const { data: changed } = await b.client.from('goals').update({ name: 'X' }).eq('id', id).select()
    expect(changed).toEqual([])
    expect(await balance(b, id)).toBe(0)
  })

  test('ninguém guarda, tira, usa ou exclui na meta de outra pessoa (Review Focus 5)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 5000)
    for (const [fn, args] of [
      ['deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(b, 'lazer') }],
      ['delete_goal', { p_goal_id: id }],
    ] as const) {
      const { error } = await b.client.rpc(fn, args)
      expect(error?.message).toContain('Meta não encontrada.')
    }
    expect(await balance(a, id)).toBe(5000)
  })

  test('ninguém grava movimento direto na meta de outra pessoa', async () => {
    const id = await newGoal(a)
    const asSelf = await b.client.from('goal_movements').insert({ user_id: b.id, goal_id: id, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(asSelf.error).not.toBeNull()
    const asOther = await b.client.from('goal_movements').insert({ user_id: a.id, goal_id: id, kind: 'deposit', amount_cents: 100, occurred_on: today })
    expect(asOther.error).not.toBeNull()
  })

  test('quem não entrou não guarda', async () => {
    const id = await newGoal(a)
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const { error } = await anon.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 })
    expect(error).not.toBeNull()
  })
})

describe('regras da meta', () => {
  test('nome, valor e prazo válidos', async () => {
    const bad = [
      { name: '' }, { name: ' Viagem' }, { name: 'x'.repeat(41) },
      { target_cents: 0 }, { target_cents: 10_000_000_000 },
      { deadline: '2027-03-15' }, { deadline: '2100-01-01' },
    ]
    for (const p of bad) {
      const { error } = await a.client.from('goals').insert({ user_id: a.id, name: 'Viagem', target_cents: 100, ...p })
      expect(error?.code).toBe('23514')
    }
    expect(await newGoal(a, { deadline: '2027-03-01' })).toBeTruthy()
  })

  test('a meta nunca é apagada de verdade', async () => {
    const id = await newGoal(a)
    const { data } = await a.client.from('goals').delete().eq('id', id).select()
    expect(data ?? []).toEqual([])
    expect(await goal(a, id)).toMatchObject({ status: 'active', deleted_on: null })
  })
})

describe('guardar e tirar (RN-13, RN-14)', () => {
  test('guardar soma no guardado da meta, com a data de hoje', async () => {
    const id = await newGoal(a)
    expect(await deposit(a, id, 230000)).toBe(230000)
    expect(await deposit(a, id, 30000)).toBe(260000)
    expect((await movements(a, id)).map((m) => [m.kind, m.amount_cents, m.occurred_on])).toEqual([
      ['deposit', 230000, today], ['deposit', 30000, today],
    ])
  })

  test('tirar vai até o que a meta tem; mais que isso é recusado sem mudar nada (Review Focus 4)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 18000)
    const tooMuch = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18001 })
    expect(tooMuch.error?.message).toContain('Valor maior que o guardado.')
    expect(await balance(a, id)).toBe(18000)
    const { data, error } = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
    expect(Number(data)).toBe(0)
    expect((await movements(a, id)).at(-1)).toMatchObject({ kind: 'withdraw', amount_cents: 18000, occurred_on: today })
  })

  test('tirar direto na tabela também respeita o guardado (Review Focus 1)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const { error } = await a.client.from('goal_movements').insert({ user_id: a.id, goal_id: id, kind: 'withdraw', amount_cents: 1001, occurred_on: today })
    expect(error?.message).toContain('Valor maior que o guardado.')
  })

  test('dois pedidos ao mesmo tempo não tiram duas vezes (Review Focus 1)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 5000)
    const results = await Promise.all([
      a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 5000 }),
      a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 5000 }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await balance(a, id)).toBe(0)
  })

  test('valores fora do limite são recusados', async () => {
    const id = await newGoal(a)
    for (const cents of [0, -1, 10_000_000_000, null]) {
      const { error } = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: cents })
      expect(error?.message).toContain('Valor inválido.')
    }
    await deposit(a, id, 9_999_999_999)
    const over = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 1 })
    expect(over.error?.message).toContain('Valor inválido.')
  })

  test('movimentos não são alterados; só o uso pode ser apagado', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const [m] = await movements(a, id)
    const { data: upd } = await a.client.from('goal_movements').update({ amount_cents: 1 }).eq('id', m.id).select()
    expect(upd ?? []).toEqual([])
    const { data: del } = await a.client.from('goal_movements').delete().eq('id', m.id).select()
    expect(del ?? []).toEqual([])
    expect(await balance(a, id)).toBe(1000)
  })
})

describe('usar o dinheiro da meta (RN-15)', () => {
  test('o banco divide o uso igual ao app; gasto maior zera a meta (RN-15a, Review Focus 2)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 300000)
    const r = await useGoal(a, id, 340000)
    const split = splitGoalUse(340000, 300000)
    expect({ funded: r.funded_cents, leftover: r.leftover_cents }).toEqual({ funded: split.fundedCents, leftover: split.leftoverCents })
    const { data: tx } = await a.client
      .from('transactions')
      .select('kind, amount_cents, status, occurred_on, category_id, goal_id, goal_funded_cents')
      .eq('id', r.tx_id)
      .single()
    expect(tx).toMatchObject({ kind: 'expense', status: 'confirmed', occurred_on: today, goal_id: id, category_id: await categoryId(a, 'lazer') })
    expect(Number(tx!.amount_cents)).toBe(340000)
    expect(Number(tx!.goal_funded_cents)).toBe(300000)
    expect((await movements(a, id)).at(-1)).toMatchObject({ kind: 'use', amount_cents: 300000, transaction_id: r.tx_id })
    expect(await balance(a, id)).toBe(0)
    expect(await goal(a, id)).toMatchObject({ status: 'used', used_on: today })
  })

  test('gasto menor: a sobra fica na meta; meta usada não recebe nem é usada de novo (RN-15b)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 248000)
    const r = await useGoal(a, id, 230000)
    expect(r.leftover_cents).toBe(18000)
    expect(await balance(a, id)).toBe(18000)
    const more = await a.client.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 })
    expect(more.error?.message).toContain('Meta não encontrada.')
    const again = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(a, 'lazer') })
    expect(again.error?.message).toContain('Meta não encontrada.')
    const { error } = await a.client.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: 18000 })
    expect(error).toBeNull()
  })

  test('meta sem dinheiro guardado, categoria de outra pessoa e valor inválido são recusados', async () => {
    const empty = await newGoal(a)
    const noMoney = await a.client.rpc('use_goal', { p_goal_id: empty, p_amount_cents: 100, p_category_id: await categoryId(a, 'lazer') })
    expect(noMoney.error?.message).toContain('Meta sem dinheiro guardado.')
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const otherCategory = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 100, p_category_id: await categoryId(b, 'lazer') })
    expect(otherCategory.error?.message).toContain('Categoria não encontrada.')
    const zero = await a.client.rpc('use_goal', { p_goal_id: id, p_amount_cents: 0, p_category_id: await categoryId(a, 'lazer') })
    expect(zero.error?.message).toContain('Valor inválido.')
    expect(await goal(a, id)).toMatchObject({ status: 'active' })
  })

  test('o gasto pago com meta não perde o vínculo', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 1000)
    const tooMuch = await a.client.from('transactions').update({ amount_cents: 500 }).eq('id', r.tx_id)
    expect(tooMuch.error?.code).toBe('23514')
    const removed = await a.client.from('transactions').delete().eq('id', r.tx_id)
    expect(removed.error?.code).toBe('23503')
  })

  test('excluir o uso: gasto e uso saem, o dinheiro volta e a meta volta a ativa (decisão 66)', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 248000)
    const r = await useGoal(a, id, 230000)
    const { data, error } = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error).toBeNull()
    expect(data).toBe(id)
    const { data: tx } = await a.client.from('transactions').select('id').eq('id', r.tx_id)
    expect(tx).toEqual([])
    expect(await balance(a, id)).toBe(248000)
    expect(await goal(a, id)).toMatchObject({ status: 'active', used_on: null })
    const again = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(again.error?.message).toContain('Gasto não encontrado.')
  })

  test('ninguém exclui o uso de outra pessoa', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 500)
    const { error } = await b.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error?.message).toContain('Gasto não encontrado.')
  })
})

describe('excluir meta (RN-16, A6 A, Review Focus 3)', () => {
  test('excluir: o guardado volta hoje, o histórico fica e a meta não aceita mais nada', async () => {
    const id = await newGoal(a)
    await deposit(a, id, 50000)
    const { error } = await a.client.rpc('delete_goal', { p_goal_id: id })
    expect(error).toBeNull()
    expect(await goal(a, id)).toMatchObject({ deleted_on: today })
    expect((await movements(a, id)).map((m) => [m.kind, m.amount_cents])).toEqual([['deposit', 50000], ['withdraw', 50000]])
    expect(await balance(a, id)).toBe(0)
    for (const [fn, args] of [
      ['deposit_to_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['withdraw_from_goal', { p_goal_id: id, p_amount_cents: 100 }],
      ['delete_goal', { p_goal_id: id }],
    ] as const) {
      const r = await a.client.rpc(fn, args)
      expect(r.error?.message).toContain('Meta não encontrada.')
    }
  })

  test('meta vazia é excluída sem movimento novo; uso de meta excluída não é desfeito', async () => {
    const empty = await newGoal(a)
    await a.client.rpc('delete_goal', { p_goal_id: empty })
    expect(await movements(a, empty)).toEqual([])

    const id = await newGoal(a)
    await deposit(a, id, 1000)
    const r = await useGoal(a, id, 400)
    await a.client.rpc('delete_goal', { p_goal_id: id })
    const { error } = await a.client.rpc('delete_goal_use', { p_transaction_id: r.tx_id })
    expect(error?.message).toContain('Meta não encontrada.')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano5.test.ts`
Expected: FAIL — `relation "public.goals" does not exist` (sem Docker: `fetch failed`; registrar como pendente e seguir; `npx tsc --noEmit` precisa passar).

- [ ] **Step 3: Implementação** — criar `supabase/migrations/20260929000001_metas.sql`:

```sql
-- Plano 5: metas (RF-25–30, RN-13–16, A6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.
-- Metas da família (Plano 7) entram depois: goal_movements.user_id já é
-- "quem guardou" (RN-22) e o tipo return_on_exit já existe (RN-22d).

-- 1. Metas. O guardado é sempre calculado pelos movimentos (etapa-3 §2).
--    "Concluída" é calculada (guardado >= valor); "usada" fica gravada.
--    Excluir é suave (deleted_on): o histórico continua (RN-16).
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  target_cents bigint not null check (target_cents > 0 and target_cents <= 9999999999),
  deadline date check (
    deadline is null
    or (deadline = date_trunc('month', deadline)::date and deadline between date '2000-01-01' and date '2099-12-01')
  ),
  status text not null default 'active' check (status in ('active', 'used')),
  used_on date,
  deleted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_used_on_when_used check ((status = 'used') = (used_on is not null)),
  unique (id, user_id)
);

create index goals_user_idx on public.goals (user_id, created_at);

create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

alter table public.goals enable row level security;

-- Sem política de exclusão: a meta nunca é apagada de verdade.
create policy goals_select on public.goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert on public.goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Gasto pago com meta (RN-15): quanto veio da meta; o resto veio do mês (RN-15a).
alter table public.transactions
  add constraint transactions_id_user_key unique (id, user_id),
  add column goal_id uuid,
  add column goal_funded_cents bigint not null default 0,
  add constraint goal_funded_range check (goal_funded_cents >= 0 and goal_funded_cents <= amount_cents),
  add constraint goal_funded_needs_goal check ((goal_id is null) = (goal_funded_cents = 0)),
  add constraint goal_only_confirmed_expense check (goal_id is null or (kind = 'expense' and status = 'confirmed')),
  add constraint transactions_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete no action;

create index transactions_goal_idx on public.transactions (goal_id) where goal_id is not null;

-- 3. Movimentos da meta: o livro-razão do Guardado (etapa-3 §3.1).
create table public.goal_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null,
  kind text not null check (kind in ('deposit', 'withdraw', 'use', 'return_on_exit')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  occurred_on date not null,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  constraint goal_movement_use_has_transaction check ((kind = 'use') = (transaction_id is not null)),
  constraint goal_movements_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete no action,
  constraint goal_movements_transaction_fk foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete no action
);

create index goal_movements_user_date_idx on public.goal_movements (user_id, occurred_on);
create index goal_movements_goal_idx on public.goal_movements (goal_id);
create unique index goal_movements_transaction_uidx on public.goal_movements (transaction_id) where transaction_id is not null;

alter table public.goal_movements enable row level security;

-- Sem política de alteração: movimentos não mudam. Só o uso pode ser
-- apagado (junto com o gasto, por delete_goal_use).
create policy goal_movements_select on public.goal_movements
  for select to authenticated using (user_id = (select auth.uid()));
create policy goal_movements_insert on public.goal_movements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goal_movements_delete_use on public.goal_movements
  for delete to authenticated using (user_id = (select auth.uid()) and kind = 'use');

-- 4. Guarda do guardado: vale também para gravação direta na tabela.
--    Trava a meta: dois pedidos ao mesmo tempo esperam um pelo outro.
create function public.goal_movements_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
  v_deleted date;
  v_balance bigint;
begin
  select g.status, g.deleted_on into v_status, v_deleted
    from public.goals g
    where g.id = new.goal_id and g.user_id = new.user_id
    for update;
  if not found or v_deleted is not null then
    raise exception 'Meta não encontrada.';
  end if;
  if new.kind = 'deposit' and v_status <> 'active' then
    raise exception 'Meta não encontrada.';
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

create trigger goal_movements_guard before insert on public.goal_movements
  for each row execute function public.goal_movements_guard();

-- 5. Guardado de uma meta da própria pessoa (0 para meta de outra pessoa).
create function public.goal_balance(p_goal_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint
  from public.goal_movements m
  where m.goal_id = p_goal_id and m.user_id = (select auth.uid())
$$;

-- 6. Guardar (RN-13): hoje, só em meta ativa.
create function public.deposit_to_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active' and g.deleted_on is null
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

-- 7. Tirar (RN-14): volta ao Disponível de hoje; nunca mais que o guardado.
--    Vale para meta ativa ou usada (a sobra de uma meta usada pode sair).
create function public.withdraw_from_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.deleted_on is null
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

-- 8. Usar o dinheiro da meta (RN-15, etapa-3 §8.3): gasto de hoje com a
--    categoria; a meta paga o menor entre o gasto e o guardado (mesma regra de
--    splitGoalUse, src/domain/goals.ts); a meta vira "usada". Tudo junto.
create function public.use_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid)
returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
  v_funded bigint;
  v_tx uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active' and g.deleted_on is null
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
  v_balance := public.goal_balance(p_goal_id);
  if v_balance <= 0 then
    raise exception 'Meta sem dinheiro guardado.';
  end if;
  v_funded := least(p_amount_cents, v_balance);

  insert into public.transactions (user_id, kind, amount_cents, category_id, occurred_on, goal_id, goal_funded_cents)
    values (v_uid, 'expense', p_amount_cents, p_category_id, v_today, p_goal_id, v_funded)
    returning id into v_tx;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on, transaction_id)
    values (v_uid, p_goal_id, 'use', v_funded, v_today, v_tx);
  update public.goals g set status = 'used', used_on = v_today
    where g.id = p_goal_id and g.user_id = v_uid;

  return query select v_tx, v_funded, v_balance - v_funded;
end;
$$;

-- 9. Desfazer um uso (engano): o gasto e o uso saem juntos, o dinheiro volta
--    para a meta e ela volta a ser ativa. Meta excluída: não.
create function public.delete_goal_use(p_transaction_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_goal uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select m.goal_id into v_goal from public.goal_movements m
    where m.transaction_id = p_transaction_id and m.user_id = v_uid and m.kind = 'use';
  if v_goal is null then
    raise exception 'Gasto não encontrado.';
  end if;
  perform 1 from public.goals g
    where g.id = v_goal and g.user_id = v_uid and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  delete from public.goal_movements m
    where m.transaction_id = p_transaction_id and m.user_id = v_uid and m.kind = 'use';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Gasto não encontrado.';
  end if;
  delete from public.transactions t where t.id = p_transaction_id and t.user_id = v_uid;
  update public.goals g set status = 'active', used_on = null
    where g.id = v_goal and g.user_id = v_uid;
  return v_goal;
end;
$$;

-- 10. Excluir meta (RN-16, A6 A): o guardado volta ao Disponível de hoje
--     como "tirado"; os movimentos passados continuam contando nos meses deles.
create function public.delete_goal(p_goal_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  v_balance := public.goal_balance(p_goal_id);
  if v_balance > 0 then
    insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
      values (v_uid, p_goal_id, 'withdraw', v_balance, v_today);
  end if;
  update public.goals g set deleted_on = v_today
    where g.id = p_goal_id and g.user_id = v_uid;
end;
$$;

revoke execute on function public.goal_movements_guard() from public, anon, authenticated;

revoke execute on function
  public.goal_balance(uuid),
  public.deposit_to_goal(uuid, bigint),
  public.withdraw_from_goal(uuid, bigint),
  public.use_goal(uuid, bigint, uuid),
  public.delete_goal_use(uuid),
  public.delete_goal(uuid)
from public, anon;

grant execute on function
  public.goal_balance(uuid),
  public.deposit_to_goal(uuid, bigint),
  public.withdraw_from_goal(uuid, bigint),
  public.use_goal(uuid, bigint, uuid),
  public.delete_goal_use(uuid),
  public.delete_goal(uuid)
to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS (`rls`, `plano2`, `plano3`, `plano4` e `plano5`). Sem Docker: registrar "pendente" e conferir `npx tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260929000001_metas.sql tests/db/plano5.test.ts
git commit -m "feat(db): metas, movimentos, guardar, tirar, usar, desfazer uso e excluir meta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Linhas do banco e leituras (metas, movimentos, registros)

**Files:**
- Create: `src/features/metas/types.ts`, `src/features/metas/queries.ts`
- Modify: `src/features/registro/tx-row.ts` (`goal_id`, `goal_funded_cents`), `src/features/registro/queries.ts` (`loadLedger` devolve `goalMovements`)
- Modify (só o ajudante `row` dos testes, porque `TxRow` ganhou `goalId`): `src/features/cartoes/view-model.test.ts`, `src/features/contas/view-model.test.ts`, `src/features/extrato/view-model.test.ts`, `src/features/parcelas/view-model.test.ts`, `src/features/seu-mes/view-model.test.ts` — acrescentar `goalId: null` aos padrões de `row(...)`.
- Test: `src/features/metas/types.test.ts`, `src/features/registro/tx-row.test.ts` (ajustar)

**Interfaces:**
- Consumes: colunas e tabelas da Task 2; `GoalMovement`, `GoalMovementKind` (`@/domain/summary`); `ISODate`, `MonthKey`; `fetchAllPages`; `requireUser`, `createClient`.
- Produces:
  - `tx-row.ts`: `TxRow` ganha `goalId: string | null`; `TxRawRow` ganha `goal_id: string | null; goal_funded_cents: number | string`; `TX_COLUMNS` termina com `, goal_id, goal_funded_cents`; `toTxRow` lê `goalFundedCents: Number(t.goal_funded_cents)` (antes era sempre 0).
  - `metas/types.ts` (puro, sem `server-only`):
    - `type GoalStatus = 'active' | 'used'`
    - `interface GoalRow { id: string; name: string; targetCents: number; deadline: MonthKey | null; status: GoalStatus; usedOn: ISODate | null; deletedOn: ISODate | null; createdAt: string }`; `type GoalRawRow`; `GOAL_COLUMNS = 'id, name, target_cents, deadline, status, used_on, deleted_on, created_at'`; `toGoalRow(r: GoalRawRow): GoalRow` (`deadline '2027-03-01'` → `'2027-03'`).
    - `interface GoalMovementRow extends GoalMovement { id: string; goalId: string; transactionId: string | null; createdAt: string }`; `type GoalMovementRawRow`; `MOVEMENT_COLUMNS = 'id, goal_id, kind, amount_cents, occurred_on, transaction_id, created_at'`; `toMovementRow(r: GoalMovementRawRow): GoalMovementRow`.
  - `metas/queries.ts` (`server-only`):
    - `fetchGoalMovements(supabase: SupabaseClient, userId: string): Promise<GoalMovementRow[]>` — todas as da pessoa por `fetchAllPages`, filtro `user_id`, ordem `occurred_on` desc, `created_at` desc, `id`.
    - `loadGoalMovements(): Promise<GoalMovementRow[]>` — `requireUser()` + `fetchGoalMovements` (para `/metas`, sem ler o histórico de registros).
    - `loadGoals(): Promise<GoalRow[]>` — todas as metas da pessoa, **inclusive excluídas** (o Extrato precisa do nome), filtro `user_id`, ordem `created_at`, `id`.
    - `loadGoal(id: string): Promise<{ goal: GoalRow; movements: GoalMovementRow[] } | null>` — em paralelo: a meta (filtros `id`, `user_id`, `.is('deleted_on', null)`, `maybeSingle`) e seus movimentos (filtros `goal_id`, `user_id`, ordem `occurred_on` desc, `created_at` desc); meta inexistente ou excluída → `null`; erro do banco → `throw`.
  - `loadLedger(): Promise<{ profile; categories; transactions; goalMovements: GoalMovementRow[] }>` — `goalMovements` lido em paralelo com profile e categorias, por `fetchGoalMovements(supabase, user.id)` (o `requireUser()` que já existe passa a guardar `user`).

- [ ] **Step 1: Testes que falham**

Em `src/features/registro/tx-row.test.ts`: acrescentar `goal_id: 'g1', goal_funded_cents: '6000'` ao `raw`; no objeto esperado do 1º teste, trocar `goalFundedCents: 0` por `goalFundedCents: 6000` e acrescentar `goalId: 'g1'`; no 2º teste passar também `goal_id: null, goal_funded_cents: 0` e esperar `goalId: null, goalFundedCents: 0`; no 3º, a lista de colunas passa a incluir `'goal_id', 'goal_funded_cents'`.

`src/features/metas/types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { GOAL_COLUMNS, MOVEMENT_COLUMNS, toGoalRow, toMovementRow } from './types'

test('converte a meta do banco; prazo vira mês', () => {
  expect(
    toGoalRow({
      id: 'g1', name: 'Viagem para Salvador', target_cents: '400000', deadline: '2027-03-01', status: 'active',
      used_on: null, deleted_on: null, created_at: '2026-07-15T12:00:00Z',
    }),
  ).toEqual({
    id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active',
    usedOn: null, deletedOn: null, createdAt: '2026-07-15T12:00:00Z',
  })
  expect(
    toGoalRow({
      id: 'g2', name: 'Computador novo', target_cents: 500000, deadline: null, status: 'used',
      used_on: '2026-07-20', deleted_on: null, created_at: '2026-01-02T12:00:00Z',
    }),
  ).toMatchObject({ deadline: null, status: 'used', usedOn: '2026-07-20' })
})

test('converte o movimento do banco', () => {
  expect(
    toMovementRow({
      id: 'm1', goal_id: 'g1', kind: 'use', amount_cents: '230000', occurred_on: '2026-09-28',
      transaction_id: 't1', created_at: '2026-09-28T15:00:00Z',
    }),
  ).toEqual({
    id: 'm1', goalId: 'g1', kind: 'use', amountCents: 230000, occurredOn: '2026-09-28',
    transactionId: 't1', createdAt: '2026-09-28T15:00:00Z',
  })
})

test('colunas lidas', () => {
  for (const c of ['target_cents', 'deadline', 'status', 'used_on', 'deleted_on']) expect(GOAL_COLUMNS).toContain(c)
  for (const c of ['goal_id', 'kind', 'amount_cents', 'occurred_on', 'transaction_id']) expect(MOVEMENT_COLUMNS).toContain(c)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas src/features/registro/tx-row.test.ts`
Expected: FAIL — `Failed to resolve import "./types"`; `tx-row` sem `goalId`.

- [ ] **Step 3: Implementação** — seguir Interfaces; `queries.ts` segue `src/features/parcelas/queries.ts` e `src/features/cartoes/queries.ts` (`import 'server-only'`, `requireUser()` primeiro, filtros `id`/`user_id` sempre explícitos). Acrescentar `goalId: null` nos ajudantes `row` dos cinco testes listados em **Files**.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS; tipos sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/types.ts src/features/metas/types.test.ts src/features/metas/queries.ts src/features/registro/tx-row.ts src/features/registro/tx-row.test.ts src/features/registro/queries.ts src/features/cartoes/view-model.test.ts src/features/contas/view-model.test.ts src/features/extrato/view-model.test.ts src/features/parcelas/view-model.test.ts src/features/seu-mes/view-model.test.ts
git commit -m "feat(metas): leitura de metas e movimentos; gasto pago com meta lido do banco" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Montagem das telas de metas (view-models)

**Files:**
- Create: `src/features/metas/view-model.ts`
- Test: `src/features/metas/view-model.test.ts`

**Interfaces:**
- Consumes: `goalBalance`, `goalProgress`, `monthlySuggestion` (Task 1); `formatBRL`, `formatWholeBRL`; `monthLabel`, `shortMonthLabel`, `dayMonthLabel`, `dayMonthYearLabel`, `monthOf`; `monthName` (`@/domain/recurrence`); `GoalRow`, `GoalMovementRow` (Task 3).
- Produces:
  - `interface GoalSummary { goal: GoalRow; balanceCents: Cents; percent: number; remainingCents: Cents; complete: boolean; remainingText: string | null; shortRemaining: string; deadlineShort: string; suggestion: { untilLabel: string; perMonth: string } | null }`
  - `summarizeGoal(goal: GoalRow, movements: GoalMovementRow[], today: ISODate): GoalSummary` — usa só os movimentos com `goalId === goal.id`. `remainingText = complete ? null : 'Faltam {formatBRL(remaining)} para {nome}.'` (copy); `shortRemaining = complete ? 'Meta completa' : 'Faltam {formatBRL(remaining)}'` (protótipo/lista); `deadlineShort = deadline ? 'até {shortMonthLabel}' : 'sem prazo'`; `suggestion` só para meta `active`, não completa, com `monthlySuggestion` não nula: `{ untilLabel: monthLabel(deadline), perMonth: '{formatWholeBRL} por mês' }`.
  - `interface MetasView { totalCents: Cents; active: GoalSummary[]; concluded: { id: string; name: string; caption: string }[]; empty: boolean }`
  - `buildMetas(input: { goals: GoalRow[]; movements: GoalMovementRow[]; today: ISODate }): MetasView` — ignora excluídas; `totalCents` = soma dos guardados das não excluídas; `active` = `status === 'active'` na ordem de criação; `concluded` = `status === 'used'`, mais recente primeiro, `caption = '{nome} · usada em {mês}'` (`monthName` quando o ano de `usedOn` é o de hoje, senão `monthLabel`); `empty` quando não sobra nenhuma meta.
  - `interface GoalHistoryItem { id: string; label: 'Guardou' | 'Tirou' | 'Usou'; dateLabel: string; amountText: string; positive: boolean; transactionId: string | null }`
  - `interface GoalDetailView { summary: GoalSummary; state: 'active' | 'complete' | 'used'; celebration: string | null; usedText: string | null; balanceText: string; canDeposit: boolean; canWithdraw: boolean; canUse: boolean; history: GoalHistoryItem[] }`
  - `buildGoalDetail(input: { goal: GoalRow; movements: GoalMovementRow[]; today: ISODate }): GoalDetailView` — `state`: `used` se `status === 'used'`, senão `complete` se completa, senão `active`; `celebration = 'Você chegou lá. {nome} está completa.'` só em `complete`; `usedText = 'Usada em {dayMonthYearLabel(usedOn)}.'` só em `used`; `balanceText = 'Você tem {formatBRL(balance)} guardados em {nome}.'` (protótipo); `canDeposit = status active`; `canWithdraw = balance > 0`; `canUse = status active && balance > 0`; histórico na ordem recebida (mais recente primeiro): `deposit` → `Guardou`/`+ R$ …`/`positive: true`; `withdraw` e `return_on_exit` → `Tirou`/`− R$ …`; `use` → `Usou`/`− R$ …` com `transactionId`; `dateLabel = dayMonthLabel` no ano de hoje, senão `dayMonthYearLabel`.
  - `pickFeatured(summaries: GoalSummary[]): GoalSummary | null` — entre `status active` e não completas: maior `percent`; empate: prazo mais perto (sem prazo por último); depois a mais antiga (`createdAt`).

- [ ] **Step 1: Testes que falham** — `src/features/metas/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { GoalMovementRow, GoalRow } from './types'
import { buildGoalDetail, buildMetas, pickFeatured, summarizeGoal } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'

const goal = (p: Partial<GoalRow> & Pick<GoalRow, 'id' | 'name'>): GoalRow => ({
  targetCents: 400000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z', ...p,
})
let seq = 0
const mv = (p: Partial<GoalMovementRow> & Pick<GoalMovementRow, 'goalId' | 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  id: `m${++seq}`, transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

const viagem = goal({ id: 'g1', name: 'Viagem para Salvador', deadline: '2027-03' })
const viagemMoves = [
  mv({ goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
  mv({ goalId: 'g1', kind: 'withdraw', amountCents: 12000, occurredOn: '2026-08-02' }),
  mv({ goalId: 'g1', kind: 'deposit', amountCents: 230000, occurredOn: '2026-07-15' }),
]

describe('resumo de uma meta (RF-29)', () => {
  test('exemplo do protótipo: 62%, faltam R$ 1.520,00, até mar. 2027, cerca de R$ 254 por mês', () => {
    const s = summarizeGoal(viagem, viagemMoves, today)
    expect(s).toMatchObject({ balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false })
    expect(s.remainingText).toBe(`Faltam ${brl('1.520,00')} para Viagem para Salvador.`)
    expect(s.shortRemaining).toBe(`Faltam ${brl('1.520,00')}`)
    expect(s.deadlineShort).toBe('até mar. 2027')
    expect(s.suggestion).toEqual({ untilLabel: 'março de 2027', perMonth: `${brl('254')} por mês` })
  })

  test('sem prazo; e meta completa não mostra quanto falta nem sugestão', () => {
    const reserva = goal({ id: 'g2', name: 'Reserva de emergência', targetCents: 1000000 })
    expect(summarizeGoal(reserva, [], today)).toMatchObject({ percent: 0, deadlineShort: 'sem prazo', suggestion: null })
    const full = summarizeGoal(viagem, [mv({ goalId: 'g1', kind: 'deposit', amountCents: 400000, occurredOn: today })], today)
    expect(full).toMatchObject({ complete: true, percent: 100, remainingText: null, shortRemaining: 'Meta completa', suggestion: null })
  })

  test('só conta os movimentos da própria meta', () => {
    expect(summarizeGoal(viagem, [...viagemMoves, mv({ goalId: 'g9', kind: 'deposit', amountCents: 999, occurredOn: today })], today).balanceCents).toBe(248000)
  })
})

describe('lista de metas', () => {
  test('guardado em metas, ativas, concluídas; excluídas não aparecem (Review Focus 3)', () => {
    const goals = [
      viagem,
      goal({ id: 'g2', name: 'Reserva de emergência', targetCents: 1000000, createdAt: '2026-08-01T12:00:00Z' }),
      goal({ id: 'g3', name: 'Computador novo', status: 'used', usedOn: '2026-07-20' }),
      goal({ id: 'g4', name: 'Bicicleta', status: 'used', usedOn: '2025-11-03' }),
      goal({ id: 'g5', name: 'Antiga', deletedOn: '2026-09-01' }),
    ]
    const movements = [
      ...viagemMoves,
      mv({ goalId: 'g3', kind: 'deposit', amountCents: 50000, occurredOn: '2026-06-01' }),
      mv({ goalId: 'g3', kind: 'use', amountCents: 32000, occurredOn: '2026-07-20', transactionId: 't1' }),
      mv({ goalId: 'g5', kind: 'deposit', amountCents: 7000, occurredOn: '2026-08-01' }),
      mv({ goalId: 'g5', kind: 'withdraw', amountCents: 7000, occurredOn: '2026-09-01' }),
    ]
    const v = buildMetas({ goals, movements, today })
    expect(v.totalCents).toBe(248000 + 18000)
    expect(v.active.map((s) => s.goal.name)).toEqual(['Viagem para Salvador', 'Reserva de emergência'])
    expect(v.concluded).toEqual([
      { id: 'g3', name: 'Computador novo', caption: 'Computador novo · usada em julho' },
      { id: 'g4', name: 'Bicicleta', caption: 'Bicicleta · usada em novembro de 2025' },
    ])
    expect(v.empty).toBe(false)
  })

  test('sem metas (ou só excluídas): vazio', () => {
    expect(buildMetas({ goals: [], movements: [], today }).empty).toBe(true)
    expect(buildMetas({ goals: [goal({ id: 'g5', name: 'Antiga', deletedOn: '2026-09-01' })], movements: [], today }).empty).toBe(true)
  })
})

describe('tela da meta', () => {
  test('ativa: histórico do protótipo, pode guardar, tirar e usar', () => {
    const v = buildGoalDetail({ goal: viagem, movements: viagemMoves, today })
    expect(v.state).toBe('active')
    expect(v.celebration).toBeNull()
    expect(v.balanceText).toBe(`Você tem ${brl('2.480,00')} guardados em Viagem para Salvador.`)
    expect([v.canDeposit, v.canWithdraw, v.canUse]).toEqual([true, true, true])
    expect(v.history.map((h) => [h.label, h.dateLabel, h.amountText, h.positive])).toEqual([
      ['Guardou', '19 de setembro', `+ ${brl('300,00')}`, true],
      ['Tirou', '2 de agosto', `− ${brl('120,00')}`, false],
      ['Guardou', '15 de julho', `+ ${brl('2.300,00')}`, true],
    ])
  })

  test('completa: comemoração da copy (RF-30)', () => {
    const v = buildGoalDetail({ goal: viagem, movements: [mv({ goalId: 'g1', kind: 'deposit', amountCents: 400000, occurredOn: today })], today })
    expect(v.state).toBe('complete')
    expect(v.celebration).toBe('Você chegou lá. Viagem para Salvador está completa.')
    expect(v.canUse).toBe(true)
  })

  test('usada com sobra: só dá para tirar; o uso aparece com o gasto', () => {
    const used = goal({ id: 'g3', name: 'Computador novo', status: 'used', usedOn: '2026-07-20' })
    const v = buildGoalDetail({
      goal: used,
      movements: [
        mv({ goalId: 'g3', kind: 'use', amountCents: 32000, occurredOn: '2026-07-20', transactionId: 't1' }),
        mv({ goalId: 'g3', kind: 'deposit', amountCents: 50000, occurredOn: '2025-12-30' }),
      ],
      today,
    })
    expect(v.state).toBe('used')
    expect(v.usedText).toBe('Usada em 20 de julho de 2026.')
    expect([v.canDeposit, v.canWithdraw, v.canUse]).toEqual([false, true, false])
    expect(v.history[0]).toMatchObject({ label: 'Usou', amountText: `− ${brl('320,00')}`, transactionId: 't1' })
    expect(v.history[1].dateLabel).toBe('30 de dezembro de 2025')
  })
})

test('meta em destaque: a ativa mais adiantada que ainda não chegou lá (decisão 70)', () => {
  const a = summarizeGoal(viagem, viagemMoves, today) // 62%
  const b = summarizeGoal(goal({ id: 'g2', name: 'Presente', targetCents: 10000 }), [mv({ goalId: 'g2', kind: 'deposit', amountCents: 10000, occurredOn: today })], today) // completa
  const c = summarizeGoal(goal({ id: 'g3', name: 'Curso', targetCents: 100000, deadline: '2026-12' }), [mv({ goalId: 'g3', kind: 'deposit', amountCents: 62000, occurredOn: today })], today) // 62%, prazo mais perto
  expect(pickFeatured([a, b, c])?.goal.id).toBe('g3')
  expect(pickFeatured([b])).toBeNull()
  expect(pickFeatured([])).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas/view-model.test.ts`
Expected: FAIL — `Failed to resolve import "./view-model"`.

- [ ] **Step 3: Implementação** — seguir Interfaces (funções puras; o sinal de menos é `−`, U+2212, como no Extrato).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/view-model.ts src/features/metas/view-model.test.ts
git commit -m "feat(metas): resumo, lista, tela da meta e meta em destaque" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Seu mês e Contas com as metas — números e "Meta em destaque"

**Files:**
- Create: `src/ui/progress-bar.tsx`, `src/features/seu-mes/featured-goal.tsx`
- Modify: `src/features/seu-mes/view-model.ts`, `src/features/contas/view-model.ts`, `src/app/(app)/inicio/page.tsx`, `src/app/(app)/contas/page.tsx`
- Test: `src/ui/progress-bar.test.tsx`, `src/features/seu-mes/featured-goal.test.tsx`, `src/features/seu-mes/view-model.test.ts` (acrescentar; chamadas existentes ganham `goals: [], goalMovements: []`), `src/features/contas/view-model.test.ts` (acrescentar; `base` ganha `goalMovements: []`)

**Interfaces:**
- Consumes: `summarizeGoal`, `pickFeatured` (Task 4); `GoalRow`, `GoalMovementRow`, `loadGoals` (Task 3); `loadLedger().goalMovements` (Task 3); `formatBRL`, `monthLabel`; `Card`, `Button`, `Money`.
- Produces:
  - `ProgressBar({ percent, label, size = 'md' }: { percent: number; label: string; size?: 'md' | 'lg' })` — `div role="progressbar"` com `aria-label={label}`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow={percent}`; trilho `rounded-full` (`md`: altura 10 px, fundo `bg-brand-wash`; `lg`: 12 px, fundo `bg-card`), preenchimento `bg-brand` com `width: {percent}%` (nada quando 0).
  - `buildSeuMes` recebe também `goals: GoalRow[]` e `goalMovements: GoalMovementRow[]`; passa `goalMovements` a `summarizeMonth` (no lugar de `[]`); devolve também `featured: { id: string; name: string; percent: number; remainingText: string; caption: string; guardarHref: string } | null` — só no mês atual; `pickFeatured` das metas não excluídas; `caption = '{formatBRL(guardado)} de {formatBRL(valor)}'` + `' · até {monthLabel(prazo)}'` quando há prazo (protótipo); `guardarHref = '/metas/{id}/guardar'`.
  - `buildContas` recebe também `goalMovements: GoalMovementRow[]` e passa a `summarizeMonth` ("Disponível depois" das contas considera o que foi guardado).
  - `FeaturedGoal({ goal }: { goal: NonNullable<SeuMesView['featured']> })` — `section aria-labelledby` com `h2` "Meta em destaque" e o link "Ver metas" (`/metas`); nome (16 px, 600) e `{percent}%` (14 px, 600, `text-brand-text`); `ProgressBar label="Progresso de {nome}"`; `remainingText` (15 px, `text-ink`); `caption` (14 px, `text-muted`); `Button variant="secondary" href={guardarHref}` "Guardar dinheiro". Visual do protótipo Seu mês.
  - `inicio/page.tsx`: `const [{ profile, categories, transactions, goalMovements }, goals] = await Promise.all([loadLedger(), loadGoals()])`; `{v.featured && <FeaturedGoal goal={v.featured} />}` logo depois de `CategoriesCard` (ordem do protótipo). `contas/page.tsx` passa `goalMovements`.

- [ ] **Step 1: Testes que falham**

Em `src/features/seu-mes/view-model.test.ts` (acrescentar; `goals: [], goalMovements: []` nas chamadas que já existem):

```ts
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'

const goalRow = (p: Partial<GoalRow> & Pick<GoalRow, 'id' | 'name'>): GoalRow => ({
  targetCents: 400000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z', ...p,
})
const move = (p: Pick<GoalMovementRow, 'id' | 'goalId' | 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

test('guardar e tirar entram nos números do mês (RN-01, RN-13, RN-14)', () => {
  const v = buildSeuMes({
    month: '2026-09', today: '2026-09-22', profile: { displayName: 'C', initialBalanceCents: 0 }, categories,
    transactions: [row({ id: 't1', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' })],
    goals: [goalRow({ id: 'g1', name: 'Viagem para Salvador' })],
    goalMovements: [
      move({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
      move({ id: 'm2', goalId: 'g1', kind: 'withdraw', amountCents: 5000, occurredOn: '2026-09-20' }),
    ],
  })
  expect(v.summary.goalLine).toEqual({ label: 'Guardado este mês', amountCents: 25000 })
  expect(v.summary.disponivelCents).toBe(475000)
  expect(v.summary.guardadoTotalCents).toBe(25000)
  expect(v.summary.saldoTotalCents).toBe(500000)
})

test('meta em destaque do protótipo, só no mês atual', () => {
  const input = {
    profile: { displayName: 'C', initialBalanceCents: 0 }, categories, transactions: [],
    goals: [goalRow({ id: 'g1', name: 'Viagem para Salvador', deadline: '2027-03' }), goalRow({ id: 'g2', name: 'Antiga', deletedOn: '2026-09-01' })],
    goalMovements: [
      move({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 248000, occurredOn: '2026-09-19' }),
      move({ id: 'm2', goalId: 'g2', kind: 'deposit', amountCents: 399000, occurredOn: '2026-08-19' }),
      move({ id: 'm3', goalId: 'g2', kind: 'withdraw', amountCents: 399000, occurredOn: '2026-09-01' }),
    ],
  }
  const NBSP = String.fromCharCode(0xa0)
  const v = buildSeuMes({ ...input, month: '2026-09', today: '2026-09-22' })
  expect(v.featured).toEqual({
    id: 'g1', name: 'Viagem para Salvador', percent: 62,
    remainingText: `Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`,
    caption: `R$${NBSP}2.480,00 de R$${NBSP}4.000,00 · até março de 2027`,
    guardarHref: '/metas/g1/guardar',
  })
  expect(buildSeuMes({ ...input, month: '2026-08', today: '2026-09-22' }).featured).toBeNull()
})
```

Em `src/features/contas/view-model.test.ts` (acrescentar; `base` ganha `goalMovements: []`):

```ts
test('"Disponível depois" considera o que foi guardado no mês', () => {
  const v = buildContas({
    ...base, tab: 'a-pagar',
    goalMovements: [{ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 1000, occurredOn: `${base.month}-02`, transactionId: null, createdAt: `${base.month}-02T12:00:00Z` }],
  })
  const without = buildContas({ ...base, tab: 'a-pagar' })
  expect(v.disponivelDepoisCents).toBe(without.disponivelDepoisCents - 1000)
})
```

`src/ui/progress-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProgressBar } from './progress-bar'

afterEach(() => cleanup())

test('barra acessível com o percentual', () => {
  render(<ProgressBar percent={62} label="Progresso de Viagem para Salvador" />)
  const bar = screen.getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' })
  expect(bar.getAttribute('aria-valuenow')).toBe('62')
  expect(bar.getAttribute('aria-valuemax')).toBe('100')
  expect((bar.firstElementChild as HTMLElement).style.width).toBe('62%')
})
```

`src/features/seu-mes/featured-goal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FeaturedGoal } from './featured-goal'

afterEach(() => cleanup())

test('Meta em destaque: progresso, quanto falta, Ver metas e Guardar dinheiro', () => {
  render(
    <FeaturedGoal goal={{ id: 'g1', name: 'Viagem para Salvador', percent: 62, remainingText: 'Faltam R$ 1.520,00 para Viagem para Salvador.', caption: 'R$ 2.480,00 de R$ 4.000,00 · até março de 2027', guardarHref: '/metas/g1/guardar' }} />,
  )
  const card = screen.getByRole('region', { name: 'Meta em destaque' })
  expect(within(card).getByRole('link', { name: 'Ver metas' }).getAttribute('href')).toBe('/metas')
  expect(within(card).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' }).getAttribute('aria-valuenow')).toBe('62')
  expect(card.textContent).toContain('62%')
  expect(card.textContent).toContain('Faltam R$ 1.520,00 para Viagem para Salvador.')
  expect(within(card).getByRole('link', { name: 'Guardar dinheiro' }).getAttribute('href')).toBe('/metas/g1/guardar')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/progress-bar.test.tsx src/features/seu-mes src/features/contas/view-model.test.ts`
Expected: FAIL — imports inexistentes; `goalLine` nulo; `featured` indefinido.

- [ ] **Step 3: Implementação** — seguir Interfaces.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/progress-bar.tsx src/ui/progress-bar.test.tsx src/features/seu-mes src/features/contas/view-model.ts src/features/contas/view-model.test.ts "src/app/(app)/inicio/page.tsx" "src/app/(app)/contas/page.tsx"
git commit -m "feat(seu-mes): guardado e tirado nos números do mês; meta em destaque" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Criar, editar e excluir meta (Server Actions)

**Files:**
- Create: `src/features/metas/schemas.ts`, `src/features/metas/actions.ts`
- Modify: `src/lib/refresh.ts` (acrescentar `revalidatePath('/metas', 'layout')`)
- Test: `src/features/metas/schemas.test.ts`, `src/features/metas/actions.test.ts`

**Interfaces:**
- Consumes: `amountField` (`@/features/registro/schemas`); `MAX_GOAL_NAME` (Task 1); `parseMonthKey`, `monthOf`, `todayInSaoPaulo`; tabela `goals` e RPC `delete_goal` (Task 2); `requireUser`, `createClient`, `setFlash`, `refreshMoneyViews`, `errorState`/`firstFieldErrors`/`readFields`.
- Produces:
  - `GOAL_MESSAGES = { deadline: 'Escolha um mês a partir de agora.' } as const` (em `schemas.ts`).
  - `makeGoalSchema(today: ISODate, mode: 'create' | 'edit' = 'create')` — entrada `{ name, target, deadline }` → `{ name: string; targetCents: number; deadline: MonthKey | null }`. Nome: `trim`, `'Falta o nome.'`, `'Use até 40 caracteres.'`; valor: `amountField` (`'Falta o valor.'`, `'Esse valor não parece certo. Use apenas números.'`); prazo: vazio → `null`; senão `AAAA-MM` válido e até `2099-12`; ao criar, a partir do mês de hoje; ao editar, a partir de `2000-01` (um prazo que já passou pode ficar). Fora disso: `GOAL_MESSAGES.deadline`.
  - `makeUseSchema()` — entrada `{ amount, categoryId }` → `{ amountCents: number; categoryId: string }`; categoria `z.uuid({ error: 'Escolha uma categoria para esse gasto.' })`.
  - `createGoal(_: FormState, fd: FormData): Promise<FormState>` — `insert` em `goals` `{ user_id, name, target_cents, deadline: deadline ? '{deadline}-01' : null }` + `.select('id').single()`; aviso `'Meta criada. O primeiro passo já foi dado.'`; `refreshMoneyViews()`; vai para `/metas/{id}`.
  - `updateGoal(_: FormState, fd: FormData): Promise<FormState>` — `update { name, target_cents, deadline }` com filtros `id`, `user_id`, `.is('deleted_on', null)`, `.select('id')`; 1 linha → `'Alterações salvas.'`, `refreshMoneyViews()`, `/metas/{id}`; 0 linha ou id inválido → `SAVE_FAILED` mantendo o que foi digitado.
  - `deleteGoal(fd: FormData): Promise<void>` — `rpc('delete_goal', { p_goal_id })`; aviso `'Meta excluída.'`; `refreshMoneyViews()`; vai para `/metas`; erro → `/metas/{id}/editar?erro=1`; id inválido → `/metas` sem chamar o banco.

- [ ] **Step 1: Testes que falham**

`src/features/metas/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { makeGoalSchema, makeUseSchema } from './schemas'

const today = '2026-09-28'
const msg = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  r.error?.issues.find((i) => i.path[0] === field)?.message

test('nome, valor e prazo (copy: "Para o que você quer guardar?" · "Quanto você precisa?" · "Até quando?")', () => {
  expect(makeGoalSchema(today).parse({ name: '  Viagem para Salvador ', target: '4.000', deadline: '2027-03' })).toEqual({
    name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03',
  })
  expect(makeGoalSchema(today).parse({ name: 'Reserva', target: '10000', deadline: '' }).deadline).toBeNull()
  expect(makeGoalSchema(today).parse({ name: 'Presente', target: '100', deadline: '2026-09' }).deadline).toBe('2026-09')
})

test('mensagens', () => {
  const s = makeGoalSchema(today)
  expect(msg(s.safeParse({ name: ' ', target: '10', deadline: '' }), 'name')).toBe('Falta o nome.')
  expect(msg(s.safeParse({ name: 'x'.repeat(41), target: '10', deadline: '' }), 'name')).toBe('Use até 40 caracteres.')
  expect(msg(s.safeParse({ name: 'Viagem', target: '', deadline: '' }), 'target')).toBe('Falta o valor.')
  expect(msg(s.safeParse({ name: 'Viagem', target: 'abc', deadline: '' }), 'target')).toBe('Esse valor não parece certo. Use apenas números.')
  for (const deadline of ['2026-08', '2100-01', 'março', '2027-13']) {
    expect(msg(s.safeParse({ name: 'Viagem', target: '10', deadline }), 'deadline')).toBe('Escolha um mês a partir de agora.')
  }
})

test('ao editar, um prazo que já passou pode ficar', () => {
  expect(makeGoalSchema(today, 'edit').parse({ name: 'Viagem', target: '10', deadline: '2026-05' }).deadline).toBe('2026-05')
  expect(makeGoalSchema(today, 'edit').safeParse({ name: 'Viagem', target: '10', deadline: '1999-12' }).success).toBe(false)
})

test('usar o dinheiro: valor e categoria', () => {
  expect(makeUseSchema().parse({ amount: '2.300', categoryId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90' })).toEqual({
    amountCents: 230000, categoryId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  })
  expect(msg(makeUseSchema().safeParse({ amount: '10', categoryId: '' }), 'categoryId')).toBe('Escolha uma categoria para esse gasto.')
})
```

`src/features/metas/actions.test.ts`:

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
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), refresh: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

function fakeSupabase(s: { rows?: number; insertError?: unknown; rpcError?: unknown } = {}) {
  return {
    from: (table: string) => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: async () => {
            calls.push({ op: `insert:${table}`, filters: {}, payload })
            return s.insertError ? { data: null, error: s.insertError } : { data: { id: ID }, error: null }
          },
        }),
      }),
      update: (payload: unknown) => {
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
            calls.push({ op: `update:${table}`, filters, payload })
            return { data: Array.from({ length: s.rows ?? 1 }, () => ({ id: filters.id })), error: null }
          },
        }
        return b
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

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.refresh.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createGoal', () => {
  test('cria a meta da própria pessoa, com prazo no 1º dia do mês, e abre a meta', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Viagem para Salvador', target: '4.000', deadline: '2027-03', user_id: 'outra' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'insert:goals', filters: {}, payload: { user_id: 'u1', name: 'Viagem para Salvador', target_cents: 400000, deadline: '2027-03-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta criada. O primeiro passo já foi dado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('sem prazo grava prazo vazio; erro no campo mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.createGoal({ status: 'idle' }, form({ name: 'Reserva', target: '10.000', deadline: '' })))
    expect((calls[0].payload as { deadline: unknown }).deadline).toBeNull()
    calls.length = 0
    const state = await actions.createGoal({ status: 'idle' }, form({ name: '', target: '10', deadline: '2027-03' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' }, values: { target: '10', deadline: '2027-03' } })
    expect(calls).toEqual([])
  })

  test('falha no banco avisa sem perder nada', async () => {
    h.supabase = fakeSupabase({ insertError: { message: 'x' } })
    const state = await actions.createGoal({ status: 'idle' }, form({ name: 'Reserva', target: '10', deadline: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Reserva' } })
  })
})

describe('updateGoal', () => {
  test('altera só a meta da própria pessoa, não excluída', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(actions.updateGoal({ status: 'idle' }, form({ id: ID, name: 'Viagem', target: '5.000', deadline: '2026-05' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'update:goals', filters: { id: ID, user_id: 'u1', deleted_on: null }, payload: { name: 'Viagem', target_cents: 500000, deadline: '2026-05-01' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('meta de outra pessoa, excluída ou id inválido não grava (Review Focus 5)', async () => {
    h.supabase = fakeSupabase({ rows: 0 })
    for (const id of [ID, 'nao-e-id']) {
      const state = await actions.updateGoal({ status: 'idle' }, form({ id, name: 'Viagem', target: '10', deadline: '' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Viagem' } })
    }
    expect(calls.map((c) => c.filters)).toEqual([{ id: ID, user_id: 'u1', deleted_on: null }])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteGoal', () => {
  test('exclui pela função atômica e avisa', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteGoal(form({ id: ID })))).toBe('/metas')
    expect(calls).toEqual([{ op: 'rpc:delete_goal', filters: {}, payload: { p_goal_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta excluída.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('falha volta para editar com aviso; id inválido volta para Metas sem chamar o banco', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'Meta não encontrada.' } })
    expect(await redirectOf(actions.deleteGoal(form({ id: ID })))).toBe(`/metas/${ID}/editar?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
    calls.length = 0
    expect(await redirectOf(actions.deleteGoal(form({ id: 'x' })))).toBe('/metas')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas/schemas.test.ts src/features/metas/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"` / `"./actions"`.

- [ ] **Step 3: Implementação** — `actions.ts`: `'use server'`, só funções async; `SAVE_FAILED` e `GOAL_FIELDS = ['name', 'target', 'deadline']` são constantes locais não exportadas; `requireUser()` primeiro; hoje por `todayInSaoPaulo()`; id validado com `z.uuid()`; `redirect()` fora de `try`. `refresh.ts`: acrescentar `revalidatePath('/metas', 'layout')`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas src/lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/schemas.ts src/features/metas/schemas.test.ts src/features/metas/actions.ts src/features/metas/actions.test.ts src/lib/refresh.ts
git commit -m "feat(metas): criar, editar e excluir meta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Guardar, tirar, usar, devolver a sobra e desfazer um uso (Server Actions)

**Files:**
- Create: `src/features/metas/movement-actions.ts`
- Test: `src/features/metas/movement-actions.test.ts`

**Interfaces:**
- Consumes: `amountField`; `makeUseSchema` (Task 6); `crossedMilestone` (Task 1); `formatBRL`; RPCs `deposit_to_goal`, `withdraw_from_goal`, `goal_balance`, `use_goal`, `delete_goal_use` (Task 2); `requireUser`, `createClient`, `setFlash`, `refreshMoneyViews`, `errorState`/`firstFieldErrors`/`readFields`.
- Produces (`'use server'`, só funções async; o id da meta vem do campo escondido `id` e é validado com `z.uuid()`; id inválido → `SAVE_FAILED` nos formulários e `/metas` nas ações de botão):
  - `depositToGoal(_: FormState, fd: FormData): Promise<FormState>` — lê a meta (`from('goals').select('name, target_cents')` com filtros `id`, `user_id`, `.is('deleted_on', null)`, `maybeSingle`); sem meta → `SAVE_FAILED`; `rpc('deposit_to_goal', { p_goal_id, p_amount_cents })` → guardado depois; aviso: `crossedMilestone(depois − valor, depois, alvo)` = `'complete'` → `'Você chegou lá. {nome} está completa.'`, `'half'` → `'Metade do caminho até {nome}.'`, senão `'Guardado. Seu mês já está atualizado.'`; `refreshMoneyViews()`; vai para `/metas/{id}`.
  - `withdrawFromGoal(_: FormState, fd: FormData): Promise<FormState>` — `rpc('withdraw_from_goal', …)`; erro com `'Valor maior que o guardado.'` → lê `rpc('goal_balance', { p_goal_id })` e devolve `fieldErrors.amount = 'Esta meta tem {formatBRL(guardado)}. Tire até esse valor.'` mantendo o valor digitado; outro erro → `SAVE_FAILED`; sucesso → `'Pronto. O valor voltou para o seu mês.'`, `refreshMoneyViews()`, `/metas/{id}`.
  - `spendFromGoal(_: FormState, fd: FormData): Promise<FormState>` — `makeUseSchema`; `rpc('use_goal', { p_goal_id, p_amount_cents, p_category_id })`; erro com `'Categoria não encontrada.'` → `fieldErrors.categoryId = 'Escolha uma categoria para esse gasto.'`; outro erro → `SAVE_FAILED`; `refreshMoneyViews()`; sobra (`leftover_cents > 0`) → `/metas/{id}/sobra` **sem aviso** (a pergunta já diz "Anotado."); sem sobra → `'Anotado. Seu mês já está atualizado.'` e `/metas/{id}`.
  - `returnLeftover(fd: FormData): Promise<void>` — `rpc('goal_balance')`; 0 → `/metas/{id}` sem gravar; senão `rpc('withdraw_from_goal', { p_amount_cents: guardado })`; erro → `/metas/{id}?erro=1`; sucesso → `'Devolvido. Seu mês já está atualizado.'`, `refreshMoneyViews()`, `/inicio` (protótipo).
  - `deleteGoalUse(fd: FormData): Promise<void>` — campos `transactionId` e `goalId` (uuid; inválidos → `/metas`); `rpc('delete_goal_use', { p_transaction_id })`; erro → `/metas/{goalId}?erro=1`; sucesso → `'Excluído. Seu mês já está atualizado.'`, `refreshMoneyViews()`, `/metas/{goalId}`.

- [ ] **Step 1: Testes que falham** — `src/features/metas/movement-actions.test.ts` (mesmo cabeçalho de mocks, `redirectOf`, `form`, `ID`, `SAVE_FAILED` e relógio falso do teste da Task 6, importando `./movement-actions`):

```ts
const NBSP = String.fromCharCode(0xa0)
const TX = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'

type Rpc = { data?: unknown; error?: unknown }
function fakeSupabase(s: { goal?: { name: string; target_cents: number } | null; rpc?: Record<string, Rpc | Rpc[]> } = {}) {
  const queue: Record<string, Rpc[]> = Object.fromEntries(Object.entries(s.rpc ?? {}).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  return {
    from: (table: string) => ({
      select: (cols: string) => {
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
          maybeSingle: async () => {
            calls.push({ op: `select:${table}:${cols}`, filters })
            return { data: s.goal === undefined ? { name: 'Viagem para Salvador', target_cents: 400000 } : s.goal, error: null }
          },
        }
        return b
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      const r = queue[fn]?.length ? queue[fn].shift()! : {}
      return { data: r.data ?? null, error: r.error ?? null }
    },
  }
}

describe('depositToGoal (RN-13)', () => {
  test('guarda na meta da própria pessoa e confirma', async () => {
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 250000 } } })
    const url = await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([
      { op: 'select:goals:name, target_cents', filters: { id: ID, user_id: 'u1', deleted_on: null } },
      { op: 'rpc:deposit_to_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 2000 } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Guardado. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('metade do caminho e meta completa usam a copy de comemoração (RF-30)', async () => {
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 200000 } } })
    await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '1.000' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Metade do caminho até Viagem para Salvador.')
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 410000 } } })
    await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '2.100' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Você chegou lá. Viagem para Salvador está completa.')
  })

  test('valor vazio fica no campo; meta excluída, de outra pessoa ou usada não grava (Review Focus 5)', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '' }))).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' } })
    h.supabase = fakeSupabase({ goal: null })
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' }))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '20' } })
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { error: { message: 'Meta não encontrada.' } } } })
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('withdrawFromGoal (RN-14)', () => {
  test('tira e confirma', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_from_goal: { data: 16000 } } })
    expect(await redirectOf(actions.withdrawFromGoal({ status: 'idle' }, form({ id: ID, amount: '20' })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:withdraw_from_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 2000 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Pronto. O valor voltou para o seu mês.')
  })

  test('tirar mais do que tem mostra quanto a meta tem, com o valor digitado no campo (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_from_goal: { error: { message: 'Valor maior que o guardado.' } }, goal_balance: { data: 18000 } } })
    const state = await actions.withdrawFromGoal({ status: 'idle' }, form({ id: ID, amount: '500' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: `Esta meta tem R$${NBSP}180,00. Tire até esse valor.` }, values: { amount: '500' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('spendFromGoal (RN-15)', () => {
  const CAT = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'

  test('sem sobra: anota e volta para a meta', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { data: [{ tx_id: TX, funded_cents: 300000, leftover_cents: 0 }] } } })
    expect(await redirectOf(actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '3.400', categoryId: CAT })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:use_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 340000, p_category_id: CAT } }])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('com sobra: vai para a pergunta da sobra, sem aviso (RN-15b)', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { data: [{ tx_id: TX, funded_cents: 230000, leftover_cents: 18000 }] } } })
    expect(await redirectOf(actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '2.300', categoryId: CAT })))).toBe(`/metas/${ID}/sobra`)
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(h.refresh).toHaveBeenCalled()
  })

  test('sem categoria ou categoria de outra pessoa: mensagem da copy no campo', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: '' }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' } })
    h.supabase = fakeSupabase({ rpc: { use_goal: { error: { message: 'Categoria não encontrada.' } } } })
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: CAT }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' }, values: { amount: '10' } })
  })

  test('meta já usada (segunda aba): não grava de novo (Review Focus 1)', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { error: { message: 'Meta não encontrada.' } } } })
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: CAT }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
  })
})

describe('returnLeftover (RN-15b "Devolver")', () => {
  test('tira a sobra inteira e vai para o Seu mês', async () => {
    h.supabase = fakeSupabase({ rpc: { goal_balance: { data: 18000 }, withdraw_from_goal: { data: 0 } } })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe('/inicio')
    expect(calls.map((c) => [c.op, c.payload])).toEqual([
      ['rpc:goal_balance', { p_goal_id: ID }],
      ['rpc:withdraw_from_goal', { p_goal_id: ID, p_amount_cents: 18000 }],
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Devolvido. Seu mês já está atualizado.')
  })

  test('devolver a sobra quando ela já foi devolvida (outra aba) não grava nada (Review Focus 1)', async () => {
    h.supabase = fakeSupabase({ rpc: { goal_balance: { data: 0 } } })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe(`/metas/${ID}`)
    expect(calls.map((c) => c.op)).toEqual(['rpc:goal_balance'])
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteGoalUse (decisão 66)', () => {
  test('exclui o gasto pago com a meta e volta para a meta', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_goal_use: { data: ID } } })
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: TX, goalId: ID })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:delete_goal_use', filters: {}, payload: { p_transaction_id: TX } }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('falha volta com aviso; ids inválidos vão para Metas sem chamar o banco', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_goal_use: { error: { message: 'Gasto não encontrado.' } } } })
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: TX, goalId: ID })))).toBe(`/metas/${ID}?erro=1`)
    calls.length = 0
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: 'x', goalId: ID })))).toBe('/metas')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas/movement-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./movement-actions"`.

- [ ] **Step 3: Implementação** — seguir Interfaces. `use_goal` devolve uma lista de uma linha: `const row = (data as { leftover_cents: number | string }[] | null)?.[0]`; sobra = `Number(row?.leftover_cents ?? 0)`. Erros do banco são reconhecidos por `error.message.includes(...)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/movement-actions.ts src/features/metas/movement-actions.test.ts
git commit -m "feat(metas): guardar, tirar, usar o dinheiro, devolver a sobra e desfazer um uso" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Telas de metas — lista, formulário da meta e tela da meta

**Files:**
- Create: `src/features/metas/metas-list.tsx`, `src/features/metas/goal-form.tsx`, `src/features/metas/goal-detail.tsx`
- Test: `src/features/metas/metas-list.test.tsx`, `src/features/metas/goal-form.test.tsx`, `src/features/metas/goal-detail.test.tsx`

**Interfaces:**
- Consumes: `MetasView`, `GoalDetailView`, `GoalHistoryItem` (Task 4); `GoalRow` (Task 3); `deleteGoalUse` (Task 7); `ProgressBar` (Task 5); `centsToInput` (`@/features/registro/form-values`); `Button`, `FormAlert`, `Money`, `ConfirmAction`; `idle`/`FormState`; `formatBRL`.
- Produces:
  - `MetasList({ view }: { view: MetasView })` — vazio: cartão tracejado com "Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?" e `Button href="/metas/nova"` "Criar meta" (copy, protótipo Estados). Com metas: faixa `bg-sunken rounded-card` "Guardado em metas" + `Money` (600, `text-ink`); se há ativas, `h2` "Só suas" (14 px, 600, `text-inactive`) e, para cada uma, um `Link href="/metas/{id}"` em cartão branco com nome (16 px, 600), `{percent}%` (14 px, 600, `text-brand-text`), `ProgressBar label="Progresso de {nome}"`, `shortRemaining` à esquerda e `deadlineShort` à direita (14 px, `text-muted`); se há concluídas, `section` tracejada com `h2` "Concluídas" e um link por meta (`/metas/{id}`, texto = `caption`, `min-h-11`). Visual do protótipo Metas.
  - `GoalForm({ action, goal, minMonth }: { action: (s: FormState, fd: FormData) => Promise<FormState>; goal?: GoalRow; minMonth: MonthKey })` — `'use client'`; campos "Para o que você quer guardar?" (`name`, `maxLength 40`, `autoComplete="off"`), "Quanto você precisa?" (`target`, `inputMode="decimal"`, número grande como o `SettleForm`), "Até quando? (opcional)" (`deadline`, `type="month"`, `min={minMonth}`, `max="2099-12"`); botão "Criar meta" (sem `goal`) ou "Salvar alterações" (com `goal`, e `input hidden id`). Valores iniciais: `err.values` → `goal` (`centsToInput(targetCents)`, `deadline ?? ''`) → vazios. Erros sob o campo (`aria-invalid`, `aria-describedby`); `err.message` em `FormAlert`; `<form key={err ? err.submission : 'idle'}>`.
  - `GoalHero({ view }: { view: GoalDetailView })` — `section data-testid="meta-resumo"` `rounded-hero border-brand-wash-border bg-brand-wash p-5`: "Guardado" (15 px, `text-brand-text`), guardado (`Money`, 40 px, 700, `text-brand-ink`) e "de {formatBRL(valor)}" (15 px); `ProgressBar size="lg" label="Progresso de {nome}"`; depois, conforme `state`: `active` → `remainingText` (16 px, `text-brand-ink`) e, se houver `suggestion`, a caixa branca "Para chegar até {untilLabel}, guarde cerca de **{perMonth}**."; `complete` → cartão `bg-brand` com ícone `Target` e `celebration` (20 px, 700) + link escuro (`bg-brand-ink text-white`, `min-h-11`) "Usar o dinheiro da meta" para `/metas/{id}/usar` (protótipo Estados "Meta concluída"); `used` → `usedText`.
  - `GoalActions({ view }: { view: GoalDetailView })` — `canDeposit` → `Button href="/metas/{id}/guardar"` "Guardar dinheiro" (52 px, ícone `Plus`); grade de 2 com `canWithdraw` → `Button variant="secondary" href="/metas/{id}/tirar"` "Tirar dinheiro" e `canUse` → `Button variant="secondary" href="/metas/{id}/usar"` "Usar o dinheiro"; nada quando nenhum vale.
  - `GoalHistory({ goalId, items }: { goalId: string; items: GoalHistoryItem[] })` — nada quando vazio; senão `section aria-labelledby` com `h2` "Histórico" e `ul`: cada `li` com rótulo (15 px, `text-ink`), data (13 px, `text-muted`) e `amountText` (600; `text-brand-text` quando `positive`, senão `text-ink`). Em "Usou", `ConfirmAction` com gatilho "Excluir" (`triggerAriaLabel="Excluir o gasto de {dateLabel}"`), título "Excluir este gasto?", corpo "Seu mês será recalculado. O valor volta para a meta.", "Excluir" · "Cancelar", `action={deleteGoalUse}`, `fields={{ transactionId, goalId }}`.

- [ ] **Step 1: Testes que falham**

`src/features/metas/metas-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { GoalSummary, MetasView } from './view-model'
import { MetasList } from './metas-list'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const summary = (p: Partial<GoalSummary> & { id: string; name: string }): GoalSummary => ({
  goal: { id: p.id, name: p.name, targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
  balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false, remainingText: null,
  shortRemaining: `Faltam R$${NBSP}1.520,00`, deadlineShort: 'até mar. 2027', suggestion: null, ...p,
})

test('lista do protótipo: guardado em metas, "Só suas" e "Concluídas"', () => {
  const view: MetasView = {
    totalCents: 428000, empty: false,
    active: [summary({ id: 'g1', name: 'Viagem para Salvador' })],
    concluded: [{ id: 'g3', name: 'Computador novo', caption: 'Computador novo · usada em julho' }],
  }
  render(<MetasList view={view} />)
  expect(screen.getByText('Guardado em metas').parentElement?.textContent).toContain(`R$${NBSP}4.280,00`)
  expect(screen.getByRole('heading', { name: 'Só suas' })).toBeTruthy()
  const link = screen.getByRole('link', { name: /^Viagem para Salvador/ })
  expect(link.getAttribute('href')).toBe('/metas/g1')
  expect(link.textContent).toContain('62%')
  expect(link.textContent).toContain(`Faltam R$${NBSP}1.520,00`)
  expect(link.textContent).toContain('até mar. 2027')
  expect(within(link).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' })).toBeTruthy()
  const done = screen.getByRole('region', { name: 'Concluídas' })
  expect(within(done).getByRole('link', { name: 'Computador novo · usada em julho' }).getAttribute('href')).toBe('/metas/g3')
})

test('sem metas: convite da copy para criar a primeira', () => {
  render(<MetasList view={{ totalCents: 0, empty: true, active: [], concluded: [] }} />)
  expect(screen.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Criar meta' }).getAttribute('href')).toBe('/metas/nova')
  expect(screen.queryByText('Guardado em metas')).toBeNull()
})
```

`src/features/metas/goal-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { GoalForm } = await import('./goal-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Criar meta: campos da copy, prazo opcional por mês a partir de agora', () => {
  render(<GoalForm action={action} minMonth="2026-09" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).maxLength).toBe(40)
  expect((screen.getByLabelText('Quanto você precisa?') as HTMLInputElement).inputMode).toBe('decimal')
  const deadline = screen.getByLabelText('Até quando? (opcional)') as HTMLInputElement
  expect(deadline.type).toBe('month')
  expect(deadline.min).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Criar meta' })).toBeTruthy()
})

test('editar: vem preenchido, com o id escondido e "Salvar alterações"', () => {
  render(
    <GoalForm
      action={action}
      minMonth="2000-01"
      goal={{ id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' }}
    />,
  )
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).value).toBe('Viagem para Salvador')
  expect((screen.getByLabelText('Quanto você precisa?') as HTMLInputElement).value).toBe('4.000,00')
  expect((screen.getByLabelText('Até quando? (opcional)') as HTMLInputElement).value).toBe('2027-03')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('g1')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erro no campo aparece e o que foi digitado fica', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { deadline: 'Escolha um mês a partir de agora.' }, values: { name: 'Viagem', target: '4000', deadline: '2026-01' } },
    vi.fn(),
    false,
  ])
  render(<GoalForm action={action} minMonth="2026-09" />)
  expect(screen.getByText('Escolha um mês a partir de agora.')).toBeTruthy()
  expect((screen.getByLabelText('Para o que você quer guardar?') as HTMLInputElement).value).toBe('Viagem')
  expect(screen.getByLabelText('Até quando? (opcional)').getAttribute('aria-invalid')).toBe('true')
})
```

`src/features/metas/goal-detail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./movement-actions', () => ({ deleteGoalUse: vi.fn() }))
const { GoalActions, GoalHero, GoalHistory } = await import('./goal-detail')
import type { GoalDetailView } from './view-model'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const base: GoalDetailView = {
  summary: {
    goal: { id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
    balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false,
    remainingText: `Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`, shortRemaining: '', deadlineShort: 'até mar. 2027',
    suggestion: { untilLabel: 'março de 2027', perMonth: `R$${NBSP}254 por mês` },
  },
  state: 'active', celebration: null, usedText: null, balanceText: '', canDeposit: true, canWithdraw: true, canUse: true, history: [],
}

test('meta ativa: guardado, quanto falta e quanto guardar por mês (protótipo)', () => {
  render(<GoalHero view={base} />)
  const hero = screen.getByTestId('meta-resumo')
  expect(hero.textContent).toContain(`R$${NBSP}2.480,00`)
  expect(hero.textContent).toContain(`de R$${NBSP}4.000,00`)
  expect(hero.textContent).toContain(`Faltam R$${NBSP}1.520,00 para Viagem para Salvador.`)
  expect(hero.textContent).toContain(`Para chegar até março de 2027, guarde cerca de R$${NBSP}254 por mês.`)
  expect(within(hero).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' }).getAttribute('aria-valuenow')).toBe('62')
})

test('meta completa: comemoração e "Usar o dinheiro da meta" (RF-30)', () => {
  render(<GoalHero view={{ ...base, state: 'complete', celebration: 'Você chegou lá. Viagem para Salvador está completa.' }} />)
  expect(screen.getByText('Você chegou lá. Viagem para Salvador está completa.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Usar o dinheiro da meta' }).getAttribute('href')).toBe('/metas/g1/usar')
  expect(screen.queryByText(/Para chegar até/)).toBeNull()
})

test('ações: guardar, tirar e usar só quando valem', () => {
  render(<GoalActions view={base} />)
  expect(screen.getByRole('link', { name: 'Guardar dinheiro' }).getAttribute('href')).toBe('/metas/g1/guardar')
  expect(screen.getByRole('link', { name: 'Tirar dinheiro' }).getAttribute('href')).toBe('/metas/g1/tirar')
  expect(screen.getByRole('link', { name: 'Usar o dinheiro' }).getAttribute('href')).toBe('/metas/g1/usar')
  cleanup()
  render(<GoalActions view={{ ...base, state: 'used', canDeposit: false, canUse: false }} />)
  expect(screen.queryByRole('link', { name: 'Guardar dinheiro' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Usar o dinheiro' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Tirar dinheiro' })).toBeTruthy()
})

test('histórico: guardou, tirou e usou; o uso pode ser excluído com confirmação', () => {
  render(
    <GoalHistory
      goalId="g1"
      items={[
        { id: 'm3', label: 'Usou', dateLabel: '28 de setembro', amountText: `− R$${NBSP}2.300,00`, positive: false, transactionId: 't1' },
        { id: 'm1', label: 'Guardou', dateLabel: '19 de setembro', amountText: `+ R$${NBSP}300,00`, positive: true, transactionId: null },
      ]}
    />,
  )
  const history = screen.getByRole('region', { name: 'Histórico' })
  expect(within(history).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    expect.stringContaining('Usou'), expect.stringContaining('Guardou'),
  ])
  expect(within(history).getAllByRole('button')).toHaveLength(1)
  fireEvent.click(within(history).getByRole('button', { name: 'Excluir o gasto de 28 de setembro' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  expect(dialog.textContent).toContain('Seu mês será recalculado. O valor volta para a meta.')
  expect((dialog.querySelector('input[name="transactionId"]') as HTMLInputElement).value).toBe('t1')
  expect((dialog.querySelector('input[name="goalId"]') as HTMLInputElement).value).toBe('g1')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas`
Expected: FAIL — `Failed to resolve import "./metas-list"` / `"./goal-form"` / `"./goal-detail"`.

- [ ] **Step 3: Implementação** — seguir Interfaces e o visual do protótipo (Metas; Meta — Viagem para Salvador; Estados).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/metas-list.tsx src/features/metas/metas-list.test.tsx src/features/metas/goal-form.tsx src/features/metas/goal-form.test.tsx src/features/metas/goal-detail.tsx src/features/metas/goal-detail.test.tsx
git commit -m "feat(metas): lista de metas, formulário da meta e tela da meta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Painéis — guardar, tirar, usar o dinheiro e a sobra

**Files:**
- Create: `src/features/metas/move-form.tsx`, `src/features/metas/use-form.tsx`, `src/features/metas/leftover-prompt.tsx`
- Test: `src/features/metas/move-form.test.tsx`, `src/features/metas/use-form.test.tsx`, `src/features/metas/leftover-prompt.test.tsx`

**Interfaces:**
- Consumes: `depositToGoal`, `withdrawFromGoal`, `spendFromGoal`, `returnLeftover` (Task 7); `Category` (`@/features/registro/queries`); `parseBRL`, `formatBRL`; `Button`, `FormAlert`; `idle`.
- Produces:
  - `MoveForm({ goalId, mode }: { goalId: string; mode: 'deposit' | 'withdraw' })` — `'use client'`; `useActionState(mode === 'deposit' ? depositToGoal : withdrawFromGoal, idle)`; `input hidden id`; campo `amount` (`inputMode="decimal"`, `autoComplete="off"`, `placeholder="R$ 0,00"`, número grande como o `SettleForm`) com rótulo "Quanto você quer guardar?" / "Quanto você quer tirar?"; texto (14 px, `text-muted`) "Esse valor sai do seu Disponível deste mês." / "Esse valor volta para o seu Disponível deste mês."; botão (52 px, desativado enquanto envia) "Guardar dinheiro" / "Tirar dinheiro". Erro sob o campo; `err.message` em `FormAlert`; mantém o que foi digitado.
  - `UseGoalForm({ goalId, balanceCents, categories }: { goalId: string; balanceCents: number; categories: Category[] })` — `'use client'`; `useActionState(spendFromGoal, idle)`; `input hidden id`; "Quanto foi o gasto?" (`amount`, mesmo estilo); `fieldset` com `legend` "Com o quê?" e um rádio `categoryId` por categoria no mesmo formato de chip das categorias de `anotar-form.tsx` (rótulo com o rádio `sr-only`, 44 px, marcado = `border-selected bg-brand-wash`); texto do protótipo "Esse gasto não sai do seu Disponível de novo: o dinheiro já tinha saído quando foi guardado."; quando `parseBRL(valor digitado) > balanceCents`, aparece (em `aria-live="polite"`) "A diferença de {formatBRL(valor − guardado)} sai do seu Disponível deste mês." (RN-15a); botão "Usar o dinheiro da meta". Erros sob os campos; mantém o que foi digitado.
  - `LeftoverPrompt({ goalId, leftoverCents }: { goalId: string; leftoverCents: number })` — `'use client'`; `section role="dialog" aria-labelledby` (título): linha "Anotado. Seu mês já está atualizado." (14 px, 500, `text-brand-text`), título `h2` "Sobraram {formatBRL(sobra)} na meta. Quer devolver para o seu mês?" (20 px, 600); `Button href="/metas"` "Deixar guardado" (primário, o padrão — RN-15b) e `form action={returnLeftover}` com `input hidden id` e `Button variant="secondary" type="submit"` "Devolver" (desativado enquanto envia, via `useFormStatus`). Visual do protótipo "Sobra da meta".

- [ ] **Step 1: Testes que falham**

`src/features/metas/move-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const acts = vi.hoisted(() => ({ depositToGoal: vi.fn(), withdrawFromGoal: vi.fn() }))
vi.mock('./movement-actions', () => acts)
const { MoveForm } = await import('./move-form')

const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('guardar: valor, aviso de que sai do Disponível e "Guardar dinheiro"', () => {
  render(<MoveForm goalId="g1" mode="deposit" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.depositToGoal)
  expect((screen.getByLabelText('Quanto você quer guardar?') as HTMLInputElement).inputMode).toBe('decimal')
  expect(screen.getByText('Esse valor sai do seu Disponível deste mês.')).toBeTruthy()
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('g1')
  expect(screen.getByRole('button', { name: 'Guardar dinheiro' })).toBeTruthy()
})

test('tirar: erro de valor maior que o guardado fica no campo, com o valor digitado (Review Focus 4)', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { amount: 'Esta meta tem R$ 180,00. Tire até esse valor.' }, values: { amount: '500' } },
    vi.fn(),
    false,
  ])
  render(<MoveForm goalId="g1" mode="withdraw" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.withdrawFromGoal)
  const input = screen.getByLabelText('Quanto você quer tirar?') as HTMLInputElement
  expect(input.value).toBe('500')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByText('Esta meta tem R$ 180,00. Tire até esse valor.')).toBeTruthy()
  expect(screen.getByText('Esse valor volta para o seu Disponível deste mês.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Tirar dinheiro' })).toBeTruthy()
})
```

`src/features/metas/use-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./movement-actions', () => ({ spendFromGoal: vi.fn() }))
const { UseGoalForm } = await import('./use-form')

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const categories = [
  { id: 'c1', name: 'Lazer', defaultKey: 'lazer' },
  { id: 'c2', name: 'Transporte', defaultKey: 'transporte' },
  { id: 'c3', name: 'Outros', defaultKey: 'outros' },
]

test('protótipo: valor, "Com o quê?", aviso e botão', () => {
  render(<UseGoalForm goalId="g1" balanceCents={248000} categories={categories} />)
  expect(screen.getByLabelText('Quanto foi o gasto?')).toBeTruthy()
  const group = screen.getByRole('group', { name: 'Com o quê?' })
  expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['c1', 'c2', 'c3'])
  expect(screen.getByText('Esse gasto não sai do seu Disponível de novo: o dinheiro já tinha saído quando foi guardado.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Usar o dinheiro da meta' })).toBeTruthy()
})

test('gasto maior que o guardado avisa quanto sai do mês (RN-15a); menor não avisa', () => {
  render(<UseGoalForm goalId="g1" balanceCents={248000} categories={categories} />)
  const amount = screen.getByLabelText('Quanto foi o gasto?')
  fireEvent.change(amount, { target: { value: '3.000' } })
  expect(screen.getByText(`A diferença de R$${NBSP}520,00 sai do seu Disponível deste mês.`)).toBeTruthy()
  fireEvent.change(amount, { target: { value: '2.300' } })
  expect(screen.queryByText(/A diferença de/)).toBeNull()
})
```

`src/features/metas/leftover-prompt.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const acts = vi.hoisted(() => ({ returnLeftover: vi.fn() }))
vi.mock('./movement-actions', () => acts)
const { LeftoverPrompt } = await import('./leftover-prompt')

afterEach(() => cleanup())

test('sobra: pergunta da RN-15b; "Deixar guardado" é o padrão, "Devolver" envia', () => {
  render(<LeftoverPrompt goalId="g1" leftoverCents={18000} />)
  const NBSP = String.fromCharCode(0xa0)
  const dialog = screen.getByRole('dialog', { name: `Sobraram R$${NBSP}180,00 na meta. Quer devolver para o seu mês?` })
  expect(dialog.textContent).toContain('Anotado. Seu mês já está atualizado.')
  expect(within(dialog).getByRole('link', { name: 'Deixar guardado' }).getAttribute('href')).toBe('/metas')
  const devolver = within(dialog).getByRole('button', { name: 'Devolver' })
  expect(devolver.getAttribute('type')).toBe('submit')
  expect((devolver.closest('form')!.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('g1')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/metas`
Expected: FAIL — `Failed to resolve import "./move-form"` / `"./use-form"` / `"./leftover-prompt"`.

- [ ] **Step 3: Implementação** — seguir Interfaces. Em `UseGoalForm`, o valor digitado fica em `useState` (inicial: `err?.values.amount ?? ''`) só para o aviso da diferença; o campo continua com `name="amount"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/metas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/metas/move-form.tsx src/features/metas/move-form.test.tsx src/features/metas/use-form.tsx src/features/metas/use-form.test.tsx src/features/metas/leftover-prompt.tsx src/features/metas/leftover-prompt.test.tsx
git commit -m "feat(metas): painéis de guardar, tirar, usar o dinheiro e a sobra" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Páginas de Metas e navegação

**Files:**
- Create: `src/app/(app)/metas/page.tsx`, `src/app/(app)/metas/nova/page.tsx`, `src/app/(app)/metas/[id]/page.tsx`, `src/app/(app)/metas/[id]/editar/page.tsx`, `src/app/(app)/metas/[id]/guardar/page.tsx`, `src/app/(app)/metas/[id]/tirar/page.tsx`, `src/app/(app)/metas/[id]/usar/page.tsx`, `src/app/(app)/metas/[id]/sobra/page.tsx`
- Modify: `src/features/shell/nav-items.ts`, `src/app/(app)/mais/page.tsx` (só o comentário)
- Test: `src/features/shell/nav-items.test.ts`, `src/features/shell/nav.test.tsx`, `src/features/shell/sidebar.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `loadGoals`, `loadGoal`, `loadGoalMovements` (Task 3); `buildMetas`, `buildGoalDetail`, `goalBalance` (Tasks 1, 4); `MetasList`, `GoalForm`, `GoalHero`, `GoalActions`, `GoalHistory` (Task 8); `MoveForm`, `UseGoalForm`, `LeftoverPrompt` (Task 9); `createGoal`, `updateGoal`, `deleteGoal` (Task 6); `loadCategories`; `SheetClose`; `PageHeader`, `Button`, `ConfirmAction`, `FormAlert`; `todayInSaoPaulo`, `monthOf`, `formatBRL`.
- Produces:
  - `nav-items.ts`: `METAS: NavItem = { href: '/metas', label: 'Metas', icon: Target, match: ['/metas'] }`; `BOTTOM_NAV_ITEMS = [SEU_MES, EXTRATO, METAS, MAIS]` (com o Anotar no meio: Seu mês · Extrato · Anotar · Metas · Mais — A5, decisão 12); `SIDEBAR_ITEMS = [SEU_MES, EXTRATO, CONTAS, METAS, CARTOES, Categorias, Configurações]` (ordem do protótipo Desktop); `isSheetRoute` também para `/^\/metas\/[^/]+\/(guardar|tirar|usar|sobra)$/`. `bottom-nav.tsx` não muda. Metas **não** entra em `/mais`.
  - `/metas` — `h1` "Suas metas" (22 px) e `Button href="/metas/nova"` "Criar meta" (ícone `Plus`, `min-h-11`) na mesma linha; `MetasList view={buildMetas({ goals, movements, today })}` com `Promise.all([loadGoals(), loadGoalMovements()])`.
  - `/metas/nova` — `PageHeader` "Criar meta" (volta a `/metas`) + `GoalForm action={createGoal} minMonth={monthOf(today)}`; largura `max-w-[560px]`.
  - `/metas/[id]` — id inválido ou `loadGoal` nulo (inexistente, excluída ou de outra pessoa) → `notFound()`; cabeçalho: Voltar (`/metas`), `h1` com o nome, link `aria-label="Mais opções"` (ícone `Ellipsis`, `size-11`) para `/metas/{id}/editar`; `?erro=1` → `FormAlert` "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; `GoalHero`, `GoalActions`, `GoalHistory`.
  - `/metas/[id]/editar` — `notFound()` como acima; `PageHeader` "Editar meta" (volta a `/metas/{id}`); `?erro=1` → mesmo `FormAlert`; `GoalForm action={updateGoal} goal={goal} minMonth="2000-01"`; `ConfirmAction` "Excluir" → título `Excluir {nome}?`, corpo "O valor guardado continua registrado no seu histórico." + (se guardado > 0) " {formatBRL(guardado)} volta para o seu Disponível deste mês.", "Excluir" · "Cancelar", `deleteGoal`, `fields={{ id }}`.
  - Painéis (mesma moldura de `contas/receber/[id]/page.tsx`: fundo `rgba(18,40,1,.32)`, `section data-sheet aria-labelledby`, `SheetClose href="/metas/{id}"`): `/guardar` — só meta `active` (senão `redirect('/metas/{id}')`); `h1` "Guardar dinheiro nesta meta", nome da meta abaixo (14 px, `text-muted`), `MoveForm mode="deposit"`. `/tirar` — só com guardado > 0; `h1` "Tirar dinheiro", caixa `bg-brand-wash` com `balanceText`, `MoveForm mode="withdraw"`. `/usar` — só se `canUse`; `h1` "Usar o dinheiro da meta", caixa com `balanceText`, `UseGoalForm` com `loadCategories()`. `/sobra` — só meta `used` com guardado > 0; `LeftoverPrompt` centralizado sobre o fundo escuro (protótipo), sem `SheetClose`.

- [ ] **Step 1: Testes que falham**

Em `nav-items.test.ts`: nos testes "Contas…" e "Cartões…", `BOTTOM_NAV_ITEMS` passa a ser `['/inicio', '/extrato', '/metas', '/mais']` e `SIDEBAR_ITEMS` `['/inicio', '/extrato', '/contas', '/metas', '/cartoes', '/categorias', '/configuracoes']`; acrescentar:

```ts
test('Metas: barra inferior entre Anotar e Mais; menu lateral depois de Contas; guardar, tirar, usar e sobra são painéis', () => {
  const metas = BOTTOM_NAV_ITEMS.find((i) => i.href === '/metas')!
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
  expect(isActive(`/metas/${ID}/guardar`, metas)).toBe(true)
  expect(isActive('/metas', mais)).toBe(false)
  for (const p of ['guardar', 'tirar', 'usar', 'sobra']) expect(isSheetRoute(`/metas/${ID}/${p}`)).toBe(true)
  for (const p of ['/metas', '/metas/nova', `/metas/${ID}`, `/metas/${ID}/editar`, `/metas/${ID}/guardar/x`]) expect(isSheetRoute(p)).toBe(false)
})
```

Em `nav.test.tsx`: o primeiro teste passa a se chamar `'barra inferior: Seu mês, Extrato, Anotar, Metas e Mais, nesta ordem'` e espera `['Seu mês', 'Extrato', 'Anotar', 'Metas', 'Mais']`; o teste dos painéis acrescenta `'/metas/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/usar'` à lista de rotas sem barra.
Em `sidebar.test.tsx`: `['Seu mês', 'Extrato', 'Contas', 'Metas', 'Cartões', 'Categorias', 'Configurações']`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — barra e menu sem "Metas"; `isSheetRoute('/metas/…/usar')` é `false`.

- [ ] **Step 3: Implementação** — seguir Interfaces. `/metas/[id]/page.tsx`:

```tsx
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function MetaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await loadGoal(id)
  if (!data) notFound()
  const view = buildGoalDetail({ ...data, today: todayInSaoPaulo() })
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-3.5 px-4 pt-4 md:px-9 md:pt-7">
      <header className="flex items-center gap-2">
        <Link href="/metas" aria-label="Voltar" className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="flex-1 text-xl font-semibold tracking-tight text-ink md:text-[26px]">{data.goal.name}</h1>
        <Link href={`/metas/${id}/editar`} aria-label="Mais opções" className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken">
          <Ellipsis className="size-5" aria-hidden="true" />
        </Link>
      </header>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <GoalHero view={view} />
      <GoalActions view={view} />
      <GoalHistory goalId={id} items={view.history} />
    </main>
  )
}
```

Os painéis seguem `src/app/(app)/contas/receber/[id]/page.tsx`; as páginas `nova` e `editar` seguem `src/app/(app)/cartoes/novo/page.tsx` e `cartoes/[id]/page.tsx`. Em `mais/page.tsx`, o comentário passa a dizer que Metas está na barra inferior e que faltam Planejamento, Relatórios e Família.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos PASS; build com `/metas`, `/metas/nova`, `/metas/[id]`, `/metas/[id]/editar`, `/metas/[id]/guardar`, `/metas/[id]/tirar`, `/metas/[id]/usar`, `/metas/[id]/sobra`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/metas" "src/app/(app)/mais/page.tsx" src/features/shell
git commit -m "feat(metas): telas de metas, painéis e Metas na barra inferior e no menu lateral" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Extrato — guardar e tirar na lista, "pago com a meta", gasto de meta protegido

**Files:**
- Modify: `src/features/extrato/view-model.ts`, `src/features/extrato/extrato-list.tsx`, `src/app/(app)/extrato/page.tsx`, `src/app/(app)/extrato/[id]/page.tsx`, `src/features/registro/actions.ts`
- Test: `src/features/extrato/view-model.test.ts` (acrescentar; o ajudante `build` passa `goals: [], movements: []`), `src/features/extrato/extrato-list.test.tsx` (acrescentar), `src/features/registro/actions.test.ts` (acrescentar; filtros esperados ganham `goal_id: null`)

**Interfaces:**
- Consumes: `GoalRow`, `GoalMovementRow`, `loadGoals` (Task 3); `loadLedger().goalMovements`; `TxRow.goalId` (Task 3).
- Produces:
  - `ExtratoRow.kind: 'income' | 'expense' | 'goal'`.
  - `buildExtrato` recebe também `goals: GoalRow[]` e `movements: GoalMovementRow[]`. Movimentos `deposit`, `withdraw` e `return_on_exit` do mês (por `occurredOn`) viram linhas `kind 'goal'`: `title` "Guardado na meta" (`deposit`) ou "Tirado da meta" (os outros), `subtitle` = nome da meta, `cents` = valor, `badge: null`, `href` = `/metas/{goalId}` (meta excluída → `/metas`). Só aparecem sem filtro de tipo, categoria e cartão; a busca procura no título e no nome da meta. Movimentos `use` não viram linha (o gasto já aparece). Ordem junto com os registros: data desc, `createdAt` desc, `id`. `empty = 'no-records'` só quando não há registro **nem** movimento no mês.
  - Gasto com `goalId`: `badge` = `'pago com a meta {nome}'` (RN-01a), `href` = `/metas/{goalId}` (meta excluída → `/metas`); valor inteiro.
  - `ExtratoList`: linha `goal` com ícone `Target` em `bg-brand-wash text-brand-text-hover`, valor **sem sinal** em `font-semibold text-brand-text` (protótipo Extrato "Guardado na meta").
  - `extrato/page.tsx`: `const [{ categories, transactions, goalMovements }, cards, goals] = await Promise.all([loadLedger(), loadCards(), loadGoals()])` e passa `goals`, `movements: goalMovements`.
  - `extrato/[id]/page.tsx`: `if (tx.goalId) redirect(\`/metas/${tx.goalId}\`)` logo depois do redirecionamento da parcela.
  - `registro/actions.ts`: os dois `update` de `updateTransaction` e o `delete` de `deleteTransaction` ganham `.is('goal_id', null)` (além de todos os filtros existentes, que ficam).

- [ ] **Step 1: Testes que falham**

Em `src/features/extrato/view-model.test.ts` (acrescentar):

```ts
import type { GoalMovementRow, GoalRow } from '@/features/metas/types'

describe('metas no Extrato (protótipo, RN-01a)', () => {
  const goals: GoalRow[] = [
    { id: 'g1', name: 'Viagem para Salvador', targetCents: 400000, deadline: null, status: 'used', usedOn: '2026-09-21', deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
    { id: 'g2', name: 'Reserva', targetCents: 100000, deadline: null, status: 'active', usedOn: null, deletedOn: '2026-09-20', createdAt: '2026-07-01T12:00:00Z' },
  ]
  const mv = (p: Pick<GoalMovementRow, 'id' | 'goalId' | 'kind' | 'amountCents' | 'occurredOn'> & Partial<GoalMovementRow>): GoalMovementRow => ({
    transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
  })
  const movements = [
    mv({ id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
    mv({ id: 'm2', goalId: 'g2', kind: 'withdraw', amountCents: 5000, occurredOn: '2026-09-20' }),
    mv({ id: 'm3', goalId: 'g1', kind: 'use', amountCents: 20000, occurredOn: '2026-09-21', transactionId: 'tg' }),
    mv({ id: 'm4', goalId: 'g1', kind: 'deposit', amountCents: 100, occurredOn: '2026-08-31' }),
  ]
  const withGoal = [row({ id: 'tg', kind: 'expense', amountCents: 23000, occurredOn: '2026-09-21', categoryId: MERCADO, goalId: 'g1', goalFundedCents: 20000 })]
  const buildGoals = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions: withGoal, cards: [], goals, movements })

  test('guardar e tirar aparecem; o gasto pago com meta leva a etiqueta e abre a meta', () => {
    const rows = buildGoals(f()).groups.flatMap((g) => g.rows)
    expect(rows.map((r) => [r.kind, r.title, r.subtitle, r.cents, r.href, r.badge])).toEqual([
      ['expense', 'Mercado', null, 23000, '/metas/g1', 'pago com a meta Viagem para Salvador'],
      ['goal', 'Tirado da meta', 'Reserva', 5000, '/metas', null],
      ['goal', 'Guardado na meta', 'Viagem para Salvador', 30000, '/metas/g1', null],
    ])
  })

  test('com filtro de tipo, categoria ou cartão, os movimentos saem; a busca acha pelo nome da meta', () => {
    for (const filters of [f({ kind: 'expense' }), f({ kind: 'income' }), f({ categoryId: MERCADO, kind: 'expense' })]) {
      expect(buildGoals(filters).groups.flatMap((g) => g.rows).some((r) => r.kind === 'goal')).toBe(false)
    }
    expect(buildGoals(f({ q: 'reserva' })).groups.flatMap((g) => g.rows.map((r) => r.title))).toEqual(['Tirado da meta'])
  })

  test('mês só com movimentos de meta não é "nenhum registro"', () => {
    const v = buildExtrato({ filters: f(), today, categories, transactions: [], cards: [], goals, movements })
    expect(v.empty).toBeNull()
  })
})
```

Em `src/features/extrato/extrato-list.test.tsx` (acrescentar; usar o mesmo formato de `view` dos testes que já existem):

```tsx
test('linha de meta: ícone de meta, nome da meta e valor sem sinal', () => {
  const NBSP = String.fromCharCode(0xa0)
  render(
    <ExtratoList
      view={{
        filters: { month: '2026-09', kind: null, categoryId: null, cardId: null, q: '' }, monthLabel: 'setembro de 2026', empty: null,
        categoryName: null, cardName: null,
        groups: [{ date: '2026-09-19', label: '19 de setembro', rows: [{ id: 'm1', kind: 'goal', title: 'Guardado na meta', subtitle: 'Viagem para Salvador', cents: 30000, href: '/metas/g1', badge: null }] }],
      }}
    />,
  )
  const link = screen.getByRole('link', { name: /^Guardado na meta/ })
  expect(link.getAttribute('href')).toBe('/metas/g1')
  expect(link.textContent).toContain('Viagem para Salvador')
  expect(link.textContent).toContain(`R$${NBSP}300,00`)
  expect(link.textContent).not.toMatch(/[+−]/)
})
```

Em `src/features/registro/actions.test.ts`: o `fakeSupabase` ganha `goalFunded?: boolean`, que simula `.is('goal_id', null)` do banco (em `update` e `delete`, `if (s.goalFunded && filters.goal_id === null) return { data: [], error: null }`); todo filtro esperado `{ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null }` passa a incluir `goal_id: null`; acrescentar:

```ts
describe('gasto pago com meta não é editado nem excluído pelo Extrato (Review Focus 5, decisão 66)', () => {
  test('editar não grava', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', goalFunded: true })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '1', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls[0].filters).toMatchObject({ id: ID, user_id: 'u1', status: 'confirmed', installment_plan_id: null, goal_id: null })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('excluir não apaga', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', goalFunded: true, deleted: [{ occurred_on: '2026-09-28' }] })
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(calls[0].filters).toMatchObject({ goal_id: null })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/extrato src/features/registro/actions.test.ts`
Expected: FAIL — sem linhas de meta; filtros sem `goal_id`.

- [ ] **Step 3: Implementação** — seguir Interfaces. Em `buildExtrato`, montar as linhas de meta à parte e ordená-las junto com as dos registros por uma chave `{ date, createdAt, id }`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/extrato src/features/registro/actions.ts src/features/registro/actions.test.ts "src/app/(app)/extrato/page.tsx" "src/app/(app)/extrato/[id]/page.tsx"
git commit -m "feat(extrato): guardar e tirar na lista, pago com a meta e gasto de meta protegido" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Ponta a ponta, verificação completa e registro

**Files:**
- Create: `tests/e2e/plano5.spec.ts`
- Modify: `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo acima; `todayInSaoPaulo`, `addMonths`, `monthOf` (`src/domain/dates`), `monthName`, `dueDateIn` (`src/domain/recurrence`).
- Produces: 3 testes (celular: 2; desktop: 1) → 6 entradas em `npx playwright test --list` para este arquivo. Limpeza por worker com prefixo único (padrão de `tests/e2e/plano4.spec.ts`); nomes de papel exatos.

- [ ] **Step 1: Escrever os testes de ponta a ponta** — `tests/e2e/plano5.spec.ts`:

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
const RUN_PREFIX = `e2e-p5-w${WORKER}-${RUN_ID}-`
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

// Meta com um guardar no mês passado (o gatilho do banco confere o guardado).
async function seedGoal(userId: string, name: string, targetCents: number, depositCents: number): Promise<string> {
  const { data, error } = await admin.from('goals').insert({ user_id: userId, name, target_cents: targetCents }).select('id').single()
  if (error) throw error
  const { error: e2 } = await admin.from('goal_movements').insert({
    user_id: userId, goal_id: data.id, kind: 'deposit', amount_cents: depositCents, occurred_on: dueDateIn(previous, 10),
  })
  if (e2) throw e2
  return data.id
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

// Rádios escondidos (chips): clica no rótulo que contém o rádio com esse nome exato.
async function pick(page: Page, name: string): Promise<void> {
  await page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click()
}

// Linha do resumo do Seu mês (rótulo + valor).
const line = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

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

test('meta: criar, guardar, tirar e ver no Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Suas metas' })).toBeVisible()
  await expect(page.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeVisible()
  await page.getByRole('link', { name: 'Criar meta', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Criar meta' })).toBeVisible()
  await page.getByLabel('Para o que você quer guardar?').fill('Viagem para Salvador')
  await page.getByLabel('Quanto você precisa?').fill('4000')
  await page.getByLabel('Até quando? (opcional)').fill(addMonths(current, 6))
  await page.getByRole('button', { name: 'Criar meta', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Meta criada. O primeiro passo já foi dado.')
  await expect(page.getByRole('heading', { level: 1, name: 'Viagem para Salvador' })).toBeVisible()
  const resumo = page.getByTestId('meta-resumo')
  await expect(resumo).toContainText(`Faltam ${brl('4.000,00')} para Viagem para Salvador.`)
  await expect(resumo).toContainText(`guarde cerca de ${brl('667')} por mês`)

  await page.getByRole('link', { name: 'Guardar dinheiro', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Guardar dinheiro nesta meta' })).toBeVisible()
  await page.getByLabel('Quanto você quer guardar?').fill('2000')
  await page.getByRole('button', { name: 'Guardar dinheiro', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Metade do caminho até Viagem para Salvador.')
  await expect(page.getByRole('region', { name: 'Histórico' })).toContainText(`+ ${brl('2.000,00')}`)

  // Tirar mais do que tem: mensagem calma, valor digitado continua (Review Focus 4).
  await page.getByRole('link', { name: 'Tirar dinheiro', exact: true }).click()
  await page.getByLabel('Quanto você quer tirar?').fill('5000')
  await page.getByRole('button', { name: 'Tirar dinheiro', exact: true }).click()
  await expect(page.getByText(`Esta meta tem ${brl('2.000,00')}. Tire até esse valor.`)).toBeVisible()
  await expect(page.getByLabel('Quanto você quer tirar?')).toHaveValue('5000')
  await page.getByLabel('Quanto você quer tirar?').fill('200')
  await page.getByRole('button', { name: 'Tirar dinheiro', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Pronto. O valor voltou para o seu mês.')

  await page.getByRole('link', { name: 'Seu mês', exact: true }).click()
  await expect(line(page, 'Guardado este mês')).toContainText(brl('1.800,00'))
  const destaque = page.getByRole('region', { name: 'Meta em destaque' })
  await expect(destaque).toContainText('Viagem para Salvador')
  await expect(destaque).toContainText('45%')
  await expect(destaque.getByRole('link', { name: 'Guardar dinheiro', exact: true })).toBeVisible()
})

test('usar o dinheiro: a meta paga, a sobra volta e o gasto não sai do mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await seedGoal(u.id, 'Viagem para Salvador', 400000, 248000)
  await entrar(page, u.email)

  await page.goto('/metas')
  await page.getByRole('link', { name: /^Viagem para Salvador/ }).click()
  await page.getByRole('link', { name: 'Usar o dinheiro', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Usar o dinheiro da meta' })).toBeVisible()
  await expect(page.getByText(`Você tem ${brl('2.480,00')} guardados em Viagem para Salvador.`)).toBeVisible()
  await page.getByLabel('Quanto foi o gasto?').fill('2300')
  await pick(page, 'Lazer')
  await page.getByRole('button', { name: 'Usar o dinheiro da meta', exact: true }).click()

  const sobra = page.getByRole('dialog', { name: `Sobraram ${brl('180,00')} na meta. Quer devolver para o seu mês?` })
  await expect(sobra).toContainText('Anotado. Seu mês já está atualizado.')
  await sobra.getByRole('button', { name: 'Devolver', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
  await expect(page.getByRole('status')).toContainText('Devolvido. Seu mês já está atualizado.')
  // RN-15: o gasto pago com a meta não sai do mês; a sobra devolvida volta ao Disponível (Review Focus 2).
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await expect(line(page, 'Tirado das metas')).toContainText(brl('180,00'))

  await page.goto('/extrato')
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('pago com a meta Viagem para Salvador')
  await expect(hoje).toContainText(brl('2.300,00'))
  await expect(hoje).toContainText('Tirado da meta')

  await page.goto('/metas')
  await expect(page.getByRole('region', { name: 'Concluídas' })).toContainText(`Viagem para Salvador · usada em ${monthName(Number(current.slice(5)))}`)
})

test('desktop: Metas no menu lateral, meta completa e excluir devolve o guardado', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  await seedGoal(u.id, 'Reserva', 50000, 50000)
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas', exact: true }).click()
  await expect(page).toHaveURL(/\/metas$/)
  await expect(page.getByText('Guardado em metas', { exact: true }).locator('..')).toContainText(brl('500,00'))
  await page.getByRole('link', { name: /^Reserva/ }).click()
  await expect(page.getByText('Você chegou lá. Reserva está completa.')).toBeVisible()

  await page.getByRole('link', { name: 'Mais opções', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar meta' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  const confirmar = page.getByRole('alertdialog', { name: 'Excluir Reserva?' })
  await expect(confirmar).toContainText('O valor guardado continua registrado no seu histórico.')
  await expect(confirmar).toContainText(`${brl('500,00')} volta para o seu Disponível deste mês.`)
  await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Meta excluída.')
  await expect(page.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeVisible()

  // Review Focus 3: o guardado volta hoje; o mês passado continua mostrando o que foi guardado.
  await page.goto('/inicio')
  await expect(line(page, 'Tirado das metas')).toContainText(brl('500,00'))
  await page.goto(`/inicio?mes=${previous}`)
  await expect(line(page, 'Guardado este mês')).toContainText(brl('500,00'))
})
```

- [ ] **Step 2: Conferir a lista e rodar**

Run: `npx playwright test --list tests/e2e/plano5.spec.ts`
Expected: 6 entradas (3 testes × 2 projetos; os `test.skip` de projeto são resolvidos ao rodar).

Run (com Docker): `npx supabase db reset && npm run test:db && npm run test:e2e`
Expected: PASS em todos os arquivos (`nucleo`, `plano2`, `plano3`, `plano4`, `plano5`). Sem Docker: registrar como pendente.

- [ ] **Step 3: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes unitários e de componentes passando; tipos, lint e build sem erros. Conferir textos: `grep -rniE "text-red|bg-red|!\"|despesa|superávit" src/features/metas "src/app/(app)/metas"` → sem resultados.

- [ ] **Step 4: Registrar** — em `docs/progresso.md`, acrescentar ao fim:

```markdown
## Plano 5 — Metas · concluído em {data}

**Entregue**
- Metas individuais: criar (nome, valor, prazo opcional), editar e excluir (o guardado volta ao Disponível de hoje; o histórico continua).
- Guardar e tirar (nunca mais do que a meta tem), com "Guardado este mês" / "Tirado das metas" no Seu mês e o Guardado no Saldo total.
- Usar o dinheiro da meta: gasto com categoria; a parte paga pela meta fica fora do "Saiu"; a diferença sai do mês; pergunta da sobra com "Devolver" e "Deixar guardado"; o uso pode ser desfeito na meta.
- Progresso: quanto falta, percentual e quanto guardar por mês até o prazo; comemoração na metade e na meta completa.
- Seu mês com "Meta em destaque"; Extrato com "Guardado na meta", "Tirado da meta" e "pago com a meta {meta}".
- Metas na barra inferior (Seu mês · Extrato · Anotar · Metas · Mais) e no menu lateral.

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco ({n} testes em `plano5.test.ts`) e ponta a ponta (`plano5.spec.ts`: 3 testes — celular: 2, desktop: 1; 6 entradas em `--list`): {rodados | pendentes do Docker}.

**Pendências levadas a outros planos**
- Metas da família (RN-22 a RN-22e, "Sua parte", saída da família com `return_on_exit`): Plano 7.
- Aviso "Faltam só {valor} para {meta}." (notificação "Meta perto"): Plano 8.
- Exportar metas e movimentos no CSV: Plano 9.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)` a seção `## Plano 5` com a tabela da seção "Decisões tomadas neste plano" abaixo (numeração 60–74), e ao fim da seção de textos novos a linha `Plano 5: ver a seção "Textos novos" do plano \`docs/superpowers/plans/2026-09-28-iris-plano-5-metas.md\`.` Preencher `{data}` e `{n}` com os valores reais.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plano5.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): metas; progresso e decisões do Plano 5" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica as seis migrações (`…_nucleo`, `…_categorias_e_onboarding`, `…_contas_e_recorrencias`, `…_nota_das_recorrencias`, `…_parcelas_e_cartoes`, `…_metas`).
3. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras (incluindo o gasto pago com meta nunca contado duas vezes), formulários, ações (Supabase simulado com filtros conferidos) e componentes
- `npm run test:db` — privacidade das metas, guardado nunca negativo (função e gravação direta), pedidos ao mesmo tempo, usar, desfazer uso, excluir meta
- `npm run test:e2e` — fluxos no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| RF-25 criar meta: nome, valor, prazo opcional (família: Plano 7) | Tasks 2, 6, 8, 10, 12 |
| RF-26 / RN-13 guardar: sai do Disponível do mês, soma em Guardado | Tasks 1, 2, 5, 7, 9, 12 |
| RF-27 / RN-14 tirar: volta ao Disponível do mês atual; nunca mais que o guardado | Tasks 2, 7, 9, 12 |
| RF-28 / RN-15 usar o dinheiro: gasto com categoria, fora do "Saiu", reduz o Saldo total; atômico | Tasks 1, 2, 7, 9, 12 |
| RN-15a gasto maior: diferença sai do mês | Tasks 1, 2, 9 (aviso), 12 |
| RN-15b sobra: pergunta, "Devolver" / "Deixar guardado", padrão deixar | Tasks 2, 7, 9, 10, 12 |
| RN-16 / A6 A excluir meta: histórico fica, guardado volta ao mês atual | Tasks 1, 2, 6, 10, 12 |
| RF-29 progresso: quanto falta, percentual, quanto guardar por mês | Tasks 1, 4, 8, 12 |
| RF-30 meta concluída com comemoração moderada | Tasks 1, 4, 7, 8, 12 |
| RN-01 / RF-32 linha "Guardado este mês" / "Tirado das metas" alimentada | Tasks 3, 5, 12 |
| RN-01a gasto pago com meta no Extrato com "pago com a meta {meta}" | Task 11 |
| RN-05 / RF-34 Guardado no Saldo total | Tasks 3, 5 (já exibido desde o Plano 1) |
| RF-33 meta em destaque no Seu mês | Tasks 4, 5, 12 |
| Decisão 12 / A5 Metas na barra inferior; menu lateral | Task 10 |
| RNF-11 regras num lugar só, gasto de meta nunca duas vezes | Tasks 1, 2 |
| Testes unitários, banco e ponta a ponta | Todas; Task 12 |

**Busca por marcadores proibidos:** nenhum "TBD", "a definir" ou "similar à Task N". Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 12, Step 4).

**Consistência de tipos e nomes:** `goalBalance`/`goalProgress`/`monthlySuggestion`/`splitGoalUse`/`crossedMilestone`/`MAX_GOAL_NAME` (1 → 2, 4, 7, 10); `monthsBetween`/`shortMonthLabel`/`formatWholeBRL` (1 → 4); `GoalRow`/`GoalMovementRow`/`toGoalRow`/`toMovementRow`/`GOAL_COLUMNS`/`MOVEMENT_COLUMNS` (3 → 4, 5, 8, 10, 11); `loadGoals`/`loadGoal`/`loadGoalMovements`/`fetchGoalMovements` (3 → 5, 10, 11); `TxRow.goalId` e `loadLedger().goalMovements` (3 → 5, 11); `GoalSummary`/`summarizeGoal`/`MetasView`/`buildMetas`/`GoalDetailView`/`GoalHistoryItem`/`buildGoalDetail`/`pickFeatured` (4 → 5, 8, 10); `ProgressBar` (5 → 8); `SeuMesView.featured`/`FeaturedGoal` (5); `makeGoalSchema`/`makeUseSchema`/`GOAL_MESSAGES` (6 → 7); `createGoal`/`updateGoal`/`deleteGoal` (6 → 10); `depositToGoal`/`withdrawFromGoal`/`spendFromGoal`/`returnLeftover`/`deleteGoalUse` (7 → 8, 9); `MetasList`/`GoalForm`/`GoalHero`/`GoalActions`/`GoalHistory` (8 → 10); `MoveForm`/`UseGoalForm`/`LeftoverPrompt` (9 → 10); RPCs `goal_balance(p_goal_id)`, `deposit_to_goal(p_goal_id, p_amount_cents)`, `withdraw_from_goal(p_goal_id, p_amount_cents)`, `use_goal(p_goal_id, p_amount_cents, p_category_id)` → `(tx_id, funded_cents, leftover_cents)`, `delete_goal_use(p_transaction_id)`, `delete_goal(p_goal_id)` (2 → 7, 6). A ação de usar se chama `spendFromGoal` (não `useGoal`) para não parecer um hook do React.

**Review Focus → testes:** 1 → Task 2 (`dois pedidos ao mesmo tempo…`, `tirar direto na tabela…`), Task 7 (`meta já usada…`, `devolver a sobra quando ela já foi devolvida…`); 2 → Task 1 (`splitGoalUse`, `guardar em agosto e usar em setembro…`), Task 2 (`o banco divide o uso igual ao app…`), e2e 2; 3 → Task 1 (`excluir a meta…`), Task 2 (`excluir: o guardado volta hoje…`), Task 4 (`…excluídas não aparecem`), Task 5 (destaque sem excluída), e2e 3; 4 → Task 2 (`tirar vai até o que a meta tem…`), Task 7 (`tirar mais do que tem…`), Task 9 (erro no campo), e2e 1; 5 → Task 2 (privacidade, `guardar numa meta usada`), Task 6 (`meta de outra pessoa, excluída…`), Task 7 (`…meta excluída, de outra pessoa ou usada não grava`), Task 10 (páginas: `notFound`/redirecionamentos), Task 11 (`gasto pago com meta não é editado…`).

**Proporção:** SQL e testes vêm completos (são o contrato); componentes, páginas e ações vêm por assinatura, regras e textos exatos, com código só onde o teste não decide (a página da meta, o arredondamento da sugestão).

---

## Conflitos encontrados na especificação

1. **RN-16 ("excluir uma meta mantém o valor guardado no histórico") × A6 A ("meta excluída devolve o dinheiro ao Disponível do mês atual"):** as duas valem juntas — os movimentos passados continuam contando nos seus meses, e o que estava guardado volta hoje como "Tirado da meta" (decisão 67). A copy da confirmação ("Excluir {meta}? O valor guardado continua registrado no seu histórico.") não diz que o dinheiro volta; foi acrescentada a frase "{valor} volta para o seu Disponível deste mês." (texto novo) — confirme.
2. **RN-01a diz que o gasto pago com meta aparece "no extrato e nas categorias" com a etiqueta:** o Extrato ganha a etiqueta (Task 11); "Para onde seu dinheiro vai" (Plano 1, `spendingByCategory`) mostra só a parte paga com o dinheiro do mês, para bater com o "Saiu". Mantido; fica para sua revisão (decisão 68).
3. **RN-15 "zera o Guardado daquela meta" × RN-15b "a sobra continua na meta":** lido como "a meta paga até o que tem"; com gasto menor sobra dinheiro nela (decisões 65 e 66).
4. **Etapa 3 §3.1 `goals.situacao` ativa / concluída / usada:** "concluída" é calculada (guardado ≥ valor), não gravada; "usada" é gravada (decisão 63). Família da meta: Plano 7.
5. **Copy "Adicionar valor: Guardar dinheiro nesta meta" × protótipo "Guardar dinheiro":** o botão é "Guardar dinheiro" (protótipo e rótulos da copy); o título do painel é "Guardar dinheiro nesta meta".
6. **Telas não desenhadas (criar meta, guardar/tirar, editar):** seguem o protótipo (Usar o dinheiro da meta, Novo cartão) e o manual; campos de criar vêm da copy (decisão 72). O protótipo mostra "Sua parte" e "Da família" na lista: Plano 7.
7. **A copy só tem os textos de criar, progresso, concluída, vazio e excluir:** os demais (guardar, tirar, erros, sobra devolvida, editar) estão em "Textos novos".

---

## Decisões tomadas neste plano

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

## Textos novos

Fora da copy oficial e do protótipo aprovado; precisam da sua aprovação (20):

- Metas: "Meta completa" (lista) · "Progresso de {meta}" (rótulo acessível da barra) · "Editar meta" · "Escolha um mês a partir de agora." · "Meta excluída." · "{valor} volta para o seu Disponível deste mês." (complemento da confirmação de excluir) · "Usada em {dia de mês de ano}." · "Usou" (histórico) · "Excluir o gasto de {dia}" (rótulo acessível) · "O valor volta para a meta." (complemento de "Seu mês será recalculado.")
- Guardar: "Quanto você quer guardar?" · "Esse valor sai do seu Disponível deste mês." · "Guardado. Seu mês já está atualizado."
- Tirar: "Quanto você quer tirar?" · "Esse valor volta para o seu Disponível deste mês." · "Esta meta tem {valor}. Tire até esse valor." · "Pronto. O valor voltou para o seu mês."
- Usar: "A diferença de {valor} sai do seu Disponível deste mês." · "Devolvido. Seu mês já está atualizado."
- Extrato: "Tirado da meta"

Da copy oficial, do protótipo, dos requisitos aprovados ou já aprovados, usados aqui: "Metas", "Suas metas", "Criar meta", "Para o que você quer guardar?", "Quanto você precisa?", "Até quando? (opcional)", "Faltam {valor} para {meta}.", "Guardar dinheiro nesta meta", "Guardar dinheiro", "Você chegou lá. {meta} está completa.", "Metade do caminho até {meta}.", "Meta criada. O primeiro passo já foi dado.", "Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?", "Excluir {meta}? O valor guardado continua registrado no seu histórico.", "Meta em destaque", "Ver metas", "Guardado em metas", "Só suas", "Concluídas", "{meta} · usada em {mês}", "até {mês abreviado} {ano}", "sem prazo", "Faltam {valor}", "Guardado", "de {valor}", "Para chegar até {mês de ano}, guarde cerca de {valor} por mês.", "Tirar dinheiro", "Usar o dinheiro", "Usar o dinheiro da meta", "Histórico", "Guardou", "Tirou", "Mais opções", "Você tem {valor} guardados em {meta}.", "Quanto foi o gasto?", "Com o quê?", "Esse gasto não sai do seu Disponível de novo: o dinheiro já tinha saído quando foi guardado.", "Sobraram {valor} na meta. Quer devolver para o seu mês?", "Devolver", "Deixar guardado", "Guardado na meta", "pago com a meta {meta}", "Guardado este mês", "Tirado das metas", "Anotado. Seu mês já está atualizado.", "Excluído. Seu mês já está atualizado.", "Alterações salvas.", "Salvar alterações", "Excluir este gasto?", "Seu mês será recalculado.", "Excluir", "Cancelar", "Voltar", "Fechar", "Falta o nome.", "Use até {n} caracteres.", "Falta o valor.", "Esse valor não parece certo. Use apenas números.", "Escolha uma categoria para esse gasto.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.", "Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.".
