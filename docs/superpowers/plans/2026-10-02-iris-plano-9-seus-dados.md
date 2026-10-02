# Íris — Plano 9: Seus dados e lançamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa baixa tudo o que é dela num arquivo CSV, exclui o próprio cadastro de forma definitiva (com o aviso certo sobre a família), troca o e-mail com confirmação nos dois endereços e encontra os Termos de uso e a Política de privacidade em páginas públicas. O plano também deixa a lista de lançamento pronta (Supabase Pro, domínio, SMTP, revisão jurídica), sem contratar nem publicar nada.

**Architecture:** Três partes independentes. **(1) Banco:** uma migração nova com `delete_my_account()` — função `SECURITY DEFINER` sem parâmetro, que só enxerga `auth.uid()`, exige uma sessão criada há no máximo 15 minutos e apaga a linha de `auth.users`; a cascata e o gatilho `handle_user_deleted` (Plano 7) fazem o resto, exatamente como na exclusão administrativa. O app **não usa a chave de serviço**. A mesma migração apaga o nome de toda família encerrada, varre o que sobra de uma família que ficou sem ninguém e traz `account_leftovers` (só para o papel de serviço), que prova, tabela por tabela, que nada da pessoa ficou. **(2) Servidor:** uma rota `GET` autenticada monta o CSV em partes, só com leituras da própria pessoa pela mesma conexão com RLS que as telas usam; ações de servidor para excluir (com uma nova tentativa em impasse `40P01`), pedir a troca de e-mail (Supabase Auth, resposta sempre igual) e confirmar a troca (página com botão, sem iniciar sessão). **(3) Telas:** Configurações ganha "Seus dados" e a linha de e-mail; páginas públicas `/termos`, `/privacidade`, `/confirmar-email` e `/cadastro-excluido`.

**Tech Stack:** Next.js 16.3 (App Router, Route Handlers, Server Actions), React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Postgres 17 (Supabase local), Zod 4, Vitest 5 + Testing Library (jsdom), Playwright 1.63. **Nenhuma dependência nova.**

**Spec:** `docs/etapa-2-requisitos.md` (RF-51 a RF-54, RF-57, RNF-07, RN-22e, RN-24, RN-25, §1.1 terminologia, §5 stack), `docs/etapa-3-arquitetura.md` (A7 A — exportação em CSV; §6 `/termos`, `/privacidade`, `/configuracoes` com "exportar, excluir cadastro"; §8.4), `docs/etapa-7-roteiro.md` (Plano 9), `docs/decisoes-para-revisao.md` (decisões 1–136, obrigatórias, com as substituições registradas lá; em especial 9, 22, 23, 109, 113, 117, 129, 132, 133), `docs/progresso.md` (pendências marcadas "Plano 9"), `README.md` ("Antes de publicar: o que depende de você (Plano 8)"), migrações `supabase/migrations/20261001000001_familia.sql` (`handle_user_deleted`, seção 4) e `20261002000001_notificacoes.sql`, copy oficial (Claude Doc "Íris — Documento-base de comunicação": "Exclusão de dados → Excluir a conta", "Cadastro → Rodapé", "Login → Recuperar senha", "Seção 8 — Confiança", "Erros", "Rótulos e botões").

## Global Constraints

- **Nenhuma chave de serviço em `src/`.** `SUPABASE_SECRET_KEY` continua só em testes de banco, e2e e scripts locais; o teste `src/features/notificacoes/no-service-key.test.ts` continua passando sem alteração. Excluir o cadastro é a função do banco `public.delete_my_account()`: `SECURITY DEFINER`, **sem parâmetro**, escopo `auth.uid()`.
- **Só planos gratuitos. Nada é contratado, configurado em serviço pago nem publicado.** "Supabase Pro" e o domínio próprio são decisões do dono do projeto: aparecem só em "O que depende de você" e na lista de lançamento do `README.md`.
- **Excluir o cadastro:** exige entrada recente (sessão criada há no máximo **15 minutos** e ainda existente), conferida **dentro do banco**; nunca recebe o id de ninguém; duas chamadas ao mesmo tempo terminam sem erro (uma devolve `true`, a outra `false`); a ação tenta de novo **uma vez** se o banco devolver `40P01`; depois: sessão encerrada no aparelho, inscrições de push, preferências e fila de avisos apagadas, nada pessoal em nenhuma tabela.
- **O que fica depois da exclusão (e só isto):** numa família **que continua**, os gastos que a pessoa marcou como da família ficam sem dono ("Ex-membro"), com valor, dia, nota e o nome da categoria (RN-24, decisão 109); a parte dela **já usada** numa compra da família fica na compra, sem dono; o aviso "Um membro saiu da família…" (sem nome); a linha de participação, sem pessoa e sem nome. Numa família que termina com ela, nada fica (a família some). Um convite pendente **enviado para o e-mail dela por outra família** fica até vencer (7 dias): é dado informado por quem convidou.
- **Tabela por tabela** (a prova é o teste de banco da Task 2):

  | Tabela | Na exclusão |
  |---|---|
  | `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, demais tabelas de `auth` ligadas à pessoa | apagadas (linha da pessoa + cascata do Supabase Auth) |
  | `auth.audit_log_entries`, `auth.flow_state` | linhas da pessoa apagadas pela função (não têm cascata) |
  | `profiles`, `categories`, `recurrences`, `cards`, `installment_plans`, `budgets`, `notification_prefs`, `push_subscriptions`, `notification_log` | apagadas (cascata) |
  | `transactions` | pessoais: apagadas. Da família: ver "O que fica" |
  | `goals` | pessoais: apagadas. Da família: `created_by` vazio |
  | `goal_movements` | apagados, menos a parte já usada numa compra da família (fica sem dono) |
  | `families` | `created_by` vazio; encerrada → nome apagado; sem mais ninguém → linha apagada |
  | `family_members` | sem pessoa e sem nome; apagada junto com a família sem ninguém |
  | `family_invites` | `created_by`/`accepted_by` vazios; os da família sem ninguém, apagados |
  | `family_events` | os de saída dela viram anônimos |
  | `private.job_secrets`, `cron.*`, `net.*`, `vault.*` | nunca tiveram dado de pessoa |

- **Exportar:** só dados da própria pessoa, lidos no servidor pela conexão com RLS (`createClient()` de `@/lib/supabase/server`) e sempre com `.eq('user_id', user.id)`; nunca linhas de outros membros, cartões de outros, endereços de push, fila de avisos, e-mail de convidado nem identificador interno (uuid). Texto: UTF-8 **com BOM**, separador `;`, fim de linha `\r\n`, datas `dd/mm/aaaa`, valores `1234,56` (sem "R$" e sem ponto de milhar). **Toda célula de texto vai entre aspas**; célula que começa com `=`, `+`, `-`, `@` (inclusive depois de espaços, e nas formas de largura inteira) ou com tabulação ganha um apóstrofo na frente; quebra de linha dentro de célula vira espaço. A rota exige sessão, responde `Cache-Control: no-store`, envia em partes, e o service worker não a guarda. Nome do arquivo sem dado pessoal: `iris-meus-dados-AAAA-MM-DD.csv`.
- **Trocar e-mail:** só pelo fluxo confirmado do Supabase Auth (`double_confirm_changes = true`: link no endereço atual **e** no novo); exige entrada recente; a resposta da tela é **a mesma** para endereço livre, endereço já cadastrado e limite de envio; o limite de envios é o do Supabase. O link do e-mail abre uma página com botão: abrir o link não confirma nada (leitores de e-mail abrem links sozinhos) e confirmar **não inicia sessão**.
- **Termos e Privacidade são textos jurídicos em rascunho.** Páginas públicas (caminhos exatos `/termos` e `/privacidade`, já na lista pública), em português simples, fiéis ao que o app faz. Enquanto o responsável, o contato, o provedor de e-mail e a data de revisão não forem preenchidos em `src/features/legal/controller.ts`, as páginas mostram o aviso de rascunho e não são indexadas. **A revisão (sua e, de preferência, de um advogado) é condição do lançamento** e está em "O que depende de você".
- **Copy:** a copy oficial é a única fonte de texto. O que não está nela está em "Textos novos", para aprovação. Tom calmo: sem exclamação, sem urgência, sem alarme, a culpa nunca é da pessoa. **"cadastro" = acesso da pessoa; "conta" = só conta a pagar** (nunca "sua conta", "conta do Google", "conta bancária", nem em `aria-label`, e-mail ou texto jurídico). Nunca "baixe o app".
- Antes de escrever código Next, ler em `node_modules/next/dist/docs/01-app/` (Next 16 difere do que você conhece; `AGENTS.md`): `03-api-reference/03-file-conventions/route.md` (streaming, `redirect`), `route-groups.md`, `proxy.md`, `03-api-reference/04-functions/generate-metadata.md` (`robots`, `referrer`), `03-api-reference/02-components/link.md` (pré-carregamento) e `01-getting-started/07-mutating-data.md`. `params`/`searchParams` são `Promise`.
- **Banco:** nunca editar migrações já aplicadas; tudo deste plano vai em **`supabase/migrations/20261003000001_seus_dados.sql`**. `SECURITY DEFINER` só onde o plano diz, com o motivo no comentário; `set search_path = ''`; todo nome qualificado; `revoke execute … from public, anon` (e de `authenticated` quando a função não é de pessoa). Nenhuma política de RLS existente é afrouxada.
- **Servidor:** o id da pessoa vem **só** de `requireUser()`; Zod no servidor; `redirect()` nunca dentro de `try`; redirecionamento só para caminho interno fixo; módulos `'use server'` exportam **somente funções async** (tipos e constantes ficam em outro arquivo). Nenhum `process.env` novo em `src/`.
- **Caminhos públicos:** só correspondência exata em `src/features/auth/routes.ts`. Este plano acrescenta `/confirmar-email` e `/cadastro-excluido`.
- Idioma pt-BR, dinheiro em centavos inteiros, "hoje" de `todayInSaoPaulo()`. Alvos de toque ≥ 44 px; texto 15–16 px; contraste AA; nada depende só de cor.
- **Testes de componente:** primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`. Ações de servidor mockam `@/lib/supabase/server`, `next/navigation`, `next/cache` e seguem o padrão de `src/features/familia/actions.test.ts`. **Nunca remover** um filtro de segurança para um teste passar.
- **e2e:** usuários com prefixo único por worker e por execução, limpeza só do próprio prefixo, nomes de papel exatos (`{ name, exact: true }`); todo teste que envia e-mail passa pela guarda `tests/e2e/local-only.ts`.
- Shell: Git Bash (POSIX). Projeto: `C:/Users/Joaov/Downloads/Planilha financeira`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/` nem `.env.local`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Sem Docker: conferir com `npx tsc --noEmit` e `npx playwright test --list`, marcar a execução como **pendente** em `docs/progresso.md` — **nunca** enfraquecer, pular ou apagar um teste.

## Review Focus

Cinco situações que o escopo não cobre de forma explícita e que mais podem machucar alguém; cada uma tem teste na tarefa dona:

1. **Dois toques em "Excluir meu cadastro", ou outra aba aberta** — a segunda chamada chega com o cadastro já apagado, ou as duas chegam juntas, ou a família está sendo alterada no mesmo instante (impasse). Expectativa: a pessoa nunca vê erro por isso; o cadastro é apagado uma vez; a aba antiga só leva a "Entrar" e não lê nem grava nada. → **Task 2** (`duas chamadas ao mesmo tempo`, `a sessão de quem excluiu não serve para mais nada`), **Task 5** (`40P01 uma vez: tenta de novo`, `já excluído: encerra a sessão e segue`).
2. **Texto que vira fórmula na planilha** — nota "=1+1", "-50 de desconto", categoria "+Extras", meta "@casa", nome com `;`, aspas ou quebra de linha, acento e emoji. Expectativa: abre no Excel como texto, uma linha por registro, acentos certos. → **Task 1** (`csvText`), **Task 3** (`uma nota com fórmula sai neutralizada na linha do registro`), e2e na **Task 11**.
3. **Download que falha no meio, ou sem sessão** — o banco cai entre duas páginas de registros; a sessão venceu; outro site aponta um link para a rota. Expectativa: nunca um arquivo pela metade com cara de completo (o download é interrompido); sem sessão vai para "Entrar"; pedido vindo de outro site não baixa nada. → **Task 4** (`falha no meio interrompe o envio`, `pedido de outro site volta para a tela`), e2e.
4. **Troca de e-mail para um endereço que já tem cadastro, ou link aberto por um leitor de e-mail** — Expectativa: a tela responde igual nos dois casos; abrir o link não troca nada; a troca só vale com as duas confirmações; confirmar num aparelho de outra pessoa não a desconecta nem conecta ninguém. → **Task 7** (`mesma resposta para endereço já cadastrado e para limite de envio`, `confirmar não usa a sessão do navegador`), e2e.
5. **Quem entra com o Google, e quem tem parte numa meta da família** — sem senha não há como "digitar a senha de novo"; e o valor do aviso precisa ser o que de fato sai da meta. Expectativa: o mesmo caminho "saia e entre de novo" serve para os dois tipos de cadastro; a troca de e-mail não é oferecida a quem entra com o Google; o aviso mostra a soma das partes positivas nas metas ativas da família, e só quando é maior que zero. → **Task 1** (`parte nas metas da família`), **Task 2** (`membro com parte nas metas`), **Task 5** (`entrada antiga: pede para sair e entrar de novo`), **Task 7** (`cadastro sem senha (entra com o Google): nada é pedido`), **Task 10** (`cadastro sem senha: e-mail só para leitura`).

---

## Estrutura de arquivos

```
supabase/migrations/20261003000001_seus_dados.sql      NOVO: entrada recente, delete_my_account, nome e varredura de família encerrada, account_leftovers
supabase/config.toml                                   MOD: modelos de e-mail (troca de e-mail, confirmação de cadastro); limite local de e-mails
supabase/templates/email_change.html                   NOVO
supabase/templates/confirmation.html                   NOVO (fica pronto; a confirmação de cadastro continua desligada)
tests/db/plano9.test.ts                                NOVO
tests/e2e/plano9.spec.ts                               NOVO
tests/e2e/local-only.ts                                MOD: authEmailTestIsLocal
src/features/notificacoes/e2e-local-only.test.ts       MOD: teste da guarda nova
src/domain/csv.ts (+ csv.test.ts)                      NOVO: células seguras, valores e datas do arquivo
src/domain/account.ts (+ account.test.ts)              NOVO: palavra de confirmação, parte nas metas da família, qual aviso mostrar
src/features/dados/export-queries.ts (+ test)          NOVO: leituras do arquivo (só da pessoa)
src/features/dados/export-csv.ts (+ test)              NOVO: blocos e linhas do arquivo
src/app/(app)/configuracoes/dados/page.tsx             NOVO: "Baixar meus dados"
src/app/(app)/configuracoes/dados/exportar/route.ts (+ route.test.ts)   NOVO: download
src/features/cadastro/state.ts                         NOVO: tipos e textos compartilhados (fora do 'use server')
src/features/cadastro/schemas.ts (+ test)              NOVO: e-mail novo, formato do código do link
src/features/cadastro/reauth.ts                        NOVO: isSessionRecent
src/features/cadastro/session.ts (+ test)              NOVO: endLocalSession (sair e limpar cookies)
src/features/cadastro/queries.ts (+ test)              NOVO: loadSignIn, loadDeletionContext
src/features/cadastro/actions.ts (+ test)              NOVO: deleteAccount, requestEmailChange, confirmEmailChange
src/features/cadastro/delete-form.tsx (+ test)         NOVO
src/features/cadastro/email-form.tsx (+ test)          NOVO
src/features/cadastro/confirm-email-form.tsx (+ test)  NOVO
src/features/cadastro/forget-device.tsx (+ test)       NOVO: apaga a inscrição de push e o que o navegador guardou
src/lib/supabase/stateless.ts                          NOVO: cliente com a chave publicável, sem cookies (confirmação do e-mail)
src/app/(app)/configuracoes/excluir/page.tsx           NOVO
src/app/(app)/configuracoes/e-mail/page.tsx            NOVO
src/app/(auth)/confirmar-email/page.tsx                NOVO (público)
src/app/(auth)/cadastro-excluido/page.tsx              NOVO (público)
src/features/legal/controller.ts                       NOVO: responsável, contato, provedor de e-mail, data da revisão (você preenche)
src/features/legal/content.ts (+ test)                 NOVO: texto dos Termos e da Política
src/features/legal/legal-page.tsx (+ test)             NOVO
src/app/(legal)/layout.tsx, termos/page.tsx, privacidade/page.tsx   NOVO (públicos)
src/features/auth/routes.ts (+ routes.test.ts)         MOD: dois caminhos públicos
src/app/(auth)/entrar/page.tsx                         MOD: frase dos Termos (o Google cria cadastro por aqui)
src/app/(app)/configuracoes/page.tsx                   MOD: linha E-mail, seção "Seus dados"
.gitignore                                             MOD: `.claude/`
README.md, docs/progresso.md, docs/decisoes-para-revisao.md   MOD
```

Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. As Tasks 3–4 (exportar), 5–6 (excluir), 7–8 (e-mail) e 9 (textos jurídicos) só dependem das Tasks 1 e 2.

---

### Task 1: Domínio — células seguras do CSV e regras da exclusão

**Files:**
- Create: `src/domain/csv.ts`, `src/domain/csv.test.ts`, `src/domain/account.ts`, `src/domain/account.test.ts`

**Interfaces:**
- Produces (`src/domain/csv.ts`):
  - `CSV_BOM = '\uFEFF'`, `CSV_SEP = ';'`, `CSV_EOL = '\r\n'`
  - `csvText(value: string | null | undefined): string` — célula de texto, sempre entre aspas; vazio/nulo → `''`
  - `csvMoney(cents: number): string` — `'1234,56'`
  - `csvDate(d: ISODate | null): string` — `'dd/mm/aaaa'` ou `''`
  - `csvMonth(m: MonthKey): string` — `'mm/aaaa'`
  - `csvLine(cells: string[]): string` — células já prontas, unidas por `;`, terminadas em `\r\n`
- Produces (`src/domain/account.ts`):
  - `DELETE_WORD = 'EXCLUIR'`, `isDeleteConfirmed(typed: string): boolean`
  - `familyShareCents(familyGoalIds: string[], movements: { goalId: string; kind: GoalMovementKind; amountCents: Cents }[]): Cents`
  - `type DeletionNotice = 'everything' | 'family-history'`
  - `deletionNotice(input: { hasCurrentFamilyTx: boolean; hasOtherFamilyTx: boolean; activeMembers: number }): DeletionNotice`

- [ ] **Step 1: Escrever os testes**

`src/domain/csv.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CSV_BOM, csvDate, csvLine, csvMoney, csvMonth, csvText } from './csv'

test('texto comum vai entre aspas; vazio e nulo viram célula vazia', () => {
  expect(csvText('Mercado')).toBe('"Mercado"')
  expect(csvText('Família Souza — açaí 🍇')).toBe('"Família Souza — açaí 🍇"')
  expect(csvText('')).toBe('')
  expect(csvText(null)).toBe('')
  expect(csvText(undefined)).toBe('')
})

test.each([
  ['=1+1', `"'=1+1"`],
  ['+55 11 99999', `"'+55 11 99999"`],
  ['-50 de desconto', `"'-50 de desconto"`],
  ['@SUM(A1:A9)', `"'@SUM(A1:A9)"`],
  ['\t=1+1', `"'\t=1+1"`],
  ['  =cmd|x', `"'  =cmd|x"`],
  ['\r=1+1', `"' =1+1"`],
  ['\n@x', `"' @x"`],
  ['＝1+1', `"'＝1+1"`],
  ['＋1', `"'＋1"`],
  ['－1', `"'－1"`],
  ['＠x', `"'＠x"`],
])('célula que viraria fórmula ganha apóstrofo: %j', (input, expected) => {
  expect(csvText(input)).toBe(expected)
})

test('o que não é fórmula não ganha apóstrofo', () => {
  expect(csvText('feira = barata')).toBe('"feira = barata"')
  expect(csvText('a-b')).toBe('"a-b"')
  expect(csvText('e-mail@casa')).toBe('"e-mail@casa"')
})

test('aspas dobram, ponto e vírgula fica dentro das aspas e quebra de linha vira espaço', () => {
  expect(csvText('diz "oi"; fim')).toBe('"diz ""oi""; fim"')
  expect(csvText('linha 1\r\nlinha 2\nlinha 3\rfim')).toBe('"linha 1 linha 2 linha 3 fim"')
})

test('valores sem R$ e sem milhar; datas e meses no formato do Brasil', () => {
  expect(csvMoney(123456)).toBe('1234,56')
  expect(csvMoney(5)).toBe('0,05')
  expect(csvMoney(0)).toBe('0,00')
  expect(csvMoney(-123456)).toBe('-1234,56')
  expect(csvMoney(9_999_999_999)).toBe('99999999,99')
  expect(csvDate('2026-10-02')).toBe('02/10/2026')
  expect(csvDate(null)).toBe('')
  expect(csvMonth('2026-03')).toBe('03/2026')
})

test('linha: células unidas por ponto e vírgula, com fim de linha do Windows; a marca de UTF-8 é um caractere só', () => {
  expect(csvLine([csvText('Luz'), csvMoney(18000), csvDate('2026-10-10'), ''])).toBe('"Luz";180,00;10/10/2026;\r\n')
  expect(CSV_BOM).toBe('\uFEFF')
})
```

`src/domain/account.test.ts`:

```ts
import { expect, test } from 'vitest'
import { DELETE_WORD, deletionNotice, familyShareCents, isDeleteConfirmed } from './account'

test('a confirmação é a palavra EXCLUIR, em maiúsculas; espaços nas pontas não contam', () => {
  expect(DELETE_WORD).toBe('EXCLUIR')
  for (const ok of ['EXCLUIR', ' EXCLUIR ', 'EXCLUIR\n']) expect(isDeleteConfirmed(ok), ok).toBe(true)
  for (const no of ['', 'excluir', 'Excluir', 'EXCLUIR!', 'EXCLU IR', 'EXCLUIR MEU CADASTRO']) expect(isDeleteConfirmed(no), no).toBe(false)
})

test('parte nas metas da família: soma do saldo próprio em cada meta da família, só o que é positivo', () => {
  const moves = [
    { goalId: 'g1', kind: 'deposit' as const, amountCents: 3000 },
    { goalId: 'g1', kind: 'withdraw' as const, amountCents: 500 },
    { goalId: 'g2', kind: 'deposit' as const, amountCents: 1000 },
    { goalId: 'g2', kind: 'use' as const, amountCents: 750 },
    { goalId: 'g3', kind: 'deposit' as const, amountCents: 400 },
    { goalId: 'g3', kind: 'return_on_exit' as const, amountCents: 400 },
    { goalId: 'pessoal', kind: 'deposit' as const, amountCents: 99999 },
  ]
  expect(familyShareCents(['g1', 'g2', 'g3'], moves)).toBe(2750)
  expect(familyShareCents(['g3'], moves)).toBe(0)
  expect(familyShareCents([], moves)).toBe(0)
  // um saldo negativo numa meta (banco antigo) não desconta das outras
  expect(familyShareCents(['g1', 'g9'], [...moves, { goalId: 'g9', kind: 'withdraw' as const, amountCents: 100 }])).toBe(2500)
})

