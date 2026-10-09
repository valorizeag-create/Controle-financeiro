# Importar extrato: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa envia o extrato do banco (PDF, CSV ou OFX), escolhe o período, revisa as categorias sugeridas e anota tudo no mês de uma vez, sem duplicar nada.

**Architecture:** A leitura e a classificação são funções puras em `src/domain/importacao/`, que rodam no navegador. O arquivo nunca vai ao servidor. A tela `/extrato/importar` (cliente) monta a revisão com dados que o servidor entrega: categorias, cartões, contas pendentes, registros do período, memória de categorias e impressões já usadas. A confirmação vai por uma server action, que valida tudo e chama a função `import_statement` no banco (`security invoker`, tudo ou nada).

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind 4, Zod 4, Supabase (Postgres 17, RLS), Vitest e jsdom, Playwright, `pdfjs-dist@5.7.284` (dependência nova, carregada só nesta tela).

**Spec:** `docs/superpowers/specs/2026-10-09-importar-extrato-design.md`

## Global Constraints

- Plano gratuito: nenhum serviço pago e nenhuma IA.
- O arquivo é lido no navegador e nunca é enviado nem guardado. O servidor só recebe as linhas confirmadas.
- RLS em toda tabela nova; ninguém lê nem grava o que é de outra pessoa (testes de banco contra o Supabase local).
- A chave service_role nunca aparece em `src/`.
- Limites: arquivo de até 5 MB, extensões `.pdf`, `.csv` e `.ofx`, até 1.000 linhas por importação.
- Todo texto novo entra em `docs/decisoes-para-revisao.md`, seção "Importar extrato", exatamente como está no código. Tom da copy: sem culpa, sem jargão, sem "Ops", botões com verbo e objeto.
- Mobile-first: sem rolagem horizontal a 375 px; respeita "reduzir movimento".
- Nunca pôr em "Outros" sem a pessoa pedir (ação em massa explícita).
- Commits com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca usar `git checkout -- <path>`, `restore`, `reset` ou `stash`.
- Publicação: o SQL vai para o projeto iris2 **antes** do push.

## Review Focus