test('qual aviso: tudo é apagado, ou os gastos da família ficam sem o nome', () => {
  const none = { hasCurrentFamilyTx: false, hasOtherFamilyTx: false, activeMembers: 0 }
  expect(deletionNotice(none)).toBe('everything')
  // sozinha na família: a família termina com ela e nada fica
  expect(deletionNotice({ ...none, hasCurrentFamilyTx: true, activeMembers: 1 })).toBe('everything')
  expect(deletionNotice({ ...none, hasCurrentFamilyTx: true, activeMembers: 2 })).toBe('family-history')
  // gastos numa família de que já saiu ficam lá
  expect(deletionNotice({ ...none, hasOtherFamilyTx: true })).toBe('family-history')
  expect(deletionNotice({ hasCurrentFamilyTx: false, hasOtherFamilyTx: false, activeMembers: 3 })).toBe('everything')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/csv.test.ts src/domain/account.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `src/domain/csv.ts`**

Regras de `csvText`, nesta ordem: nulo/indefinido/vazio → `''`; trocar `\r\n`, `\r` e `\n` por um espaço; se o resultado casa com `/^\t|^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/`, pôr `'` na frente; dobrar as aspas; envolver em aspas. `csvMoney` trabalha com inteiros (sinal, `Math.trunc(abs / 100)`, dois dígitos de centavos), nunca com `toFixed` nem `Intl`. `csvDate` reordena o texto `AAAA-MM-DD` (não cria `Date`).

- [ ] **Step 4: Implementar `src/domain/account.ts`**

`familyShareCents` agrupa os movimentos por meta, usa `goalBalance` de `./goals` em cada meta de `familyGoalIds` e soma só os saldos maiores que zero. `deletionNotice` devolve `'family-history'` quando `hasOtherFamilyTx`, ou quando `hasCurrentFamilyTx` e `activeMembers > 1`; senão `'everything'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/domain/csv.test.ts src/domain/account.test.ts && npx tsc --noEmit`
Expected: PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/domain/csv.ts src/domain/csv.test.ts src/domain/account.ts src/domain/account.test.ts
git commit -m "feat(dominio): células seguras do CSV e regras da exclusão do cadastro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Banco — entrada recente, excluir o cadastro, família encerrada e conferência

**Files:**
- Create: `supabase/migrations/20261003000001_seus_dados.sql`, `tests/db/plano9.test.ts`

**Interfaces:**
- Produces (SQL, chamáveis pela API):
  - `public.session_is_recent() returns boolean` — `authenticated`. A sessão de quem chama existe e foi criada há no máximo 15 minutos.
  - `public.delete_my_account() returns boolean` — `authenticated`. `true`: excluiu agora; `false`: já não existia. Erros: `'Sessão necessária.'` e `'Entrada recente necessária.'`, ambos com `errcode 42501`.
  - `public.session_recent_at(p_user uuid, p_session uuid, p_now timestamptz) returns boolean` — só `service_role` (testes escolhem o relógio; mesmo padrão de `job_enqueue_morning_on`).
  - `public.account_leftovers(p_user uuid, p_email text default null) returns table (place text, n bigint)` — só `service_role`. Uma linha por lugar onde ainda existe algo da pessoa.
- Produces (internos): `private.sweep_ended_family(p_family uuid)`, gatilho `families_forget_name` (nome `'Família encerrada'`).

**Como a exclusão funciona sem a chave de serviço (leia antes de escrever):**
- As funções das migrações pertencem a quem aplica a migração (`postgres`). No Supabase esse papel tem `SELECT`/`DELETE` nas tabelas de `auth` (as migrações anteriores já leem `auth.users` em funções `SECURITY DEFINER` e criam gatilhos nela). **Isso nunca foi executado neste projeto (sem Docker)**: por isso a migração começa com um bloco que **para a aplicação** com mensagem clara se o dono não tiver esses privilégios.
- `delete from auth.users where id = auth.uid()` dispara o gatilho `on_auth_user_deleted` (`handle_user_deleted`, Plano 7) e as cascatas, como a exclusão administrativa. Nenhum gatilho do caminho de exclusão lê `auth.uid()` nem `current_user` (conferido nas migrações: só `goal_movements_author_guard`, que é de `INSERT`), então rodar com a sessão da pessoa dá o mesmo resultado.
- **Ordem das travas:** a função trava a família (`for update`) **antes** de tocar em `auth.users` — a mesma ordem de sair e remover (seção 4 do Plano 7). A exclusão administrativa trava ao contrário e pode dar impasse; a tela não usa esse caminho. Ainda assim a ação tenta de novo uma vez em `40P01` (Task 5).
- **Entrada recente:** o token traz `session_id`; a função procura essa sessão em `auth.sessions` para a própria pessoa e confere `created_at`. Sessão encerrada (saiu da Íris) não existe mais: um token ainda não vencido não serve.

- [ ] **Step 1: Escrever os testes de banco**

`tests/db/plano9.test.ts`:

```ts
import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, expense, joinFamily, todaySP } from './family-helpers'
import { pendingBill, subscribe } from './notify-helpers'

// Quem é excluído dentro de um teste nasce com newUser() e fica fora desta lista.
const created: TestUser[] = []
const today = todaySP()
const month = `${today.slice(0, 7)}-01`
const REAUTH = 'Entrada recente necessária.'
const ENDED = 'Família encerrada'
const NOT_CALLABLE = ['PGRST202', '42501']
const anon = createClient(url, publishable, { auth: { persistSession: false } })

async function user(name: string): Promise<TestUser> {
  const u = await newUser(name)
  created.push(u)
  return u
}
async function session(u: TestUser) {
  const { data } = await u.client.auth.getSession()
  if (!data.session) throw new Error('sem sessão')
  return data.session
}
const sessionId = (token: string): string =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).session_id as string
// Um token que ainda não venceu, usado depois de a sessão ter sido encerrada.
const withToken = (token: string) =>
  createClient(url, publishable, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

async function leftovers(id: string, email: string | null = null): Promise<string[]> {
  const { data, error } = await admin.rpc('account_leftovers', { p_user: id, p_email: email })
  if (error) throw error
  return (data as { place: string; n: number }[]).map((r) => r.place).sort()
}
const exists = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user !== null
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
  const { data, error } = await u.client.rpc('family_goal_totals')
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { goal_id: string; saved_cents: number }[]).map((r) => [r.goal_id, Number(r.saved_cents)]))
}
async function familyRows(u: TestUser) {
  const { data, error } = await u.client.rpc('family_expenses', { p_from: month, p_to: today })
  if (error) throw error
  return data as { id: string; author_id: string | null; author_name: string | null; amount_cents: number; note: string | null }[]
}

afterAll(async () => {
  await removeUsers(...created)
})

describe('entrada recente', () => {
  test('quem acabou de entrar tem entrada recente; sem sessão a função nem é chamável', async () => {
    const a = await user('Ana')
    const r = await a.client.rpc('session_is_recent')
    expect(r.error).toBeNull()
    expect(r.data).toBe(true)
    expect((await anon.rpc('session_is_recent')).error?.code).toBe('42501')
  })

  test('vale 15 minutos, só para a própria sessão e só enquanto ela existe', async () => {
    const a = await user('Ana')
    const b = await user('Bia')
    const s = await session(a)
    const sid = sessionId(s.access_token)
    const recent = async (userId: string, sessionUuid: string, now: string) => {
      const { data, error } = await admin.rpc('session_recent_at', { p_user: userId, p_session: sessionUuid, p_now: now })
      if (error) throw error
      return data
    }
    expect(await recent(a.id, sid, inMinutes(0))).toBe(true)
    expect(await recent(a.id, sid, inMinutes(14))).toBe(true)
    expect(await recent(a.id, sid, inMinutes(16))).toBe(false)
    // sessão de outra pessoa, sessão que não existe, relógio muito atrás
    expect(await recent(b.id, sid, inMinutes(0))).toBe(false)
    expect(await recent(a.id, '00000000-0000-4000-8000-000000000000', inMinutes(0))).toBe(false)
    expect(await recent(a.id, sid, inMinutes(-10))).toBe(false)

    // Saiu da Íris: o token ainda passa pela API até vencer, mas a sessão não existe mais.
    const stale = withToken(s.access_token)
    expect((await a.client.auth.signOut()).error).toBeNull()
    const after = await stale.rpc('session_is_recent')
    expect(after.error).toBeNull()
    expect(after.data).toBe(false)
    expect(await recent(a.id, sid, inMinutes(0))).toBe(false)
  })
})

describe('excluir o cadastro: só o próprio, com entrada recente', () => {
  test('sem sessão, com sessão encerrada ou tentando passar o id de outra pessoa: nada é apagado', async () => {
    const a = await user('Ana')
    const b = await user('Bia')
    expect((await anon.rpc('delete_my_account')).error?.code).toBe('42501')

    // A função não tem parâmetro: não existe forma de apontar para outra pessoa.
    const aimed = await a.client.rpc('delete_my_account', { p_user: b.id })
    expect(aimed.error?.code).toBe('PGRST202')
    expect(await exists(b.id)).toBe(true)
    expect(await exists(a.id)).toBe(true)

    const s = await session(a)
    const stale = withToken(s.access_token)
    expect((await a.client.auth.signOut()).error).toBeNull()
    const refused = await stale.rpc('delete_my_account')
    expect(refused.error?.message).toBe(REAUTH)
    expect(refused.error?.code).toBe('42501')
    expect(await exists(a.id)).toBe(true)
    expect((await admin.from('profiles').select('id').eq('id', a.id)).data).toHaveLength(1)
    expect((await admin.from('categories').select('id').eq('user_id', a.id)).data).toHaveLength(10)
  })

  test('cada tabela tem algo da pessoa antes e nada depois; outra pessoa não perde nada', async () => {
    const z = await newUser('Zeca') // excluído no teste
    const olga = await user('Olga')
    const email = (await session(z)).user.email!
    const mercado = await categoryId(z, 'mercado')

    // Uma linha em cada tabela pessoal.
    expect((await z.client.from('categories').insert({ user_id: z.id, name: 'Pet' })).error).toBeNull()
    await expense(z, 'mercado', 1234, { note: 'feira' })
    expect((await z.client.from('transactions').insert({
      user_id: z.id, kind: 'income', amount_cents: 500_000, source: 'Salário', occurred_on: today,
    })).error).toBeNull()
    await pendingBill(z, { name: 'Luz', dueOn: today })
    const card = await z.client.from('cards').insert({ user_id: z.id, nickname: 'Roxinho', kind: 'credit', color: 'purple' }).select('id').single()
    expect(card.error).toBeNull()
    expect((await z.client.rpc('create_installment_purchase', {
      p_amount_cents: 60_000, p_count: 3, p_category_id: mercado, p_note: null, p_card_id: card.data!.id, p_payment_method: null, p_purchased_on: today,
    })).error).toBeNull()
    const goal = await z.client.from('goals').insert({ user_id: z.id, name: 'Viagem', target_cents: 400_000 }).select('id').single()
    expect(goal.error).toBeNull()
    expect((await z.client.rpc('deposit_to_goal', { p_goal_id: goal.data!.id, p_amount_cents: 5000 })).error).toBeNull()
    expect((await z.client.rpc('set_month_budgets', { p_month: month, p_category_ids: [mercado], p_amounts: [80_000] })).error).toBeNull()
    expect((await z.client.from('notification_prefs').upsert({ user_id: z.id, kind: 'daily', enabled: true })).error).toBeNull()
    await subscribe(z)
    expect((await admin.from('notification_log').insert({ user_id: z.id, kind: 'comeback', ref: today })).error).toBeNull()
    const fam = await createFamily(z, 'Família do Zeca')
    expect((await z.client.rpc('create_family_email_invite', { p_email: 'convidado@teste.iris.dev' })).error).toBeNull()
    await expense(z, 'casa', 9900, { family_id: fam, note: 'aluguel' })
    const famGoal = await familyGoal(z, 'Sofá')
    await deposit(z, famGoal, 2000)

    await expense(olga, 'lazer', 777, { note: 'da Olga' })

    // A conferência enxerga cada tabela (se um lugar novo guardar o id da pessoa, ele aparece aqui).
    const before = await leftovers(z.id, email)
    for (const place of [
      'auth.users.id', 'auth.users.email', 'auth.sessions.user_id', 'auth.refresh_tokens.user_id',
      'public.profiles.id', 'public.categories.user_id', 'public.transactions.user_id', 'public.recurrences.user_id',
      'public.cards.user_id', 'public.installment_plans.user_id', 'public.goals.user_id', 'public.goals.created_by',
      'public.goal_movements.user_id', 'public.budgets.user_id', 'public.notification_prefs.user_id',
      'public.push_subscriptions.user_id', 'public.notification_log.user_id',
      'public.families.created_by', 'public.family_members.user_id', 'public.family_invites.created_by',
    ]) {
      expect(before, place).toContain(place)
    }

    const done = await z.client.rpc('delete_my_account')
    expect(done.error).toBeNull()
    expect(done.data).toBe(true)

    expect(await exists(z.id)).toBe(false)
    expect(await leftovers(z.id, email)).toEqual([])
    for (const table of [
      'categories', 'transactions', 'recurrences', 'cards', 'installment_plans', 'goals', 'goal_movements',
      'budgets', 'notification_prefs', 'push_subscriptions', 'notification_log',
    ]) {
      expect((await admin.from(table).select('user_id').eq('user_id', z.id)).data, table).toEqual([])
    }
    // A família era só dela: some inteira, com o nome, o convite (e o resumo do endereço convidado), a meta e os gastos.
    expect((await admin.from('families').select('id').eq('id', fam)).data).toEqual([])
    expect((await admin.from('family_members').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_invites').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('family_events').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('transactions').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goals').select('id').eq('family_id', fam)).data).toEqual([])
    expect((await admin.from('goal_movements').select('id').eq('goal_id', famGoal)).data).toEqual([])

    // Quem não tem nada com isso continua igual.
    expect((await olga.client.from('transactions').select('note')).data).toEqual([{ note: 'da Olga' }])
    expect((await olga.client.from('categories').select('id')).data).toHaveLength(10)
    expect((await olga.client.rpc('session_is_recent')).data).toBe(true)

    // A sessão de quem excluiu não serve para mais nada (o token ainda não venceu).
    expect((await z.client.from('profiles').select('id')).data ?? []).toEqual([])
    expect((await z.client.from('transactions').insert({
      user_id: z.id, kind: 'income', amount_cents: 100, source: 'x', occurred_on: today,
    })).error).not.toBeNull()
    const again = await z.client.rpc('delete_my_account')
    expect(again.error).toBeNull()
    expect(again.data).toBe(false)
  })

  test('duas chamadas ao mesmo tempo: uma exclui, a outra encontra o cadastro já excluído; nenhuma dá erro', async () => {
    const d = await newUser('Duda') // excluída no teste
    await createFamily(d, 'Família da Duda')
    const [r1, r2] = await Promise.all([d.client.rpc('delete_my_account'), d.client.rpc('delete_my_account')])
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect([r1.data, r2.data].sort()).toEqual([false, true])
    expect(await exists(d.id)).toBe(false)
    expect(await leftovers(d.id)).toEqual([])
  })
})

describe('excluir o cadastro e a família (RN-22e, RN-24, RN-25)', () => {
  test('administradora com outras pessoas: quem participa há mais tempo assume; os gastos ficam como Ex-membro; o nome da família fica', async () => {
    const ana = await newUser('Ana') // excluída no teste
    const bia = await user('Bia')
    const caio = await user('Caio')
    const fam = await createFamily(ana, 'Família Souza')
    await joinFamily(bia, ana)
    await joinFamily(caio, ana)
    const daFamilia = await expense(ana, 'mercado', 4000, { family_id: fam, note: 'feira' })
    const pessoal = await expense(ana, 'lazer', 999)

    expect((await ana.client.rpc('delete_my_account')).data).toBe(true)

    expect(await leftovers(ana.id)).toEqual([])
    const members = (await bia.client.from('family_members').select('user_id, role, display_name, left_at')).data!
    expect(members.find((m) => m.user_id === bia.id)?.role).toBe('admin')
    expect(members.find((m) => m.user_id === caio.id)?.role).toBe('member')
    const ex = members.filter((m) => m.user_id === null)
    expect(ex).toHaveLength(1)
    expect(ex[0]).toMatchObject({ role: 'member', display_name: null })
    expect(ex[0].left_at).not.toBeNull()
    expect((await bia.client.from('families').select('name, ended_at').single()).data).toEqual({ name: 'Família Souza', ended_at: null })
    expect((await familyRows(bia)).find((r) => r.id === daFamilia)).toMatchObject({ author_id: null, author_name: null, amount_cents: 4000, note: 'feira' })
    expect((await admin.from('transactions').select('id').eq('id', pessoal)).data).toEqual([])
    expect((await bia.client.from('family_events').select('kind, member_name, goal_name, amount_cents')).data).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null },
    ])
  })

  test('membro com parte nas metas: a parte sai, a meta diminui e a família recebe o aviso sem nome', async () => {
    const ana = await user('Ana')
    const dani = await newUser('Dani') // excluída no teste
    await createFamily(ana, 'Família Lima')
    await joinFamily(dani, ana)
    const reforma = await familyGoal(ana, 'Reforma')
    await deposit(ana, reforma, 1000)
    await deposit(dani, reforma, 3000)
    expect((await totals(ana))[reforma]).toBe(4000)

    expect((await dani.client.rpc('delete_my_account')).data).toBe(true)

    expect((await totals(ana))[reforma]).toBe(1000)
    expect(await leftovers(dani.id)).toEqual([])
    const owners = (await admin.from('goal_movements').select('user_id').eq('goal_id', reforma)).data!
    expect(owners.every((m) => m.user_id === ana.id)).toBe(true)
    expect((await ana.client.from('family_events').select('kind, member_name, goal_name, amount_cents')).data).toEqual([
      { kind: 'member_deleted', member_name: null, goal_name: 'Reforma', amount_cents: null },
    ])
    expect((await ana.client.from('families').select('name').single()).data).toEqual({ name: 'Família Lima' })
  })

  test('sair sozinho encerra a família e apaga o nome dela', async () => {
    const c = await user('Caio')
    const fam = await createFamily(c, 'Família Teixeira')
    expect((await c.client.rpc('leave_family')).error).toBeNull()
    const row = (await admin.from('families').select('name, ended_at').eq('id', fam).single()).data!
    expect(row.name).toBe(ENDED)
    expect(row.ended_at).not.toBeNull()
    // ninguém muda o nome por gravação direta
    const direct = await c.client.from('families').update({ name: 'Volta' }).eq('id', fam).select()
    expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true)
  })

  test('família encerrada com algo de quem já saiu: fica sem nome até essa pessoa também excluir; aí some', async () => {
    const ana = await newUser('Ana') // excluída no teste
    const bia = await newUser('Bia') // excluída no teste
    const fam = await createFamily(ana, 'Família Prado')
    await joinFamily(bia, ana)
    const daBia = await expense(bia, 'mercado', 2500, { family_id: fam })
    expect((await bia.client.rpc('leave_family')).error).toBeNull()

    expect((await ana.client.rpc('delete_my_account')).data).toBe(true)

    const row = (await admin.from('families').select('name, ended_at').eq('id', fam).single()).data!
    expect(row.name).toBe(ENDED)
    expect(row.ended_at).not.toBeNull()
    // O que é da Bia não foi tocado: o gasto continua dela, com a marca da família.
    expect((await bia.client.from('transactions').select('family_id, amount_cents').eq('id', daBia).single()).data).toEqual({ family_id: fam, amount_cents: 2500 })
    const members = (await admin.from('family_members').select('user_id, display_name').eq('family_id', fam)).data!
    expect(members).toHaveLength(2)
    expect(members.find((m) => m.user_id === bia.id)?.display_name).toBe('Bia')
    expect(members.find((m) => m.user_id === null)?.display_name).toBeNull()
    expect(await leftovers(ana.id)).toEqual([])

    expect((await bia.client.rpc('delete_my_account')).data).toBe(true)
    expect((await admin.from('families').select('id').eq('id', fam)).data).toEqual([])
    expect((await admin.from('family_members').select('id').eq('family_id', fam)).data).toEqual([])
    expect(await leftovers(bia.id)).toEqual([])
  })
})

describe('funções internas não são chamáveis por pessoas', () => {
  test('conferência, relógio de teste e gatilho: só o papel de serviço (ou ninguém)', async () => {
    const a = await user('Ana')
    const sid = sessionId((await session(a)).access_token)
    for (const client of [a.client, anon]) {
      expect(NOT_CALLABLE).toContain((await client.rpc('account_leftovers', { p_user: a.id, p_email: null })).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('session_recent_at', { p_user: a.id, p_session: sid, p_now: inMinutes(0) })).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('families_forget_name')).error?.code)
      expect(NOT_CALLABLE).toContain((await client.rpc('sweep_ended_family', { p_family: a.id })).error?.code)
    }
    // account_leftovers não devolve nada sobre quem não tem nada (nem erro para um id qualquer)
    expect(await leftovers('00000000-0000-4000-8000-000000000000')).toEqual([])
  })
})
```

Ao escrever, confira nomes de coluna e assinaturas nas migrações (`cards`, `goals`, `notification_prefs`, `create_installment_purchase`, `set_month_budgets`, `create_family_email_invite`). Se um preparo precisar de ajuste, ajuste **o preparo**; nunca uma afirmação.

- [ ] **Step 2: Escrever a migração**

`supabase/migrations/20261003000001_seus_dados.sql`:

```sql
-- Plano 9: seus dados (RF-51 a RF-54, RNF-07; RN-22e, RN-24, RN-25).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regras de ouro:
-- 1. O app não usa a chave de serviço. Excluir o cadastro é uma função do
--    banco, sem parâmetro, que só enxerga quem chama (auth.uid()) e apaga a
--    linha de auth.users. A cascata e handle_user_deleted (Plano 7) fazem o
--    resto, como na exclusão administrativa.
-- 2. Excluir exige entrada recente: a sessão de quem chama existe e foi
--    criada há no máximo 15 minutos. Um token de sessão encerrada não serve.
-- 3. Nada pessoal fica. O que resta numa família que continua é o histórico
--    sem nome (RN-24). account_leftovers confere, tabela por tabela.

-- 0. Conferência ao aplicar. As funções abaixo pertencem a quem aplica esta
--    migração e leem e apagam em auth. Sem esses privilégios a exclusão
--    falharia só na hora em que alguém a pedisse: melhor parar aqui.
do $$
begin
  if not has_table_privilege(current_user, 'auth.users', 'SELECT')
     or not has_table_privilege(current_user, 'auth.users', 'DELETE')
     or not has_table_privilege(current_user, 'auth.sessions', 'SELECT') then
    raise exception 'Plano 9: o papel % precisa de SELECT e DELETE em auth.users e SELECT em auth.sessions.', current_user;
  end if;
end;
$$;

-- 1. Entrada recente, com o relógio por parâmetro (para os testes). Só o
--    papel de serviço chama; as funções abaixo a usam como donas.
--    SECURITY DEFINER: auth.sessions não é lida pela API.
create function public.session_recent_at(p_user uuid, p_session uuid, p_now timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_user
      and s.created_at > p_now - interval '15 minutes'
      and s.created_at <= p_now + interval '1 minute'
  )
$$;

-- 2. A sessão de quem chama é recente? Sem parâmetro: só responde sobre a
--    própria sessão (o session_id vem do token, conferido pela API).
--    SECURITY DEFINER: mesmo motivo do item 1.
create function public.session_is_recent() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sid text := auth.jwt() ->> 'session_id';
begin
  if v_uid is null or v_sid is null
     or v_sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.session_recent_at(v_uid, v_sid::uuid, now());
end;
$$;

-- 3. Família encerrada não guarda o nome (pode trazer sobrenome), seja qual
--    for o caminho: sair sozinho, ou excluir o cadastro. Ninguém lê uma
--    família encerrada; o nome não tem mais para quê.
create function public.families_forget_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ended_at is not null then
    new.name := 'Família encerrada';
  end if;
  return new;
end;
$$;

create trigger families_forget_name before update on public.families
  for each row execute function public.families_forget_name();

update public.families set name = 'Família encerrada' where ended_at is not null and name <> 'Família encerrada';

-- 4. Varredura de uma família encerrada (só chamada pela exclusão do
--    cadastro, item 5). Apaga o que não é de mais ninguém: convites, avisos e
--    metas sem movimento. Se nada de outra pessoa depende da família (nenhuma
--    participação com pessoa, nenhum registro, molde ou meta), apaga também
--    as participações anônimas e a própria família. Senão a linha fica, sem
--    nome. Nunca toca em registro, molde, meta com movimento ou participação
--    de quem ainda tem cadastro.
--    SECURITY DEFINER: essas tabelas não têm gravação pela API.
create function private.sweep_ended_family(p_family uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.families f where f.id = p_family and f.ended_at is not null) then
    return;
  end if;
  delete from public.family_invites i where i.family_id = p_family;
  delete from public.family_events e where e.family_id = p_family;
  delete from public.goals g
    where g.family_id = p_family
      and not exists (select 1 from public.goal_movements m where m.goal_id = g.id)
      and not exists (select 1 from public.transactions t where t.goal_id = g.id);
  if exists (select 1 from public.family_members fm where fm.family_id = p_family and fm.user_id is not null)
     or exists (select 1 from public.transactions t where t.family_id = p_family)
     or exists (select 1 from public.recurrences rc where rc.family_id = p_family)
     or exists (select 1 from public.goals g where g.family_id = p_family) then
    return;
  end if;
  delete from public.family_members fm where fm.family_id = p_family;
  delete from public.families f where f.id = p_family;
end;
$$;

-- 5. Excluir o próprio cadastro (RF-53, LGPD). Sem parâmetro.
--    Em ordem:
--    a) quem chama existe? Se não, devolve falso (toque duplo, outra aba): a
--       ação encerra a sessão do mesmo jeito;
--    b) entrada recente (item 2);
--    c) trava a família ativa ANTES da linha de auth.users — a mesma ordem de
--       sair e remover (Plano 7, seção 4). A participação é lida de novo
--       depois da trava;
--    d) apaga auth.users: handle_user_deleted e as cascatas rodam aqui;
--    e) apaga os rastros da pessoa no serviço de autenticação que não têm
--       cascata (registro de acessos e pedidos de login em andamento). Um
--       problema nisso não desfaz a exclusão: fica um aviso no registro do
--       banco, e account_leftovers mostra o que sobrou;
--    f) varre as famílias encerradas em que ela participou (item 4).
--    Duas chamadas ao mesmo tempo: a segunda espera a trava e encontra zero
--    linhas para apagar; devolve falso.
--    SECURITY DEFINER: a pessoa não alcança auth pela API. O escopo é só
--    auth.uid(); nenhum id chega por parâmetro.
create function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_family uuid;
  v_families uuid[];
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if not found then
    return false;
  end if;
  if not public.session_is_recent() then
    raise exception 'Entrada recente necessária.' using errcode = '42501';
  end if;

  loop
    select fm.family_id into v_family from public.family_members fm
      where fm.user_id = v_uid and fm.left_at is null;
    exit when v_family is null;
    perform 1 from public.families f where f.id = v_family for update;
    exit when exists (
      select 1 from public.family_members fm
      where fm.family_id = v_family and fm.user_id = v_uid and fm.left_at is null
    );
  end loop;

  select array_agg(distinct fm.family_id) into v_families
    from public.family_members fm where fm.user_id = v_uid;

  delete from auth.users u where u.id = v_uid;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false;
  end if;

  begin
    delete from auth.audit_log_entries a
      where a.payload ->> 'actor_id' = v_uid::text
         or a.payload -> 'traits' ->> 'user_id' = v_uid::text
         or (v_email is not null and (
              lower(a.payload ->> 'actor_username') = lower(v_email)
              or lower(a.payload -> 'traits' ->> 'user_email') = lower(v_email)));
  exception when others then
    raise warning 'delete_my_account (registro de acessos): %', sqlstate;
  end;
  begin
    delete from auth.flow_state fs where fs.user_id = v_uid;
  exception when others then
    raise warning 'delete_my_account (login em andamento): %', sqlstate;
  end;

  if v_families is not null then
    foreach v_family in array v_families loop
      begin
        perform private.sweep_ended_family(v_family);
      exception when others then
        raise warning 'delete_my_account (família encerrada): %', sqlstate;
      end;
    end loop;
  end if;
  return true;
end;
$$;

-- 6. O que ainda existe de uma pessoa? Uma linha por lugar. Serve para os
--    testes provarem a exclusão e para conferir um pedido de exclusão no
--    banco hospedado (SQL Editor). Não altera nada.
--    Procura o id em toda coluna uuid de public, private e auth que o dono
--    desta função enxerga, mais os lugares em que o id ou o e-mail aparecem
--    como texto. Uma tabela de auth que o dono não enxerga não é conferida.
--    SECURITY DEFINER: lê tabelas sem acesso pela API. Só o papel de serviço.
create function public.account_leftovers(p_user uuid, p_email text default null)
returns table (place text, n bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  v_n bigint;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if p_user is null then
    return;
  end if;
  for r in
    select c.table_schema as s, c.table_name as t, c.column_name as col
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'private', 'auth') and c.data_type = 'uuid'
    order by 1, 2, 3
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.s, r.t, r.col) into v_n using p_user;
    if v_n > 0 then
      place := format('%s.%s.%s', r.s, r.t, r.col);
      n := v_n;
      return next;
    end if;
  end loop;

  -- O id guardado como texto.
  begin
    select count(*) into v_n from auth.refresh_tokens rt where rt.user_id::text = p_user::text;
    if v_n > 0 then place := 'auth.refresh_tokens.user_id'; n := v_n; return next; end if;
  exception when others then
    place := 'auth.refresh_tokens (não conferido)'; n := -1; return next;
  end;
  begin
    select count(*) into v_n from auth.audit_log_entries a
      where a.payload::text like '%' || p_user::text || '%'
         or (v_email is not null and position(v_email in lower(a.payload::text)) > 0);
    if v_n > 0 then place := 'auth.audit_log_entries.payload'; n := v_n; return next; end if;
  exception when others then
    place := 'auth.audit_log_entries (não conferido)'; n := -1; return next;
  end;

  if v_email is not null then
    select count(*) into v_n from auth.users u where lower(u.email) = v_email;
    if v_n > 0 then place := 'auth.users.email'; n := v_n; return next; end if;
    select count(*) into v_n from public.family_invites i where i.invited_email = v_email;
    if v_n > 0 then place := 'public.family_invites.invited_email'; n := v_n; return next; end if;
  end if;
end;
$$;

revoke execute on function
  public.session_recent_at(uuid, uuid, timestamptz),
  public.account_leftovers(uuid, text),
  public.families_forget_name()
from public, anon, authenticated;
grant execute on function
  public.session_recent_at(uuid, uuid, timestamptz),
  public.account_leftovers(uuid, text)
to service_role;

revoke execute on function private.sweep_ended_family(uuid) from public, anon, authenticated, service_role;

revoke execute on function public.session_is_recent(), public.delete_my_account() from public, anon;
grant execute on function public.session_is_recent(), public.delete_my_account() to authenticated;
```

- [ ] **Step 3: Aplicar e rodar (exige Docker)**

Run: `npx supabase db reset && npm run test:db -- tests/db/plano9.test.ts`
Expected: a migração aplica sem parar no bloco 0; **10 testes** passam. Depois `npm run test:db` inteiro: os testes dos Planos 1 a 8 continuam passando (em especial `plano7-saida` e `plano7-familia`, que agora passam pelo gatilho `families_forget_name`).

Sem Docker: `npx tsc --noEmit` (o arquivo de teste compila) e marque como **pendente** na Task 11.

Se o bloco 0 parar a aplicação, ou `leftovers` não ficar vazio por causa de uma tabela de `auth`: **não** contorne com a chave de serviço no app. Registre o que apareceu e pare para decisão (as saídas possíveis estão em "Ao rodar o banco pela primeira vez", na Task 11).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261003000001_seus_dados.sql tests/db/plano9.test.ts
git commit -m "feat(db): excluir o próprio cadastro com entrada recente, família encerrada sem nome e conferência do que sobra" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Exportar — leituras e montagem do arquivo

**Files:**
- Create: `src/features/dados/export-queries.ts`, `src/features/dados/export-queries.test.ts`, `src/features/dados/export-csv.ts`, `src/features/dados/export-csv.test.ts`

**Interfaces:**
- Consumes: `csvText`, `csvMoney`, `csvDate`, `csvMonth`, `csvLine`, `CSV_BOM` (Task 1); `TX_COLUMNS`/`toTxRow`/`TxRow` (`@/features/registro/tx-row`), `fetchAllPages` não é usado aqui (o arquivo é lido página a página); `MOVEMENT_COLUMNS`/`toMovementRow`/`GoalMovementRow`, `GOAL_COLUMNS`/`toGoalRow`; `CARD_COLUMNS`/`toCardRow`/`CardRow`/`CARD_KIND_LABELS`/`paymentText`; `cardColor` (`@/features/cartoes/palette`); `RECURRENCE_COLUMNS`/`toRecurrenceRow`/`RecurrenceRow`; `PLAN_COLUMNS`/`toPlanRow`/`PlanRow`; `BUDGET_COLUMNS`/`toBudgetRow`/`BudgetRow`; `resolvePrefs`, `PREF_LABELS`, `PREF_ORDER`, `PrefKind`; `orderCategories`; `createClient`, `requireUser`.
- Produces (`export-queries.ts`, `import 'server-only'`):

  ```ts
  export interface ExportGoal { id: string; name: string; targetCents: number; deadline: MonthKey | null; status: 'active' | 'used'; deletedOn: ISODate | null; family: boolean }
  export interface ExportData {
    profile: { displayName: string; email: string; initialBalanceCents: number; createdOn: ISODate }
    categories: { id: string; name: string }[]
    cards: CardRow[]
    recurrences: (RecurrenceRow & { familyId: string | null })[]
    plans: PlanRow[]
    goals: ExportGoal[]
    budgets: BudgetRow[]
    prefs: Record<PrefKind, boolean>
    family: { name: string; role: 'admin' | 'member'; joinedOn: ISODate } | null
  }
  export const EXPORT_PAGE = 1000
  export async function loadExportData(): Promise<ExportData>
  export function exportTransactionPages(): AsyncGenerator<TxRow[]>
  export function exportMovementPages(): AsyncGenerator<GoalMovementRow[]>
  ```
- Produces (`export-csv.ts`, sem `server-only`, puro):

  ```ts
  export function exportFileName(today: ISODate): string            // 'iris-meus-dados-2026-10-02.csv'
  export function exportCsv(data: ExportData, txPages: AsyncIterable<TxRow[]>, movePages: AsyncIterable<GoalMovementRow[]>): AsyncGenerator<string>
  ```

**O arquivo (decisões 137 a 139).** Um arquivo só, em blocos. Cada bloco: uma linha com o título, uma linha de cabeçalho, as linhas, e uma linha vazia (`\r\n`) depois. Bloco sem linhas aparece só com título e cabeçalho. Títulos e cabeçalhos são células de texto (`csvText`). Ordem e conteúdo:

| # | Título | Cabeçalho | De onde vem cada linha |
|---|---|---|---|
| 1 | `Cadastro` | Nome · E-mail · Quanto você tinha ao começar · Cadastro criado em | `profile` (uma linha) |
| 2 | `Registros` | Data · Tipo · Situação · Valor · Categoria · De onde veio · Nota · Como pagou · Parcela · Gasto da família · Pago com a meta · Parte paga pela meta · Vencimento | todo registro da pessoa, confirmado ou não. Data = `occurredOn`. Tipo: `Gasto`/`Entrada`. Situação: `Confirmado`; pendente: `A pagar` (gasto) ou `A receber` (entrada). Como pagou: `paymentText(tx, cards)`. Parcela: `{n} de {N}`. Gasto da família: `Sim`/`Não`. Pago com a meta: nome da meta (meta que a pessoa não alcança mais: `Meta da família`). Parte paga pela meta: só quando maior que zero. Vencimento: `dueOn` |
| 3 | `Contas e entradas que se repetem` | Nome · Tipo · Valor · Categoria · De onde veio · Frequência · Dia · Mês · Começou em · Encerrada em · Conta da família | todas as da pessoa, inclusive encerradas e as da família que ela criou. Tipo: `Conta`/`Entrada`. Frequência: `Todo mês`/`Todo ano`. Mês: número (só anual) |
| 4 | `Compras parceladas` | Data da compra · Total · Parcelas · Situação · Encerrada em | `Em andamento`/`Quitada`/`Devolvida` |
| 5 | `Cartões` | Apelido · Tipo · Cor | `CARD_KIND_LABELS`, `cardColor(color).label` |
| 6 | `Metas` | Nome · Valor da meta · Prazo · Situação · Meta da família | metas pessoais (inclusive excluídas) e as da família atual em que a pessoa tem movimento. Situação: `Excluída` se `deletedOn`; senão `Ativa`/`Usada`. Prazo: `mm/aaaa` |
| 7 | `Movimentos das metas` | Data · Meta · Movimento · Valor | só os movimentos da própria pessoa. `Guardou`/`Tirou`/`Usou`/`Voltou ao sair da família` |
| 8 | `Planejamento` | Mês · Categoria · Planejado | ordenado por mês e nome da categoria |
| 9 | `Categorias` | Nome | na ordem do app (`orderCategories`) |
| 10 | `Lembretes` | Lembrete · Ligado | os oito, na ordem `PREF_ORDER`, com `PREF_LABELS`; `Sim`/`Não` |
| 11 | `Família` | Família · Papel · Desde | só para quem participa de uma. `Administra`/`Participa` |

Categoria que não existe mais na lista: célula vazia. **Nunca** entra: uuid, endereço de push, fila de avisos, e-mail de convidado, nome ou gasto de outra pessoa.

- [ ] **Step 1: Escrever o teste das leituras**

`src/features/dados/export-queries.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ supabase: null as unknown, user: { id: 'u1', email: 'camila@teste.iris.dev' } }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => h.user }))

const q = await import('./export-queries')

type Read = { table: string; filters: string[]; range: [number, number] | null }
let reads: Read[] = []
let rows: Record<string, unknown[]> = {}
let failOn: { table: string; from: number } | null = null

// Construtor encadeável: registra a tabela e os filtros e responde com as linhas da tabela.
function fake() {
  return {
    from(table: string) {
      const read: Read = { table, filters: [], range: null }
      reads.push(read)
      const result = () => {
        if (failOn && failOn.table === table && read.range && read.range[0] >= failOn.from) return { data: null, error: { message: 'caiu' } }
        const all = rows[table] ?? []
        return { data: read.range ? all.slice(read.range[0], read.range[1] + 1) : all, error: null }
      }
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        eq: (c: string, v: unknown) => (read.filters.push(`eq:${c}=${String(v)}`), b),
        is: (c: string, v: unknown) => (read.filters.push(`is:${c}=${String(v)}`), b),
        in: (c: string) => (read.filters.push(`in:${c}`), b),
        range: (a: number, z: number) => ((read.range = [a, z]), b),
        single: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, no),
      }
      return b
    },
  }
}

const tx = (i: number) => ({
  id: `t${i}`, kind: 'expense', amount_cents: 100 + i, category_id: 'c1', source: null, note: null, payment_method: 'pix',
  occurred_on: '2026-10-01', status: 'confirmed', due_on: null, paid_on: null, created_at: '2026-10-01T12:00:00Z',
  card_id: null, card_deleted: false, installment_plan_id: null, installment_number: null, installment_count: null,
  goal_id: null, goal_funded_cents: 0, family_id: null,
})

beforeEach(() => {
  reads = []
  failOn = null
  rows = {
    profiles: [{ display_name: 'Camila', initial_balance_cents: 100000, created_at: '2026-09-01T15:00:00Z' }],
    categories: [{ id: 'c1', name: 'Mercado', default_key: 'mercado', sort_order: 2 }],
    family_members: [],
  }
  h.supabase = fake()
})

async function drain<T>(pages: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = []
  for await (const p of pages) out.push(p)
  return out
}

test('toda leitura é da própria pessoa; nada de push, fila de avisos, convites ou avisos da família', async () => {
  const data = await q.loadExportData()
  await drain(q.exportTransactionPages())
  await drain(q.exportMovementPages())
  expect(data.profile).toEqual({ displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 100000, createdOn: '2026-09-01' })
  expect(data.family).toBeNull()
  const tables = [...new Set(reads.map((r) => r.table))].sort()
  expect(tables).toEqual([
    'budgets', 'cards', 'categories', 'family_members', 'goal_movements', 'goals', 'installment_plans',
    'notification_prefs', 'profiles', 'recurrences', 'transactions',
  ])
  for (const r of reads) {
    const own = r.table === 'profiles' ? 'eq:id=u1' : 'eq:user_id=u1'
    expect(r.filters, r.table).toContain(own)
  }
})

test('com família: lê só a própria participação, o nome da família dela e as metas dessa família', async () => {
  rows.family_members = [{ family_id: 'f1', role: 'member', joined_at: '2026-09-10T12:00:00Z' }]
  rows.families = [{ id: 'f1', name: 'Família Souza' }]
  rows.goals = []
  const data = await q.loadExportData()
  expect(data.family).toEqual({ name: 'Família Souza', role: 'member', joinedOn: '2026-09-10' })
  const members = reads.filter((r) => r.table === 'family_members')
  expect(members).toHaveLength(1)
  expect(members[0].filters).toEqual(expect.arrayContaining(['eq:user_id=u1', 'is:left_at=null']))
  expect(reads.find((r) => r.table === 'families')?.filters).toEqual(['eq:id=f1'])
  const familyGoals = reads.filter((r) => r.table === 'goals' && r.filters.includes('eq:family_id=f1'))
  expect(familyGoals).toHaveLength(1)
})

test('os registros vêm em páginas de 1000, até a última', async () => {
  rows.transactions = Array.from({ length: 2300 }, (_, i) => tx(i))
  const pages = await drain(q.exportTransactionPages())
  expect(pages.map((p) => p.length)).toEqual([1000, 1000, 300])
  expect(pages[2][299].amountCents).toBe(2399)
  expect(reads.filter((r) => r.table === 'transactions').map((r) => r.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
})

test('erro numa página interrompe a leitura (não devolve um arquivo pela metade)', async () => {
  rows.transactions = Array.from({ length: 2300 }, (_, i) => tx(i))
  failOn = { table: 'transactions', from: 1000 }
  const pages = q.exportTransactionPages()
  expect((await pages.next()).value).toHaveLength(1000)
  await expect(pages.next()).rejects.toBeTruthy()
})
```

- [ ] **Step 2: Escrever o teste do arquivo**

`src/features/dados/export-csv.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { GoalMovementRow } from '@/features/metas/types'
import type { TxRow } from '@/features/registro/tx-row'
import type { ExportData } from './export-queries'
import { exportCsv, exportFileName } from './export-csv'

const base: TxRow = {
  id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', kind: 'expense', amountCents: 14230, categoryId: 'c-mercado', source: null, note: null,
  paymentMethod: null, occurredOn: '2026-10-02', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0,
  createdAt: '2026-10-02T12:00:00Z', cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null,
  installmentCount: null, goalId: null, familyId: null,
}
const data: ExportData = {
  profile: { displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 100000, createdOn: '2026-09-01' },
  categories: [{ id: 'c-casa', name: 'Casa' }, { id: 'c-mercado', name: 'Mercado' }, { id: 'c-lazer', name: 'Lazer' }, { id: 'c-extras', name: '+Extras' }],
  cards: [{ id: 'k1', nickname: 'Roxinho', kind: 'credit', color: 'purple' }],
  recurrences: [{
    id: 'r1', kind: 'expense', name: 'Luz', amountCents: 18000, categoryId: 'c-casa', source: null, frequency: 'monthly',
    dueDay: 10, dueMonth: null, startsOn: '2026-09-01', endedOn: null, familyId: null,
  }],
  plans: [{ id: 'p1', totalCents: 60000, count: 6, purchasedOn: '2026-09-02', status: 'active', closedOn: null }],
  goals: [
    { id: 'g1', name: 'Viagem', targetCents: 400000, deadline: '2027-03', status: 'active', deletedOn: null, family: false },
    { id: 'g2', name: '@casa', targetCents: 100000, deadline: null, status: 'active', deletedOn: '2026-09-20', family: false },
  ],
  budgets: [{ month: '2026-10', categoryId: 'c-mercado', amountCents: 80000 }],
  prefs: { bills: true, income: true, budget: true, goal: true, summary: true, daily: false, comeback: true, family: true },
  family: null,
}
const txs: TxRow[] = [
  { ...base, note: '=1+1', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 6, familyId: 'f1' },
  { ...base, id: 't2', kind: 'income', amountCents: 500000, categoryId: null, source: 'Salário', occurredOn: '2026-10-01' },
  { ...base, id: 't3', amountCents: 18000, categoryId: 'c-casa', occurredOn: '2026-10-10', status: 'pending', dueOn: '2026-10-10' },
  { ...base, id: 't4', amountCents: 150000, categoryId: 'c-lazer', occurredOn: '2026-09-30', goalId: 'g1', goalFundedCents: 100000 },
  { ...base, id: 't5', amountCents: 990, categoryId: 'c-extras', note: 'diz "oi"; fim\nsegunda linha', paymentMethod: 'pix' },
]
const moves: GoalMovementRow[] = [
  { id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 100000, occurredOn: '2026-09-15', transactionId: null, createdAt: '2026-09-15T12:00:00Z' },
  { id: 'm2', goalId: 'outra-familia', kind: 'return_on_exit', amountCents: 5000, occurredOn: '2026-09-18', transactionId: null, createdAt: '2026-09-18T12:00:00Z' },
]

async function* pages<T>(...p: T[][]) {
  for (const page of p) yield page
}
async function build(d: ExportData = data): Promise<string> {
  let out = ''
  for await (const part of exportCsv(d, pages(txs.slice(0, 3), txs.slice(3)), pages(moves))) out += part
  return out
}
const TITLES = ['Cadastro', 'Registros', 'Contas e entradas que se repetem', 'Compras parceladas', 'Cartões', 'Metas', 'Movimentos das metas', 'Planejamento', 'Categorias', 'Lembretes']

test('nome do arquivo sem dado pessoal', () => {
  expect(exportFileName('2026-10-02')).toBe('iris-meus-dados-2026-10-02.csv')
})

test('começa com a marca de UTF-8, tem os blocos na ordem e toda linha termina em \\r\\n', async () => {
  const csv = await build()
  expect(csv.startsWith('﻿"Cadastro"\r\n')).toBe(true)
  const positions = TITLES.map((t) => csv.indexOf(`\r\n"${t}"\r\n`) === -1 ? csv.indexOf(`"${t}"\r\n`) : csv.indexOf(`\r\n"${t}"\r\n`))
  expect(positions.every((p) => p >= 0)).toBe(true)
  expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  expect(csv).not.toContain('"Família"\r\n')
  expect(csv.endsWith('\r\n')).toBe(true)
  expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  expect(csv).not.toMatch(/undefined|null|NaN|\[object/)
  // nenhum identificador interno
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  expect(csv).not.toContain('k1')
})

test('cadastro e registros: cabeçalho e linhas exatas', async () => {
  const csv = await build()
  expect(csv).toContain('"Nome";"E-mail";"Quanto você tinha ao começar";"Cadastro criado em"\r\n"Camila";"camila@teste.iris.dev";1000,00;01/09/2026\r\n\r\n')
  expect(csv).toContain(
    '"Data";"Tipo";"Situação";"Valor";"Categoria";"De onde veio";"Nota";"Como pagou";"Parcela";"Gasto da família";"Pago com a meta";"Parte paga pela meta";"Vencimento"\r\n',
  )
  // uma nota com fórmula sai neutralizada na linha do registro
  expect(csv).toContain(`02/10/2026;"Gasto";"Confirmado";142,30;"Mercado";;"'=1+1";"Roxinho";"2 de 6";"Sim";;;\r\n`)
  expect(csv).toContain('01/10/2026;"Entrada";"Confirmado";5000,00;;"Salário";;;;"Não";;;\r\n')
  expect(csv).toContain('10/10/2026;"Gasto";"A pagar";180,00;"Casa";;;;;"Não";;;10/10/2026\r\n')
  expect(csv).toContain('30/09/2026;"Gasto";"Confirmado";1500,00;"Lazer";;;;;"Não";"Viagem";1000,00;\r\n')
  expect(csv).toContain(`02/10/2026;"Gasto";"Confirmado";9,90;"'+Extras";;"diz ""oi""; fim segunda linha";"Pix";;"Não";;;\r\n`)
})

test('os outros blocos', async () => {
  const csv = await build()
  expect(csv).toContain('"Luz";"Conta";180,00;"Casa";;"Todo mês";10;;01/09/2026;;"Não"\r\n')
  expect(csv).toContain('02/09/2026;600,00;6;"Em andamento";\r\n')
  expect(csv).toContain('"Roxinho";"Crédito";"Roxo"\r\n')
  expect(csv).toContain('"Viagem";4000,00;03/2027;"Ativa";"Não"\r\n')
  expect(csv).toContain(`"'@casa";1000,00;;"Excluída";"Não"\r\n`)
  expect(csv).toContain('15/09/2026;"Viagem";"Guardou";1000,00\r\n')
  expect(csv).toContain('18/09/2026;"Meta da família";"Voltou ao sair da família";50,00\r\n')
  expect(csv).toContain('10/2026;"Mercado";800,00\r\n')
  expect(csv).toContain('"Lembrete";"Ligado"\r\n"Contas perto do vencimento";"Sim"\r\n')
  expect(csv).toContain('"Lembrete para anotar";"Não"\r\n')
  expect(csv.match(/";"(Sim|Não)"\r\n/g)!.length).toBeGreaterThanOrEqual(8)
})

test('com família, o último bloco é o dela; bloco vazio fica só com título e cabeçalho', async () => {
  const csv = await build({ ...data, cards: [], family: { name: 'Família Souza', role: 'admin', joinedOn: '2026-09-10' } })
  expect(csv).toContain('"Cartões"\r\n"Apelido";"Tipo";"Cor"\r\n\r\n')
  expect(csv.endsWith('"Família"\r\n"Família";"Papel";"Desde"\r\n"Família Souza";"Administra";10/09/2026\r\n\r\n')).toBe(true)
})

test('erro numa página de registros interrompe o arquivo', async () => {
  async function* broken(): AsyncGenerator<TxRow[]> {
    yield txs.slice(0, 1)
    throw new Error('caiu')
  }
  const it = exportCsv(data, broken(), pages(moves))
  let failed = false
  try {
    for await (const _part of it) void _part
  } catch {
    failed = true
  }
  expect(failed).toBe(true)
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/features/dados`
Expected: FAIL (módulos não existem).

- [ ] **Step 4: Implementar `export-queries.ts`**

Uma conexão (`createClient()`), id só de `requireUser()`. `loadExportData` lê em paralelo: `profiles` (`display_name, initial_balance_cents, created_at`, `.eq('id', user.id).single()`), `categories`, `cards`, `recurrences` (`RECURRENCE_COLUMNS + ', family_id'`, **sem** os filtros de encerrada/família de `loadRecurrences`), `installment_plans`, `goals` pessoais (sem filtrar excluídas), `budgets`, `notification_prefs`, e a própria participação (`family_members`, `family_id, role, joined_at`, `.eq('user_id', user.id).is('left_at', null).maybeSingle()`). Todas com `.eq('user_id', user.id)`. Com participação: `families` (`.eq('id', familyId)`) e as metas dessa família (`.eq('family_id', familyId)`, com as excluídas), marcadas `family: true`. Datas com hora viram dia por `todayInSaoPaulo(new Date(valor))`. Qualquer `error` lança.
`exportTransactionPages` e `exportMovementPages` são geradores: leem com `.range(from, from + EXPORT_PAGE - 1)`, na mesma ordem de `loadLedger`/`fetchGoalMovements` (`occurred_on` desc, `created_at` desc, `id`), entregam a página convertida (`toTxRow`/`toMovementRow`), param quando a página vem com menos de `EXPORT_PAGE` linhas e lançam no primeiro `error`. **Não** usam `personalLedger`: as contas da família que a pessoa criou e ainda não foram pagas são linhas dela e entram no arquivo.

- [ ] **Step 5: Implementar `export-csv.ts`**

`exportCsv` entrega, em ordem: `CSV_BOM` + bloco 1; título e cabeçalho do bloco 2, depois um texto por página de registros, depois a linha vazia; blocos 3 a 6; título e cabeçalho do bloco 7, um texto por página de movimentos, linha vazia; blocos 8 a 11. Os nomes de categoria, cartão e meta vêm de mapas montados uma vez a partir de `data`. Não captura erro das páginas (o erro sobe para a rota).

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/features/dados && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/dados
git commit -m "feat(dados): leituras e montagem do arquivo CSV com tudo o que é da pessoa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Exportar — rota de download e tela "Baixar meus dados"

**Files:**
- Create: `src/app/(app)/configuracoes/dados/exportar/route.ts`, `src/app/(app)/configuracoes/dados/exportar/route.test.ts`, `src/app/(app)/configuracoes/dados/page.tsx`

**Interfaces:**
- Consumes: `loadExportData`, `exportTransactionPages`, `exportMovementPages` (Task 3); `exportCsv`, `exportFileName`; `requireUser`; `todayInSaoPaulo`.
- Produces: `GET /configuracoes/dados/exportar` (download) e a página `/configuracoes/dados`. A Task 6 liga "Baixar meus dados antes" a `/configuracoes/dados`; a Task 10, a linha de Configurações.

- [ ] **Step 1: Escrever o teste da rota**

`src/app/(app)/configuracoes/dados/exportar/route.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return {
    RedirectSignal,
    requireUser: vi.fn(async () => ({ id: 'u1', email: 'camila@teste.iris.dev' })),
    loadExportData: vi.fn(async () => ({ marker: 'data' })),
    parts: ['﻿"Cadastro"\r\n', '"Registros"\r\n'] as (string | Error)[],
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ requireUser: h.requireUser }))
vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => { if (e instanceof h.RedirectSignal) throw e } }))
vi.mock('@/features/dados/export-queries', () => ({
  loadExportData: h.loadExportData,
  exportTransactionPages: () => 'tx-pages',
  exportMovementPages: () => 'move-pages',
}))
vi.mock('@/features/dados/export-csv', () => ({
  exportFileName: (d: string) => `iris-meus-dados-${d}.csv`,
  exportCsv: async function* (data: unknown, tx: unknown, moves: unknown) {
    expect([data, tx, moves]).toEqual([{ marker: 'data' }, 'tx-pages', 'move-pages'])
    for (const p of h.parts) {
      if (p instanceof Error) throw p
      yield p
    }
  },
}))

const route = await import('./route')
const get = (headers: Record<string, string> = {}) => route.GET(new Request('http://localhost:3000/configuracoes/dados/exportar', { headers }))

beforeEach(() => {
  h.requireUser.mockClear()
  h.loadExportData.mockClear()
  h.loadExportData.mockImplementation(async () => ({ marker: 'data' }))
  h.requireUser.mockImplementation(async () => ({ id: 'u1', email: 'camila@teste.iris.dev' }))
  h.parts = ['﻿"Cadastro"\r\n', '"Registros"\r\n']
})

test('só GET; nunca guardado; arquivo com nome sem dado pessoal', async () => {
  expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic', 'runtime'])
  expect(route.dynamic).toBe('force-dynamic')
  const res = await get({ 'sec-fetch-site': 'same-origin' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('no-store, max-age=0')
  expect(res.headers.get('x-robots-tag')).toBe('noindex')
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="iris-meus-dados-\d{4}-\d{2}-\d{2}\.csv"$/)
  expect(res.headers.get('content-disposition')).not.toMatch(/camila|u1/i)
  const bytes = new Uint8Array(await res.arrayBuffer())
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  expect(new TextDecoder().decode(bytes)).toBe('"Cadastro"\r\n"Registros"\r\n')
})

test('sem sessão nada é lido: requireUser decide antes de qualquer leitura', async () => {
  h.requireUser.mockImplementation(async () => {
    throw new h.RedirectSignal('/entrar')
  })
  await expect(get()).rejects.toMatchObject({ url: '/entrar' })
  expect(h.loadExportData).not.toHaveBeenCalled()
})

test('pedido de outro site volta para a tela, sem ler nada; digitar o endereço e seguir um link da própria Íris baixam', async () => {
  for (const site of ['cross-site', 'same-site']) {
    const res = await get({ 'sec-fetch-site': site })
    expect(res.status, site).toBe(303)
    expect(res.headers.get('location')).toBe('/configuracoes/dados')
    expect(res.headers.get('cache-control')).toBe('no-store, max-age=0')
  }
  expect(h.loadExportData).not.toHaveBeenCalled()
  expect((await get({ 'sec-fetch-site': 'none' })).status).toBe(200)
  expect((await get()).status).toBe(200)
})

test('falha antes de começar volta para a tela com o aviso; falha no meio interrompe o envio', async () => {
  h.loadExportData.mockImplementation(async () => {
    throw new Error('caiu')
  })
  const before = await get()
  expect(before.status).toBe(303)
  expect(before.headers.get('location')).toBe('/configuracoes/dados?erro=1')

  h.loadExportData.mockImplementation(async () => ({ marker: 'data' }))
  h.parts = ['﻿"Cadastro"\r\n', new Error('caiu no meio')]
  const res = await get()
  expect(res.status).toBe(200)
  await expect(res.text()).rejects.toBeTruthy()
})

test('o service worker não guarda nada do app, e a tela usa um link simples (sem pré-carregamento)', () => {
  const sw = readFileSync('public/sw.js', 'utf8')
  expect(sw).not.toMatch(/cache\.put\(|configuracoes/)
  expect(sw).toMatch(/const PRECACHE = \[OFFLINE_URL, '\/icons\/icon-192\.png'\]/)
  const page = readFileSync('src/app/(app)/configuracoes/dados/page.tsx', 'utf8')
  expect(page).toMatch(/<a\s[^>]*href="\/configuracoes\/dados\/exportar"/)
  expect(page).not.toMatch(/from 'next\/link'|<Button[^>]*href/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(app)/configuracoes/dados"`
Expected: FAIL.

- [ ] **Step 3: Escrever a rota**

`src/app/(app)/configuracoes/dados/exportar/route.ts` (completa: a forma dela é a decisão de segurança):

```ts
import { unstable_rethrow } from 'next/navigation'
import { todayInSaoPaulo } from '@/domain/dates'
import { exportCsv, exportFileName } from '@/features/dados/export-csv'
import { exportMovementPages, exportTransactionPages, loadExportData, type ExportData } from '@/features/dados/export-queries'
import { requireUser } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = 'no-store, max-age=0'
const back = (query = '') => new Response(null, { status: 303, headers: { location: `/configuracoes/dados${query}`, 'cache-control': NO_STORE } })

// O arquivo com tudo o que é da pessoa. Só GET, só com sessão (sem sessão,
// requireUser leva a Entrar antes de qualquer leitura). Nunca é guardado: nem
// pelo navegador, nem por intermediário, nem pelo service worker (que não
// guarda nada do app). Um link em outro site não faz o download acontecer.
// Enviado em partes: uma falha no meio interrompe o envio, e o navegador
// mostra o download como incompleto — nunca um arquivo pela metade com cara
// de completo.
export async function GET(request: Request): Promise<Response> {
  await requireUser()
  const site = request.headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin' && site !== 'none') return back()

  let data: ExportData
  try {
    data = await loadExportData()
  } catch (e) {
    unstable_rethrow(e)
    return back('?erro=1')
  }

  const parts = exportCsv(data, exportTransactionPages(), exportMovementPages())
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await parts.next()
        if (done) controller.close()
        else controller.enqueue(encoder.encode(value))
      } catch (e) {
        controller.error(e)
      }
    },
    async cancel() {
      await parts.return(undefined)
    },
  })
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(todayInSaoPaulo())}"`,
      'cache-control': NO_STORE,
      'x-robots-tag': 'noindex',
    },
  })
}
```

- [ ] **Step 4: Escrever a página `/configuracoes/dados`**

Server Component, `searchParams: Promise<{ erro?: string }>`. `PageHeader title="Baixar meus dados" backHref="/configuracoes"`; com `erro`, `FormAlert` com "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."; os dois parágrafos (textos novos 3 e 4); e o link **simples** `<a href="/configuracoes/dados/exportar">Baixar arquivo</a>` com as classes do botão principal (`src/ui/button.tsx`), altura mínima de 44 px. Não usar `next/link` nem `Button href`: o pré-carregamento do `Link` chamaria a rota sem a pessoa pedir.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run "src/app/(app)/configuracoes/dados" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/dados"
git commit -m "feat(dados): baixar meus dados em CSV, com sessão, sem cache e em partes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Excluir o cadastro — ação do servidor

**Files:**
- Create: `src/features/cadastro/state.ts`, `src/features/cadastro/reauth.ts`, `src/features/cadastro/session.ts`, `src/features/cadastro/session.test.ts`, `src/features/cadastro/actions.ts`, `src/features/cadastro/actions.test.ts`

**Interfaces:**
- Consumes: `isDeleteConfirmed` (Task 1); `delete_my_account`, `session_is_recent` (Task 2); `UNEXPECTED` (`@/features/auth/errors`); `errorState`, `FormState`.
- Produces:
  - `state.ts`: `REAUTH_DELETE = 'Por segurança, saia e entre de novo antes de excluir o cadastro.'`, `REAUTH_EMAIL = 'Por segurança, saia e entre de novo antes de trocar o e-mail.'`, `CONFIRM_HINT = 'Digite EXCLUIR para confirmar.'`, `type ConfirmEmailState = { status: 'idle' | 'half' | 'done' | 'invalid' }`, `confirmIdle: ConfirmEmailState`.
  - `reauth.ts` (`server-only`): `isSessionRecent(supabase: SupabaseClient): Promise<boolean>` — `true` só quando `rpc('session_is_recent')` responde sem erro e com `true`.
  - `session.ts` (`server-only`): `endLocalSession(supabase: SupabaseClient): Promise<void>` — nunca lança.
  - `actions.ts` (`'use server'`): `deleteAccount(_: FormState, fd: FormData): Promise<FormState>`. (As Tasks 7 acrescentam `requestEmailChange` e `confirmEmailChange` ao mesmo arquivo.)

- [ ] **Step 1: Escrever os testes**

`src/features/cadastro/session.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ jar: [] as { name: string }[], deleted: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => h.jar, delete: (name: string) => void h.deleted.push(name) }),
}))
const { endLocalSession } = await import('./session')

beforeEach(() => {
  h.deleted = []
  h.jar = [
    { name: 'sb-127-auth-token' }, { name: 'sb-127-auth-token.0' }, { name: 'sb-127-auth-token.1' },
    { name: 'sb-127-auth-token-code-verifier' }, { name: 'iris_flash' }, { name: 'outro' },
  ]
})

test('sai só deste aparelho e apaga os cookies da sessão que tiverem sobrado', async () => {
  const signOut = vi.fn(async () => ({ error: null }))
  await endLocalSession({ auth: { signOut } } as never)
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(h.deleted.sort()).toEqual(['sb-127-auth-token', 'sb-127-auth-token-code-verifier', 'sb-127-auth-token.0', 'sb-127-auth-token.1'])
})

test('nunca lança: o serviço de login recusando (cadastro já excluído) ou fora do ar não prende a pessoa', async () => {
  await expect(endLocalSession({ auth: { signOut: async () => ({ error: { status: 403 } }) } } as never)).resolves.toBeUndefined()
  await expect(endLocalSession({ auth: { signOut: async () => { throw new Error('rede') } } } as never)).resolves.toBeUndefined()
  expect(h.deleted).toHaveLength(8)
})
```

`src/features/cadastro/actions.test.ts` (parte da exclusão; a Task 7 acrescenta ao mesmo arquivo):

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
  return {
    RedirectSignal,
    supabase: null as unknown,
    stateless: null as unknown,
    user: { id: 'u1', email: 'ana@teste.iris.dev' },
    endLocalSession: vi.fn(async (_s: unknown) => {}),
    hasPassword: true,
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => h.user }))
vi.mock('@/lib/supabase/stateless', () => ({ createStatelessClient: () => h.stateless }))
vi.mock('./session', () => ({ endLocalSession: h.endLocalSession }))
vi.mock('./queries', () => ({ loadSignIn: async () => ({ hasPassword: h.hasPassword, pendingEmail: null, sessionRecent: true }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const REAUTH_DELETE = 'Por segurança, saia e entre de novo antes de excluir o cadastro.'
const HINT = 'Digite EXCLUIR para confirmar.'
const idle = { status: 'idle' } as const
type Result = { data?: unknown; error?: { message?: string; code?: string; status?: number } | null }

let rpcCalls: { fn: string; args: unknown }[] = []
let rpcQueue: Record<string, Result[]> = {}
let updateUser = vi.fn(async (_a: unknown) => ({ error: null as Result['error'] }))

function fake() {
  return {
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcQueue[fn]?.shift() ?? { data: null, error: { message: `sem resposta para ${fn}` } }
    },
    auth: { updateUser: (a: unknown) => updateUser(a) },
  }
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const calls = (fn: string) => rpcCalls.filter((c) => c.fn === fn)

beforeEach(() => {
  rpcCalls = []
  rpcQueue = {}
  updateUser = vi.fn(async () => ({ error: null }))
  h.endLocalSession.mockClear()
  h.hasPassword = true
  h.supabase = fake()
  h.stateless = null
})

describe('deleteAccount', () => {
  test.each(['', 'excluir', 'Excluir', 'EXCLUIR!', 'sim'])('sem a palavra EXCLUIR nada é chamado: %j', async (typed) => {
    const state = await actions.deleteAccount(idle, form({ confirm: typed }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { confirm: HINT } })
    expect(rpcCalls).toEqual([])
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('com EXCLUIR: chama a função sem nenhum parâmetro, encerra a sessão e leva à página pública', async () => {
    rpcQueue.delete_my_account = [{ data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: ' EXCLUIR ' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(rpcCalls).toEqual([{ fn: 'delete_my_account', args: undefined }])
    expect(h.endLocalSession).toHaveBeenCalledTimes(1)
  })

  test('nenhum campo do formulário vira parâmetro (não dá para apontar para outra pessoa)', async () => {
    rpcQueue.delete_my_account = [{ data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR', user_id: 'outra', p_user: 'outra', id: 'outra' }))).rejects.toBeInstanceOf(h.RedirectSignal)
    expect(rpcCalls).toEqual([{ fn: 'delete_my_account', args: undefined }])
  })

  test('40P01 uma vez: tenta de novo e segue', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '40P01', message: 'deadlock detected' } }, { data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(calls('delete_my_account')).toHaveLength(2)
  })

  test('40P01 duas vezes: para, com o aviso calmo; a sessão continua', async () => {
    const deadlock = { data: null, error: { code: '40P01', message: 'deadlock detected' } }
    rpcQueue.delete_my_account = [deadlock, deadlock, { data: true, error: null }]
    expect(await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(calls('delete_my_account')).toHaveLength(2)
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('outro erro não é repetido', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '57014', message: 'timeout' } }, { data: true, error: null }]
    expect(await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(calls('delete_my_account')).toHaveLength(1)
  })

  test('entrada antiga: pede para sair e entrar de novo', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '42501', message: 'Entrada recente necessária.' } }]
    const state = await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))
    expect(state).toMatchObject({ status: 'error', message: REAUTH_DELETE, code: 'reauth' })
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('já excluído (toque duplo, outra aba): encerra a sessão e segue, sem erro', async () => {
    rpcQueue.delete_my_account = [{ data: false, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(h.endLocalSession).toHaveBeenCalledTimes(1)
  })
})
```