1. **Extrato com a mesma compra duas vezes no mesmo dia** (dois cafés de R$ 8,00 na mesma padaria): as duas entram, e reimportar não duplica nenhuma. Teste no Task 6: `importKeys` dá chaves diferentes por posição.
2. **CSV em Windows-1252 com acentos** ("Saúde", "Pão de Açúcar"): os acentos aparecem certos, sem "�". Teste no Task 2.
3. **Valor sem sinal, com débito e crédito em colunas separadas, e linha de saldo no meio**: os sinais saem certos e o saldo é ignorado. Testes nos Tasks 2 e 4.
4. **Período escolhido que corta o arquivo**: só entram as linhas entre De e Até, com os dois extremos incluídos. Teste no Task 6.
5. **A categoria lembrada foi excluída depois**: a memória some junto (cascade) e a linha volta a pedir categoria. Testes nos Tasks 1 (banco) e 5 (domínio: id ausente nas categorias atuais é ignorado).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261010000001_importar_extrato.sql` | `transactions.import_key`, `import_rules`, `import_statement()` |
| `src/domain/importacao/tipos.ts` | Tipos compartilhados |
| `src/domain/importacao/valores.ts` | `parseAmount`, `parseDate`, `decodeBytes` |
| `src/domain/importacao/csv.ts` | Leitura de CSV e detecção de colunas |
| `src/domain/importacao/ofx.ts` | Leitura de OFX |
| `src/domain/importacao/pdf-texto.ts` | Linhas de texto do PDF → lançamentos (puro) |
| `src/features/importacao/ler-pdf.ts` | Carrega o `pdfjs-dist` e extrai os itens de texto (navegador) |
| `src/domain/importacao/normalizar.ts` | `normalizeMerchant`, `prettyNote` |
| `src/domain/importacao/dicionario.ts` | Palavras → `default_key`; detecção de fatura, transferência e salário |
| `src/domain/importacao/classificar.ts` | Memória > dicionário > nada |
| `src/domain/importacao/revisar.ts` | `importKeys`, período, duplicados, contas pendentes → `ReviewLine[]` |
| `src/features/importacao/schemas.ts`, `actions.ts`, `queries.ts` | Contexto do servidor, validação e salvamento |
| `src/features/importacao/*.tsx` | As três etapas da tela e o ajuste de colunas |
| `src/app/(app)/extrato/importar/page.tsx` | Rota |

---

### Task 1: Banco (import_key, memória de categorias, import_statement)

**Files:**
- Create: `supabase/migrations/20261010000001_importar_extrato.sql`
- Create (fora do git): `docs/copy/banco-importar-extrato.sql`, com o mesmo SQL em `begin; … commit;` e o `insert into supabase_migrations.schema_migrations (version, name) values ('20261010000001', 'importar_extrato') on conflict do nothing;`
- Test: `tests/db/importar-extrato.test.ts`, usando `newUser`, `removeUsers` e `categoryId` de `tests/db/helpers.ts`, como no `plano4.test.ts`

**Interfaces:**
- Produces:
  - Coluna `transactions.import_key text null`, com índice único `transactions_user_import_key_uidx on (user_id, import_key) where import_key is not null`.
  - Tabela `import_rules (user_id uuid, merchant_key text check 1..60 chars, kind text check in ('income','expense'), category_id uuid, source text null check ≤ 40, updated_at timestamptz default now())`, com PK `(user_id, merchant_key, kind)`, FK `(category_id, user_id) → categories(id, user_id) on delete cascade` e FK `user_id → auth.users on delete cascade`. Cada regra tem categoria (gasto) ou origem (entrada): `check ((kind = 'expense') = (category_id is not null))`. RLS com a política `import_rules_own` (`for all to authenticated using/with check user_id = auth.uid()`).
  - Função `public.import_statement(p_lines jsonb, p_card_id uuid default null) returns integer`, com `security invoker` e `set search_path = ''`. Cada item: `{import_key text, kind text, amount_cents bigint, occurred_on date, category_id uuid|null, source text|null, note text|null, bill_id uuid|null, merchant_key text|null}`. Para cada item:
    - com `bill_id`: `update transactions set status='confirmed', paid_on=occurred_on, import_key=… where id=bill_id and user_id=auth.uid() and status='pending'`;
    - sem `bill_id`: `insert … (user_id=auth.uid(), card_id=p_card_id quando kind='expense', status 'confirmed') on conflict (user_id, import_key) where import_key is not null do nothing`.
    - Com `merchant_key` não nulo: faz upsert em `import_rules`.
    - Retorna o número de linhas inseridas ou atualizadas. Fora do Postgres não há validação extra: os checks e a RLS existentes valem. `grant execute … to authenticated`; `revoke … from public, anon`.

- [ ] **Step 1: Write the failing DB tests**
  - `'import_statement anota as linhas, ignora import_key repetida e devolve quantas entraram'`: insere 2 linhas, depois as mesmas 2 mais 1 nova; espera `2` e depois `1`, e 3 registros no total.
  - `'marca a conta pendente como paga em vez de criar gasto'`: cria uma ocorrência `pending`; linha com `bill_id`; espera `status = 'confirmed'`, `paid_on = occurred_on` e nenhum registro novo.
  - `'grava a memória e a categoria excluída apaga a memória junto'`: linha com `merchant_key: 'padaria do ze'`; espera a regra; exclui a categoria (`delete_category` ou delete direto) e espera 0 regras.
  - `'tudo ou nada: uma linha inválida desfaz as outras'`: duas linhas, a segunda com `amount_cents: 0`; espera erro e 0 registros.
  - `'RLS: Bia não lê nem grava a memória de Ana, e não usa a conta pendente de Ana'`: `b.client.from('import_rules').select()` vazio; `insert` com `user_id` de Ana falha; `import_statement` de Bia com o `bill_id` de Ana atualiza 0 linhas.
  - `'gasto de cartão leva card_id; entrada não'`.

- [ ] **Step 2: Run** `npm run test:db -- importar-extrato`. Expected: FAIL (função ou tabela inexistente). Sem Docker, registrar "não executado: Docker ausente" no relatório da tarefa e seguir. O teste continua no repositório.

- [ ] **Step 3: Write the migration** com as interfaces acima e um comentário de cabeçalho no estilo das outras migrações.

- [ ] **Step 4: Run** `npm run test:db -- importar-extrato` (quando houver Docker). Expected: PASS.

- [ ] **Step 5: Commit** `feat(db): importar extrato (import_key, memória de categorias, import_statement)`

---

### Task 2: Valores, datas, codificação e CSV

**Files:**
- Create: `src/domain/importacao/tipos.ts`, `src/domain/importacao/valores.ts`, `src/domain/importacao/csv.ts`
- Test: `src/domain/importacao/valores.test.ts`, `src/domain/importacao/csv.test.ts`

**Interfaces:**
- Produces (`tipos.ts`):
```ts
export type Direction = 'in' | 'out'
export type RawLine = { date: ISODate; description: string; amountCents: number; direction: Direction } // amountCents > 0
export type ParseResult = { lines: RawLine[]; skipped: number }
export type CsvMapping = { date: number; description: number; amount?: number; debit?: number; credit?: number }
export type CsvResult = ({ ok: true } & ParseResult) | { ok: false; headers: string[]; preview: string[][] }
```
- Produces (`valores.ts`): `parseAmount(s: string): { cents: number; direction: Direction } | null`, `parseDate(s: string): ISODate | null`, `decodeBytes(bytes: Uint8Array): string`.
- Produces (`csv.ts`): `parseCsv(text: string, mapping?: CsvMapping): CsvResult`, `periodOf(lines: RawLine[]): { from: ISODate; to: ISODate } | null`.

- [ ] **Step 1: Write the failing tests**
  - `parseAmount`: `'-1.234,56'` → `{cents:123456, direction:'out'}`; `'1.234,56 D'` → out; `'50,00 C'` → in; `'1234.56'` → in; `'R$ -12,30'` → out; `'(12,30)'` → out; `''`, `'abc'`, `'0,00'` → `null`.
  - `parseDate`: `'09/10/2026'` → `'2026-10-09'`; `'09/10/26'` → `'2026-10-09'`; `'2026-10-09'`; `'2026-10-09T10:00:00'` → `'2026-10-09'`; `'31/02/2026'` → null.
  - `decodeBytes`: os bytes Windows-1252 de `'Saúde;Pão de Açúcar'` decodificam sem `'�'`; os bytes UTF-8 continuam iguais; o BOM some.
  - `parseCsv`:
    - `;` com cabeçalho `Data;Histórico;Valor` → 3 linhas.
    - `,` com `Date,Description,Amount` e valores `-12.30` (formato do Nubank).
    - Colunas `Data;Lançamento;Débito;Crédito` com só uma preenchida por linha (Itaú/BB).
    - Cabeçalho na 4ª linha (linhas de título antes).
    - Linha `SALDO DO DIA` ignorada, com `skipped` 1.
    - Linha com data inválida: `skipped` 1.
    - Campos entre aspas com `;` dentro.
    - Cabeçalho desconhecido → `{ok:false, headers, preview}`, com `preview` de até 5 linhas; com `mapping` informado → `ok: true`.
  - `periodOf`: menor e maior data, e `null` sem linhas.

- [ ] **Step 2: Run** `npx vitest run src/domain/importacao`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `decodeBytes`: tenta `new TextDecoder('utf-8', {fatal:true})` e, se der erro, usa `'windows-1252'`.
  - Separador: o que mais aparece entre `;`, `,` e tab nas 10 primeiras linhas, sem contar o que está dentro de aspas.
  - Cabeçalho: a primeira linha (até a 15ª) em que, sem acento e em minúsculas, algum campo contém `data`/`date` e outro contém `valor`/`amount`/`debito`/`credito`/`entrada`/`saida`.
  - Descrição: `historico`, `descricao`, `description`, `lancamento`, `title` ou `estabelecimento`.
  - Saldo: descrição começando com `saldo` → `skipped`.

- [ ] **Step 4: Run** a mesma linha de comando. Expected: PASS.

- [ ] **Step 5: Commit** `feat(importar): leitura de CSV, valores e datas`

---

### Task 3: OFX

**Files:**
- Create: `src/domain/importacao/ofx.ts`
- Test: `src/domain/importacao/ofx.test.ts`

**Interfaces:**
- Consumes: `RawLine`, `ParseResult` e `parseDate` (Task 2).
- Produces: `parseOfx(text: string): ParseResult`.

- [ ] **Step 1: Write the failing tests**
  - OFX SGML (sem tags de fechamento) com 3 `<STMTTRN>`: `TRNAMT -45.90` → out 4590; `TRNAMT 1500.00` → in; `DTPOSTED 20261009120000[-3:BRT]` → `'2026-10-09'`.
  - A descrição vem de `MEMO`; se estiver vazio, de `NAME`.
  - OFX XML com as mesmas transações → o mesmo resultado.
  - `TRNAMT 0` ou sem `DTPOSTED` → `skipped`.

- [ ] **Step 2: Run** `npx vitest run src/domain/importacao/ofx.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Separar os blocos por `<STMTTRN>` e ler cada campo com a regex `<TAG>([^<\r\n]*)`. `TRNAMT` usa ponto decimal.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(importar): leitura de OFX`

---

### Task 4: PDF

**Files:**
- Create: `src/domain/importacao/pdf-texto.ts` (puro), `src/features/importacao/ler-pdf.ts` (navegador)
- Modify: `package.json` (adicionar `"pdfjs-dist": "5.7.284"` em dependencies; `npm install` atualiza o lockfile)
- Test: `src/domain/importacao/pdf-texto.test.ts`

**Interfaces:**
- Consumes: `parseAmount`, `parseDate`, `ParseResult` (Task 2).
- Produces:
  - `type TextItem = { str: string; x: number; y: number; page: number }`
  - `linesFromItems(items: TextItem[]): string[]`: agrupa por página e por `y` (tolerância de 2), ordena por `x` e junta com espaço.
  - `parseStatementLines(lines: string[], year: number): ParseResult`
  - `readPdf(file: File): Promise<ParseResult | { error: 'senha' | 'sem-texto' }>`

- [ ] **Step 1: Write the failing tests** (`pdf-texto.test.ts`)
  - `linesFromItems`: itens embaralhados de 2 linhas → 2 strings na ordem certa; uma linha quebrada em itens com `y` 100,0 e 101,5 vira uma linha só.
  - `parseStatementLines`:
    - `'07/10 COMPRA CARTAO PADARIA DO ZE -12,30'` com `year` 2026 → `{date:'2026-10-07', description:'COMPRA CARTAO PADARIA DO ZE', amountCents:1230, direction:'out'}`.
    - `'07/10/2026 PIX RECEBIDO MARIA 150,00 C'` → in.
    - `'08/10/2026 UBER *TRIP 23,90 D 1.204,50'` (valor seguido do saldo): usa o **primeiro** valor depois da descrição e ignora o saldo final.
    - `'SALDO ANTERIOR 1.000,00'` e linhas sem data → ignoradas, sem contar como `skipped`.
    - Data `dd/mm` sem ano usa `year`.

- [ ] **Step 2: Run** `npx vitest run src/domain/importacao/pdf-texto.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `parseStatementLines`: a regex do começo pega a data `^(\d{2}/\d{2}(?:/\d{2,4})?)\s+`. Os valores monetários são os tokens que casam com `-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[DC])?`. O primeiro deles é o valor; a descrição é o texto entre a data e esse valor.
  - `readPdf`: `const pdfjs = await import('pdfjs-dist')`; `pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. `PasswordException` → `{error:'senha'}`; nenhum item de texto → `{error:'sem-texto'}`. O ano vem do ano mais frequente encontrado no texto (`\b20\d{2}\b`); sem nenhum, o ano atual.
  - `readPdf` é testado no navegador no Task 8.
- [ ] **Step 4: Run.** Expected: PASS. Conferir que `npm run build` passa com o import dinâmico.
- [ ] **Step 5: Commit** `feat(importar): leitura de PDF (pdfjs-dist, carregado só na importação)`

---

### Task 5: Normalização, dicionário e classificação

**Files:**
- Create: `src/domain/importacao/normalizar.ts`, `src/domain/importacao/dicionario.ts`, `src/domain/importacao/classificar.ts`
- Test: um `.test.ts` para cada um

**Interfaces:**
- Produces:
  - `normalizeMerchant(desc: string): string`: até 60 caracteres, regras da seção 6 do spec.
  - `prettyNote(desc: string): string`: descrição sem prefixos e com a primeira letra de cada palavra maiúscula; até 140 caracteres.
  - `dictionaryKey(merchant: string): string | null`: devolve uma `default_key` (`casa`, `mercado`, `transporte`, `comer_fora`, `saude`, `lazer`, `assinaturas`, `educacao`, `compras`).
  - `specialOf(desc: string, origin: 'conta' | 'cartao'): 'fatura' | 'transferencia' | 'pagamento-fatura-no-cartao' | 'estorno' | 'salario' | null`
  - `type Rule = { merchantKey: string; kind: 'income' | 'expense'; categoryId: string | null; source: string | null }`
  - `classify(line: RawLine, ctx: { rules: Rule[]; categories: Category[] }): { kind: 'income' | 'expense'; categoryId: string | null; source: string | null; via: 'memoria' | 'dicionario' | null }`

- [ ] **Step 1: Write the failing tests**
  - `normalizeMerchant`:
    - `'COMPRA CARTAO 07/10 PADARIA DO ZE SAO PAULO BR'` → `'padaria do ze'`
    - `'IFD*IFOOD.COM AGENCIA DE RESTA'` → `'ifood.com agencia de resta'`
    - `'PIX ENVIADO 12345678900 JOAO SILVA'` → `'joao silva'`
    - `'MP *MERCADOLIVRE'` → `'mercadolivre'`
    - `'Pão de Açúcar - Loja 123'` → `'pao de acucar - loja'`
  - `prettyNote('COMPRA CARTAO PADARIA DO ZE')` → `'Padaria Do Ze'`.
  - `dictionaryKey`:
    - `'uber trip'` → `transporte`; `'ifood.com'` → `comer_fora`; `'supermercado dia'` → `mercado`
    - `'droga raia'` → `saude`; `'netflix.com'` → `assinaturas`; `'enel sp'` → `casa`
    - `'amazon marketplace'` → `compras`; `'amazon prime'` → `assinaturas` (a mais específica ganha)
    - `'udemy'` → `educacao`; `'cinemark'` → `lazer`; `'loja qualquer'` → `null`
  - `specialOf`:
    - `('PAGAMENTO FATURA NUBANK','conta')` → `fatura`
    - `('APLICACAO CDB','conta')` → `transferencia`; `('TRANSF MESMA TITULARIDADE','conta')` → `transferencia`
    - `('PAGAMENTO RECEBIDO','cartao')` → `pagamento-fatura-no-cartao`
    - `('ESTORNO UBER','cartao')` → `estorno`
    - `('PAGTO SALARIO EMPRESA X','conta')` → `salario`
  - `classify`:
    - Uma regra na memória vence o dicionário.
    - Regra cuja `categoryId` não existe mais em `categories` é ignorada (Review Focus 5).
    - Dicionário resolve pela `defaultKey` mesmo com a categoria renomeada ("Supermercado").
    - `direction: 'in'` → `kind: 'income'`; salário → `source: 'Salário'`.
    - Nada encontrado → `categoryId: null, via: null`.

- [ ] **Step 2: Run** `npx vitest run src/domain/importacao`. Expected: FAIL.
- [ ] **Step 3: Implement.** O dicionário é uma lista ordenada `[palavra, chave]`, com as entradas mais específicas primeiro e as palavras da Parte 3 do spec. A busca é por limite de palavra na descrição normalizada.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(importar): normalização, dicionário e classificação`

---

### Task 6: Montar a revisão (período, impressões, duplicados, contas)

**Files:**
- Create: `src/domain/importacao/revisar.ts`
- Test: `src/domain/importacao/revisar.test.ts`

**Interfaces:**
- Consumes: Tasks 2 e 5. Do app: `TxRow` (`src/features/registro/tx-row.ts`) e `Category`.
- Produces:
```ts
export type Reason = 'ja-importada' | 'ja-anotada' | 'fatura' | 'transferencia' | 'pagamento-fatura-no-cartao'
export type ReviewLine = {
  importKey: string; date: ISODate; description: string; note: string; merchantKey: string
  amountCents: number; kind: 'income' | 'expense'; categoryId: string | null; source: string | null
  checked: boolean; reason: Reason | null; similarTxId: string | null; billId: string | null
}
export async function importKeys(lines: RawLine[]): Promise<string[]>
export async function buildReview(input: {
  lines: RawLine[]; from: ISODate; to: ISODate; origin: 'conta' | 'cartao'
  rules: Rule[]; categories: Category[]; existing: TxRow[]; usedKeys: Set<string>
}): Promise<{ lines: ReviewLine[]; alreadyImported: number }>
```
  - `existing` são os registros da pessoa entre `from − 5 dias` e `to + 5 dias` (confirmados e pendentes). `usedKeys` são as `import_key` já gravadas nesse intervalo.

- [ ] **Step 1: Write the failing tests**
  - `importKeys`: SHA-256 hex de `date|amountCents|direction|normalizeMerchant(description)|n`, em que `n` é a posição entre linhas iguais. Duas linhas idênticas dão chaves diferentes (Review Focus 1), e o resultado é estável entre chamadas.
  - O período inclui `from` e `to` e exclui o dia anterior e o seguinte (Review Focus 4).
  - Chave em `usedKeys` → fora de `lines` e contada em `alreadyImported`.
  - Gasto de R$ 89,00 em 07/10 com um registro manual de R$ 89,00 em 05/10 (sem `import_key`) → `checked: false`, `reason: 'ja-anotada'`, `similarTxId`. Um segundo gasto igual no mesmo extrato não casa com o mesmo registro.
  - Gasto de R$ 102,00 em 12/10 com uma ocorrência `pending` de R$ 100,00 com vencimento em 10/10 → `billId` dela, `checked: true`, sem categoria obrigatória. Com R$ 120,00 (mais de 5%) não casa.
  - Fatura e transferência → `checked: false` com o motivo. Origem `cartao` com `pagamento-fatura-no-cartao` → `checked: false`. Estorno no cartão → `kind: 'income'`.
  - Ordem: primeiro as linhas marcadas sem categoria (gasto sem `billId`); depois o resto por data decrescente.

- [ ] **Step 2: Run** `npx vitest run src/domain/importacao/revisar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** O hash usa `crypto.subtle.digest('SHA-256', …)`, que existe no navegador e no Node 20.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(importar): revisão com período, impressões, duplicados e contas pendentes`

---

### Task 7: Servidor (contexto, validação, salvar)

**Files:**
- Create: `src/features/importacao/queries.ts`, `src/features/importacao/schemas.ts`, `src/features/importacao/actions.ts`
- Test: `schemas.test.ts` e `actions.test.ts`, no estilo de `src/features/cartoes/actions.test.ts` (Supabase falso, `setFlash` e `revalidatePath` mockados)

**Interfaces:**
- Produces:
  - `loadImportContext(from: ISODate, to: ISODate): Promise<{ categories: Category[]; cards: CardRow[]; existing: TxRow[]; usedKeys: string[]; rules: Rule[] }>`, que usa `requireUser` e as consultas que já existem (`loadCategories`, `loadCards`, leitura de `transactions` por intervalo com as colunas de `tx-row`, `import_rules`).
  - Server action `loadContextAction(from, to)` que devolve esse contexto para o cliente, porque o período só é conhecido depois de ler o arquivo.
  - `importLineSchema` (Zod): `importKey` hex de 64; `kind`; `amountCents` inteiro de 1 a 9.999.999.999; `occurredOn` ISO; `categoryId` uuid ou null; `source` de até 40 ou null; `note` de até 140; `billId` uuid ou null; `merchantKey` de até 60 ou null. Gasto sem `billId` exige `categoryId`.
  - `importSchema = z.object({ cardId: z.uuid().nullable(), lines: z.array(importLineSchema).min(1).max(1000) })`
  - Server action `saveImport(payload: unknown): Promise<{ status: 'error'; message: string } | never>`. Valida, confere que `cardId` e todos os `categoryId` são da pessoa e chama `supabase.rpc('import_statement', { p_lines, p_card_id })`. No sucesso: `setFlash(\`${n} registros anotados.\`)` (ou `'1 registro anotado.'`), `revalidatePath('/', 'layout')` e `redirect('/inicio')`. No erro: `{ status: 'error', message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.' }`.

- [ ] **Step 1: Write the failing tests**
  - O schema recusa 1.001 linhas, `amountCents` 0, gasto sem categoria e sem conta, e `importKey` fora do formato.
  - `saveImport` monta o `p_lines` em snake_case exatamente como o Task 1 espera.
  - Categoria de outra pessoa → erro sem chamar a RPC.
  - Erro da RPC → a mensagem acima.
  - Flash no singular e no plural.

- [ ] **Step 2: Run** `npx vitest run src/features/importacao`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(importar): contexto, validação e salvamento no servidor`

---

### Task 8: Tela de importar e pontos de entrada

**Files:**
- Create: `src/app/(app)/extrato/importar/page.tsx`, `src/features/importacao/importar.tsx` (orquestra as etapas), `etapa-arquivo.tsx`, `ajuste-colunas.tsx`, `etapa-revisao.tsx`
- Modify:
  - `src/app/(app)/extrato/(tela)/page.tsx`: botão "Importar extrato" no cabeçalho (`Button variant="secondary" href="/extrato/importar"`)
  - `src/app/(app)/mais/page.tsx`: linha depois de "Contas"
  - `src/features/shell/nav-items.ts`: `SIDEBAR_ITEMS` ganha `{ href: '/extrato/importar', label: 'Importar extrato', icon: FileUp, match: ['/extrato/importar'] }` depois de Extrato. O `match` do Extrato não pode marcar os dois ao mesmo tempo: `isActive` do Extrato passa a excluir `/extrato/importar`.
  - `src/features/registro/anotar-form.tsx`: o link no fim (só quando `!record`)
- Test: `importar.test.tsx`, `etapa-revisao.test.tsx` e testes dos pontos de entrada

**Interfaces:**
- Consumes: `parseCsv`, `parseOfx`, `readPdf`, `decodeBytes`, `periodOf` e `buildReview` (Tasks 2 a 6); `loadContextAction` e `saveImport` (Task 7); `CHIP`, `Button`, `FormAlert` e `CardFace` de `src/ui` e de cartões.
- `/extrato/importar` já cai em `isSheetRoute` (`/^\/extrato\/[^/]+$/`): fica sem barra inferior, e o rodapé fixo da revisão ocupa o lugar dela. Isso é intencional; o teste confirma.

**Textos** (exatos; também vão para a lista no Task 9):
"Importar extrato" · "Escolher arquivo" · "PDF, CSV ou OFX, até 5 MB." · "De onde é este extrato?" · "Conta do banco" · "De" · "Até" · "O arquivo é lido aqui no seu aparelho. Só os registros que você confirmar são salvos." · "Ver o que a Íris encontrou" · "Escolha a categoria" · "Pôr em Outros as {n} sem categoria" · "Parece que você já anotou isto: {categoria}, {valor}, {data}" · "Pagamento de fatura: as compras do cartão já contam uma a uma." · "Parece dinheiro entre suas contas." · "Pagamento da própria fatura: não é gasto." · "Marcar {conta} como paga" · "{n} linhas já importadas antes." · "{n} linhas que a Íris não entendeu." · "{g} gastos · {e} entradas" · "Anotar {n} registros" (no singular, "Anotar 1 registro") · "Qual coluna é a data? E a descrição? E o valor?" · "Data" · "Descrição" · "Valor" · "Usar estas colunas" · "Não conseguimos ler este PDF. Tente o arquivo CSV ou OFX do seu banco." · "Este PDF tem senha. Baixe de novo sem senha, ou use o CSV ou o OFX." · "Este arquivo passa de 5 MB. Escolha um período menor no app do banco." · "Escolha um arquivo PDF, CSV ou OFX." · "Nenhum registro neste período." · "Tem o extrato do banco? Importar"

- [ ] **Step 1: Write the failing tests** (jsdom, com `loadContextAction` e `saveImport` mockados e um `File` de CSV)
  - Escolher um CSV → aparece o período detectado e "Ver o que a Íris encontrou".
  - Arquivo `.txt` → "Escolha um arquivo PDF, CSV ou OFX."; arquivo de 6 MB → mensagem dos 5 MB.
  - CSV com cabeçalho desconhecido → ajuste de colunas → "Usar estas colunas" → revisão.
  - Revisão: as linhas sem categoria vêm primeiro; "Anotar" fica desligado até escolher; "Pôr em Outros as 2 sem categoria" liga o botão; desmarcar uma linha muda o resumo e o número do botão.
  - "Anotar 3 registros" chama `saveImport` com 3 linhas e o `cardId` escolhido.
  - Pontos de entrada: o botão do Extrato, a linha do Mais, o item do menu lateral e o link no Anotar levam a `/extrato/importar`. Com o caminho `/extrato/importar`, `isActive` do Extrato é falso e o do item novo é verdadeiro.

- [ ] **Step 2: Run** `npx vitest run src/features/importacao src/features/shell src/features/registro`. Expected: FAIL.
- [ ] **Step 3: Implement**, no visual do Extrato e do Anotar:
  - Lista por dia; `CHIP` para o tipo; `<select>` de categoria com a classe dos selects do Anotar.
  - Rodapé `sticky bottom-0`, com `pb-[env(safe-area-inset-bottom)]`.
  - A página é Server Component (`requireUser` acontece no layout) e renderiza `<Importar cards={…} />`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Verificar no navegador real** (página temporária em `src/app/api/jobs/zz-*` com o contexto falso, como nas tarefas de animação; apagar depois):
  - Um PDF gerado na hora com 5 lançamentos (por exemplo com `pdf-lib` num script de rascunho fora do repositório).
  - Um CSV em Windows-1252.
  - Um OFX.
  - A 375 px, sem rolagem horizontal, e com o rodapé visível.
  - Prints.
- [ ] **Step 6: Commit** `feat(importar): tela de importar extrato e pontos de entrada`

---

### Task 9: Dados, privacidade, textos e documentação

**Files:**
- Modify:
  - `src/features/dados/export-queries.ts` e `export-csv.ts`: bloco "Memória de categorias", com colunas "Descrição" e "Categoria ou origem", depois de "Categorias"
  - `src/features/legal/content.ts`: a frase do spec §9, na seção sobre o que a Íris guarda, marcada como pendente de revisão jurídica, como os outros trechos
  - `docs/decisoes-para-revisao.md`: seção "Importar extrato", com todos os textos do Task 8 e o do bloco de dados
  - `README.md`: lista de lançamento, item 24 (validar com extratos reais; revisão jurídica da frase)
  - `docs/progresso.md`: seção "Importar extrato"
- Test: `export-csv.test.ts` (bloco novo, vazio e preenchido) e o teste de `content.ts` que já existe

- [ ] **Step 1: Write the failing tests.** O CSV contém `'"Memória de categorias"\r\n"Descrição";"Categoria ou origem"\r\n'` e uma linha `'"padaria do ze";"Mercado"\r\n'`. O `TITLES` do teste ganha o bloco.
- [ ] **Step 2: Run** `npx vitest run src/features/dados src/features/legal`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/features/dados src/features/legal` e `npm run textos`. Expected: PASS. `textos` não lista nenhum dos textos novos.
- [ ] **Step 5: Commit** `feat(importar): memória no "Baixar meus dados", privacidade e textos`

---

### Task 10: Ponta a ponta e verificação final

**Files:**
- Create: `tests/e2e/importar.spec.ts`, com um CSV de exemplo gerado no próprio teste
- Modify: `tests/e2e/acessibilidade.spec.ts` (`APP` ganha `/extrato/importar`)

- [ ] **Step 1: Write the tests** (precisam do Docker):
  - Fluxo completo: CSV → revisão → escolher a categoria → anotar → Seu mês com "3 registros anotados." e o Disponível certo.
  - Reimportar o mesmo arquivo → "3 linhas já importadas antes." e "Nenhum registro neste período.".
  - 375 px: `expectNoHorizontalScroll` na revisão.
- [ ] **Step 2: Run tudo:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx playwright test --grep @publico` e (com Docker) `npm run test:db` e `npx playwright test`. Expected: tudo passa. Sem Docker, registrar o que não rodou.
- [ ] **Step 3: Commit** `test(importar): ponta a ponta e acessibilidade`
- [ ] **Step 4: Publicação** (só com o "ok" da pessoa responsável): ela cola `docs/copy/banco-importar-extrato.sql` no SQL Editor do iris2. Conferir via REST que `import_rules` existe. Depois, push e conferência do deploy.