Os dois `vi.mock` de `@/lib/supabase/stateless` e `./queries` apontam para arquivos das Tasks 6 e 7. Se o Vitest recusar um módulo que ainda não existe, deixe essas duas linhas para a Task 7 (a exclusão não usa nenhum dos dois).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/cadastro`
Expected: FAIL.

- [ ] **Step 3: Implementar `state.ts`, `reauth.ts` e `session.ts`**

`endLocalSession`: `supabase.auth.signOut({ scope: 'local' })` dentro de `try` (erro devolvido ou lançado é ignorado: com o cadastro já excluído o serviço de login responde 403/404); depois, com `cookies()` de `next/headers`, apaga todo cookie cujo nome casa com `/^sb-.+-auth-token(\.\d+)?$/` ou `/^sb-.+-auth-token-code-verifier$/`. Só esses.

- [ ] **Step 4: Implementar `deleteAccount`**

```ts
export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  if (!isDeleteConfirmed(String(fd.get('confirm') ?? ''))) return errorState({ fieldErrors: { confirm: CONFIRM_HINT } })
  const supabase = await createClient()
  let result = await supabase.rpc('delete_my_account')
  // Impasse com outra gravação no mesmo instante: nada foi apagado; uma nova tentativa resolve.
  if (result.error?.code === '40P01') result = await supabase.rpc('delete_my_account')
  if (result.error) {
    if ((result.error.message ?? '').includes('Entrada recente necessária')) return errorState({ message: REAUTH_DELETE, code: 'reauth' })
    return errorState({ message: UNEXPECTED })
  }
  // true: excluído agora. false: já estava excluído. Nos dois casos a sessão termina aqui.
  await endLocalSession(supabase)
  redirect('/cadastro-excluido')
}
```

Nada é escrito em log (nem o e-mail, nem o id).

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/features/cadastro src/features/notificacoes/no-service-key.test.ts && npx tsc --noEmit`
Expected: PASS (a guarda da chave de serviço continua verde).

- [ ] **Step 6: Commit**

```bash
git add src/features/cadastro
git commit -m "feat(cadastro): ação de excluir o cadastro com entrada recente e nova tentativa em impasse" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Excluir o cadastro — tela, página "cadastro excluído" e caminhos públicos

**Files:**
- Create: `src/features/cadastro/queries.ts`, `src/features/cadastro/queries.test.ts`, `src/features/cadastro/delete-form.tsx`, `src/features/cadastro/delete-form.test.tsx`, `src/features/cadastro/forget-device.tsx`, `src/features/cadastro/forget-device.test.tsx`, `src/app/(app)/configuracoes/excluir/page.tsx`, `src/app/(auth)/cadastro-excluido/page.tsx`
- Modify: `src/features/auth/routes.ts`, `src/features/auth/routes.test.ts`

**Interfaces:**
- Consumes: `deleteAccount`, `isSessionRecent`, `REAUTH_DELETE`, `CONFIRM_HINT` (Task 5); `deletionNotice`, `familyShareCents`, `DeletionNotice` (Task 1); `loadMyFamily`, `loadFamilyGoals` (`@/features/familia/queries`); `fetchGoalMovements`; `SignOutButton`; `formatBRL`.
- Produces (`queries.ts`, `server-only`):

  ```ts
  export async function loadSignIn(): Promise<{ hasPassword: boolean; pendingEmail: string | null; sessionRecent: boolean }>
  export async function loadDeletionContext(): Promise<{ notice: DeletionNotice; shareCents: number; passesAdmin: boolean; sessionRecent: boolean }>
  ```
  `hasPassword`: `user.app_metadata.providers` (de `supabase.auth.getUser()`) inclui `'email'`. `pendingEmail`: `user.new_email` ou `null`.
- Produces: `DeleteForm({ notice, shareCents, passesAdmin }: { notice: DeletionNotice; shareCents: number; passesAdmin: boolean })`, `ForgetDevice()`.

**Textos da tela (copy oficial, com "cadastro" no lugar de "conta" — conflito 1):**
- Título: "Excluir seu cadastro"
- Aviso `everything`: "Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito."
- Aviso `family-history` (RF-53): "Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome." e, em seguida, "Isso não pode ser desfeito."
- Só quando `shareCents > 0` (RN-22e): "Sua parte nas metas da família ({valor}) também sairá delas." — `{valor}` com `formatBRL`.
- Só quando `passesAdmin` (texto novo 1): "A administração da família passa para quem participa há mais tempo."
- Link: "Baixar meus dados antes" → `/configuracoes/dados`
- Campo: rótulo "Digite EXCLUIR para confirmar." (o mesmo texto é a mensagem de erro do campo)
- Botões: "Excluir meu cadastro" (envia) · "Manter meu cadastro" (link para `/configuracoes`)
- Depois (`/cadastro-excluido`): título "Seu cadastro foi excluído." e parágrafo "Obrigado por ter usado a Íris."

- [ ] **Step 1: Escrever os testes**

`src/features/cadastro/delete-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as Record<string, unknown>, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ deleteAccount: async () => ({ status: 'idle' }) }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sair da Íris</button> }))

const { DeleteForm } = await import('./delete-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
})

const ALL = 'Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito.'
const FAMILY = 'Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome.'

test('sem histórico de família: o texto da copy, o link para baixar antes, o campo e os dois botões', () => {
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByText(ALL)).toBeTruthy()
  expect(screen.queryByText(FAMILY)).toBeNull()
  expect(screen.queryByText(/também sairá delas/)).toBeNull()
  expect(screen.queryByText(/A administração da família/)).toBeNull()
  expect(screen.getByRole('link', { name: 'Baixar meus dados antes' }).getAttribute('href')).toBe('/configuracoes/dados')
  const field = screen.getByLabelText('Digite EXCLUIR para confirmar.') as HTMLInputElement
  expect(field.name).toBe('confirm')
  expect(field.getAttribute('autocomplete')).toBe('off')
  expect(screen.getByRole('button', { name: 'Excluir meu cadastro' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Manter meu cadastro' }).getAttribute('href')).toBe('/configuracoes')
})

test('com gastos na família: o texto aprovado do RF-53, a parte nas metas com o valor e o aviso da administração', () => {
  render(<DeleteForm notice="family-history" shareCents={3000} passesAdmin />)
  expect(screen.getByText(FAMILY)).toBeTruthy()
  expect(screen.getByText('Isso não pode ser desfeito.')).toBeTruthy()
  expect(screen.queryByText(ALL)).toBeNull()
  const share = screen.getByText(/também sairá delas/)
  expect(share.textContent!.replace(/ /g, ' ')).toBe('Sua parte nas metas da família (R$ 30,00) também sairá delas.')
  expect(screen.getByText('A administração da família passa para quem participa há mais tempo.')).toBeTruthy()
})

test('palavra errada: o campo mostra o erro; enquanto envia, o botão fica desativado (dois toques não enviam duas vezes)', () => {
  h.state = { status: 'error', submission: 1, fieldErrors: { confirm: 'Digite EXCLUIR para confirmar.' } }
  h.pending = true
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  expect((screen.getByRole('button', { name: 'Excluir meu cadastro' }) as HTMLButtonElement).disabled).toBe(true)
})

test('entrada antiga na hora de enviar: o aviso e "Sair da Íris"', () => {
  h.state = { status: 'error', submission: 2, message: 'Por segurança, saia e entre de novo antes de excluir o cadastro.', code: 'reauth' }
  render(<DeleteForm notice="everything" shareCents={0} passesAdmin={false} />)
  expect(screen.getByRole('alert').textContent).toBe('Por segurança, saia e entre de novo antes de excluir o cadastro.')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})
```

`src/features/cadastro/forget-device.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { ForgetDevice } from './forget-device'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

test('apaga a inscrição de push deste navegador e o que a Íris guardou nele', async () => {
  const unsubscribe = vi.fn(async () => true)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }) },
  })
  window.localStorage.setItem('iris:lembretes:depois', '1')
  render(<ForgetDevice />)
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1))
  expect(window.localStorage.getItem('iris:lembretes:depois')).toBeNull()
})

test('sem service worker, ou com erro, não mostra nada e não lança', async () => {
  const { container } = render(<ForgetDevice />)
  expect(container.innerHTML).toBe('')
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => { throw new Error('x') } } })
  expect(() => render(<ForgetDevice />)).not.toThrow()
})
```

`src/features/cadastro/queries.test.ts`: seguindo o fake encadeável da Task 3 (`from` registra tabela e filtros; `rpc` por nome; `auth.getUser` devolve o usuário do teste), com estes testes e afirmações:

```ts
test('loadSignIn: senha, troca pendente e entrada recente vêm do próprio cadastro', async () => {
  setUser({ app_metadata: { providers: ['email', 'google'] }, new_email: 'nova@teste.iris.dev' })
  rpcData('session_is_recent', true)
  expect(await q.loadSignIn()).toEqual({ hasPassword: true, pendingEmail: 'nova@teste.iris.dev', sessionRecent: true })
  setUser({ app_metadata: { providers: ['google'] } })
  rpcError('session_is_recent', 'caiu')
  expect(await q.loadSignIn()).toEqual({ hasPassword: false, pendingEmail: null, sessionRecent: false })
})

test('loadDeletionContext sem família: tudo é apagado, sem parte e sem troca de administração', async () => {
  family(null)
  rows.transactions = []
  rpcData('session_is_recent', true)
  expect(await q.loadDeletionContext()).toEqual({ notice: 'everything', shareCents: 0, passesAdmin: false, sessionRecent: true })
  // os registros da família são procurados só entre os da própria pessoa
  for (const r of reads.filter((x) => x.table === 'transactions')) expect(r.filters).toContain('eq:user_id=u1')
})

test('loadDeletionContext: membro com gastos na família e parte nas metas', async () => {
  family({ id: 'f1', role: 'member', members: [active('u1'), active('u2')] })
  rows.transactions = [{ family_id: 'f1' }]
  familyGoals(['g1', 'g2'])
  movements([{ goal_id: 'g1', kind: 'deposit', amount_cents: 3000 }, { goal_id: 'pessoal', kind: 'deposit', amount_cents: 999 }])
  rpcData('session_is_recent', false)
  expect(await q.loadDeletionContext()).toEqual({ notice: 'family-history', shareCents: 3000, passesAdmin: false, sessionRecent: false })
})

test('loadDeletionContext: administradora com outras pessoas passa a administração; sozinha, não', async () => {
  family({ id: 'f1', role: 'admin', members: [active('u1'), active('u2'), left('u3')] })
  expect((await q.loadDeletionContext()).passesAdmin).toBe(true)
  family({ id: 'f1', role: 'admin', members: [active('u1'), left('u3')] })
  expect((await q.loadDeletionContext()).passesAdmin).toBe(false)
})
```

(`family`, `familyGoals`, `movements`, `setUser`, `rpcData`, `rpcError`, `active`, `left` são auxiliares do próprio arquivo de teste: `family` e `familyGoals` mockam `@/features/familia/queries`; `movements` mocka `fetchGoalMovements` de `@/features/metas/queries`.)

Em `src/features/auth/routes.test.ts`, acrescentar:

```ts
test('páginas públicas do Plano 9: só o caminho exato', () => {
  for (const path of ['/termos', '/privacidade', '/confirmar-email', '/cadastro-excluido']) expect(isPublicPath(path), path).toBe(true)
  for (const path of ['/termos/', '/privacidade/x', '/confirmar-email/abc', '/cadastro-excluido/1', '/configuracoes/excluir', '/configuracoes/dados/exportar', '/configuracoes/e-mail']) {
    expect(isPublicPath(path), path).toBe(false)
  }
  expect(isAnonOnlyPath('/confirmar-email')).toBe(false)
  expect(isAnonOnlyPath('/cadastro-excluido')).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/cadastro src/features/auth/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `routes.ts`: acrescentar `'/confirmar-email'` e `'/cadastro-excluido'` ao conjunto `PUBLIC`. Nada mais muda.
- `queries.ts`: `loadDeletionContext` usa `requireUser()`, `loadMyFamily()`, e duas leituras mínimas em `transactions` (`select('family_id')`, `.eq('user_id', user.id).eq('status', 'confirmed')`, `.limit(1)`): uma com `.eq('family_id', familyId)` (só com família) e outra com `.not('family_id', 'is', null)` mais `.neq('family_id', familyId)` quando há família. `activeMembers` = participações com `leftAt === null`. Com família: `familyShareCents(ids de loadFamilyGoals(familyId), fetchGoalMovements(supabase, user.id))`.
- `delete-form.tsx` (`'use client'`): `useActionState(deleteAccount, idle)`; `TextField` não tem `autoComplete="off"` por padrão — passar `autoComplete="off"`; o botão de enviar usa `disabled={pending}`; com `code === 'reauth'`, `FormAlert` + `SignOutButton variant="row"` (mesmo padrão de `NewPasswordForm`). Os avisos são parágrafos comuns (sem vermelho, sem ícone de alerta: V5).
- `forget-device.tsx` (`'use client'`): num `useEffect`, dentro de `try`, `navigator.serviceWorker?.getRegistration()` → `pushManager.getSubscription()` → `unsubscribe()`; depois `window.localStorage.clear()`. Devolve `null`.
- `configuracoes/excluir/page.tsx`: `loadDeletionContext()`; `PageHeader title="Excluir seu cadastro" backHref="/configuracoes"`. Se `!sessionRecent`: só o `FormAlert` com `REAUTH_DELETE` e `SignOutButton variant="row"` (sem formulário: a pessoa não digita EXCLUIR à toa). Senão, `DeleteForm`.
- `(auth)/cadastro-excluido/page.tsx`: `metadata = { robots: { index: false } }`; `h1` e parágrafo dos textos acima; `<ForgetDevice />`. Sem link para criar cadastro.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/cadastro src/features/auth && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cadastro src/features/auth/routes.ts src/features/auth/routes.test.ts "src/app/(app)/configuracoes/excluir" "src/app/(auth)/cadastro-excluido"
git commit -m "feat(cadastro): tela de excluir o cadastro, com os avisos da família, e página depois da exclusão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Trocar e-mail — modelos do Supabase Auth e ações

**Files:**
- Create: `supabase/templates/email_change.html`, `supabase/templates/confirmation.html`, `src/lib/supabase/stateless.ts`, `src/features/cadastro/schemas.ts`, `src/features/cadastro/schemas.test.ts`
- Modify: `supabase/config.toml`, `src/features/cadastro/actions.ts`, `src/features/cadastro/actions.test.ts`

**Interfaces:**
- Consumes: `isSessionRecent`, `REAUTH_EMAIL`, `ConfirmEmailState` (Task 5); `loadSignIn` (Task 6); o esquema de e-mail de `@/features/auth/schemas` (`resetSchema`).
- Produces:
  - `schemas.ts`: `emailChangeSchema` (= `resetSchema`: `{ email }` aparado e em minúsculas, erro "Confira o e-mail. Parece que falta alguma coisa."), `TOKEN_HASH = /^[A-Za-z0-9_-]{16,128}$/`, `SAME_EMAIL = 'Esse já é o seu e-mail.'`
  - `stateless.ts` (`server-only`): `createStatelessClient(): SupabaseClient` — `createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })` de `@supabase/supabase-js`. Chave publicável; não lê nem grava cookie.
  - `actions.ts`: `requestEmailChange(_: FormState, fd: FormData): Promise<FormState>` (sucesso: `{ status: 'sent' }`), `confirmEmailChange(_: ConfirmEmailState, fd: FormData): Promise<ConfirmEmailState>`.

**Como funciona (decisão 150):**
- `supabase.auth.updateUser({ email })` com `double_confirm_changes = true` (já está no `config.toml`): o Supabase envia um link ao endereço atual e outro ao novo; o e-mail só muda depois dos dois.
- **Mesma resposta:** o Supabase responde `email_exists` quando o endereço é de outro cadastro. A tela nunca mostra isso: toda resposta do serviço de login com status abaixo de 500, fora 401 e 403, vira `{ status: 'sent' }` — endereço livre, endereço já cadastrado e limite de envio ficam iguais. Só falha de servidor (≥ 500), de rede (sem status) ou de sessão (401/403) vira o aviso genérico.
- **O link não confirma sozinho e não inicia sessão:** o modelo aponta para `/confirmar-email?token_hash=…`; a página tem um botão; a ação confere o código com um cliente sem cookies (`createStatelessClient`). A sessão de quem estiver naquele navegador (a própria pessoa ou outra) não é lida nem trocada.
- **Entrada recente** é conferida pela ação antes de pedir a troca. Limite conhecido: quem chamar a API do Supabase Auth direto, com a própria sessão, não passa por essa conferência nem pela resposta única; a proteção de verdade continua sendo a confirmação nos dois endereços e o limite de envios do Supabase (registrado em "Limites conhecidos", Task 11).

- [ ] **Step 1: Modelos de e-mail e `config.toml`**

`supabase/templates/email_change.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Confirme a troca de e-mail na Íris</title>
  </head>
  <body>
    <h1>Confirme a troca de e-mail.</h1>
    <p>Recebemos um pedido para trocar o e-mail do seu cadastro na Íris para {{ .NewEmail }}.</p>
    <p>A troca só vale depois de confirmar pelos dois links: o enviado ao e-mail atual e o enviado ao novo.</p>
    <p><a href="{{ .SiteURL }}/confirmar-email?token_hash={{ .TokenHash }}">Confirmar troca de e-mail</a></p>
    <p>Se o link não abrir, copie este endereço no navegador:</p>
    <p>{{ .SiteURL }}/confirmar-email?token_hash={{ .TokenHash }}</p>
    <p>Se não foi você, é só ignorar este e-mail. O e-mail do cadastro continua o mesmo.</p>
    <p>Íris — Veja para onde seu dinheiro vai</p>
  </body>
</html>
```

`supabase/templates/confirmation.html` (fica pronto; `enable_confirmations` continua `false`):

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Confirme seu e-mail na Íris</title>
  </head>
  <body>
    <h1>Confirme seu e-mail.</h1>
    <p>Falta só confirmar o e-mail do seu cadastro na Íris.</p>
    <p><a href="{{ .ConfirmationURL }}">Confirmar e-mail</a></p>
    <p>Se o link não abrir, copie este endereço no navegador:</p>
    <p>{{ .ConfirmationURL }}</p>
    <p>Se não foi você, é só ignorar este e-mail.</p>
    <p>Íris — Veja para onde seu dinheiro vai</p>
  </body>
</html>
```

Em `supabase/config.toml`, depois de `[auth.email.template.recovery]`:

```toml
[auth.email.template.email_change]
subject = "Confirme a troca de e-mail na Íris"
content_path = "./supabase/templates/email_change.html"

[auth.email.template.confirmation]
subject = "Confirme seu e-mail na Íris"
content_path = "./supabase/templates/confirmation.html"
```

E em `[auth.rate_limit]`, `email_sent = 2` → `email_sent = 20` (só no ambiente local: cada troca envia dois e-mails e o limite de 2 por hora derrubaria os testes; no projeto hospedado o limite é configurado no painel). Não mexer em `double_confirm_changes`, `secure_password_change` nem `enable_confirmations`.

- [ ] **Step 2: Escrever os testes**

`src/features/cadastro/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { emailChangeSchema, TOKEN_HASH } from './schemas'

test('e-mail novo: aparado, em minúsculas, com a mensagem da copy', () => {
  expect(emailChangeSchema.parse({ email: '  Nova@Teste.Iris.dev ' })).toEqual({ email: 'nova@teste.iris.dev' })
  const bad = emailChangeSchema.safeParse({ email: 'sem-arroba' })
  expect(bad.success).toBe(false)
  if (!bad.success) expect(bad.error.issues[0].message).toBe('Confira o e-mail. Parece que falta alguma coisa.')
})

test('código do link: só o formato do Supabase', () => {
  for (const ok of ['a'.repeat(56), `pkce_${'b'.repeat(56)}`, 'AbC-_0123456789x']) expect(TOKEN_HASH.test(ok), ok).toBe(true)
  for (const no of ['', 'curto', 'a'.repeat(129), 'com espaço dentro 1234', 'a/b/c/d/e/f/g/h/i/j', '../../etc/passwd0000', 'x'.repeat(20) + '?y=1']) {
    expect(TOKEN_HASH.test(no), no).toBe(false)
  }
})
```

Acrescentar a `src/features/cadastro/actions.test.ts`:

```ts
const SENT = { status: 'sent' }
const REAUTH_EMAIL = 'Por segurança, saia e entre de novo antes de trocar o e-mail.'
const recent = (value: boolean) => (rpcQueue.session_is_recent = [{ data: value, error: null }])

describe('requestEmailChange', () => {
  test('e-mail que não parece e-mail: erro no campo, nada é pedido', async () => {
    const state = await actions.requestEmailChange(idle, form({ email: 'sem-arroba' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { email: 'Confira o e-mail. Parece que falta alguma coisa.' }, values: { email: 'sem-arroba' } })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('o mesmo e-mail (maiúsculas não contam): nada é pedido', async () => {
    const state = await actions.requestEmailChange(idle, form({ email: 'ANA@teste.iris.dev' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { email: 'Esse já é o seu e-mail.' } })
    expect(updateUser).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([])
  })

  test('cadastro sem senha (entra com o Google): nada é pedido', async () => {
    h.hasPassword = false
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('entrada antiga: pede para sair e entrar de novo, e nada é pedido', async () => {
    recent(false)
    const state = await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))
    expect(state).toMatchObject({ status: 'error', message: REAUTH_EMAIL, code: 'reauth', values: { email: 'nova@teste.iris.dev' } })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('pedido aceito: só o e-mail vai para o Supabase Auth', async () => {
    recent(true)
    expect(await actions.requestEmailChange(idle, form({ email: ' Nova@teste.iris.dev ', user_id: 'outra' }))).toEqual(SENT)
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(updateUser).toHaveBeenCalledWith({ email: 'nova@teste.iris.dev' })
  })

  test.each([
    ['endereço de outro cadastro', { code: 'email_exists', status: 422 }],
    ['limite de envio', { code: 'over_email_send_rate_limit', status: 429 }],
    ['limite de pedidos', { code: 'over_request_rate_limit', status: 429 }],
    ['endereço recusado pelo serviço', { code: 'email_address_invalid', status: 400 }],
  ])('mesma resposta para %s', async (_name, error) => {
    recent(true)
    updateUser = vi.fn(async () => ({ error }))
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toEqual(SENT)
  })

  test.each([
    ['servidor', { status: 500 }], ['rede', { message: 'fetch failed' }], ['sessão vencida', { status: 401 }], ['sem permissão', { status: 403 }],
  ])('falha de %s: aviso genérico (não depende do endereço)', async (_name, error) => {
    recent(true)
    updateUser = vi.fn(async () => ({ error }))
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
  })
})

describe('confirmEmailChange', () => {
  const TOKEN = `pkce_${'a'.repeat(56)}`
  const confirmIdle = { status: 'idle' } as const
  let verifyOtp = vi.fn(async (_a: unknown) => ({ data: { session: null as unknown, user: null as unknown }, error: null as unknown }))
  beforeEach(() => {
    verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
    h.stateless = { auth: { verifyOtp: (a: unknown) => verifyOtp(a) } }
    h.supabase = { get auth(): never { throw new Error('a sessão do navegador não é usada') }, rpc: () => { throw new Error('sem banco') } }
  })

  test('código fora do formato: nem consulta', async () => {
    for (const bad of ['', 'curto', '../x'.repeat(8)]) {
      expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: bad }))).toEqual({ status: 'invalid' })
    }
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  test('primeira confirmação: falta o outro endereço', async () => {
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'half' })
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email_change', token_hash: TOKEN })
  })

  test('segunda confirmação: e-mail alterado', async () => {
    verifyOtp = vi.fn(async () => ({ data: { session: { access_token: 'x' }, user: { id: 'u1' } }, error: null }))
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'done' })
  })

  test('link vencido, usado ou inventado: a mesma resposta', async () => {
    verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error: { code: 'otp_expired', status: 403 } }))
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'invalid' })
  })

  test('confirmar não usa a sessão do navegador (o beforeEach faz qualquer uso dela lançar)', async () => {
    await expect(actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).resolves.toEqual({ status: 'half' })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/features/cadastro`
Expected: FAIL nos testes novos.

- [ ] **Step 4: Implementar**

```ts
export async function requestEmailChange(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['email'] as const)
  const parsed = emailChangeSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  if (parsed.data.email === user.email.trim().toLowerCase()) return errorState({ fieldErrors: { email: SAME_EMAIL }, values })
  if (!(await loadSignIn()).hasPassword) return errorState({ message: UNEXPECTED, values })
  const supabase = await createClient()
  if (!(await isSessionRecent(supabase))) return errorState({ message: REAUTH_EMAIL, code: 'reauth', values })
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email })
  // A mesma resposta para endereço livre, endereço de outro cadastro e limite de envio.
  const status = error ? (error as { status?: number }).status : undefined
  if (error && (status === undefined || status >= 500 || status === 401 || status === 403)) return errorState({ message: UNEXPECTED, values })
  return { status: 'sent' }
}

export async function confirmEmailChange(_: ConfirmEmailState, fd: FormData): Promise<ConfirmEmailState> {
  const token = String(fd.get('token_hash') ?? '')
  if (!TOKEN_HASH.test(token)) return { status: 'invalid' }
  // Cliente sem cookies: confirmar não lê nem troca a sessão de quem está neste navegador.
  const { data, error } = await createStatelessClient().auth.verifyOtp({ type: 'email_change', token_hash: token })
  if (error) return { status: 'invalid' }
  return { status: data.session ? 'done' : 'half' }
}
```

`loadSignIn()` é chamado depois de validar (o mock do teste fixa `sessionRecent`; a ação usa `isSessionRecent` direto, para o teste `recent(false)` valer). Nada é escrito em log: nem o e-mail novo, nem o código do link.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/features/cadastro src/features/notificacoes/no-service-key.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml supabase/templates src/lib/supabase/stateless.ts src/features/cadastro
git commit -m "feat(cadastro): pedir e confirmar a troca de e-mail, com a mesma resposta para qualquer endereço" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Trocar e-mail — telas

**Files:**
- Create: `src/features/cadastro/email-form.tsx`, `src/features/cadastro/email-form.test.tsx`, `src/features/cadastro/confirm-email-form.tsx`, `src/features/cadastro/confirm-email-form.test.tsx`, `src/app/(app)/configuracoes/e-mail/page.tsx`, `src/app/(auth)/confirmar-email/page.tsx`

**Interfaces:**
- Consumes: `requestEmailChange`, `confirmEmailChange` (Task 7); `loadSignIn` (Task 6); `REAUTH_EMAIL`, `confirmIdle`, `TOKEN_HASH`.
- Produces: `EmailForm({ currentEmail, pendingEmail }: { currentEmail: string; pendingEmail: string | null })`, `ConfirmEmailForm({ tokenHash }: { tokenHash: string | null })`.

**Textos:**
- `/configuracoes/e-mail`: título "Trocar e-mail"; linha "E-mail atual" com o endereço; campo "Novo e-mail"; botão "Enviar link"; depois de enviar (texto novo 12): "Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois."; com troca pendente (texto novo 14): "Troca pendente para {e-mail}. Ela só vale depois de confirmar pelos dois links."
- `/confirmar-email`: título e botão "Confirmar troca de e-mail"; `half`: "Falta um passo. Confirme também pelo link enviado ao outro endereço."; `done`: "E-mail alterado. Use o novo endereço para entrar."; `invalid` (e link sem código): "Este link não vale mais. Peça a troca de novo em Configurações."

- [ ] **Step 1: Escrever os testes**

`src/features/cadastro/email-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as Record<string, unknown>, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ requestEmailChange: async () => ({ status: 'idle' }) }))
vi.mock('@/features/shell/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sair da Íris</button> }))
const { EmailForm } = await import('./email-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
})

const SENT = 'Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois.'

test('mostra o e-mail atual, o campo do novo e o botão', () => {
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByText('ana@teste.iris.dev')).toBeTruthy()
  const field = screen.getByLabelText('Novo e-mail') as HTMLInputElement
  expect(field.type).toBe('email')
  expect(field.name).toBe('email')
  expect(screen.getByRole('button', { name: 'Enviar link' })).toBeTruthy()
  expect(screen.queryByText(/Troca pendente/)).toBeNull()
})

test('depois de enviar: a mesma frase, sem dizer se o endereço já tem cadastro, e sem repetir o endereço', () => {
  h.state = { status: 'sent' }
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByRole('status').textContent).toBe(SENT)
  expect(screen.queryByRole('button', { name: 'Enviar link' })).toBeNull()
})

test('troca pendente aparece com o endereço novo', () => {
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail="nova@teste.iris.dev" />)
  expect(screen.getByText('Troca pendente para nova@teste.iris.dev. Ela só vale depois de confirmar pelos dois links.')).toBeTruthy()
})

test('entrada antiga: o aviso, "Sair da Íris" e o que foi digitado continua no campo', () => {
  h.state = { status: 'error', submission: 3, message: 'Por segurança, saia e entre de novo antes de trocar o e-mail.', code: 'reauth', values: { email: 'nova@teste.iris.dev' } }
  render(<EmailForm currentEmail="ana@teste.iris.dev" pendingEmail={null} />)
  expect(screen.getByRole('alert').textContent).toBe('Por segurança, saia e entre de novo antes de trocar o e-mail.')
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
  expect((screen.getByLabelText('Novo e-mail') as HTMLInputElement).defaultValue).toBe('nova@teste.iris.dev')
})
```

`src/features/cadastro/confirm-email-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ state: { status: 'idle' } as { status: string }, pending: false }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [h.state, () => {}, h.pending] }))
vi.mock('./actions', () => ({ confirmEmailChange: async () => ({ status: 'idle' }) }))
const { ConfirmEmailForm } = await import('./confirm-email-form')

afterEach(() => {
  cleanup()
  h.state = { status: 'idle' }
  h.pending = false
})

const TOKEN = `pkce_${'a'.repeat(56)}`
const INVALID = 'Este link não vale mais. Peça a troca de novo em Configurações.'

test('abrir o link só mostra o botão; o código vai num campo escondido', () => {
  const { container } = render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(screen.getByRole('button', { name: 'Confirmar troca de e-mail' })).toBeTruthy()
  expect((container.querySelector('input[name="token_hash"]') as HTMLInputElement).value).toBe(TOKEN)
  expect(container.textContent).not.toContain(TOKEN)
})

test('sem código, ou com código fora do formato: link que não vale, sem botão', () => {
  for (const bad of [null, 'curto', '<script>']) {
    const { unmount } = render(<ConfirmEmailForm tokenHash={bad} />)
    expect(screen.getByText(INVALID)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
  }
})

test.each([
  ['half', 'Falta um passo. Confirme também pelo link enviado ao outro endereço.'],
  ['done', 'E-mail alterado. Use o novo endereço para entrar.'],
  ['invalid', INVALID],
])('estado %s', (status, text) => {
  h.state = { status }
  render(<ConfirmEmailForm tokenHash={TOKEN} />)
  expect(screen.getByText(text)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Confirmar troca de e-mail' })).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/cadastro`
Expected: FAIL nos dois arquivos novos.

- [ ] **Step 3: Implementar**

- `email-form.tsx` (`'use client'`): mesmo `useForm` de `src/features/auth/forms.tsx` (copiar o padrão: `key`, `values`, `errors`, `message`, `code`). `sent` → `<p role="status">` com a frase (classes do aviso verde de `ResetForm`).
- `confirm-email-form.tsx` (`'use client'`): `useActionState(confirmEmailChange, confirmIdle)`; `half`/`done` em `<p role="status">`; `invalid` em parágrafo comum (não é erro da pessoa). Botão `disabled={pending}`.
- `configuracoes/e-mail/page.tsx`: `requireUser()` + `loadSignIn()`. Cadastro sem senha → `redirect('/configuracoes')` (a troca não é oferecida a quem entra com o Google; decisão 151). `!sessionRecent` → `FormAlert` com `REAUTH_EMAIL` + `SignOutButton variant="row"`, sem formulário. Senão `EmailForm`. `PageHeader title="Trocar e-mail" backHref="/configuracoes"`.
- `(auth)/confirmar-email/page.tsx`: `metadata = { robots: { index: false }, referrer: 'no-referrer' }` (o código do link é um segredo de uso único, como o do convite); lê `searchParams.token_hash` (texto único; lista ou ausente → `null`); `h1` "Confirmar troca de e-mail"; `ConfirmEmailForm`. A página **não** chama o Supabase: abrir o link não confirma nada.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/cadastro && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cadastro "src/app/(app)/configuracoes/e-mail" "src/app/(auth)/confirmar-email"
git commit -m "feat(cadastro): telas de trocar e-mail e de confirmar a troca" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Termos de uso e Política de privacidade

**Files:**
- Create: `src/features/legal/controller.ts`, `src/features/legal/content.ts`, `src/features/legal/content.test.ts`, `src/features/legal/legal-page.tsx`, `src/features/legal/legal-page.test.tsx`, `src/app/(legal)/layout.tsx`, `src/app/(legal)/termos/page.tsx`, `src/app/(legal)/privacidade/page.tsx`
- Modify: `src/app/(auth)/entrar/page.tsx`

**Interfaces:**
- Produces (`controller.ts`):

  ```ts
  export interface LegalController { name: string | null; contact: string | null; emailProvider: string | null; reviewedOn: ISODate | null }
  // Só o dono do projeto preenche (README, "Lista de lançamento"). Enquanto houver um campo vazio, as páginas ficam como rascunho.
  export const CONTROLLER: LegalController = { name: null, contact: null, emailProvider: null, reviewedOn: null }
  export const LEGAL_UPDATED_ON: ISODate = '2026-10-02'
  export const TO_DEFINE = '[a definir antes do lançamento]'
  export function isLegalReady(c: LegalController): boolean
  ```
- Produces (`content.ts`):

  ```ts
  export type LegalBlock = string | string[]                      // parágrafo | lista
  export interface LegalSection { heading: string; blocks: LegalBlock[] }
  export interface LegalDoc { title: string; sections: LegalSection[] }
  export function termsDoc(c: LegalController): LegalDoc
  export function privacyDoc(c: LegalController): LegalDoc
  ```
- Produces: `LegalPage({ doc, controller, updatedOn }: { doc: LegalDoc; controller: LegalController; updatedOn: ISODate })`.

**Estes são textos jurídicos em rascunho.** O texto abaixo é o que vai para `content.ts`, palavra por palavra (`{responsável}`, `{contato}` e `{provedor de e-mail}` vêm de `controller.ts`; vazios aparecem como `[a definir antes do lançamento]`). Ele descreve o que o app faz hoje; **não substitui a revisão do dono do projeto e de um advogado**, que é condição do lançamento. Pontos que pedem decisão ou revisão estão marcados com ⚖ aqui (a marca não vai para a página) e repetidos em "O que depende de você".

**Termos de uso**

1. **O que é a Íris** — "A Íris é um app gratuito para anotar o que entra e o que sai e enxergar o seu mês. Os números que ela mostra vêm do que você anota."
2. **Seu cadastro** — "Para usar a Íris você cria um cadastro com e-mail e senha, ou entra com o Google." · "O cadastro é pessoal. Cuide da sua senha e não a compartilhe." · "Use um e-mail que você acompanha: é por ele que a Íris envia o link para criar uma nova senha."
3. **Gratuita** — "A Íris é gratuita e não pede dados de cartão para funcionar." · "Se isso mudar um dia, você será avisado antes e poderá baixar ou excluir os seus dados." ⚖
4. **O que a Íris não é** — lista: "Não é banco e não movimenta dinheiro." · "Não se conecta ao seu banco e não pede senha de banco." · "Não dá conselho de investimento nem promete resultado." · parágrafo: "A Íris mostra o que está acontecendo. As decisões continuam sendo suas. Confira valores importantes antes de decidir com base neles." ⚖
5. **Família** — "Quem cria uma família passa a administrá-la e pode convidar outras pessoas." · "Tudo o que alguém marca como da família aparece para quem participa dela: os gastos da família, as contas da família e as metas da família." · "Quem administra pode ajustar e excluir gastos da família e remover participantes." · "O que você não marca como da família continua privado."
6. **Uso combinado** — lista: "Não use a Íris para atividade ilegal." · "Não tente acessar dados de outras pessoas." · "Não envie convites a quem não quer recebê-los." · "Não sobrecarregue nem tente derrubar o serviço."
7. **Seus dados** — "O que você anota é seu. Você pode baixar tudo em Configurações → Baixar meus dados e excluir o cadastro em Configurações → Excluir meu cadastro, quando quiser." · "A Política de privacidade explica o que a Íris guarda e para quê."
8. **Disponibilidade** — "A Íris precisa de conexão com a internet para funcionar." · "Ela pode ficar fora do ar por algum tempo, mudar ou ser encerrada. Se for encerrada, você será avisado com antecedência para baixar os seus dados." ⚖
9. **Encerramento** — "Você pode excluir o seu cadastro quando quiser." · "A Íris pode suspender um cadastro que descumpra estes termos." ⚖
10. **Mudanças nestes termos** — "Se estes termos mudarem de forma importante, a Íris avisa antes de a mudança valer."
11. **Contato e lei aplicável** — "A Íris é mantida por {responsável}. Para falar sobre estes termos, escreva para {contato}." · "Estes termos seguem a lei brasileira." ⚖

**Política de privacidade**

1. **Quem cuida dos seus dados** — "A Íris é mantida por {responsável}, que decide como os dados são tratados." · "Para falar sobre os seus dados, escreva para {contato}." ⚖
2. **O que a Íris guarda** — lista: "Seu cadastro: nome, e-mail e senha. A senha fica guardada de forma cifrada; ninguém consegue lê-la." · "Se você entra com o Google: o nome, o e-mail e um identificador que o Google informa. Nunca a sua senha do Google." · "O que você anota: gastos, entradas, contas a pagar e a receber, compras parceladas, metas, planejamento, categorias e notas." · "Cartões: só o apelido, o tipo e a cor. Nenhum número de cartão." · "Família, se você participar de uma: o nome da família, quem participa e o que é marcado como da família (gastos, contas da família e metas)." · "Lembretes: quais estão ligados e, se você ativar os lembretes num aparelho, o endereço técnico que o navegador fornece para a Íris enviar avisos a ele." · "Convites por e-mail: o endereço de quem foi convidado fica guardado enquanto o convite está pendente. Um resumo cifrado desse endereço fica por até 7 dias, só para limitar a quantidade de convites." · "Registros técnicos: como em todo site, os serviços que hospedam a Íris registram dados de acesso, como endereço IP, data, hora e tipo de navegador."
3. **O que a Íris não faz** — lista: "Não se conecta ao seu banco e não pede senha de banco." · "Não guarda número de cartão." · "Não vende nem aluga dados." · "Não mostra publicidade." · "Não usa ferramentas de medição de audiência nem rastreadores."
4. **Para que os dados são usados** — lista: "Para mostrar o seu mês e calcular os números a partir do que você anota." · "Para manter o seu acesso seguro." · "Para enviar os lembretes e os e-mails que você deixou ligados." · "Para o espaço da família, quando você participa de uma." · parágrafo: "A Íris trata esses dados para prestar o serviço que você pediu ao criar o cadastro. Os lembretes no aparelho dependem da sua permissão, que você pode retirar quando quiser." ⚖
5. **O que a família vê** — "Aqui aparecem só os gastos marcados como da família." · "O Disponível e as entradas de cada pessoa nunca aparecem aqui." · "Os outros participantes também não veem os seus cartões, as suas metas pessoais nem quanto você guardou numa meta da família: só o total da meta."
6. **Quem ajuda a Íris a funcionar** — lista: "Supabase: guarda o banco de dados e cuida do login. Os dados ficam em servidores em São Paulo." ⚖ · "Netlify: hospeda o site. As páginas passam pelos servidores da Netlify, que podem ficar fora do Brasil." ⚖ · "{provedor de e-mail}: envia os e-mails da Íris (confirmações, nova senha, convites e resumo do mês)." · "Serviço de avisos do seu navegador (Google, Mozilla, Apple ou Microsoft): entrega os lembretes ao aparelho. O conteúdo viaja cifrado." · "Google: só se você escolher entrar com o Google." · parágrafo: "Esses serviços tratam os dados só para a Íris funcionar."
7. **Cookies e o que fica no aparelho** — parágrafo: "A Íris usa só o necessário para funcionar:" · lista: "cookies de sessão, que mantêm você dentro do app;" · "um cookie que dura alguns segundos, para mostrar avisos como "Anotado.";" · "no aparelho: a página "Sem conexão", um ícone e a sua escolha de não ver de novo o convite para ativar lembretes." · parágrafo: "Não há cookies de publicidade nem de medição."
8. **Por quanto tempo** — lista: "Enquanto o seu cadastro existir." · "Ao excluir o cadastro, seus dados pessoais são apagados na hora." · "Os gastos que você registrou numa família que continua existindo ficam no histórico dela, sem o seu nome. A sua parte nas metas da família sai delas." · "O registro de que um aviso foi enviado fica por até 90 dias: só o tipo do aviso, sem o texto." · "Registros técnicos e cópias de segurança dos serviços de hospedagem seguem os prazos desses serviços." ⚖
9. **Seus direitos** — parágrafo: "A qualquer momento você pode:" · lista: "ver e corrigir o que anotou, nas próprias telas;" · "baixar tudo, em Configurações → Baixar meus dados;" · "excluir o cadastro, em Configurações → Excluir meu cadastro;" · "tirar dúvidas ou pedir qualquer um desses direitos por {contato}." · parágrafo: "Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD)." ⚖
10. **Segurança** — "O acesso é sempre por conexão cifrada (HTTPS)." · "Cada pessoa só alcança os próprios dados. Essa regra é aplicada dentro do banco de dados, não só nas telas." · "Nenhum sistema é infalível. Se algo acontecer com os seus dados, você será avisado." ⚖
11. **Idade** — "A Íris é pensada para adultos. Menores de 18 anos só devem usar com um responsável." ⚖
12. **Mudanças nesta política** — "Se esta política mudar de forma importante, a Íris avisa antes de a mudança valer."

- [ ] **Step 1: Escrever os testes**

`src/features/legal/content.test.ts`:

```ts
import { expect, test } from 'vitest'
import { privacyDoc, termsDoc, type LegalDoc } from './content'
import { CONTROLLER, isLegalReady, TO_DEFINE, type LegalController } from './controller'

const filled: LegalController = { name: 'Fulano de Tal', contact: 'privacidade@iris.example', emailProvider: 'Provedor X', reviewedOn: '2026-11-01' }
const text = (d: LegalDoc) => [d.title, ...d.sections.flatMap((s) => [s.heading, ...s.blocks.flat()])].join('\n')

test('no repositório os textos estão em rascunho: nada do responsável está preenchido', () => {
  expect(CONTROLLER).toEqual({ name: null, contact: null, emailProvider: null, reviewedOn: null })
  expect(isLegalReady(CONTROLLER)).toBe(false)
  expect(isLegalReady(filled)).toBe(true)
  for (const key of ['name', 'contact', 'emailProvider', 'reviewedOn'] as const) expect(isLegalReady({ ...filled, [key]: null })).toBe(false)
})

test('títulos e seções', () => {
  expect(termsDoc(filled).title).toBe('Termos de uso')
  expect(termsDoc(filled).sections.map((s) => s.heading)).toEqual([
    'O que é a Íris', 'Seu cadastro', 'Gratuita', 'O que a Íris não é', 'Família', 'Uso combinado', 'Seus dados',
    'Disponibilidade', 'Encerramento', 'Mudanças nestes termos', 'Contato e lei aplicável',
  ])
  expect(privacyDoc(filled).title).toBe('Política de privacidade')
  expect(privacyDoc(filled).sections.map((s) => s.heading)).toEqual([
    'Quem cuida dos seus dados', 'O que a Íris guarda', 'O que a Íris não faz', 'Para que os dados são usados', 'O que a família vê',
    'Quem ajuda a Íris a funcionar', 'Cookies e o que fica no aparelho', 'Por quanto tempo', 'Seus direitos', 'Segurança', 'Idade',
    'Mudanças nesta política',
  ])
})

test('responsável, contato e provedor entram no texto; vazios aparecem como "a definir"', () => {
  expect(text(privacyDoc(filled))).toContain('A Íris é mantida por Fulano de Tal, que decide como os dados são tratados.')
  expect(text(privacyDoc(filled))).toContain('Provedor X: envia os e-mails da Íris')
  expect(text(termsDoc(filled))).toContain('escreva para privacidade@iris.example.')
  expect(text(privacyDoc(filled)) + text(termsDoc(filled))).not.toContain(TO_DEFINE)
  expect(text(privacyDoc(CONTROLLER))).toContain(`A Íris é mantida por ${TO_DEFINE}`)
  expect(text(termsDoc(CONTROLLER))).toContain(`escreva para ${TO_DEFINE}.`)
})

test('a política diz o que o app faz de verdade', () => {
  const p = text(privacyDoc(filled))
  for (const fact of [
    'Nenhum número de cartão.', 'Supabase', 'São Paulo', 'Netlify', 'podem ficar fora do Brasil', 'por até 7 dias', 'por até 90 dias',
    'Não há cookies de publicidade nem de medição.', 'Configurações → Baixar meus dados', 'Configurações → Excluir meu cadastro',
    'ficam no histórico dela, sem o seu nome', 'Google, Mozilla, Apple ou Microsoft', 'Autoridade Nacional de Proteção de Dados',
  ]) {
    expect(p, fact).toContain(fact)
  }
})

test('terminologia e tom: "conta" só para contas a pagar; sem exclamação; sem "baixe o app"', () => {
  for (const doc of [termsDoc(filled), privacyDoc(filled)]) {
    const t = text(doc)
    expect(t).not.toMatch(/sua conta|minha conta|uma conta no|conta banc|conta do google|conta google/i)
    expect(t).not.toMatch(/!/)
    expect(t).not.toMatch(/baixe o app|loja de aplicativos/i)
    // toda ocorrência de "conta(s)" fala de conta a pagar, a receber ou da família
    for (const m of t.matchAll(/\bcontas?\b[^.;]*/gi)) expect(m[0], m[0]).toMatch(/^contas? (a pagar|da família)/i)
  }
})
```

`src/features/legal/legal-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { termsDoc } from './content'
import { CONTROLLER, type LegalController } from './controller'
import { LegalPage } from './legal-page'

afterEach(() => cleanup())
const filled: LegalController = { name: 'Fulano de Tal', contact: 'privacidade@iris.example', emailProvider: 'Provedor X', reviewedOn: '2026-11-01' }
const DRAFT = 'Rascunho em revisão. Este texto ainda será revisado antes do lançamento.'

test('rascunho: aviso visível antes do texto, um título e uma seção por assunto', () => {
  render(<LegalPage doc={termsDoc(CONTROLLER)} controller={CONTROLLER} updatedOn="2026-10-02" />)
  expect(screen.getByRole('note').textContent).toBe(DRAFT)
  expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Termos de uso'])
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11)
  expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('Atualizado em 2 de outubro de 2026.')).toBeTruthy()
})

test('revisado e preenchido: sem aviso de rascunho; a data é a da revisão', () => {
  render(<LegalPage doc={termsDoc(filled)} controller={filled} updatedOn="2026-10-02" />)
  expect(screen.queryByRole('note')).toBeNull()
  expect(screen.getByText('Atualizado em 1 de novembro de 2026.')).toBeTruthy()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/legal`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `controller.ts` e `content.ts` como acima. `content.ts` não tem lógica além de trocar os três valores (vazio → `TO_DEFINE`).
- `legal-page.tsx` (Server Component, sem `'use client'`): `<article>` com `h1`, o aviso de rascunho em `<p role="note">` quando `!isLegalReady(controller)` (fundo `brand-wash`, texto `brand-ink`; não é erro), "Atualizado em {data}." com `dayMonthYearLabel(controller.reviewedOn ?? updatedOn)`, e cada seção como `<section aria-labelledby>` com `h2`, parágrafos (`string`) e listas (`string[]` → `<ul>`). Texto 16 px, largura de leitura confortável.
- `(legal)/layout.tsx`: `<main>` centralizado (`max-w-[720px]`, fundo `card`), `Logo` no topo, e no rodapé os links "Termos de uso" e "Política de privacidade". Sem barra do app e sem leitura de sessão.
- `termos/page.tsx` e `privacidade/page.tsx`: `metadata = { title: 'Termos de uso — Íris' | 'Política de privacidade — Íris', robots: { index: isLegalReady(CONTROLLER) } }`; renderizam `LegalPage`. Nenhuma API dinâmica (as páginas são estáticas).
- `(auth)/entrar/page.tsx`: logo abaixo de `SignInForm`, o mesmo parágrafo já aprovado de `criar-cadastro/page.tsx` ("Ao criar seu cadastro, você concorda com os Termos de uso e a Política de privacidade.", com os dois links) — "Continuar com o Google" nesta tela também cria cadastro (decisão 155). O teste `src/app/(auth)/pages.test.tsx` continua passando sem alteração.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/legal "src/app/(auth)" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/legal "src/app/(legal)" "src/app/(auth)/entrar/page.tsx"
git commit -m "feat(legal): Termos de uso e Política de privacidade em rascunho, em páginas públicas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Configurações — "Seus dados" e a linha de e-mail

**Files:**
- Modify: `src/app/(app)/configuracoes/page.tsx`
- Create: `src/app/(app)/configuracoes/page.test.tsx`

**Interfaces:**
- Consumes: `loadSignIn` (Task 6); as rotas das Tasks 4, 6, 8 e 9.

- [ ] **Step 1: Escrever o teste**

`src/app/(app)/configuracoes/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ hasPassword: true }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: { vapidPublicKey: null } }))
vi.mock('@/features/perfil/queries', () => ({
  loadProfile: async () => ({ displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 0, onboardedAt: null, categoriesCount: 10 }),
}))
vi.mock('@/features/notificacoes/queries', () => ({ loadNotificationPrefs: async () => ({}) }))
vi.mock('@/features/notificacoes/reminders-section', () => ({ RemindersSection: () => null }))
vi.mock('@/features/familia/queries', () => ({ loadFamilySummaryOrNull: async () => null }))
vi.mock('@/features/cadastro/queries', () => ({ loadSignIn: async () => ({ hasPassword: h.hasPassword, pendingEmail: null, sessionRecent: true }) }))

const { default: ConfiguracoesPage } = await import('./page')
const show = async () => render(await ConfiguracoesPage({ searchParams: Promise.resolve({}) }))

afterEach(() => {
  cleanup()
  h.hasPassword = true
})

test('"Seus dados" é a última seção: baixar, termos, privacidade e, por último, excluir', async () => {
  await show()
  const sections = screen.getAllByRole('region').map((s) => within(s).getByRole('heading', { level: 2 }).textContent)
  expect(sections[sections.length - 1]).toBe('Seus dados')
  const links = within(screen.getByRole('region', { name: 'Seus dados' })).getAllByRole('link')
  expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Baixar meus dados', '/configuracoes/dados'],
    ['Termos de uso', '/termos'],
    ['Política de privacidade', '/privacidade'],
    ['Excluir meu cadastro', '/configuracoes/excluir'],
  ])
})

test('cadastro com senha: o e-mail leva à troca', async () => {
  await show()
  const link = within(screen.getByRole('region', { name: 'Seu cadastro' })).getByRole('link', { name: /camila@teste\.iris\.dev/ })
  expect(link.getAttribute('href')).toBe('/configuracoes/e-mail')
})

test('cadastro sem senha: e-mail só para leitura', async () => {
  h.hasPassword = false
  await show()
  const region = screen.getByRole('region', { name: 'Seu cadastro' })
  expect(within(region).getByText('camila@teste.iris.dev')).toBeTruthy()
  expect(within(region).queryByRole('link', { name: /camila@teste\.iris\.dev/ })).toBeNull()
})
```

(`ListSection` já é uma `<section aria-labelledby>`: o papel `region` com o nome do título existe hoje.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(app)/configuracoes/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Alterar a página**

Em `src/app/(app)/configuracoes/page.tsx`: acrescentar `loadSignIn()` ao `Promise.all`; a linha do e-mail vira `RowLink href="/configuracoes/e-mail" caption="E-mail" title={p.email}` quando `hasPassword` (senão continua `RowStatic`); depois da seção "App", a seção `ListSection title="Seus dados"` com as quatro linhas na ordem do teste; remover o comentário "Seções que chegam depois…". Nenhum texto de alerta nem cor de erro na linha "Excluir meu cadastro" (a confirmação está na tela dela).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "src/app/(app)/configuracoes" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/page.tsx" "src/app/(app)/configuracoes/page.test.tsx"
git commit -m "feat(configuracoes): seção Seus dados e troca de e-mail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ponta a ponta, verificação completa, lista de lançamento e registro

**Files:**
- Create: `tests/e2e/plano9.spec.ts`
- Modify: `tests/e2e/local-only.ts`, `src/features/notificacoes/e2e-local-only.test.ts`, `.gitignore`, `README.md`, `docs/progresso.md`, `docs/decisoes-para-revisao.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–10.
- Produces (`tests/e2e/local-only.ts`): `authEmailTestIsLocal(env?: Env): boolean` — `isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)` (quem envia o e-mail da troca é o Supabase Auth; local, ele entrega na caixa local).

- [ ] **Step 1: Guarda "só local" para a troca de e-mail**

Em `tests/e2e/local-only.ts`, acrescentar no fim:

```ts
// A troca de e-mail é enviada pelo Supabase Auth: com o banco local, os e-mails caem na caixa local.
export function authEmailTestIsLocal(env: Env = process.env): boolean {
  return isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)
}
```

Em `src/features/notificacoes/e2e-local-only.test.ts`, importar `authEmailTestIsLocal` e acrescentar:

```ts
  test('troca de e-mail: só com o banco local', () => {
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_DB })).toBe(true)
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB })).toBe(false)
    expect(authEmailTestIsLocal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_DB, SMTP_HOST: '127.0.0.1' })).toBe(false)
    expect(authEmailTestIsLocal({})).toBe(false)
  })
```

- [ ] **Step 2: Escrever o teste de ponta a ponta**

`tests/e2e/plano9.spec.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { todayInSaoPaulo } from '../../src/domain/dates'
import { authEmailTestIsLocal, LOCAL_ONLY } from './local-only'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const password = 'senha-forte-123'
const created: string[] = []
// Prefixo único por worker e por execução: a limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p9-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const DRAFT = 'Rascunho em revisão. Este texto ainda será revisado antes do lançamento.'
const SENT = 'Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois.'
const CHANGE_SUBJECT = 'Confirme a troca de e-mail na Íris'
const CONFIRM = 'Digite EXCLUIR para confirmar.'

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
async function seedExpense(userId: string, key: string, cents: number, note: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, note, ...extra,
  })
  if (error) throw error
}
// Família com quem administra e, se houver, um membro. As guardas do banco valem para o cliente administrativo.
async function seedFamily(adminId: string, name: string, memberId?: string): Promise<string> {
  const { data: fam, error } = await admin.from('families').insert({ name, created_by: adminId }).select('id').single()
  if (error) throw error
  for (const [id, role] of [[adminId, 'admin'], ...(memberId ? [[memberId, 'member']] : [])] as [string, string][]) {
    const { data: profile, error: e1 } = await admin.from('profiles').select('display_name').eq('id', id).single()
    if (e1) throw e1
    const { error: e2 } = await admin.from('family_members').insert({ family_id: fam.id, user_id: id, role, display_name: profile.display_name })
    if (e2) throw e2
  }
  return fam.id as string
}
// A própria pessoa, pela API: para o que o banco só aceita de quem é dono (meta da família e a parte de cada um).
async function clientOf(email: string) {
  const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
async function entrar(page: Page, email: string, pass: string = password): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(pass)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
}
const userExists = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user !== null
async function leftovers(id: string, email: string): Promise<string[]> {
  const { data, error } = await admin.rpc('account_leftovers', { p_user: id, p_email: email })
  if (error) throw error
  return (data as { place: string }[]).map((r) => r.place)
}

test.afterAll(async () => {
  // Quem foi excluído pela tela já não existe: só o resto é apagado, com uma nova tentativa se houver impasse.
  const remove = async (id: string) => {
    if (!(await userExists(id))) return
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

test('celular: Termos e Privacidade são públicos, em rascunho, e o cadastro e o entrar levam a eles', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'celular')
  for (const [path, title] of [['/termos', 'Termos de uso'], ['/privacidade', 'Política de privacidade']] as const) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(200)
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('note')).toHaveText(DRAFT)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  }
  await expect(page.getByText('Configurações → Excluir meu cadastro', { exact: false })).toBeVisible()
  await expect(page.getByText('Não há cookies de publicidade nem de medição.')).toBeVisible()

  await page.goto('/criar-cadastro')
  await page.getByRole('link', { name: 'Termos de uso', exact: true }).click()
  await expect(page).toHaveURL(/\/termos$/)
  await page.goto('/entrar')
  await page.getByRole('link', { name: 'Política de privacidade', exact: true }).click()
  await expect(page).toHaveURL(/\/privacidade$/)

  // Caminhos parecidos não são públicos.
  for (const path of ['/termos/x', '/configuracoes/dados', '/configuracoes/excluir', '/configuracoes/e-mail']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(307)
    expect(res.headers().location, path).toContain('/entrar')
  }
})

test('desktop: baixar meus dados — CSV só com o que é da pessoa, sem fórmula, sem cache; sem sessão não baixa', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const fam = await seedFamily(camila.id, 'Família Souza', alex.id)
  await seedExpense(camila.id, 'mercado', 14230, '=1+1')
  await seedExpense(camila.id, 'casa', 9900, 'aluguel', { family_id: fam })
  const { error: incomeError } = await admin.from('transactions').insert({
    user_id: camila.id, kind: 'income', amount_cents: 500_000, source: 'Salário', occurred_on: today,
  })
  if (incomeError) throw incomeError
  // De outra pessoa: um gasto pessoal e um da família. Nenhum dos dois entra no arquivo da Camila.
  await seedExpense(alex.id, 'lazer', 777, 'segredo-pessoal-do-alex')
  await seedExpense(alex.id, 'mercado', 4321, 'gasto-da-familia-do-alex', { family_id: fam })

  await entrar(page, camila.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Baixar meus dados', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracoes\/dados$/)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar arquivo', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^iris-meus-dados-\d{4}-\d{2}-\d{2}\.csv$/)
  const file = await download.path()
  const bytes = await readFile(file!)
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const csv = bytes.toString('utf8')
  expect(csv).toContain('"Registros"\r\n')
  expect(csv).toContain(`;"Gasto";"Confirmado";142,30;"Mercado";;"'=1+1";`)
  expect(csv).toContain(';"Gasto";"Confirmado";99,00;"Casa";;"aluguel";')
  expect(csv).toContain(';"Entrada";"Confirmado";5000,00;;"Salário";')
  expect(csv).toContain(`"Camila";"${camila.email}";`)
  expect(csv).toContain('"Família Souza";"Administra";')
  for (const foreign of ['segredo-pessoal-do-alex', 'gasto-da-familia-do-alex', 'Alex', alex.email, camila.id, alex.id, fam]) {
    expect(csv, foreign).not.toContain(foreign)
  }
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)

  // Cabeçalhos da resposta, com a sessão da página.
  const res = await page.request.get('/configuracoes/dados/exportar')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('text/csv; charset=utf-8')
  expect(res.headers()['cache-control']).toContain('no-store')
  expect(res.headers()['content-disposition']).toMatch(/^attachment; filename="iris-meus-dados-/)
  // Vindo de outro site: nada é baixado.
  const cross = await page.request.get('/configuracoes/dados/exportar', { headers: { 'sec-fetch-site': 'cross-site' }, maxRedirects: 0 })
  expect(cross.status()).toBe(303)
  // Sem sessão: vai para Entrar.
  const anon = await request.get('/configuracoes/dados/exportar', { maxRedirects: 0 })
  expect(anon.status()).toBe(307)
  expect(anon.headers().location).toContain('/entrar')
  // O service worker não guardou nada do app.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const urls = await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))
    return urls.flat()
  })
  expect(cached.filter((p) => p.startsWith('/configuracoes'))).toEqual([])
})

test('celular: excluir o cadastro — aviso, palavra EXCLUIR, sessão encerrada, nada fica; a senha antiga não entra mais', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 14230, 'feira')

  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracoes\/excluir$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Excluir seu cadastro', exact: true })).toBeVisible()
  await expect(page.getByText('Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito.')).toBeVisible()
  await expect(page.getByText(/também sairá delas/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Baixar meus dados antes', exact: true })).toHaveAttribute('href', '/configuracoes/dados')
  await expect(page.getByRole('link', { name: 'Manter meu cadastro', exact: true })).toHaveAttribute('href', '/configuracoes')

  // Palavra errada: nada acontece.
  await page.getByLabel(CONFIRM).fill('excluir')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page.getByLabel(CONFIRM)).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL(/\/configuracoes\/excluir$/)
  expect(await userExists(u.id)).toBe(true)

  await page.getByLabel(CONFIRM).fill('EXCLUIR')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/cadastro-excluido$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Seu cadastro foi excluído.', exact: true })).toBeVisible()
  await expect(page.getByText('Obrigado por ter usado a Íris.', { exact: true })).toBeVisible()

  expect(await userExists(u.id)).toBe(false)
  expect(await leftovers(u.id, u.email)).toEqual([])
  // A sessão acabou neste aparelho, e a senha antiga não entra mais.
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar/)
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.' })).toBeVisible()
})

test('desktop: excluir o cadastro com parte numa meta da família — aviso com o valor; a família fica com "Ex-membro" e o aviso sem nome', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop')
  const ana = await makeUser('Ana')
  const bia = await makeUser('Bia')
  const fam = await seedFamily(ana.id, 'Família Souza', bia.id)
  await seedExpense(bia.id, 'mercado', 4000, 'feira da Bia', { family_id: fam })
  const anaApi = await clientOf(ana.email)
  const goal = await anaApi.rpc('create_family_goal', { p_name: 'Reforma', p_target_cents: 1_000_000, p_deadline: null })
  if (goal.error) throw goal.error
  const biaApi = await clientOf(bia.email)
  const dep = await biaApi.rpc('deposit_family_goal', { p_goal_id: goal.data, p_amount_cents: 3000 })
  if (dep.error) throw dep.error

  await entrar(page, bia.email)
  await page.goto('/configuracoes/excluir')
  await expect(page.getByText('Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome.')).toBeVisible()
  await expect(page.getByText(/Sua parte nas metas da família \(R\$\s30,00\) também sairá delas\./)).toBeVisible()
  await expect(page.getByText('A administração da família passa para quem participa há mais tempo.')).toHaveCount(0)
  await page.getByLabel(CONFIRM).fill('EXCLUIR')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/cadastro-excluido$/)
  expect(await userExists(bia.id)).toBe(false)
  expect(await leftovers(bia.id, bia.email)).toEqual([])

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const anaPage = await other.newPage()
  await entrar(anaPage, ana.email)
  await anaPage.goto('/familia')
  await expect(anaPage.getByText('Um membro saiu da família, e a meta Reforma foi atualizada.')).toBeVisible()
  await expect(anaPage.getByText('Bia', { exact: true })).toHaveCount(0)
  await anaPage.goto('/inicio/familia')
  await expect(anaPage.getByText('Ex-membro').first()).toBeVisible()
  await expect(anaPage.getByText('feira da Bia').first()).toBeVisible()
  await other.close()
})

test('desktop: trocar e-mail — mesma resposta para endereço já cadastrado; abrir o link não troca nada; só vale depois dos dois; confirmar não inicia sessão', async ({ page, browser, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  // Guarda de segurança, não atalho: o Supabase Auth envia e-mail para endereços de teste. Só com o banco local.
  test.skip(!authEmailTestIsLocal(), LOCAL_ONLY)
  const u = await makeUser('Camila')
  const other = await makeUser('Alex')
  const novo = `${RUN_PREFIX}novo-${Date.now()}@teste.iris.dev`
  const emailOf = async () => (await admin.auth.admin.getUserById(u.id)).data.user?.email

  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: new RegExp(u.email.replace(/[.+]/g, '\\$&')) }).click()
  await expect(page).toHaveURL(/\/configuracoes\/e-mail$/)

  // Endereço de outro cadastro: a mesma resposta.
  await page.getByLabel('Novo e-mail').fill(other.email)
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: SENT })).toBeVisible()
  await page.reload()
  await page.getByLabel('Novo e-mail').fill(novo)
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: SENT })).toBeVisible()

  const MAILBOX = process.env.E2E_MAILBOX_URL ?? 'http://127.0.0.1:54324'
  const linkFor = async (to: string): Promise<string> => {
    let found = ''
    await expect.poll(async () => {
      const list = await (await request.get(`${MAILBOX}/api/v1/search`, { params: { query: `to:${to} subject:"${CHANGE_SUBJECT}"` } })).json()
      const first = list.messages?.[0]
      if (!first) return ''
      const message = await (await request.get(`${MAILBOX}/api/v1/message/${first.ID}`)).json()
      found = `${message.Text ?? ''}\n${message.HTML ?? ''}`.match(/https?:\/\/[^\s"<]+\/confirmar-email\?token_hash=[A-Za-z0-9_-]+/)?.[0] ?? ''
      return found
    }).toContain('/confirmar-email?token_hash=')
    const parsed = new URL(found)
    return `${parsed.pathname}${parsed.search}`
  }
  const atual = await linkFor(u.email)
  const noNovo = await linkFor(novo)
  expect(atual).not.toBe(noNovo)

  // Outro navegador, sem sessão (como um celular ou um leitor de e-mail).
  const ctx = await browser.newContext(info.project.use as BrowserContextOptions)
  const p = await ctx.newPage()
  await p.goto(atual)
  await expect(p.getByRole('heading', { level: 1, name: 'Confirmar troca de e-mail', exact: true })).toBeVisible()
  expect(await emailOf()).toBe(u.email) // abrir o link não confirma nada
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByRole('status').filter({ hasText: 'Falta um passo. Confirme também pelo link enviado ao outro endereço.' })).toBeVisible()
  expect(await emailOf()).toBe(u.email)

  await p.goto(noNovo)
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByRole('status').filter({ hasText: 'E-mail alterado. Use o novo endereço para entrar.' })).toBeVisible()
  expect(await emailOf()).toBe(novo)

  // Confirmar não iniciou sessão neste navegador, e o link usado não vale de novo.
  await p.goto('/inicio')
  await expect(p).toHaveURL(/\/entrar/)
  await p.goto(noNovo)
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByText('Este link não vale mais. Peça a troca de novo em Configurações.')).toBeVisible()
  // O novo endereço entra; a sessão que pediu a troca mostra o novo e-mail.
  await entrar(p, novo)
  await ctx.close()
  await page.goto('/configuracoes')
  await expect(page.getByText(novo, { exact: true })).toBeVisible()
  // O outro cadastro não foi tocado.
  expect((await admin.auth.admin.getUserById(other.id)).data.user?.email).toBe(other.email)
})
```

- [ ] **Step 3: Conferir sem Docker e rodar o que roda**

Run: `npx playwright test --list tests/e2e/plano9.spec.ts`
Expected: **10 entradas** (5 testes × 2 navegadores; os `test.skip` por navegador se resolvem na execução).

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde; `src/features/notificacoes/no-service-key.test.ts` sem alteração e passando.

Com Docker: `npx supabase db reset && npm run test:db && npm run test:e2e`. Sem Docker: registrar como **pendente** (Step 6).

- [ ] **Step 4: `.gitignore`**

Acrescentar, em "Sistema e editores": `.claude/` (pendência dos ajustes finais do Plano 8).

- [ ] **Step 5: `README.md` — lista de lançamento**

1. Em "Testes", acrescentar a cada linha o que o Plano 9 traz: `npm test` (células do CSV, textos jurídicos, ações de excluir e trocar e-mail, rota de download); `npm run test:db` (`plano9`: entrada recente, exclusão completa tabela por tabela, isolamento, família); `npm run test:e2e` (`plano9`: páginas públicas, download, exclusão, troca de e-mail — esta só com o banco local).
2. Renomear "Antes de publicar: o que depende de você (Plano 8)" para **"Lista de lançamento: o que depende de você"**, manter os 11 itens existentes e acrescentar, com a mesma numeração contínua:

```markdown
12. **Supabase Pro (cerca de US$ 25 por mês): decisão sua.** No plano gratuito o projeto é pausado depois de um tempo sem uso; com ele pausado, a Íris sai do ar e o agendador (lembretes, contas do mês) para. O plano pago também traz cópias de segurança diárias. Nada foi contratado. Se decidir ficar no gratuito no começo, saiba que é preciso reativar o projeto à mão quando ele pausar.
13. **Domínio próprio: decisão sua (é pago).** Sem domínio, o site funciona no endereço da Netlify, mas o provedor de e-mail exige um domínio verificado para enviar a qualquer pessoa (item 1). Com o domínio: apontar na Netlify, trocar `NEXT_PUBLIC_SITE_URL`, o "Site URL" e os endereços de retorno em Supabase → Authentication → URL Configuration, e o retorno do login com o Google.
14. **Supabase hospedado na região São Paulo** (RNF-07). A região é escolhida ao criar o projeto e não muda depois.
15. **Supabase → Authentication → Email:** deixar ligados "Secure email change" (a troca de e-mail só vale com a confirmação nos dois endereços) e "Secure password change". Em Email Templates, colar `supabase/templates/email_change.html` em "Change Email Address", com o assunto "Confirme a troca de e-mail na Íris". Se decidir ligar a confirmação de e-mail no cadastro ("Confirm email"), colar também `supabase/templates/confirmation.html` em "Confirm signup" (assunto "Confirme seu e-mail na Íris") e testar o caminho do convite da família antes (pendência registrada em `docs/progresso.md`).
16. **Termos de uso e Política de privacidade: revisão sua e, de preferência, de um advogado.** Os textos em `src/features/legal/content.ts` são um rascunho fiel ao que o app faz. Antes de lançar: (a) preencher em `src/features/legal/controller.ts` quem é o responsável (você ou a sua empresa), o e-mail de contato para assuntos de dados, o nome do provedor de e-mail e a data da revisão — enquanto um deles estiver vazio, as páginas mostram "Rascunho em revisão" e não são indexadas; (b) decidir os pontos marcados em `docs/decisoes-para-revisao.md` (Plano 9, "Para a revisão jurídica"): base legal, servidores da Netlify fora do Brasil, idade mínima, limite de responsabilidade, aviso em caso de incidente, prazos das cópias de segurança.
17. **Excluir o cadastro nunca rodou num banco de verdade.** Antes de lançar, com Docker: `npx supabase db reset && npm run test:db -- tests/db/plano9.test.ts`. No banco hospedado, `npx supabase db push` para na migração `20261003000001_seus_dados.sql` com uma mensagem clara se o papel que aplica as migrações não puder apagar em `auth.users`; nesse caso não publique: fale comigo. Depois de publicar, teste com um cadastro de teste e confira no SQL Editor: `select * from public.account_leftovers('ID-DO-CADASTRO', 'e-mail')` deve voltar vazio.
18. **Landing (Plano 10):** a seção "Confiança" só pode citar exportação, exclusão e privacidade depois que os itens 16 e 17 estiverem feitos (RF-57).
```

3. Na tabela "Documentação do produto" nada muda.

- [ ] **Step 6: `docs/progresso.md` e `docs/decisoes-para-revisao.md`**

Acrescentar a `docs/progresso.md` a seção abaixo (trocando `{data}` e os números reais de testes):

````markdown
## Plano 9 — Seus dados e lançamento · concluído em {data}

**Entregue**
- Configurações → Seus dados: Baixar meus dados, Termos de uso, Política de privacidade e Excluir meu cadastro.
- Baixar meus dados: um arquivo CSV (abre no Excel) com tudo o que é da pessoa — cadastro, registros, contas e entradas que se repetem, compras parceladas, cartões, metas e movimentos, planejamento, categorias, lembretes e família. Nada de outras pessoas. Texto que viraria fórmula na planilha sai neutralizado.
- Excluir meu cadastro: aviso conforme a família (o texto da copy, ou o do RF-53 quando há gastos na família), a parte nas metas da família com o valor, "Baixar meus dados antes", palavra EXCLUIR. Depois: sessão encerrada, página "Seu cadastro foi excluído.", nada pessoal no banco.
- Trocar e-mail (cadastro com senha): pedido em Configurações, confirmação nos dois endereços, página de confirmação com botão.
- Termos de uso e Política de privacidade em páginas públicas, em rascunho, com aviso visível.
- Pendências de planos anteriores fechadas: troca de e-mail (decisão 22); nova tentativa em impasse na exclusão; nome de família encerrada; frase dos Termos também em "Entrar"; `.claude/` no `.gitignore`.

**Segurança e privacidade**
- Nenhuma chave de serviço no app: a exclusão é uma função do banco, sem parâmetro, que só enxerga quem chama e exige entrada recente (15 minutos).
- O que fica depois da exclusão: numa família que continua, os gastos marcados como da família ("Ex-membro", sem nome), a parte já usada numa compra da família, o aviso sem nome e a participação anônima. Numa família que termina com a pessoa, nada.
- A troca de e-mail responde igual para qualquer endereço; o link não confirma sozinho e não inicia sessão.

**Testes**
- Unitários e de componentes: {n} passando ({m} arquivos). Tipos, lint e build sem erros.
- Banco (`plano9`: 10 testes) e ponta a ponta (`plano9.spec.ts`: 5 testes — celular: 2, desktop: 3; 10 entradas em `--list`): **pendentes**, dependem do Docker (mesma pendência dos Planos 1 a 8).

**Ao rodar o banco pela primeira vez (Docker)** — o SQL do Plano 9 nunca foi executado, só lido
- A migração para no bloco 0 se o papel que a aplica não tiver SELECT e DELETE em `auth.users` e SELECT em `auth.sessions`. Se parar: não usar a chave de serviço no app. Saídas, para decisão: (a) conceder os privilégios ao papel no projeto, se o Supabase permitir; (b) mover a exclusão para uma função do Supabase (Edge Function) fora de `src/`, com o segredo guardado só no Supabase.
- Se `auth.sessions` não puder ser lida: trocar o corpo de `session_recent_at` pela data de entrada que vem no próprio token (`amr`), numa migração nova.
- `account_leftovers` vazio depois de excluir é o que prova a exclusão. Se sobrar uma linha de `auth` (por exemplo `auth.audit_log_entries`, `auth.flow_state`, `auth.one_time_tokens`), acrescentar o `delete` correspondente em `delete_my_account`, numa migração nova, dentro de um bloco protegido como os outros dois.
- Conferir que `auth.jwt() ->> 'session_id'` vem preenchido; que `supabase.auth.verifyOtp({ type: 'email_change', token_hash })` devolve sessão só na segunda confirmação (é como a ação distingue "falta um passo" de "alterado"); e que o modelo `email_change.html` recebe um `{{ .TokenHash }}` diferente em cada endereço.
- Medir a exclusão de um cadastro grande (o papel `authenticated` tem limite de tempo por comando).
- Os testes do Plano 7 que encerram uma família agora passam pelo gatilho do nome: conferir `plano7-familia` e `plano7-saida`.
- A caixa de e-mail local: se a mensagem do Supabase Auth vier só em HTML, o teste já lê os dois campos (`Text` e `HTML`).

**Limites conhecidos**
- Quem chama a API do Supabase Auth direto, com a própria sessão, recebe "esse e-mail já tem cadastro" ao tentar trocar para um endereço existente, e não passa pela conferência de entrada recente da troca de e-mail. As telas da Íris nunca mostram isso; os limites de envio são os do Supabase.
- Um token de sessão já emitido vale até vencer (até 1 hora) depois da exclusão, mas não lê nem grava nada.
- Os nomes das metas de uma família encerrada que ainda guarda algo de outra pessoa ficam no banco, sem ligação com quem excluiu o cadastro; ninguém os lê.
- Um convite pendente enviado por outra família para o e-mail de quem excluiu o cadastro fica até vencer (7 dias).
- Depois de sair e entrar de novo, a pessoa volta a Configurações por conta própria (o retorno automático só existe para convite e pagamento de conta).

**Pendências levadas a outros planos**
- Plano 10: landing (seção Confiança só depois da lista de lançamento, itens 16 e 17); layout de desktop das telas novas.
- Depois da v1, se fizer falta: digitar a senha de novo em vez de sair e entrar; cancelar uma troca de e-mail pendente; limpeza completa de famílias encerradas; registrar a versão dos Termos aceita por cada cadastro.
````

Em `docs/decisoes-para-revisao.md`, acrescentar `## Plano 9` com a tabela "Decisões tomadas neste plano" (137–156), os blocos "Conflitos…", "Para você confirmar" e "Para a revisão jurídica" (os pontos ⚖ da Task 9), e, em "Textos novos usados", a lista "Textos novos" deste plano, exatamente como estiver no código.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/plano9.spec.ts tests/e2e/local-only.ts src/features/notificacoes/e2e-local-only.test.ts .gitignore README.md docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): seus dados (download, exclusão, troca de e-mail, páginas públicas); lista de lançamento, progresso e decisões do Plano 9" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## O que depende de você

Nada disto é feito pelo plano. São decisões, contas e textos que só você pode dar.

| # | O quê | Observação |
|---|---|---|
| 1 | **Supabase Pro (cerca de US$ 25 por mês)** | Decisão sua. Sem ele o projeto gratuito pausa por inatividade (a Íris sai do ar e os lembretes param) e não há cópia de segurança diária. Nada foi contratado. |
| 2 | **Domínio próprio (pago)** | Decisão sua. Necessário para o provedor de e-mail enviar a qualquer pessoa; muda `NEXT_PUBLIC_SITE_URL`, o "Site URL" do Supabase e o retorno do Google. |
| 3 | **Quem é o responsável pela Íris** | Nome (seu ou da empresa), e-mail de contato para assuntos de dados e nome do provedor de e-mail, em `src/features/legal/controller.ts`. Sem isso as páginas ficam como "Rascunho em revisão". |
| 4 | **Revisão dos Termos e da Política** | Sua e, de preferência, de um advogado. Pontos marcados com ⚖: base legal do tratamento; Netlify com servidores fora do Brasil (RNF-07 pede dados no Brasil: o banco fica em São Paulo, a hospedagem do site não necessariamente); idade mínima; limite de responsabilidade; aviso em caso de incidente; prazos das cópias de segurança; lei aplicável e foro; gratuidade. |
| 5 | **Supabase hospedado** | Região São Paulo ao criar o projeto; "Secure email change" e "Secure password change" ligados; colar os modelos de e-mail (troca de e-mail; confirmação de cadastro, se ligar); Postgres 17 ou mais novo. |
| 6 | **Docker** | A exclusão do cadastro e todo o SQL deste plano nunca rodaram. Rodar `npx supabase db reset && npm run test:db && npm run test:e2e` antes de lançar é obrigatório. |
| 7 | **Sua aprovação** | Os textos novos (abaixo), a adaptação "conta → cadastro" nos textos de exclusão da copy, e as interpretações (decisões 137, 142, 144, 146, 150, 151, 155). |
| 8 | **Tudo o que já estava na lista do Plano 8** | SMTP, modelo de recuperação de senha, chaves VAPID, segredo da tarefa, extensões, teste em aparelho de verdade, logo definitivo (README, itens 1 a 11). |

---

## Autorrevisão do plano

**1. Cobertura do escopo**

| Requisito | Onde |
|---|---|
| RF-52 exportar todos os dados; A7 A (CSV) | Tasks 1, 3, 4; e2e Task 11 |
| RF-53 excluir o cadastro, baixar antes, EXCLUIR, texto de aviso | Tasks 2, 5, 6; e2e |
| RN-22e aviso da parte nas metas da família | Task 1 (`familyShareCents`), Task 6, Task 2 (o valor sai da meta), e2e |
| RN-24, RN-25 consequências na família | Task 2 (três casos + família encerrada), já no banco desde o Plano 7 |
| RF-54 Termos e Privacidade acessíveis | Tasks 9, 10; e2e |
| RNF-07 LGPD: exportação, exclusão, política e termos; região São Paulo | Tasks 2–6, 9; lista de lançamento (itens 14, 16, 17) |
| RF-51 trocar e-mail (decisão 22) | Tasks 7, 8, 10; e2e |
| Pendência: nova tentativa em 40P01 | Task 5 |
| Pendência: `families.name` de família encerrada | Task 2 (gatilho + varredura) |
| Pendência: exportar cartão, parcelada, metas, planejado, família | Task 3 (blocos 2, 4–8, 11) |
| Pendência: CSV sem endereços de push; política cita push, e-mail e o resumo do endereço convidado | Task 3 (teste das leituras), Task 9 |
| Pendência: e-mails de troca de e-mail e de confirmação de cadastro | Task 7 |
| Sem chave de serviço em `src/` | Tasks 2, 5, 7 (o teste de guarda é rodado nas Tasks 5, 7 e 11) |
| Supabase Pro e domínio: só documentar | "O que depende de você"; Task 11 Step 5 |

Lacunas conhecidas, registradas: a entrada antiga (sessão com mais de 15 minutos) não é exercitada no e2e — é coberta no banco (relógio por parâmetro) e nas ações; a troca de e-mail no e2e só roda com o banco local; nada deste plano foi executado contra um banco.

**2. Passos:** cada passo de teste traz o código; cada passo de código traz assinatura, arquivo, regras e textos exatos. Completos, porque a forma é a decisão: a migração, a rota de download, as três ações e os dois modelos de e-mail.

**3. Nomes e tipos conferidos entre tarefas:** `csvText`/`csvMoney`/`csvDate`/`csvMonth`/`csvLine` (Task 1) = usos da Task 3; `ExportData`, `exportTransactionPages`, `exportMovementPages`, `exportCsv`, `exportFileName` (Task 3) = rota (Task 4); `delete_my_account`/`session_is_recent`/`account_leftovers` (Task 2) = ações (Tasks 5, 7), consultas (Task 6) e e2e; `REAUTH_DELETE`/`REAUTH_EMAIL`/`CONFIRM_HINT`/`ConfirmEmailState` (Task 5) = formulários (Tasks 6, 8); `loadSignIn`/`loadDeletionContext` (Task 6) = ações (Task 7) e páginas (Tasks 6, 8, 10); `DeletionNotice` (Task 1) = `DeleteForm`; `TOKEN_HASH` (Task 7) = `ConfirmEmailForm`; `LegalController`/`LegalDoc` (Task 9); `authEmailTestIsLocal` (Task 11).

**4. Review Focus:** os cinco itens têm teste na tarefa dona (lista no topo).

**5. Proporção:** o plano carrega o SQL, os testes de banco e de ponta a ponta e os textos jurídicos por extenso (pedido do projeto, como nos Planos 7 e 8); as implementações em TypeScript, fora as de segurança, estão como assinatura e regras.

## Conflitos encontrados na especificação

1. **Copy "Excluir sua conta" / "Excluir minha conta · Manter minha conta" / "Sua conta foi excluída." × terminologia fixa (etapa-2 §1.1: "conta" só para conta a pagar).** Vale a terminologia, como desde o Plano 1 ("Criar meu cadastro"): "Excluir seu cadastro", "Excluir meu cadastro · Manter meu cadastro", "Seu cadastro foi excluído. Obrigado por ter usado a Íris.". **Confirme.**
2. **Copy "Todos os seus dados serão apagados de forma permanente…" × RF-53 e RN-24 (os gastos da família continuam no histórico dela, sem o nome).** Para quem tem gastos numa família que continua, "todos" não é verdade. Decisão 144: o texto da copy aparece para quem não deixa nada; o texto aprovado do RF-53, seguido de "Isso não pode ser desfeito.", para quem deixa gastos na família. **Confirme.**
3. **RNF-07 "dados no Brasil (região São Paulo)" × Netlify.** O banco fica em São Paulo, mas as páginas e as ações do servidor passam pela hospedagem da Netlify, que pode rodar fora do Brasil. A política diz isso com todas as letras; se a exigência for "nada fora do Brasil", é uma decisão de hospedagem que só você pode tomar. **Precisa da sua decisão antes do lançamento.**
4. **"A Íris nunca diz se um endereço tem cadastro" × Supabase Auth.** O serviço responde `email_exists` a quem pede a troca; a tela esconde (mesma resposta), mas quem chama a API direto, com a própria sessão, vê. Limite conhecido, registrado. O cadastro por e-mail tem o mesmo comportamento desde o Plano 1 ("Esse e-mail já tem um cadastro. Quer entrar?", da copy).
5. **RF-51 "editar e-mail" × quem entra com o Google.** Trocar o e-mail de um cadastro sem senha deixaria o e-mail da Íris diferente do e-mail do Google, sem ganho. A troca só é oferecida a cadastros com senha (decisão 151).
6. **A7 A "CSV" × "todos os dados" (tabelas diferentes).** Um arquivo só, em blocos, em vez de vários arquivos compactados (decisão 137): um toque, abre direto na planilha, sem dependência nova.
7. **Copy "Nunca 'Enviar'" × botão "Enviar link".** A própria copy usa "Enviar link" na recuperação de senha; reaproveitado.
8. **Etapa-2 §5 "Supabase Pro no lançamento" × regra "só planos gratuitos, nada contratado".** O plano só documenta; a decisão e a contratação são suas.
9. **Copy da landing, seção 8: "Você pode exportar ou excluir tudo quando quiser." × RN-24.** "Excluir tudo" tem a mesma tensão do conflito 2; fica para o Plano 10 decidir a frase.
10. **Etapa-3 §6 lista "exportar, excluir cadastro" dentro de Configurações × telas próprias.** São páginas sob `/configuracoes/…`, no mesmo padrão de "Nome" e "Saldo inicial".
11. **README "Antes de publicar (Plano 8)" × lista de lançamento do Plano 9.** A seção é renomeada e continua a numeração; nenhum item do Plano 8 sai.
12. **Copy "Rodapé do cadastro" só na tela de cadastro × "Continuar com o Google" na tela de entrar, que também cria cadastro.** A mesma frase aprovada aparece nas duas telas (decisão 155).

## Decisões tomadas neste plano

| # | Decisão | Motivo |
|---|---|---|
| 137 | Baixar meus dados gera **um arquivo CSV só, em blocos** (Cadastro, Registros, Contas e entradas que se repetem, Compras parceladas, Cartões, Metas, Movimentos das metas, Planejamento, Categorias, Lembretes, Família). Separador ponto e vírgula, UTF-8 com a marca que o Excel reconhece, datas `dd/mm/aaaa`, valores `1234,56`. Nome: `iris-meus-dados-AAAA-MM-DD.csv`. (interpretação — confirme) | A7 A; RF-52; abre direto no Excel em português; sem dependência nova. |
| 138 | O arquivo traz só o que é da pessoa, inclusive as contas da família que ela criou e a parte dela nas metas da família. **Não traz**: nada de outros participantes, endereços técnicos dos aparelhos (push), a fila de avisos, e-mails de convidados nem identificadores internos. | RN-17; LGPD; pendência do Plano 8. |
| 139 | Toda célula de texto vai entre aspas; a que começaria com `=`, `+`, `-`, `@` ou tabulação ganha um apóstrofo; quebra de linha vira espaço. | Uma nota como "=1+1" não pode virar fórmula na planilha de ninguém. |
| 140 | O download é um link simples (sem pré-carregamento), só com sessão, nunca guardado (navegador, intermediários, service worker), enviado em partes. Falha no meio interrompe o download; pedido vindo de outro site não baixa nada. | Review Focus 3; decisão 113. |
| 141 | Excluir o cadastro **sem chave de serviço**: função do banco `delete_my_account()`, sem parâmetro, que só enxerga quem chama, apaga a linha de `auth.users` e deixa a cascata e a regra da família (Plano 7) agirem. A migração para ao ser aplicada se o banco não permitir isso. | Decisão 133; pedido de segurança. |
| 142 | **Entrada recente = sessão criada há no máximo 15 minutos**, conferida dentro do banco pela sessão que vem no token (sessão encerrada não vale). Quem está com a sessão mais antiga vê "Por segurança, saia e entre de novo antes de…", com o botão "Sair da Íris" — o mesmo padrão da troca de senha (decisão 23) — e serve igual para quem entra com senha ou com o Google. Vale para excluir o cadastro (no banco) e para trocar o e-mail (na ação). (interpretação — confirme) | Decisões 9 e 23; Review Focus 5. |
| 143 | Depois de excluir: a sessão termina naquele aparelho, a página pública "Seu cadastro foi excluído." aparece, e o navegador apaga a inscrição de lembretes e o que a Íris guardou nele. Outros aparelhos caem em "Entrar" na próxima tela. | RF-53; LGPD; decisão 117. |
| 144 | Tela de exclusão: quem não deixa nada vê o texto da copy; quem tem gastos numa família que continua vê o texto do RF-53 e "Isso não pode ser desfeito."; com parte nas metas da família, "Sua parte nas metas da família ({valor}) também sairá delas." (soma das partes positivas nas metas ativas); administradora com outras pessoas: "A administração da família passa para quem participa há mais tempo." (texto novo). Sem vermelho e sem ícone de alerta. (interpretação — confirme) | RF-53, RN-22e, RN-25, decisão 109; V5; conflito 2. |
| 145 | Dois toques ou duas abas: a segunda chamada encontra o cadastro já excluído e termina igual, sem erro. Impasse no banco (40P01): uma nova tentativa, só nesse caso. | Review Focus 1; pendência do Plano 7. |
| 146 | **Família encerrada não guarda o nome**: vira "Família encerrada" na hora, por qualquer caminho. Quando a exclusão do cadastro deixa uma família encerrada sem nada de outra pessoa, o que sobrou dela (participações anônimas, convites, avisos, metas sem movimento e a própria família) é apagado. Se ainda há algo de quem saiu antes e continua com cadastro, a linha fica, sem nome, até essa pessoa também excluir. (interpretação — confirme) | Pendência do Plano 7; LGPD (não guardar sem necessidade). |
| 147 | O que fica depois da exclusão é só o histórico sem nome de uma família que continua (RN-24, decisão 109) e, por até 7 dias, um convite pendente que outra família tenha enviado para aquele e-mail. | RN-24; decisão 129. |
| 148 | `account_leftovers` (só o papel de serviço): diz onde ainda existe algo de um cadastro. Os testes a usam para provar a exclusão, e você pode usá-la no banco hospedado para conferir um pedido de exclusão. | LGPD; prova da exclusão. |
| 149 | A exclusão também apaga os rastros da pessoa no serviço de login que não saem sozinhos (registro de acessos e pedidos de login em andamento). | LGPD. |
| 150 | Trocar e-mail: pedido em Configurações → E-mail; o Supabase envia um link ao endereço atual e outro ao novo, e a troca só vale com os dois. A tela responde sempre a mesma frase. O link abre uma página com botão (abrir o link não confirma nada) e confirmar não inicia sessão em quem confirma. Uma troca pendente aparece na tela. (interpretação — confirme) | RF-51; decisão 22; Review Focus 4. |
| 151 | Quem entra só com o Google vê o e-mail apenas para leitura. (interpretação — confirme) | Conflito 5. |
| 152 | Modelos de e-mail do Supabase Auth em português para a troca de e-mail e para a confirmação de cadastro (este fica pronto; a confirmação continua desligada). | Pendência do Plano 8. |
| 153 | No ambiente local, o limite de e-mails do Supabase Auth sobe de 2 para 20 por hora. No projeto hospedado o limite é o do painel. | Cada troca envia dois e-mails; os testes precisam de mais de um. |
| 154 | Termos e Política: páginas públicas, texto num arquivo só, em rascunho com aviso visível e sem indexação até você preencher o responsável, o contato, o provedor de e-mail e a data da revisão. | RF-54; RNF-07; texto jurídico pede revisão. |
| 155 | Concordância: a frase da copy no cadastro ("Ao criar seu cadastro, você concorda com…"), agora também em "Entrar" (o Google cria cadastro por lá). Sem caixa de marcar e sem registrar a versão aceita. (interpretação — confirme) | Copy; os requisitos não pedem caixa. |
| 156 | Supabase Pro e domínio próprio ficam só documentados, com o que cada escolha muda. | Pedido do projeto; etapa-2 §5. |

## Textos novos

Fora da copy oficial, para aprovação. Todos em tom calmo, sem exclamação e sem urgência.

**Excluir o cadastro**
1. "A administração da família passa para quem participa há mais tempo."
2. "Por segurança, saia e entre de novo antes de excluir o cadastro."

**Baixar meus dados**
3. "Um arquivo com tudo o que você registrou na Íris: registros, contas que se repetem, cartões, metas, planejamento e categorias. Abre no Excel e em outras planilhas."
4. "O arquivo traz só o que é seu. Nada de outras pessoas da família entra nele."
5. "Baixar arquivo" (link)
6. Títulos dos blocos do arquivo: "Cadastro", "Registros", "Contas e entradas que se repetem", "Compras parceladas", "Cartões", "Metas", "Movimentos das metas", "Planejamento", "Categorias", "Lembretes", "Família"
7. Cabeçalhos do arquivo: os da tabela da Task 3 (por exemplo "Quanto você tinha ao começar", "Cadastro criado em", "De onde veio", "Como pagou", "Gasto da família", "Pago com a meta", "Parte paga pela meta", "Vencimento", "Começou em", "Encerrada em", "Conta da família", "Data da compra", "Valor da meta", "Prazo", "Meta da família", "Movimento", "Planejado", "Lembrete", "Ligado", "Papel", "Desde")
8. Valores do arquivo: "Sim", "Não", "Gasto", "Entrada", "Confirmado", "A pagar", "A receber", "Conta", "Em andamento", "Quitada", "Devolvida", "Ativa", "Usada", "Excluída", "Voltou ao sair da família", "Administra", "Participa", "Meta da família" (meta que a pessoa não alcança mais)

**Trocar e-mail (telas)**
9. "Trocar e-mail" (título)
10. "E-mail atual" e "Novo e-mail" (rótulos)
11. "Esse já é o seu e-mail."
12. "Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois."
13. "Por segurança, saia e entre de novo antes de trocar o e-mail."
14. "Troca pendente para {e-mail}. Ela só vale depois de confirmar pelos dois links."
15. "Confirmar troca de e-mail" (título e botão)
16. "Falta um passo. Confirme também pelo link enviado ao outro endereço."
17. "E-mail alterado. Use o novo endereço para entrar."
18. "Este link não vale mais. Peça a troca de novo em Configurações."

**E-mail de troca de e-mail** (modelo do Supabase)
19. Assunto: "Confirme a troca de e-mail na Íris"
20. "Confirme a troca de e-mail." (título)
21. "Recebemos um pedido para trocar o e-mail do seu cadastro na Íris para {novo e-mail}."
22. "A troca só vale depois de confirmar pelos dois links: o enviado ao e-mail atual e o enviado ao novo."
23. "Se não foi você, é só ignorar este e-mail. O e-mail do cadastro continua o mesmo."

**E-mail de confirmação de cadastro** (modelo pronto; desligado)
24. Assunto: "Confirme seu e-mail na Íris"
25. "Confirme seu e-mail." (título) e "Confirmar e-mail" (link)
26. "Falta só confirmar o e-mail do seu cadastro na Íris."
27. "Se não foi você, é só ignorar este e-mail."

**Termos e Privacidade**
28. "Rascunho em revisão. Este texto ainda será revisado antes do lançamento."
29. "Atualizado em {data}."
30. O texto dos Termos de uso (Task 9, por extenso)
31. O texto da Política de privacidade (Task 9, por extenso)

**Banco**
32. "Família encerrada" (nome que substitui o de uma família encerrada; nenhuma tela o mostra)

**Adaptados da copy por causa da terminologia fixa (conflito 1; não contam como novos, mas peço a confirmação):** "Excluir seu cadastro", "Excluir meu cadastro", "Manter meu cadastro", "Seu cadastro foi excluído. Obrigado por ter usado a Íris."

**Reaproveitados (já aprovados; não contam como novos):** "Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito." (copy), "Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome." (RF-53), "Sua parte nas metas da família ({valor}) também sairá delas." (RN-22e), "Baixar meus dados antes", "Digite EXCLUIR para confirmar.", "Termos de uso", "Política de privacidade", "Ao criar seu cadastro, você concorda com os Termos de uso e a Política de privacidade.", "Enviar link", "Confira o e-mail. Parece que falta alguma coisa.", "Algo não saiu como esperado do nosso lado. Tente novamente em instantes.", "Sair da Íris", "Se o link não abrir, copie este endereço no navegador:", "Íris — Veja para onde seu dinheiro vai", "Guardou", "Tirou", "Usou", "Todo mês", "Todo ano", "Crédito", "Débito", os nomes das cores dos cartões, os oito rótulos de Lembretes, "Aqui aparecem só os gastos marcados como da família.", "O Disponível e as entradas de cada pessoa nunca aparecem aqui.", "E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.", e, do mapa de Configurações do Plano 2 (protótipo `Configuracoes`): "Seus dados", "Baixar meus dados", "Excluir meu cadastro".
