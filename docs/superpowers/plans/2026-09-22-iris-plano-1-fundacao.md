# Íris — Plano 1: Fundação e núcleo individual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma pessoa cria o cadastro (e-mail ou Google), entra, anota gastos e entradas e vê o "Seu mês" com Disponível, Entrou, Saiu, maior gasto, categorias, últimos registros e Saldo total corretos — no celular e no desktop.

**Architecture:** Next.js 16 (App Router, Server Components e Server Actions) servindo o app; Supabase (Postgres + Auth) guardando os dados com row level security. Todas as fórmulas de dinheiro ficam em `src/domain/`, funções puras testadas; o banco guarda só registros (livro-razão) e os números são sempre calculados.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react, Vitest 5 + Testing Library, Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (regras RN e RF), `docs/etapa-3-arquitetura.md` (modelo de dados, decisões A1–A8), `docs/etapa-5-ui.md` (tokens), protótipo https://claude.ai/artifact/6WwTy3f8GoUcuXYigncNLd, copy oficial https://claude.ai/artifact/GjLmkNKXindMZcm1z49gLq.

## Global Constraints

- Idioma pt-BR, moeda somente R$ (RN-28). Fuso fixo `America/Sao_Paulo` para "hoje" e "mês".
- Dinheiro sempre em **centavos inteiros** (`number` seguro); nunca `float` para somas. Valor máximo aceito: R$ 99.999.999,99 (`9_999_999_999` centavos).
- "Mês" = mês do calendário (A2). Disponível não herda sobra (RN-02).
- Conta paga com atraso conta no mês do pagamento (A1 B): mês efetivo = `paid_on ?? occurred_on`.
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar. Nunca "conta" para o acesso do usuário.
- Todo texto de interface vem da copy oficial; textos novos listados na seção "Textos novos" deste plano (já submetidos ao usuário).
- Sem vermelho de alerta; vermelho só para erro de sistema/campo (V5). Disponível negativo aparece como `−R$ 142,30`, na mesma cor.
- Alvos de toque ≥ 44 px; texto 15–16 px no celular; contraste WCAG AA.
- Botões: verbo + objeto ("Salvar gasto"). Sem exclamação em mensagens de estado.
- Nenhuma chave secreta no bundle do navegador: só `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` são públicas; `SUPABASE_SECRET_KEY` só em testes.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Valor digitado de vários jeitos** ("1.234,56", "12,5", "1.5", "R$ 10", espaço não separável, valor gigante) — deve virar o centavo certo ou dar "Esse valor não parece certo. Use apenas números." (testes na Task 2).
2. **Gasto anotado perto da meia-noite** — às 23h30 de 30/09 em Brasília o "Hoje" é 30/09, não 01/10; o servidor resolve "Hoje/Ontem" no fuso de Brasília (testes nas Tasks 3 e 8).
3. **Disponível negativo** — quem gastou mais do que entrou vê `−R$ 142,30` sem cor de alarme (teste na Task 12).
4. **Toque duplo em "Salvar gasto"** — o botão fica desativado enquanto salva; não cria dois registros (teste na Task 11).
5. **Dados de outra pessoa** — enviar o id de categoria de outra pessoa ou ler registros alheios é barrado pelo banco (teste na Task 6); link de retorno de login não pode redirecionar para outro site (teste na Task 7).

---

## Pré-requisitos (feitos por você, com minha orientação)

Eu não posso criar contas nem digitar chaves; estes passos são seus:

1. Criar um projeto no Supabase (plano gratuito), **região São Paulo (sa-east-1)**, nome `iris-dev`.
2. Em *Authentication → Sign In / Providers → Email*: desligar **"Confirm email"** no projeto de desenvolvimento (o protótipo aprovado vai do cadastro direto ao app; ver decisão D1 no fim).
3. Em *Authentication → Providers → Google*: ativar com um Client ID/Secret do Google Cloud (posso guiar passo a passo). Até lá, o botão Google fica visível, mas o login por e-mail funciona sozinho.
4. Copiar para `.env.local` (arquivo que só existe na sua máquina): URL do projeto, *publishable key* e *secret key*.
5. Rodar `npx supabase login` uma vez (abre o navegador).

---

## Estrutura de arquivos

```
src/
  app/
    layout.tsx                      raiz: fonte Geist, idioma, tokens
    globals.css                     tokens da Etapa 5 no Tailwind
    page.tsx                        "/" → /entrar (landing vem no Plano 10)
    (auth)/layout.tsx               moldura das telas de acesso
    (auth)/entrar/page.tsx
    (auth)/criar-cadastro/page.tsx
    (auth)/recuperar-senha/page.tsx
    (auth)/nova-senha/page.tsx
    auth/callback/route.ts          retorno do Google e do link de senha
    (app)/layout.tsx                casca: barra inferior / menu lateral / aviso
    (app)/inicio/page.tsx           Seu mês
    (app)/anotar/page.tsx           Anotar gasto / Registrar entrada
  proxy.ts                          renova sessão e protege rotas (Next 16)
  domain/
    money.ts (+ .test.ts)           centavos ⇄ texto
    dates.ts (+ .test.ts)           hoje/mês em Brasília
    summary.ts (+ .test.ts)         Disponível, Entrou, Saiu, Saldo total…
    breakdown.ts (+ .test.ts)       gastos por categoria
  lib/
    env.ts                          variáveis públicas validadas
    supabase/server.ts, browser.ts, proxy.ts
    forms.ts (+ .test.ts)           estado de formulário e erros do Zod
    flash.ts                        aviso "Anotado." entre páginas
  features/
    auth/routes.ts (+ .test.ts)     rotas públicas, safeNext
    auth/schemas.ts (+ .test.ts)
    auth/actions.ts
    auth/forms.tsx
    registro/schemas.ts (+ .test.ts)
    registro/actions.ts
    registro/queries.ts
    registro/anotar-form.tsx
    seu-mes/*.tsx (+ hero.test.tsx)
    shell/nav-items.ts, bottom-nav.tsx, sidebar.tsx, toast.tsx
  ui/
    button.tsx, card.tsx, text-field.tsx, form-alert.tsx, money.tsx, logo.tsx (+ ui.test.tsx)
supabase/migrations/20260922000001_nucleo.sql
tests/db/rls.test.ts
tests/e2e/nucleo.spec.ts
vitest.config.ts, vitest.db.config.ts, playwright.config.ts, netlify.toml, .env.example
```

---

### Task 1: Projeto base, ferramentas de teste e repositório

**Files:**
- Create: projeto Next.js na raiz, `vitest.config.ts`, `vitest.db.config.ts`, `.env.example`, `src/domain/smoke.test.ts` (removido na Task 2)
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: scripts `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`; alias `@/*` → `src/*`.

- [ ] **Step 1: Criar o repositório e o app em pasta temporária** (a raiz já tem `docs/`)

```bash
cd "C:/Users/Joaov/Downloads/Planilha financeira"
git init -b main
npx create-next-app@16.3.6 iris-tmp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --yes
cp -r iris-tmp/. . && rm -rf iris-tmp
```

Expected: `package.json`, `src/app/`, `next.config.ts` na raiz; `docs/` intacto.

- [ ] **Step 2: Instalar dependências**

```bash
npm install @supabase/ssr@0.12 @supabase/supabase-js@2 zod@4 lucide-react
npm install -D vitest@5 @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/dom @playwright/test@1.63 dotenv supabase
npx playwright install chromium
```

- [ ] **Step 3: Configurar Vitest** — `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

`vitest.db.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
```

- [ ] **Step 4: Scripts** — em `package.json`, dentro de `"scripts"`, deixar:

```json
"dev": "next dev --turbopack",
"build": "next build",
"start": "next start",
"lint": "eslint .",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:db": "vitest run --config vitest.db.config.ts",
"test:e2e": "playwright test"
```

- [ ] **Step 5: `.env.example` e `.gitignore`**

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Só para testes de banco e E2E. Nunca usar no código do app.
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Acrescentar ao `.gitignore`: `.env.local`, `/test-results/`, `/playwright-report/`, `/supabase/.temp/`.

- [ ] **Step 6: Teste de fumaça** — `src/domain/smoke.test.ts`:

```ts
import { expect, test } from 'vitest'

test('vitest roda', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 7: Verificar**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: 1 teste passando; typecheck, lint e build sem erros.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: projeto base Next.js 16 com Vitest e Playwright" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dinheiro — centavos ⇄ texto

**Files:**
- Create: `src/domain/money.ts`, `src/domain/money.test.ts`
- Delete: `src/domain/smoke.test.ts`

**Interfaces:**
- Produces: `type Cents = number`; `MAX_CENTS = 9_999_999_999`; `parseBRL(input: string): Cents | null`; `formatBRL(cents: Cents): string` (sempre com `R$` + espaço não separável; negativos com `−` U+2212 antes do `R$`).

- [ ] **Step 1: Teste que falha** — `src/domain/money.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { formatBRL, MAX_CENTS, parseBRL } from './money'

describe('parseBRL', () => {
  test.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['12,5', 1250],
    ['12,', 1200],
    [',50', 50],
    ['0,99', 99],
    ['R$ 10', 1000],
    ['R$\u00a01.000,00', 100000],
    ['  142,30 ', 14230],
    ['1.5', 150],
    ['1.23', 123],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['5000', 500000],
    ['0', 0],
    ['99.999.999,99', MAX_CENTS],
  ])('%s → %i', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  test.each(['', 'abc', '-10', '10,999', '1,234,5', '1.23.4', '12a', '100.000.000,00', '1..2'])(
    'rejeita %s',
    (input) => {
      expect(parseBRL(input)).toBeNull()
    },
  )
})

describe('formatBRL', () => {
  test('formata com R$ e espaço não separável', () => {
    expect(formatBRL(123456)).toBe('R$\u00a01.234,56')
    expect(formatBRL(0)).toBe('R$\u00a00,00')
  })
  test('negativo usa sinal de menos tipográfico', () => {
    expect(formatBRL(-14230)).toBe('\u2212R$\u00a0142,30')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/money.test.ts`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 3: Implementar** — `src/domain/money.ts`:

```ts
export type Cents = number

export const MAX_CENTS = 9_999_999_999

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: Cents): string {
  const text = brl.format(Math.abs(cents) / 100).replace(/\s/g, '\u00a0')
  return cents < 0 ? `\u2212${text}` : text
}

export function parseBRL(input: string): Cents | null {
  const s = input.replace(/R\$/gi, '').replace(/[\s\u00a0]/g, '')
  if (s === '' || !/^[\d.,]+$/.test(s)) return null

  let intPart: string
  let decPart = ''
  const lastComma = s.lastIndexOf(',')
  if (lastComma >= 0) {
    intPart = s.slice(0, lastComma)
    decPart = s.slice(lastComma + 1)
    if (decPart.includes('.') || intPart.includes(',')) return null
  } else {
    const firstDot = s.indexOf('.')
    const lastDot = s.lastIndexOf('.')
    const digitsAfter = s.length - lastDot - 1
    if (lastDot >= 0 && firstDot === lastDot && digitsAfter >= 1 && digitsAfter <= 2) {
      intPart = s.slice(0, lastDot)
      decPart = s.slice(lastDot + 1)
    } else {
      intPart = s
    }
  }

  if (intPart.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null
    intPart = intPart.replace(/\./g, '')
  }
  if (intPart === '') intPart = '0'
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null

  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null
  return cents
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `git rm -q src/domain/smoke.test.ts && npx vitest run src/domain/money.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): conversão de reais em centavos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Datas e mês no fuso de Brasília

**Files:**
- Create: `src/domain/dates.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces: `type ISODate = string` (`YYYY-MM-DD`); `type MonthKey = string` (`YYYY-MM`); `todayInSaoPaulo(now?: Date): ISODate`; `addDays(d: ISODate, n: number): ISODate`; `monthOf(d: ISODate): MonthKey`; `parseMonthKey(s: string | null | undefined): MonthKey | null`; `addMonths(m: MonthKey, n: number): MonthKey`; `isInMonth(d: ISODate, m: MonthKey): boolean`; `monthLabel(m: MonthKey): string` ("setembro de 2026"); `dayLabel(d: ISODate, today: ISODate): string` ("Hoje" | "Ontem" | "19 de setembro"); `isValidISODate(s: string): boolean`.

- [ ] **Step 1: Teste que falha** — `src/domain/dates.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  addDays, addMonths, dayLabel, isInMonth, isValidISODate, monthLabel, monthOf, parseMonthKey, todayInSaoPaulo,
} from './dates'

describe('todayInSaoPaulo', () => {
  test('23h30 de 30/09 em Brasília ainda é 30/09', () => {
    expect(todayInSaoPaulo(new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-30')
  })
  test('00h10 de 01/10 em Brasília já é 01/10', () => {
    expect(todayInSaoPaulo(new Date('2026-10-01T03:10:00Z'))).toBe('2026-10-01')
  })
})

describe('aritmética de datas', () => {
  test('addDays atravessa mês e ano', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  test('addMonths atravessa ano', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
  test('monthOf e isInMonth', () => {
    expect(monthOf('2026-09-22')).toBe('2026-09')
    expect(isInMonth('2026-09-30', '2026-09')).toBe(true)
    expect(isInMonth('2026-10-01', '2026-09')).toBe(false)
  })
})

describe('validação', () => {
  test('parseMonthKey', () => {
    expect(parseMonthKey('2026-09')).toBe('2026-09')
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('abc')).toBeNull()
    expect(parseMonthKey(undefined)).toBeNull()
  })
  test('isValidISODate recusa dia inexistente', () => {
    expect(isValidISODate('2026-02-28')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-9-1')).toBe(false)
  })
})

describe('rótulos', () => {
  test('monthLabel', () => {
    expect(monthLabel('2026-09')).toBe('setembro de 2026')
  })
  test('dayLabel', () => {
    expect(dayLabel('2026-09-22', '2026-09-22')).toBe('Hoje')
    expect(dayLabel('2026-09-21', '2026-09-22')).toBe('Ontem')
    expect(dayLabel('2026-09-19', '2026-09-22')).toBe('19 de setembro')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/dates.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/domain/dates.ts`:

```ts
export type ISODate = string
export type MonthKey = string

export const TZ = 'America/Sao_Paulo'

const isoInTz = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonthFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

export function todayInSaoPaulo(now: Date = new Date()): ISODate {
  return isoInTz.format(now)
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return fromUTC(toUTC(s)) === s
}

export function addDays(d: ISODate, n: number): ISODate {
  const date = toUTC(d)
  date.setUTCDate(date.getUTCDate() + n)
  return fromUTC(date)
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7)
}

export function parseMonthKey(s: string | null | undefined): MonthKey | null {
  return s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1 + n, 1))
  return date.toISOString().slice(0, 7)
}

export function isInMonth(d: ISODate, m: MonthKey): boolean {
  return monthOf(d) === m
}

export function monthLabel(m: MonthKey): string {
  return monthFmt.format(toUTC(`${m}-01`))
}

export function dayLabel(d: ISODate, today: ISODate): string {
  if (d === today) return 'Hoje'
  if (d === addDays(today, -1)) return 'Ontem'
  return dayMonthFmt.format(toUTC(d))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates.ts src/domain/dates.test.ts
git commit -m "feat(domain): datas e meses no fuso de Brasília" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: As fórmulas do mês (Disponível, Entrou, Saiu, Saldo total)

**Files:**
- Create: `src/domain/summary.ts`, `src/domain/summary.test.ts`

**Interfaces:**
- Consumes: `Cents` (Task 2); `ISODate`, `MonthKey`, `isInMonth` (Task 3).
- Produces:

```ts
export type TxKind = 'income' | 'expense'
export type TxStatus = 'confirmed' | 'pending'
export interface LedgerTx {
  kind: TxKind
  amountCents: Cents
  occurredOn: ISODate
  status: TxStatus
  dueOn: ISODate | null
  paidOn: ISODate | null
  goalFundedCents: Cents        // parte paga com meta (RN-15); 0 até o Plano 5
}
export type GoalMovementKind = 'deposit' | 'withdraw' | 'use' | 'return_on_exit'
export interface GoalMovement { kind: GoalMovementKind; amountCents: Cents; occurredOn: ISODate }
export interface GoalLine { label: 'Guardado este mês' | 'Tirado das metas'; amountCents: Cents }
export interface MonthSummary {
  entrouCents: Cents; saiuCents: Cents; goalLine: GoalLine | null
  disponivelCents: Cents; contasAPagarCents: Cents; disponivelDepoisContasCents: Cents
  saldoTotalCents: Cents; guardadoTotalCents: Cents
}
export function effectiveDate(tx: LedgerTx): ISODate | null
export function summarizeMonth(input: {
  month: MonthKey; today: ISODate; initialBalanceCents: Cents
  transactions: LedgerTx[]; goalMovements: GoalMovement[]
}): MonthSummary
```

- [ ] **Step 1: Teste que falha** — `src/domain/summary.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { summarizeMonth, type GoalMovement, type LedgerTx } from './summary'

const tx = (p: Partial<LedgerTx> & Pick<LedgerTx, 'kind' | 'amountCents' | 'occurredOn'>): LedgerTx => ({
  status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, ...p,
})
const base = { month: '2026-09', today: '2026-09-22', initialBalanceCents: 0 }

describe('summarizeMonth', () => {
  test('exemplo do protótipo: 5.000 − 3.460 − 300 = 1.240; menos 600 de contas = 640', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [
        tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-09-05' }),
        tx({ kind: 'expense', amountCents: 346000, occurredOn: '2026-09-10' }),
        tx({ kind: 'expense', amountCents: 18000, occurredOn: '2026-09-25', status: 'pending', dueOn: '2026-09-25' }),
        tx({ kind: 'expense', amountCents: 12000, occurredOn: '2026-09-28', status: 'pending', dueOn: '2026-09-28' }),
        tx({ kind: 'expense', amountCents: 30000, occurredOn: '2026-09-30', status: 'pending', dueOn: '2026-09-30' }),
      ],
      goalMovements: [{ kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }],
    })
    expect(s.entrouCents).toBe(500000)
    expect(s.saiuCents).toBe(346000)
    expect(s.goalLine).toEqual({ label: 'Guardado este mês', amountCents: 30000 })
    expect(s.disponivelCents).toBe(124000)
    expect(s.contasAPagarCents).toBe(60000)
    expect(s.disponivelDepoisContasCents).toBe(64000)
  })

  test('sem guardar nem tirar, a linha de metas some', () => {
    const s = summarizeMonth({ ...base, transactions: [], goalMovements: [] })
    expect(s.goalLine).toBeNull()
    expect(s.disponivelCents).toBe(0)
  })

  test('tirar mais do que guardou vira "Tirado das metas" e volta para o Disponível', () => {
    const moves: GoalMovement[] = [
      { kind: 'deposit', amountCents: 10000, occurredOn: '2026-09-02' },
      { kind: 'withdraw', amountCents: 30000, occurredOn: '2026-09-12' },
    ]
    const s = summarizeMonth({ ...base, transactions: [], goalMovements: moves })
    expect(s.goalLine).toEqual({ label: 'Tirado das metas', amountCents: 20000 })
    expect(s.disponivelCents).toBe(20000)
  })

  test('gasto pago com meta: só a diferença sai do mês (RN-15, RN-15a)', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'expense', amountCents: 340000, occurredOn: '2026-09-15', goalFundedCents: 300000 })],
      goalMovements: [
        { kind: 'deposit', amountCents: 300000, occurredOn: '2026-07-01' },
        { kind: 'use', amountCents: 300000, occurredOn: '2026-09-15' },
      ],
    })
    expect(s.saiuCents).toBe(40000)
    expect(s.disponivelCents).toBe(-40000)
    expect(s.guardadoTotalCents).toBe(0)
    expect(s.saldoTotalCents).toBe(-340000)
  })

  test('entrada a receber não conta', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'income', amountCents: 80000, occurredOn: '2026-09-30', status: 'pending', dueOn: '2026-09-30' })],
      goalMovements: [],
    })
    expect(s.entrouCents).toBe(0)
    expect(s.saldoTotalCents).toBe(0)
  })

  test('conta paga com atraso conta no mês do pagamento (A1)', () => {
    const late = tx({ kind: 'expense', amountCents: 18000, occurredOn: '2026-09-28', dueOn: '2026-09-28', paidOn: '2026-10-02' })
    const sep = summarizeMonth({ ...base, transactions: [late], goalMovements: [] })
    const oct = summarizeMonth({ ...base, month: '2026-10', today: '2026-10-05', transactions: [late], goalMovements: [] })
    expect(sep.saiuCents).toBe(0)
    expect(oct.saiuCents).toBe(18000)
  })

  test('parcela futura não entra no mês nem no Saldo total', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'expense', amountCents: 7980, occurredOn: '2026-11-22' })],
      goalMovements: [],
    })
    expect(s.saiuCents).toBe(0)
    expect(s.saldoTotalCents).toBe(0)
  })

  test('sobra do mês anterior não entra no Disponível, só no Saldo total (RN-02)', () => {
    const s = summarizeMonth({
      ...base,
      initialBalanceCents: 600000,
      transactions: [tx({ kind: 'income', amountCents: 100000, occurredOn: '2026-08-10' })],
      goalMovements: [{ kind: 'deposit', amountCents: 20000, occurredOn: '2026-08-11' }],
    })
    expect(s.disponivelCents).toBe(0)
    expect(s.saldoTotalCents).toBe(700000)
    expect(s.guardadoTotalCents).toBe(20000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/summary.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/domain/summary.ts`:

```ts
import type { Cents } from './money'
import { isInMonth, type ISODate, type MonthKey } from './dates'

export type TxKind = 'income' | 'expense'
export type TxStatus = 'confirmed' | 'pending'

export interface LedgerTx {
  kind: TxKind
  amountCents: Cents
  occurredOn: ISODate
  status: TxStatus
  dueOn: ISODate | null
  paidOn: ISODate | null
  goalFundedCents: Cents
}

export type GoalMovementKind = 'deposit' | 'withdraw' | 'use' | 'return_on_exit'

export interface GoalMovement {
  kind: GoalMovementKind
  amountCents: Cents
  occurredOn: ISODate
}

export interface GoalLine {
  label: 'Guardado este mês' | 'Tirado das metas'
  amountCents: Cents
}

export interface MonthSummary {
  entrouCents: Cents
  saiuCents: Cents
  goalLine: GoalLine | null
  disponivelCents: Cents
  contasAPagarCents: Cents
  disponivelDepoisContasCents: Cents
  saldoTotalCents: Cents
  guardadoTotalCents: Cents
}

/** Data em que o dinheiro realmente entrou ou saiu. Registros pendentes não têm. */
export function effectiveDate(tx: LedgerTx): ISODate | null {
  if (tx.status !== 'confirmed') return null
  return tx.paidOn ?? tx.occurredOn
}

/** Parte do gasto que saiu do dinheiro do mês (o resto veio de uma meta). */
function ownMoney(tx: LedgerTx): Cents {
  return tx.amountCents - tx.goalFundedCents
}

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0)

export function summarizeMonth(input: {
  month: MonthKey
  today: ISODate
  initialBalanceCents: Cents
  transactions: LedgerTx[]
  goalMovements: GoalMovement[]
}): MonthSummary {
  const { month, today, initialBalanceCents, transactions, goalMovements } = input

  const inMonth = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, month)
  })
  const entrouCents = sum(inMonth.filter((t) => t.kind === 'income').map((t) => t.amountCents))
  const saiuCents = sum(inMonth.filter((t) => t.kind === 'expense').map(ownMoney))

  const movesInMonth = goalMovements.filter((m) => isInMonth(m.occurredOn, month))
  const guardadoLiquido =
    sum(movesInMonth.filter((m) => m.kind === 'deposit').map((m) => m.amountCents)) -
    sum(movesInMonth.filter((m) => m.kind === 'withdraw' || m.kind === 'return_on_exit').map((m) => m.amountCents))

  const goalLine: GoalLine | null =
    guardadoLiquido > 0
      ? { label: 'Guardado este mês', amountCents: guardadoLiquido }
      : guardadoLiquido < 0
        ? { label: 'Tirado das metas', amountCents: -guardadoLiquido }
        : null

  const disponivelCents = entrouCents - saiuCents - guardadoLiquido

  const contasAPagarCents = sum(
    transactions
      .filter((t) => t.kind === 'expense' && t.status === 'pending' && t.dueOn !== null && isInMonth(t.dueOn, month))
      .map((t) => t.amountCents),
  )

  const untilToday = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && d <= today
  })
  const movesUntilToday = goalMovements.filter((m) => m.occurredOn <= today)
  const usesCents = sum(movesUntilToday.filter((m) => m.kind === 'use').map((m) => m.amountCents))

  const saldoTotalCents =
    initialBalanceCents +
    sum(untilToday.filter((t) => t.kind === 'income').map((t) => t.amountCents)) -
    sum(untilToday.filter((t) => t.kind === 'expense').map(ownMoney)) -
    usesCents

  const guardadoTotalCents =
    sum(movesUntilToday.filter((m) => m.kind === 'deposit').map((m) => m.amountCents)) -
    sum(movesUntilToday.filter((m) => m.kind !== 'deposit').map((m) => m.amountCents))

  return {
    entrouCents,
    saiuCents,
    goalLine,
    disponivelCents,
    contasAPagarCents,
    disponivelDepoisContasCents: disponivelCents - contasAPagarCents,
    saldoTotalCents,
    guardadoTotalCents,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain/summary.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/summary.ts src/domain/summary.test.ts
git commit -m "feat(domain): fórmulas do mês e do Saldo total" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Para onde o dinheiro vai (gastos por categoria)

**Files:**
- Create: `src/domain/breakdown.ts`, `src/domain/breakdown.test.ts`

**Interfaces:**
- Consumes: `LedgerTx`, `effectiveDate` (Task 4); `isInMonth` (Task 3).
- Produces: `interface CategorizedTx extends LedgerTx { categoryId: string | null }`; `interface CategoryTotal { categoryId: string; cents: Cents }`; `spendingByCategory(txs: CategorizedTx[], month: MonthKey): CategoryTotal[]` (maior primeiro; usa só a parte paga com dinheiro do mês).

- [ ] **Step 1: Teste que falha** — `src/domain/breakdown.test.ts`:

```ts
import { expect, test } from 'vitest'
import { spendingByCategory, type CategorizedTx } from './breakdown'

const g = (categoryId: string, amountCents: number, occurredOn = '2026-09-10', extra: Partial<CategorizedTx> = {}): CategorizedTx => ({
  kind: 'expense', amountCents, occurredOn, status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, categoryId, ...extra,
})

test('soma por categoria, do maior para o menor, só no mês e só confirmados', () => {
  const result = spendingByCategory(
    [
      g('mercado', 50000), g('mercado', 39000), g('saude', 81000), g('casa', 72000),
      g('casa', 10000, '2026-08-30'),
      g('lazer', 5000, '2026-09-20', { status: 'pending', dueOn: '2026-09-20' }),
      { ...g('x', 0), kind: 'income', amountCents: 500000, categoryId: null },
    ],
    '2026-09',
  )
  expect(result).toEqual([
    { categoryId: 'mercado', cents: 89000 },
    { categoryId: 'saude', cents: 81000 },
    { categoryId: 'casa', cents: 72000 },
  ])
})

test('parte paga com meta não entra', () => {
  expect(spendingByCategory([g('lazer', 340000, '2026-09-15', { goalFundedCents: 300000 })], '2026-09')).toEqual([
    { categoryId: 'lazer', cents: 40000 },
  ])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/breakdown.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/domain/breakdown.ts`:

```ts
import type { Cents } from './money'
import { isInMonth, type MonthKey } from './dates'
import { effectiveDate, type LedgerTx } from './summary'

export interface CategorizedTx extends LedgerTx {
  categoryId: string | null
}

export interface CategoryTotal {
  categoryId: string
  cents: Cents
}

export function spendingByCategory(txs: CategorizedTx[], month: MonthKey): CategoryTotal[] {
  const totals = new Map<string, Cents>()
  for (const t of txs) {
    const d = effectiveDate(t)
    if (t.kind !== 'expense' || t.categoryId === null || d === null || !isInMonth(d, month)) continue
    const own = t.amountCents - t.goalFundedCents
    if (own <= 0) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + own)
  }
  return [...totals.entries()]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .sort((a, b) => b.cents - a.cents)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domain/breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/breakdown.ts src/domain/breakdown.test.ts
git commit -m "feat(domain): gastos por categoria" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Banco de dados do núcleo e privacidade

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20260922000001_nucleo.sql`, `tests/db/rls.test.ts`

**Interfaces:**
- Produces: tabelas `profiles(id, display_name, initial_balance_cents, onboarded_at, created_at)`, `categories(id, user_id, name, default_key, sort_order, created_at)`, `transactions(id, user_id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at, updated_at)`; gatilho que cria perfil + 10 categorias padrão no cadastro; políticas: cada pessoa só vê e altera o que é seu.

- [ ] **Step 1: Iniciar a pasta do Supabase e ligar ao projeto** (depois dos pré-requisitos)

```bash
npx supabase init
npx supabase link --project-ref SEU_PROJECT_REF
```

- [ ] **Step 2: Teste que falha** — `tests/db/rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const admin = createClient(url, secret, { auth: { persistSession: false } })

async function newUser(name: string) {
  const email = `rls-${name}-${Date.now()}@teste.iris.dev`
  const password = 'senha-de-teste-123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  })
  if (error) throw error
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id: data.user.id, client }
}

let a: { id: string; client: SupabaseClient }
let b: { id: string; client: SupabaseClient }

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await admin.auth.admin.deleteUser(a.id)
  await admin.auth.admin.deleteUser(b.id)
})

describe('cadastro novo', () => {
  test('cria perfil com o nome e as 10 categorias padrão', async () => {
    const { data: profile } = await a.client.from('profiles').select('display_name, initial_balance_cents').single()
    expect(profile).toEqual({ display_name: 'Ana', initial_balance_cents: 0 })
    const { data: cats } = await a.client.from('categories').select('name, default_key').order('sort_order')
    expect(cats?.map((c) => c.name)).toEqual([
      'Casa', 'Mercado', 'Transporte', 'Comer fora', 'Saúde', 'Lazer', 'Assinaturas', 'Educação', 'Compras', 'Outros',
    ])
  })
})

describe('privacidade', () => {
  test('ninguém lê os registros de outra pessoa', async () => {
    const { data: cat } = await a.client.from('categories').select('id').eq('default_key', 'mercado').single()
    const { error } = await a.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 14230, category_id: cat!.id, occurred_on: '2026-09-22',
    })
    expect(error).toBeNull()
    const { data: seenByB } = await b.client.from('transactions').select('id')
    expect(seenByB).toEqual([])
    const { data: catsSeenByB } = await b.client.from('categories').select('id').eq('id', cat!.id)
    expect(catsSeenByB).toEqual([])
  })

  test('ninguém grava usando a categoria de outra pessoa', async () => {
    const { data: catA } = await a.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { error } = await b.client.from('transactions').insert({
      user_id: b.id, kind: 'expense', amount_cents: 1000, category_id: catA!.id, occurred_on: '2026-09-22',
    })
    expect(error).not.toBeNull()
  })

  test('ninguém grava em nome de outra pessoa', async () => {
    const { data: catB } = await b.client.from('categories').select('id').eq('default_key', 'casa').single()
    const { error } = await b.client.from('transactions').insert({
      user_id: a.id, kind: 'expense', amount_cents: 1000, category_id: catB!.id, occurred_on: '2026-09-22',
    })
    expect(error).not.toBeNull()
  })

  test('o banco recusa valor zero, gasto sem categoria e entrada com categoria', async () => {
    const { data: cat } = await b.client.from('categories').select('id').eq('default_key', 'casa').single()
    const zero = await b.client.from('transactions').insert({ user_id: b.id, kind: 'expense', amount_cents: 0, category_id: cat!.id, occurred_on: '2026-09-22' })
    const semCat = await b.client.from('transactions').insert({ user_id: b.id, kind: 'expense', amount_cents: 100, occurred_on: '2026-09-22' })
    const entradaComCat = await b.client.from('transactions').insert({ user_id: b.id, kind: 'income', amount_cents: 100, category_id: cat!.id, occurred_on: '2026-09-22' })
    expect(zero.error).not.toBeNull()
    expect(semCat.error).not.toBeNull()
    expect(entradaComCat.error).not.toBeNull()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test:db`
Expected: FAIL — `relation "public.profiles" does not exist` (ou erro equivalente).

- [ ] **Step 4: Migração** — `supabase/migrations/20260922000001_nucleo.sql`:

```sql
-- Núcleo individual da Íris: perfil, categorias e registros (livro-razão).
-- Números (Disponível, Saldo total) nunca são guardados: são calculados em src/domain.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  initial_balance_cents bigint not null default 0
    check (initial_balance_cents between -9999999999 and 9999999999),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  default_key text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  category_id uuid references public.categories (id) on delete restrict,
  source text check (source is null or char_length(source) <= 40),
  note text check (note is null or char_length(note) <= 140),
  payment_method text check (payment_method in ('pix', 'cash', 'boleto', 'debit', 'credit', 'other')),
  occurred_on date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  due_on date,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_has_category check ((kind = 'expense') = (category_id is not null))
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on);
create index categories_user_idx on public.categories (user_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Cadastro novo: perfil + categorias padrão da copy oficial.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(trim(new.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, display_name) values (new.id, left(v_name, 60));
  insert into public.categories (user_id, name, default_key, sort_order)
  select new.id, c.name, c.key, c.ord
  from (values
    ('Casa', 'casa', 1), ('Mercado', 'mercado', 2), ('Transporte', 'transporte', 3),
    ('Comer fora', 'comer_fora', 4), ('Saúde', 'saude', 5), ('Lazer', 'lazer', 6),
    ('Assinaturas', 'assinaturas', 7), ('Educação', 'educacao', 8), ('Compras', 'compras', 9),
    ('Outros', 'outros', 10)
  ) as c (name, key, ord);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privacidade: cada pessoa só enxerga e altera o que é seu.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy categories_own on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_select on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));

create policy transactions_delete on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())
    ))
  );

create policy transactions_update on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())
    ))
  );
```

- [ ] **Step 5: Aplicar e rodar os testes**

Run: `npx supabase db push && npm run test:db`
Expected: migração aplicada; 5 testes passando.

- [ ] **Step 6: Commit**

```bash
git add supabase tests/db
git commit -m "feat(db): perfil, categorias e registros com privacidade por pessoa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sessão, rotas protegidas e cadastro/entrada

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`, `src/lib/forms.ts`, `src/lib/forms.test.ts`, `src/features/auth/routes.ts`, `src/features/auth/routes.test.ts`, `src/features/auth/schemas.ts`, `src/features/auth/schemas.test.ts`, `src/features/auth/actions.ts`, `src/features/auth/forms.tsx`, `src/app/auth/callback/route.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/entrar/page.tsx`, `src/app/(auth)/criar-cadastro/page.tsx`, `src/app/(auth)/recuperar-senha/page.tsx`, `src/app/(auth)/nova-senha/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: componentes `Button`, `TextField`, `FormAlert`, `Logo` (Task 9 — **executar a Task 9 antes desta** se a ordem for alterada; a numeração segue a leitura, a execução segue 9 → 7).
- Produces: `createClient(): Promise<SupabaseClient>` (servidor); `createBrowserSupabase()`; `requireUser(): Promise<{ id: string; email: string }>` (redireciona para `/entrar` sem sessão); `type FormState`; `firstFieldErrors(error: z.ZodError): Record<string, string>`; `isPublicPath`, `isAnonOnlyPath`, `safeNext`.

> Ordem de execução do plano: 1 → 2 → 3 → 4 → 5 → 6 → **9** → **7** → 8 → 10 → 11 → 12 → 13.

- [ ] **Step 1: Testes que falham** — `src/features/auth/routes.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isAnonOnlyPath, isPublicPath, safeNext } from './routes'

test('rotas públicas e rotas só para quem não entrou', () => {
  expect(isPublicPath('/entrar')).toBe(true)
  expect(isPublicPath('/auth/callback')).toBe(true)
  expect(isPublicPath('/inicio')).toBe(false)
  expect(isPublicPath('/nova-senha')).toBe(false)
  expect(isAnonOnlyPath('/criar-cadastro')).toBe(true)
  expect(isAnonOnlyPath('/inicio')).toBe(false)
})

test('safeNext só aceita caminhos internos', () => {
  expect(safeNext('/nova-senha')).toBe('/nova-senha')
  expect(safeNext('//malicioso.com')).toBe('/inicio')
  expect(safeNext('https://malicioso.com')).toBe('/inicio')
  expect(safeNext('/\\malicioso.com')).toBe('/inicio')
  expect(safeNext(null)).toBe('/inicio')
})
```

`src/features/auth/schemas.test.ts`:

```ts
import { expect, test } from 'vitest'
import { resetSchema, signInSchema, signUpSchema } from './schemas'
import { firstFieldErrors } from '@/lib/forms'

test('cadastro válido normaliza o e-mail', () => {
  const r = signUpSchema.parse({ displayName: ' Camila ', email: ' Camila@Email.com ', password: '12345678' })
  expect(r).toEqual({ displayName: 'Camila', email: 'camila@email.com', password: '12345678' })
})

test('cadastro inválido traz as mensagens da copy', () => {
  const r = signUpSchema.safeParse({ displayName: '', email: 'camila@', password: '123' })
  expect(r.success).toBe(false)
  expect(firstFieldErrors(r.error!)).toEqual({
    displayName: 'Falta o seu nome.',
    email: 'Confira o e-mail. Parece que falta alguma coisa.',
    password: 'A senha precisa ter pelo menos 8 caracteres.',
  })
})

test('entrar exige senha', () => {
  const r = signInSchema.safeParse({ email: 'a@b.com', password: '' })
  expect(firstFieldErrors(r.error!)).toEqual({ password: 'Falta a senha.' })
})

test('recuperar senha exige e-mail válido', () => {
  expect(resetSchema.safeParse({ email: 'x' }).success).toBe(false)
})
```

`src/lib/forms.test.ts`:

```ts
import { expect, test } from 'vitest'
import { z } from 'zod'
import { firstFieldErrors, readFields } from './forms'

test('firstFieldErrors pega a primeira mensagem de cada campo', () => {
  const s = z.object({ a: z.string().min(2, { error: 'curto' }), b: z.number({ error: 'número' }) })
  const r = s.safeParse({ a: 'x', b: 'y' })
  expect(firstFieldErrors(r.error!)).toEqual({ a: 'curto', b: 'número' })
})

test('readFields lê só os campos pedidos, como texto', () => {
  const fd = new FormData()
  fd.set('a', 'um')
  fd.set('extra', 'ignorado')
  expect(readFields(fd, ['a', 'b'])).toEqual({ a: 'um', b: '' })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/auth src/lib/forms.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar utilitários** — `src/lib/forms.ts`:

```ts
import type { z } from 'zod'

export type FormState =
  | { status: 'idle' }
  | { status: 'sent' }
  | {
      status: 'error'
      submission: number
      message?: string
      fieldErrors?: Record<string, string>
      values?: Record<string, string>
    }

export const idle: FormState = { status: 'idle' }

export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

export function readFields<K extends string>(fd: FormData, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? '')])) as Record<K, string>
}

export function errorState(input: Omit<Extract<FormState, { status: 'error' }>, 'status' | 'submission'>): FormState {
  return { status: 'error', submission: Date.now(), ...input }
}
```

`src/features/auth/routes.ts`:

```ts
const PUBLIC = new Set(['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/auth/callback', '/termos', '/privacidade'])
const ANON_ONLY = new Set(['/entrar', '/criar-cadastro', '/recuperar-senha'])

export const isPublicPath = (path: string) => PUBLIC.has(path)
export const isAnonOnlyPath = (path: string) => ANON_ONLY.has(path)

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/inicio'
  return next
}
```

`src/features/auth/schemas.ts`:

```ts
import { z } from 'zod'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Confira o e-mail. Parece que falta alguma coisa.' }))

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, { error: 'Falta o seu nome.' }).max(60, { error: 'Use até 60 caracteres.' }),
  email,
  password: z
    .string()
    .min(8, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
    .max(72, { error: 'Use até 72 caracteres.' }),
})

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Falta a senha.' }),
})

export const resetSchema = z.object({ email })

export const newPasswordSchema = signUpSchema.pick({ password: true })
```

- [ ] **Step 4: Rodar os testes unitários**

Run: `npx vitest run src/features/auth src/lib/forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Clientes do Supabase e proxy**

`src/lib/env.ts`:

```ts
import { z } from 'zod'

const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
    NEXT_PUBLIC_SITE_URL: z.url(),
  })
  .parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })

export const env = {
  supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: parsed.NEXT_PUBLIC_SITE_URL,
}
```

`src/lib/supabase/server.ts`:

```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o proxy renova a sessão.
        }
      },
    },
  })
}

export async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/entrar')
  return { id: data.user.id, email: data.user.email ?? '' }
}
```

Instalar o pacote de guarda: `npm install server-only`.

`src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

export const createBrowserSupabase = () => createBrowserClient(env.supabaseUrl, env.supabaseKey)
```

`src/lib/supabase/proxy.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { isAnonOnlyPath, isPublicPath } from '@/features/auth/routes'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    const r = NextResponse.redirect(url)
    response.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  if (!data.user && !isPublicPath(path)) return redirectTo('/entrar')
  if (data.user && isAnonOnlyPath(path)) return redirectTo('/inicio')
  return response
}
```

`src/proxy.ts`:

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
}
```

- [ ] **Step 6: Ações de acesso** — `src/features/auth/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { newPasswordSchema, resetSchema, signInSchema, signUpSchema } from './schemas'

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['displayName', 'email', 'password'] as const)
  const values = { displayName: raw.displayName, email: raw.email }
  const parsed = signUpSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error?.code === 'user_already_exists') {
    return errorState({ message: 'Esse e-mail já tem um cadastro. Quer entrar?', values })
  }
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/inicio')
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['email', 'password'] as const)
  const values = { email: raw.email }
  const parsed = signInSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error?.code === 'invalid_credentials') {
    return errorState({ message: 'E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.', values })
  }
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/inicio')
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env.siteUrl}/auth/callback` },
  })
  redirect(error || !data.url ? '/entrar?erro=1' : data.url)
}

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const raw = readFields(fd, ['email'] as const)
  const parsed = resetSchema.safeParse(raw)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values: raw })
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/nova-senha`,
  })
  return { status: 'sent' }
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(readFields(fd, ['password'] as const))
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error) })
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return errorState({ message: UNEXPECTED })
  redirect('/inicio')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/entrar')
}
```

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/features/auth/routes'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/entrar?erro=1`)
}
```

- [ ] **Step 7: Telas de acesso** — `src/features/auth/forms.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'
import { requestPasswordReset, signIn, signUp, updatePassword } from './actions'

function useForm(action: (s: FormState, fd: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  return {
    state,
    formAction,
    pending,
    key: err ? err.submission : 'idle',
    values: err?.values ?? {},
    errors: err?.fieldErrors ?? {},
    message: err?.message,
  }
}

export function SignUpForm() {
  const f = useForm(signUp)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="displayName" label="Como podemos te chamar?" autoComplete="given-name" defaultValue={f.values.displayName} error={f.errors.displayName} />
      <TextField name="email" type="email" label="Seu e-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <TextField name="password" type="password" label="Crie uma senha" autoComplete="new-password" hint="Pelo menos 8 caracteres." error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending} className="mt-2">Criar meu cadastro</Button>
    </form>
  )
}

export function SignInForm() {
  const f = useForm(signIn)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="email" type="email" label="E-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <TextField name="password" type="password" label="Senha" autoComplete="current-password" error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending} className="mt-2">Entrar</Button>
    </form>
  )
}

export function ResetForm() {
  const f = useForm(requestPasswordReset)
  if (f.state.status === 'sent') {
    return (
      <p role="status" className="rounded-panel bg-brand-wash px-4 py-3 text-[15px] text-brand-ink">
        Pronto. Se houver um cadastro com esse e-mail, o link já está na sua caixa de entrada.
      </p>
    )
  }
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="email" type="email" label="E-mail" autoComplete="email" defaultValue={f.values.email} error={f.errors.email} />
      <Button type="submit" disabled={f.pending}>Enviar link</Button>
    </form>
  )
}

export function NewPasswordForm() {
  const f = useForm(updatePassword)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      <TextField name="password" type="password" label="Crie uma senha" autoComplete="new-password" hint="Pelo menos 8 caracteres." error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending}>Salvar nova senha</Button>
    </form>
  )
}
```

`src/app/(auth)/layout.tsx`:

```tsx
import { Logo } from '@/ui/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 bg-card px-6 py-8 md:my-10 md:min-h-0 md:rounded-hero md:border md:border-line">
      <Logo />
      {children}
    </main>
  )
}
```

`src/app/(auth)/criar-cadastro/page.tsx`:

```tsx
import Link from 'next/link'
import { SignUpForm } from '@/features/auth/forms'
import { GoogleButton } from '@/features/auth/google-button'

export default function CriarCadastroPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Vamos começar.</h1>
        <p className="text-muted">Leva menos de um minuto.</p>
      </header>
      <GoogleButton />
      <SignUpForm />
      <p className="text-center text-[13px] text-muted">
        Ao criar seu cadastro, você concorda com os <Link href="/termos" className="text-brand-text">Termos de uso</Link> e a{' '}
        <Link href="/privacidade" className="text-brand-text">Política de privacidade</Link>.
      </p>
      <Link href="/entrar" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Já tenho cadastro</Link>
    </>
  )
}
```

`src/features/auth/google-button.tsx`:

```tsx
import { signInWithGoogle } from './actions'

export function GoogleButton() {
  return (
    <form action={signInWithGoogle} className="flex flex-col gap-4">
      <button type="submit" className="flex h-[50px] items-center justify-center gap-2.5 rounded-panel border border-control bg-card font-semibold text-ink">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
        </svg>
        Continuar com Google
      </button>
      <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" />
      </div>
    </form>
  )
}
```

`src/app/(auth)/entrar/page.tsx`:

```tsx
import Link from 'next/link'
import { SignInForm } from '@/features/auth/forms'
import { GoogleButton } from '@/features/auth/google-button'
import { FormAlert } from '@/ui/form-alert'

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Que bom te ver de novo.</h1>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <GoogleButton />
      <SignInForm />
      <Link href="/recuperar-senha" className="flex min-h-11 items-center self-end font-medium text-brand-text">Esqueci minha senha</Link>
      <Link href="/criar-cadastro" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Criar um cadastro</Link>
    </>
  )
}
```

`src/app/(auth)/recuperar-senha/page.tsx`:

```tsx
import Link from 'next/link'
import { ResetForm } from '@/features/auth/forms'

export default function RecuperarSenhaPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Sem problema.</h1>
        <p>Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
      </header>
      <ResetForm />
      <Link href="/entrar" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Voltar</Link>
    </>
  )
}
```

`src/app/(auth)/nova-senha/page.tsx`:

```tsx
import { NewPasswordForm } from '@/features/auth/forms'

export default function NovaSenhaPage() {
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Crie uma nova senha.</h1>
      <NewPasswordForm />
    </>
  )
}
```

`src/app/page.tsx` (substituir o conteúdo gerado):

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/entrar')
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run typecheck && npm run build`
Expected: testes passando; build sem erros. Manual: `npm run dev`, abrir `/inicio` sem sessão → vai para `/entrar`; criar cadastro → vai para `/inicio` (404 até a Task 12, esperado).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): cadastro, entrada, Google, recuperar senha e rotas protegidas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Registros — validação, gravação e leitura

**Files:**
- Create: `src/features/registro/schemas.ts`, `src/features/registro/schemas.test.ts`, `src/features/registro/actions.ts`, `src/features/registro/queries.ts`, `src/lib/flash.ts`

**Interfaces:**
- Consumes: `parseBRL`, `MAX_CENTS` (Task 2); `todayInSaoPaulo`, `addDays`, `isValidISODate` (Task 3); `LedgerTx` (Task 4); `CategorizedTx` (Task 5); `createClient`, `requireUser`, `FormState`, `errorState`, `firstFieldErrors`, `readFields` (Task 7).
- Produces:
  - `resolveWhen(when: string, date: string, today: ISODate): ISODate | null`
  - `expenseSchema`, `incomeSchema` (Zod) com `today` injetado: `makeExpenseSchema(today)`, `makeIncomeSchema(today)`
  - `createTransaction(prev: FormState, fd: FormData): Promise<FormState>` (Server Action)
  - `setFlash(message: string): Promise<void>`; cookie `iris_flash`
  - `loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }>`
  - `type Profile = { displayName: string; initialBalanceCents: number }`
  - `type Category = { id: string; name: string; defaultKey: string | null }`
  - `interface TxRow extends CategorizedTx { id: string; source: string | null; note: string | null; paymentMethod: string | null; createdAt: string }`

- [ ] **Step 1: Teste que falha** — `src/features/registro/schemas.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { firstFieldErrors } from '@/lib/forms'
import { makeExpenseSchema, makeIncomeSchema, resolveWhen } from './schemas'

const today = '2026-09-30'
const cat = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

describe('resolveWhen', () => {
  test('Hoje e Ontem usam o dia de Brasília informado pelo servidor', () => {
    expect(resolveWhen('today', '', today)).toBe('2026-09-30')
    expect(resolveWhen('yesterday', '', today)).toBe('2026-09-29')
    expect(resolveWhen('other', '2026-08-15', today)).toBe('2026-08-15')
    expect(resolveWhen('other', '2026-02-30', today)).toBeNull()
    expect(resolveWhen('qualquer', '', today)).toBeNull()
  })
})

describe('gasto', () => {
  const schema = makeExpenseSchema(today)
  test('válido vira centavos e data', () => {
    const r = schema.parse({ amount: '142,30', categoryId: cat, when: 'today', date: '', note: ' café ', paymentMethod: '' })
    expect(r).toEqual({ amountCents: 14230, categoryId: cat, occurredOn: today, note: 'café', paymentMethod: null })
  })
  test('mensagens da copy', () => {
    const r = schema.safeParse({ amount: '', categoryId: '', when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r.error!)).toEqual({
      amount: 'Falta o valor.',
      categoryId: 'Escolha uma categoria para esse gasto.',
    })
    const r2 = schema.safeParse({ amount: '12a', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r2.error!)).toEqual({ amount: 'Esse valor não parece certo. Use apenas números.' })
    const r3 = schema.safeParse({ amount: '0', categoryId: cat, when: 'today', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r3.error!)).toEqual({ amount: 'Falta o valor.' })
  })
  test('data de outro dia inválida', () => {
    const r = schema.safeParse({ amount: '10', categoryId: cat, when: 'other', date: '', note: '', paymentMethod: '' })
    expect(firstFieldErrors(r.error!)).toEqual({ date: 'Escolha o dia.' })
  })
})

describe('entrada', () => {
  test('origem opcional', () => {
    const r = makeIncomeSchema(today).parse({ amount: '5.000', source: '', when: 'today', date: '' })
    expect(r).toEqual({ amountCents: 500000, source: null, occurredOn: today })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/features/registro/schemas.ts`:

```ts
import { z } from 'zod'
import { parseBRL } from '@/domain/money'
import { addDays, isValidISODate, type ISODate } from '@/domain/dates'

export const PAYMENT_METHODS = ['pix', 'cash', 'boleto', 'debit', 'credit', 'other'] as const

export function resolveWhen(when: string, date: string, today: ISODate): ISODate | null {
  if (when === 'today') return today
  if (when === 'yesterday') return addDays(today, -1)
  if (when === 'other' && isValidISODate(date)) return date
  return null
}

const amount = z.string().transform((raw, ctx) => {
  if (raw.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'Falta o valor.' })
    return z.NEVER
  }
  const cents = parseBRL(raw)
  if (cents === null) {
    ctx.addIssue({ code: 'custom', message: 'Esse valor não parece certo. Use apenas números.' })
    return z.NEVER
  }
  if (cents === 0) {
    ctx.addIssue({ code: 'custom', message: 'Falta o valor.' })
    return z.NEVER
  }
  return cents
})

const optionalText = (max: number) =>
  z.string().trim().max(max, { error: `Use até ${max} caracteres.` }).transform((s) => (s === '' ? null : s))

function withDate<T extends z.ZodRawShape>(shape: T, today: ISODate) {
  return z
    .object({ ...shape, when: z.string(), date: z.string() })
    .transform((v, ctx) => {
      const occurredOn = resolveWhen(v.when, v.date, today)
      if (!occurredOn) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Escolha o dia.' })
        return z.NEVER
      }
      const { when: _w, date: _d, ...rest } = v
      return { ...rest, occurredOn }
    })
}

export const makeExpenseSchema = (today: ISODate) =>
  withDate(
    {
      amount,
      categoryId: z.uuid({ error: 'Escolha uma categoria para esse gasto.' }),
      note: optionalText(140),
      paymentMethod: z
        .string()
        .transform((s) => (s === '' ? null : s))
        .pipe(z.enum(PAYMENT_METHODS).nullable()),
    },
    today,
  ).transform(({ amount: amountCents, ...rest }) => ({ amountCents, ...rest }))

export const makeIncomeSchema = (today: ISODate) =>
  withDate({ amount, source: optionalText(40) }, today).transform(({ amount: amountCents, ...rest }) => ({
    amountCents,
    ...rest,
  }))
```

> Observação para o executor: a ordem das chaves no objeto de saída não importa para `toEqual`. Se a ordem de validação fizer o erro de `date` aparecer junto com erros de outros campos, o `transform` do `withDate` só roda quando os campos do `shape` são válidos — é o comportamento esperado pelos testes.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro`
Expected: PASS.

- [ ] **Step 5: Aviso entre páginas** — `src/lib/flash.ts`:

```ts
import 'server-only'
import { cookies } from 'next/headers'

export const FLASH_COOKIE = 'iris_flash'

export async function setFlash(message: string) {
  const store = await cookies()
  store.set(FLASH_COOKIE, encodeURIComponent(message), { path: '/', maxAge: 30, sameSite: 'lax' })
}
```

- [ ] **Step 6: Gravar** — `src/features/registro/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { todayInSaoPaulo } from '@/domain/dates'
import { makeExpenseSchema, makeIncomeSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod'] as const)
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind,
      amount_cents: d.amountCents,
      category_id: d.categoryId,
      note: d.note,
      payment_method: d.paymentMethod,
      occurred_on: d.occurredOn,
    })
    if (error) return errorState({ message: SAVE_FAILED, values })
    await setFlash('Anotado. Seu mês já está atualizado.')
  } else {
    const values = readFields(fd, ['amount', 'source', 'when', 'date'] as const)
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind,
      amount_cents: d.amountCents,
      source: d.source,
      occurred_on: d.occurredOn,
    })
    if (error) return errorState({ message: SAVE_FAILED, values })
    await setFlash(`Anotado. Mais ${formatBRL(d.amountCents)} no seu mês.`)
  }

  revalidatePath('/inicio')
  redirect('/inicio')
}
```

- [ ] **Step 7: Ler** — `src/features/registro/queries.ts`:

```ts
import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { CategorizedTx } from '@/domain/breakdown'

export type Profile = { displayName: string; initialBalanceCents: number }
export type Category = { id: string; name: string; defaultKey: string | null }
export interface TxRow extends CategorizedTx {
  id: string
  source: string | null
  note: string | null
  paymentMethod: string | null
  createdAt: string
}

export async function loadCategories(): Promise<Category[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').select('id, name, default_key').order('sort_order')
  if (error) throw error
  return data.map((c) => ({ id: c.id, name: c.name, defaultKey: c.default_key }))
}

export async function loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }> {
  await requireUser()
  const supabase = await createClient()
  const [profile, categories, txs] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    loadCategories(),
    supabase
      .from('transactions')
      .select('id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  if (profile.error) throw profile.error
  if (txs.error) throw txs.error
  return {
    profile: { displayName: profile.data.display_name, initialBalanceCents: Number(profile.data.initial_balance_cents) },
    categories,
    transactions: txs.data.map((t) => ({
      id: t.id,
      kind: t.kind as 'income' | 'expense',
      amountCents: Number(t.amount_cents),
      categoryId: t.category_id,
      source: t.source,
      note: t.note,
      paymentMethod: t.payment_method,
      occurredOn: t.occurred_on,
      status: t.status as 'confirmed' | 'pending',
      dueOn: t.due_on,
      paidOn: t.paid_on,
      goalFundedCents: 0,
      createdAt: t.created_at,
    })),
  }
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run typecheck`
Expected: PASS; sem erros de tipo.

- [ ] **Step 9: Commit**

```bash
git add src/features/registro src/lib/flash.ts
git commit -m "feat(registro): validar, gravar e ler gastos e entradas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Identidade visual e componentes base

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/ui/button.tsx`, `src/ui/card.tsx`, `src/ui/text-field.tsx`, `src/ui/form-alert.tsx`, `src/ui/money.tsx`, `src/ui/logo.tsx`, `src/ui/ui.test.tsx`

**Interfaces:**
- Consumes: `formatBRL` (Task 2).
- Produces: classes Tailwind dos tokens (`bg-brand`, `text-brand-ink`, `bg-brand-wash`, `border-brand-wash-border`, `text-brand-text`, `border-selected`, `bg-canvas`, `bg-card`, `border-line`, `border-control`, `bg-sunken`, `text-ink`, `text-body`, `text-muted`, `text-inactive`, `bg-amber-wash`, `text-amber-ink`, `bg-spend`, `bg-error-wash`, `text-error-ink`, `rounded-control`, `rounded-panel`, `rounded-card`, `rounded-hero`, `rounded-sheet`, `shadow-card`, `num`); componentes `Button({ variant?: 'primary'|'secondary'|'ghost', href?, className?, ...button props })`, `Card({ className?, children })`, `TextField({ name, label, type?, hint?, error?, defaultValue?, autoComplete?, inputMode? })`, `FormAlert({ children })`, `Money({ cents, className? })`, `Logo()`.

- [ ] **Step 1: Teste que falha** — `src/ui/ui.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'
import { Money } from './money'
import { TextField } from './text-field'

describe('componentes base', () => {
  test('Money formata centavos', () => {
    render(<Money cents={-14230} />)
    expect(screen.getByText('\u2212R$\u00a0142,30')).toBeTruthy()
  })
  test('Button com href vira link', () => {
    render(<Button href="/anotar">Anotar</Button>)
    expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
  })
  test('TextField liga rótulo, dica e erro ao campo', () => {
    render(<TextField name="email" label="Seu e-mail" hint="dica" error="Confira o e-mail." />)
    const input = screen.getByLabelText('Seu e-mail')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('email-error')
    expect(screen.getByText('Confira o e-mail.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Tokens** — substituir `src/app/globals.css` por:

```css
@import "tailwindcss";

@theme {
  --color-brand: #a0e870;
  --color-brand-ink: #122801;
  --color-brand-wash: #eef4e9;
  --color-brand-wash-border: #ddf6c9;
  --color-brand-text: #22500a;
  --color-brand-text-hover: #3f7d1c;
  --color-selected: #6cbf38;
  --color-canvas: #f8f8f8;
  --color-card: #ffffff;
  --color-line: #ececec;
  --color-control: #e4e4e4;
  --color-sunken: #f2f2f2;
  --color-ink: #171717;
  --color-body: #3a3a3a;
  --color-muted: #666666;
  --color-inactive: #525252;
  --color-amber-wash: #fff8e8;
  --color-amber-ink: #8a4204;
  --color-amber-bar: #f2b54a;
  --color-spend: #525252;
  --color-error-wash: #fef2f2;
  --color-error-ink: #b91c1c;

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;

  --radius-control: 8px;
  --radius-panel: 10px;
  --radius-card: 12px;
  --radius-hero: 16px;
  --radius-sheet: 20px;

  --shadow-card: 0 1px 2px rgba(18, 40, 1, 0.04);
  --shadow-sheet: 0 24px 48px rgba(18, 40, 1, 0.12);
}

@layer base {
  html { -webkit-text-size-adjust: 100%; }
  body {
    background: var(--color-canvas);
    color: var(--color-body);
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(160, 232, 112, 0.45); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}

@utility num {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Íris — Veja para onde seu dinheiro vai',
  description: 'App gratuito de finanças pessoais. Anote seus gastos em segundos e entenda seu mês de um jeito simples, visual e sem planilha.',
}

export const viewport: Viewport = { themeColor: '#f8f8f8', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Componentes**

`src/ui/button.tsx`:

```tsx
import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-[#8bdc55]',
  secondary: 'border border-control bg-card text-ink hover:bg-canvas',
  ghost: 'text-brand-text hover:text-brand-text-hover',
}

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-panel px-5 text-base font-semibold transition-colors duration-[120ms] active:scale-[0.98] disabled:bg-sunken disabled:text-[#737373]'

type Props = { variant?: Variant; href?: string; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant = 'primary', href, className = '', children, ...rest }: Props) {
  const cls = `${base} ${styles[variant]} ${className}`
  if (href) return <Link href={href} className={cls}>{children}</Link>
  return <button className={cls} {...rest}>{children}</button>
}
```

`src/ui/card.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-card border border-line bg-card p-5 shadow-card ${className}`}>{children}</section>
}
```

`src/ui/text-field.tsx`:

```tsx
import type { HTMLInputTypeAttribute } from 'react'

type Props = {
  name: string
  label: string
  type?: HTMLInputTypeAttribute
  hint?: string
  error?: string
  defaultValue?: string
  autoComplete?: string
  inputMode?: 'text' | 'decimal' | 'email'
}

export function TextField({ name, label, type = 'text', hint, error, defaultValue, autoComplete, inputMode }: Props) {
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-[#262626]">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-12 rounded-control border bg-card px-3.5 text-base text-ink ${error ? 'border-error-ink' : 'border-control'}`}
      />
      {hint && !error && <span id={`${name}-hint`} className="text-[13px] text-muted">{hint}</span>}
      {error && <span id={`${name}-error`} className="text-sm text-error-ink">{error}</span>}
    </div>
  )
}
```

`src/ui/form-alert.tsx`:

```tsx
import type { ReactNode } from 'react'

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-[#fee2e2] bg-error-wash px-4 py-3 text-[15px] text-[#7f1d1d]">
      {children}
    </p>
  )
}
```

`src/ui/money.tsx`:

```tsx
import { formatBRL, type Cents } from '@/domain/money'

export function Money({ cents, className = '' }: { cents: Cents; className?: string }) {
  return <span className={`num ${className}`}>{formatBRL(cents)}</span>
}
```

`src/ui/logo.tsx` (logo provisório aprovado, V2):

```tsx
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#a0e870" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#122801" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="3.2" fill="#122801" />
        <circle cx="19.5" cy="12.5" r="1.6" fill="#ffffff" />
      </svg>
      <span className="text-[22px] font-bold tracking-tight text-brand-ink">Íris</span>
    </span>
  )
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/ui && npm run build`
Expected: PASS; build sem erros.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): tokens da Etapa 5 e componentes base" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Casca do app (barra inferior, menu lateral e aviso "Anotado")

**Files:**
- Create: `src/features/shell/nav-items.ts`, `src/features/shell/bottom-nav.tsx`, `src/features/shell/sidebar.tsx`, `src/features/shell/toast.tsx`, `src/features/shell/nav.test.tsx`, `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 9); `FLASH_COOKIE` (Task 8); `signOut` (Task 7).
- Produces: `NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[]` (Plano 1: só "Seu mês"; cada plano seguinte acrescenta o seu item); `BottomNav({ current })`, `Sidebar({ current, displayName })`, `Toast()`.

- [ ] **Step 1: Teste que falha** — `src/features/shell/nav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomNav } from './bottom-nav'

test('barra inferior marca a página atual e tem o botão Anotar', () => {
  render(<BottomNav current="/inicio" />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/features/shell/nav-items.ts`:

```ts
import { House, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

// Cada plano acrescenta seu item aqui (Extrato no Plano 2, Metas no Plano 5, Mais no Plano 2).
export const NAV_ITEMS: NavItem[] = [{ href: '/inicio', label: 'Seu mês', icon: House }]
```

`src/features/shell/bottom-nav.tsx`:

```tsx
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { NAV_ITEMS } from './nav-items'

export function BottomNav({ current }: { current: string }) {
  const [first, ...rest] = NAV_ITEMS
  const items = [first, 'anotar' as const, ...rest]
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid h-[72px] max-w-[480px] auto-cols-fr grid-flow-col items-start px-1 pt-2">
        {items.map((item) =>
          item === 'anotar' ? (
            <li key="anotar" className="flex justify-center">
              <Link href="/anotar" className="-mt-7 flex flex-col items-center gap-1 text-xs font-semibold text-brand-ink">
                <span className="flex size-14 items-center justify-center rounded-full bg-brand shadow-[0_4px_12px_rgba(18,40,1,.1)]">
                  <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
                </span>
                Anotar
              </Link>
            </li>
          ) : (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={current === item.href ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 text-xs ${current === item.href ? 'font-semibold text-brand-ink' : 'font-medium text-inactive'}`}
              >
                <span className={`flex h-[30px] w-14 items-center justify-center rounded-full ${current === item.href ? 'bg-brand' : ''}`}>
                  <item.icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
```

`src/features/shell/sidebar.tsx`:

```tsx
import Link from 'next/link'
import { LogOut, Plus } from 'lucide-react'
import { Logo } from '@/ui/logo'
import { signOut } from '@/features/auth/actions'
import { NAV_ITEMS } from './nav-items'

export function Sidebar({ current, displayName }: { current: string; displayName: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-line bg-card px-3.5 py-6 md:flex">
      <div className="px-2"><Logo /></div>
      <Link href="/anotar" className="flex h-[46px] items-center justify-center gap-2 rounded-panel bg-brand font-semibold text-brand-ink">
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />Anotar
      </Link>
      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current === item.href ? 'page' : undefined}
            className={`flex h-[42px] items-center gap-3 rounded-control px-3 text-sm ${current === item.href ? 'bg-brand-wash font-semibold text-brand-ink' : 'font-medium text-inactive hover:bg-canvas'}`}
          >
            <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-3.5">
        <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
        <form action={signOut}>
          <button type="submit" aria-label="Sair da Íris" className="flex size-11 items-center justify-center rounded-full text-inactive hover:bg-canvas">
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  )
}
```

`src/features/shell/toast.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { FLASH_COOKIE_NAME } from './flash-name'

function readAndClear(): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))
  if (!match) return null
  document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
  return decodeURIComponent(match.split('=')[1])
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    const m = readAndClear()
    if (!m) return
    setMessage(m)
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-30 flex justify-center md:bottom-8">
      {message && (
        <p role="status" className="flex items-center gap-2.5 rounded-card bg-brand-ink px-4 py-3.5 text-[15px] text-white shadow-[0_8px_24px_rgba(18,40,1,.16)]">
          <Check className="size-5 text-brand" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  )
}
```

`src/features/shell/flash-name.ts` (compartilhado entre servidor e navegador):

```ts
export const FLASH_COOKIE_NAME = 'iris_flash'
```

E em `src/lib/flash.ts` (Task 8) trocar `export const FLASH_COOKIE = 'iris_flash'` por `import { FLASH_COOKIE_NAME as FLASH_COOKIE } from '@/features/shell/flash-name'` e manter o resto.

`src/app/(app)/layout.tsx`:

```tsx
import { headers } from 'next/headers'
import { requireUser, createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/features/shell/bottom-nav'
import { Sidebar } from '@/features/shell/sidebar'
import { Toast } from '@/features/shell/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('display_name').single()
  const current = (await headers()).get('x-pathname') ?? '/inicio'
  return (
    <div className="flex min-h-dvh">
      <Sidebar current={current} displayName={profile?.display_name ?? ''} />
      <div className="flex-1 pb-28 md:pb-10">{children}</div>
      <BottomNav current={current} />
      <Toast />
    </div>
  )
}
```

Para o layout saber a página atual, no `src/lib/supabase/proxy.ts` (Task 7) acrescentar, antes do `const supabase = …`, `request.headers.set('x-pathname', request.nextUrl.pathname)` e trocar os dois `NextResponse.next({ request })` por `NextResponse.next({ request: { headers: request.headers } })`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/shell && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): barra inferior, menu lateral e aviso Anotado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Anotar gasto e registrar entrada

**Files:**
- Create: `src/features/registro/anotar-form.tsx`, `src/features/registro/anotar-form.test.tsx`, `src/app/(app)/anotar/page.tsx`

**Interfaces:**
- Consumes: `createTransaction` (Task 8); `loadCategories`, `Category` (Task 8); `Button`, `FormAlert` (Task 9); `idle`, `FormState` (Task 7).
- Produces: página `/anotar?tipo=gasto|entrada`; `AnotarForm({ kind, categories })`.

- [ ] **Step 1: Teste que falha** — `src/features/registro/anotar-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({ createTransaction: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), true]) }
})

import { AnotarForm } from './anotar-form'

const categories = [
  { id: '1', name: 'Casa', defaultKey: 'casa' },
  { id: '2', name: 'Mercado', defaultKey: 'mercado' },
]

describe('AnotarForm', () => {
  test('gasto tem valor, categorias, quando e "Salvar gasto"', () => {
    render(<AnotarForm kind="expense" categories={categories} />)
    expect(screen.getByLabelText('Quanto foi?').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
  })
  test('botão fica desativado enquanto salva (evita registro duplicado)', () => {
    render(<AnotarForm kind="expense" categories={categories} />)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toHaveProperty('disabled', true)
  })
  test('entrada usa "Quanto entrou?" e "Salvar entrada"', () => {
    render(<AnotarForm kind="income" categories={categories} />)
    expect(screen.getByLabelText('Quanto entrou?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar entrada' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/anotar-form.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/features/registro/anotar-form.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { createTransaction } from './actions'
import type { Category } from './queries'

const chip =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-control bg-card px-3 text-sm font-medium text-[#262626] has-[:checked]:border-[1.5px] has-[:checked]:border-selected has-[:checked]:bg-brand-wash has-[:checked]:font-semibold has-[:checked]:text-brand-ink has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]'

const SOURCES = ['Salário', 'Freela', 'Presente', 'Outros']
const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix', cash: 'Dinheiro', boleto: 'Boleto', debit: 'Débito', credit: 'Crédito', other: 'Outra forma',
}

export function AnotarForm({ kind, categories }: { kind: 'expense' | 'income'; categories: Category[] }) {
  const [state, action, pending] = useActionState(createTransaction, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? {}
  const e = err?.fieldErrors ?? {}
  const [when, setWhen] = useState(v.when || 'today')
  const isExpense = kind === 'expense'

  return (
    <form key={err ? err.submission : 'idle'} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[15px] font-medium">{isExpense ? 'Quanto foi?' : 'Quanto entrou?'}</label>
        <input
          id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" defaultValue={v.amount}
          aria-invalid={e.amount ? true : undefined} aria-describedby={e.amount ? 'amount-error' : undefined}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink outline-none placeholder:text-[#a3a3a3] ${e.amount ? 'border-error-ink' : 'border-brand'}`}
        />
        {e.amount && <span id="amount-error" className="text-sm text-error-ink">{e.amount}</span>}
      </div>

      {isExpense ? (
        <fieldset className="flex flex-col gap-2.5" aria-describedby={e.categoryId ? 'cat-error' : undefined}>
          <legend className="mb-2.5 text-[15px] font-medium">Com o quê?</legend>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((c) => (
              <label key={c.id} className={chip}>
                <input type="radio" name="categoryId" value={c.id} defaultChecked={v.categoryId === c.id} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
          {e.categoryId && <span id="cat-error" className="text-sm text-error-ink">{e.categoryId}</span>}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-medium">De onde veio?</legend>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <label key={s} className={chip}>
                <input type="radio" name="source" value={s} defaultChecked={v.source === s} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[15px] font-medium">Quando?</legend>
        <div className="flex flex-wrap gap-2">
          {[['today', 'Hoje'], ['yesterday', 'Ontem'], ['other', 'Outro dia']].map(([value, label]) => (
            <label key={value} className={`${chip} rounded-full px-[18px]`}>
              <input type="radio" name="when" value={value} checked={when === value} onChange={() => setWhen(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {when === 'other' && (
          <input type="date" name="date" defaultValue={v.date} aria-label="Dia" className="h-12 rounded-control border border-control px-3.5 text-base" />
        )}
        {when !== 'other' && <input type="hidden" name="date" value="" />}
        {e.date && <span className="text-sm text-error-ink">{e.date}</span>}
      </fieldset>

      {isExpense && (
        <details className="group border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] font-medium text-ink">
            Mais detalhes
            <ChevronDown className="size-[18px] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm text-inactive">Uma nota, se quiser</label>
              <input id="note" name="note" maxLength={140} defaultValue={v.note} className="h-11 rounded-control border border-control px-3 text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paymentMethod" className="text-sm text-inactive">Forma de pagamento</label>
              <select id="paymentMethod" name="paymentMethod" defaultValue={v.paymentMethod ?? ''} className="h-11 rounded-control border border-control bg-card px-3 text-base">
                <option value="">Não informar</option>
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </details>
      )}

      {err?.message && <FormAlert>{err.message}</FormAlert>}

      <Button type="submit" disabled={pending} className="h-[52px]">
        {isExpense ? 'Salvar gasto' : 'Salvar entrada'}
      </Button>
    </form>
  )
}
```

`src/app/(app)/anotar/page.tsx`:

```tsx
import Link from 'next/link'
import { X } from 'lucide-react'
import { loadCategories } from '@/features/registro/queries'
import { AnotarForm } from '@/features/registro/anotar-form'

export default async function AnotarPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const kind = tipo === 'entrada' ? 'income' : 'expense'
  const categories = await loadCategories()
  const tab = (active: boolean) =>
    `flex h-10 items-center justify-center rounded-control text-[15px] ${active ? 'bg-card font-semibold text-ink shadow-[0_1px_2px_rgba(18,40,1,.08)]' : 'font-medium text-inactive'}`

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-label="Anotar" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <nav aria-label="Tipo de registro" className="grid flex-1 grid-cols-2 gap-1 rounded-panel bg-sunken p-1">
            <Link href="/anotar" aria-current={kind === 'expense' ? 'page' : undefined} className={tab(kind === 'expense')}>Saiu dinheiro</Link>
            <Link href="/anotar?tipo=entrada" aria-current={kind === 'income' ? 'page' : undefined} className={tab(kind === 'income')}>Entrou dinheiro</Link>
          </nav>
          <Link href="/inicio" aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full bg-sunken text-[#262626]">
            <X className="size-5" aria-hidden="true" />
          </Link>
        </div>
        <AnotarForm key={kind} kind={kind} categories={categories} />
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/registro && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(registro): tela Anotar gasto e Registrar entrada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Seu mês

**Files:**
- Create: `src/features/seu-mes/hero.tsx`, `src/features/seu-mes/hero.test.tsx`, `src/features/seu-mes/month-nav.tsx`, `src/features/seu-mes/categories-card.tsx`, `src/features/seu-mes/recent-card.tsx`, `src/features/seu-mes/view-model.ts`, `src/features/seu-mes/view-model.test.ts`, `src/app/(app)/inicio/page.tsx`

**Interfaces:**
- Consumes: `summarizeMonth`, `MonthSummary` (Task 4); `spendingByCategory` (Task 5); `todayInSaoPaulo`, `parseMonthKey`, `monthOf`, `addMonths`, `monthLabel`, `dayLabel`, `isInMonth` (Task 3); `loadLedger`, `TxRow`, `Category` (Task 8); `Card`, `Money`, `Button` (Task 9).
- Produces: `buildSeuMes(input: { month: MonthKey; today: ISODate; profile; categories; transactions: TxRow[] }): SeuMesView` com `{ month, label, isCurrentMonth, hasAnyInMonth, summary: MonthSummary, biggest: { name: string; cents: number } | null, categories: { name: string; cents: number; share: number }[], recent: { id: string; title: string; subtitle: string; cents: number; kind: 'income'|'expense' }[] }`.

- [ ] **Step 1: Testes que falham** — `src/features/seu-mes/view-model.test.ts`:

```ts
import { expect, test } from 'vitest'
import { buildSeuMes } from './view-model'
import type { TxRow } from '@/features/registro/queries'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})
const categories = [
  { id: 'c1', name: 'Mercado', defaultKey: 'mercado' },
  { id: 'c2', name: 'Saúde', defaultKey: 'saude' },
]

test('monta o Seu mês com maior gasto, categorias e últimos registros', () => {
  const v = buildSeuMes({
    month: '2026-09', today: '2026-09-22', profile: { displayName: 'Camila', initialBalanceCents: 600000 }, categories,
    transactions: [
      row({ id: 't1', kind: 'expense', amountCents: 14230, occurredOn: '2026-09-22', categoryId: 'c1' }),
      row({ id: 't2', kind: 'expense', amountCents: 81000, occurredOn: '2026-09-20', categoryId: 'c2' }),
      row({ id: 't3', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
      row({ id: 't4', kind: 'expense', amountCents: 5000, occurredOn: '2026-08-30', categoryId: 'c1' }),
    ],
  })
  expect(v.label).toBe('setembro de 2026')
  expect(v.isCurrentMonth).toBe(true)
  expect(v.summary.disponivelCents).toBe(500000 - 14230 - 81000)
  expect(v.summary.saldoTotalCents).toBe(600000 + 500000 - 14230 - 81000 - 5000)
  expect(v.biggest).toEqual({ name: 'Saúde', cents: 81000 })
  expect(v.categories.map((c) => c.name)).toEqual(['Saúde', 'Mercado'])
  expect(v.categories[0].share).toBe(1)
  expect(v.recent.map((r) => [r.title, r.subtitle])).toEqual([
    ['Mercado', 'Hoje'],
    ['Saúde', '20 de setembro'],
    ['Salário', '5 de setembro'],
  ])
})

test('mês sem registros', () => {
  const v = buildSeuMes({ month: '2026-10', today: '2026-09-22', profile: { displayName: 'C', initialBalanceCents: 0 }, categories, transactions: [] })
  expect(v.hasAnyInMonth).toBe(false)
  expect(v.isCurrentMonth).toBe(false)
  expect(v.biggest).toBeNull()
})
```

`src/features/seu-mes/hero.test.tsx`:

```tsx
// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './hero'

const summary = {
  entrouCents: 0, saiuCents: 14230, goalLine: null, disponivelCents: -14230, contasAPagarCents: 0,
  disponivelDepoisContasCents: -14230, saldoTotalCents: -14230, guardadoTotalCents: 0,
}

test('Disponível negativo aparece com sinal e sem cor de alarme', () => {
  render(<Hero summary={summary} />)
  const value = screen.getByTestId('disponivel')
  expect(value.textContent).toBe('\u2212R$\u00a0142,30')
  expect(value.className).toContain('text-brand-ink')
  expect(value.className).not.toMatch(/red|error/)
})

test('linha de metas só aparece com valor', () => {
  render(<Hero summary={summary} />)
  expect(screen.queryByText('Guardado este mês')).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/seu-mes`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar** — `src/features/seu-mes/view-model.ts`:

```ts
import { spendingByCategory } from '@/domain/breakdown'
import { dayLabel, isInMonth, monthLabel, monthOf, type ISODate, type MonthKey } from '@/domain/dates'
import { effectiveDate, summarizeMonth, type MonthSummary } from '@/domain/summary'
import type { Category, Profile, TxRow } from '@/features/registro/queries'

export interface SeuMesView {
  month: MonthKey
  label: string
  isCurrentMonth: boolean
  hasAnyInMonth: boolean
  summary: MonthSummary
  biggest: { name: string; cents: number } | null
  categories: { name: string; cents: number; share: number }[]
  recent: { id: string; title: string; subtitle: string; cents: number; kind: 'income' | 'expense' }[]
}

export function buildSeuMes(input: {
  month: MonthKey
  today: ISODate
  profile: Profile
  categories: Category[]
  transactions: TxRow[]
}): SeuMesView {
  const { month, today, profile, categories, transactions } = input
  const nameOf = new Map(categories.map((c) => [c.id, c.name]))

  const summary = summarizeMonth({
    month,
    today,
    initialBalanceCents: profile.initialBalanceCents,
    transactions,
    goalMovements: [],
  })

  const totals = spendingByCategory(transactions, month)
  const top = totals[0]?.cents ?? 0
  const cats = totals.map((t) => ({ name: nameOf.get(t.categoryId) ?? 'Outros', cents: t.cents, share: top ? t.cents / top : 0 }))

  const monthTx = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, month)
  })

  const recent = monthTx.slice(0, 3).map((t) => ({
    id: t.id,
    title: t.kind === 'income' ? t.source ?? 'Entrada' : nameOf.get(t.categoryId ?? '') ?? 'Outros',
    subtitle: dayLabel(effectiveDate(t)!, today),
    cents: t.amountCents,
    kind: t.kind,
  }))

  return {
    month,
    label: monthLabel(month),
    isCurrentMonth: month === monthOf(today),
    hasAnyInMonth: monthTx.length > 0,
    summary,
    biggest: cats[0] ? { name: cats[0].name, cents: cats[0].cents } : null,
    categories: cats,
    recent,
  }
}
```

`src/features/seu-mes/hero.tsx`:

```tsx
import { ArrowDownLeft, ArrowUpRight, CircleHelp, Target } from 'lucide-react'
import { Money } from '@/ui/money'
import type { MonthSummary } from '@/domain/summary'

export function Hero({ summary }: { summary: MonthSummary }) {
  const s = summary
  return (
    <section className="flex flex-col gap-3.5 rounded-hero border border-brand-wash-border bg-brand-wash p-5 md:col-span-2 md:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-brand-text">Disponível</h2>
        <details className="relative">
          <summary aria-label="O que é Disponível?" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full bg-card text-brand-text">
            <CircleHelp className="size-[18px]" aria-hidden="true" />
          </summary>
          <p className="absolute right-0 top-11 z-10 w-64 rounded-card border border-line bg-card p-3 text-sm shadow-card">
            O que entrou, menos o que saiu e o que você guardou neste mês.
          </p>
        </details>
      </div>
      <p data-testid="disponivel" className="num text-[44px] font-bold leading-none text-brand-ink md:text-[56px]">
        <Money cents={s.disponivelCents} />
      </p>
      <div className="flex items-center justify-between rounded-panel bg-card px-3.5 py-3">
        <span className="text-sm">Disponível depois das contas</span>
        <Money cents={s.disponivelDepoisContasCents} className="font-semibold text-brand-ink" />
      </div>
      <dl className="grid grid-cols-3 gap-2 pt-1">
        <div className="flex flex-col gap-1">
          <dt className="flex items-center gap-1 text-[13px]"><ArrowDownLeft className="size-3.5 text-brand-text-hover" aria-hidden="true" />Entrou</dt>
          <dd><Money cents={s.entrouCents} className="text-base font-semibold text-ink" /></dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="flex items-center gap-1 text-[13px]"><ArrowUpRight className="size-3.5" aria-hidden="true" />Saiu</dt>
          <dd><Money cents={s.saiuCents} className="text-base font-semibold text-ink" /></dd>
        </div>
        {s.goalLine && (
          <div className="flex flex-col gap-1">
            <dt className="flex items-center gap-1 text-[13px]"><Target className="size-3.5" aria-hidden="true" />{s.goalLine.label}</dt>
            <dd><Money cents={s.goalLine.amountCents} className="text-base font-semibold text-ink" /></dd>
          </div>
        )}
      </dl>
    </section>
  )
}
```

`src/features/seu-mes/month-nav.tsx`:

```tsx
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, type MonthKey } from '@/domain/dates'

export function MonthNav({ month, label }: { month: MonthKey; label: string }) {
  const link = 'flex size-11 items-center justify-center rounded-control text-[#262626] hover:bg-canvas'
  return (
    <nav aria-label="Mês" className="flex h-[46px] items-center rounded-panel border border-line bg-card">
      <Link href={`/inicio?mes=${addMonths(month, -1)}`} aria-label="Mês anterior" className={link}><ChevronLeft className="size-[18px]" aria-hidden="true" /></Link>
      <span className="px-1.5 text-sm font-semibold capitalize text-ink">{label}</span>
      <Link href={`/inicio?mes=${addMonths(month, 1)}`} aria-label="Próximo mês" className={link}><ChevronRight className="size-[18px]" aria-hidden="true" /></Link>
    </nav>
  )
}
```

`src/features/seu-mes/categories-card.tsx`:

```tsx
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'

export function CategoriesCard({ categories }: { categories: { name: string; cents: number; share: number }[] }) {
  const top = categories.slice(0, 4)
  const rest = categories.slice(4)
  const Row = ({ c }: { c: { name: string; cents: number; share: number } }) => (
    <li className="grid grid-cols-[92px_1fr_84px] items-center gap-2.5 text-[15px]">
      <span className="truncate text-ink">{c.name}</span>
      <span className="h-2 rounded-full bg-spend" style={{ width: `${Math.max(c.share * 100, 4)}%` }} aria-hidden="true" />
      <Money cents={c.cents} className="text-right text-ink" />
    </li>
  )
  return (
    <Card className="flex flex-col gap-4 md:col-span-2">
      <h2 className="text-[17px] font-semibold text-ink">Para onde seu dinheiro vai</h2>
      <ul className="flex flex-col gap-3.5">{top.map((c) => <Row key={c.name} c={c} />)}</ul>
      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center font-medium text-brand-text">
            Ver mais {rest.length} {rest.length === 1 ? 'categoria' : 'categorias'}
          </summary>
          <ul className="flex flex-col gap-3.5 pt-2">{rest.map((c) => <Row key={c.name} c={c} />)}</ul>
        </details>
      )}
    </Card>
  )
}
```

`src/features/seu-mes/recent-card.tsx`:

```tsx
import { ArrowDownLeft, Receipt } from 'lucide-react'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'
import type { SeuMesView } from './view-model'

export function RecentCard({ recent }: { recent: SeuMesView['recent'] }) {
  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="text-[17px] font-semibold text-ink">Últimos registros</h2>
      <ul className="flex flex-col gap-3.5">
        {recent.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-panel ${r.kind === 'income' ? 'bg-brand-wash text-brand-text-hover' : 'bg-sunken text-[#262626]'}`}>
              {r.kind === 'income' ? <ArrowDownLeft className="size-5" aria-hidden="true" /> : <Receipt className="size-5" aria-hidden="true" />}
            </span>
            <span className="flex flex-1 flex-col"><span className="text-[15px] text-ink">{r.title}</span><span className="text-[13px] text-muted">{r.subtitle}</span></span>
            <span className={`num text-[15px] ${r.kind === 'income' ? 'font-semibold text-brand-text-hover' : 'font-medium text-ink'}`}>
              {r.kind === 'income' ? '+ ' : '\u2212 '}<Money cents={r.cents} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
```

`src/app/(app)/inicio/page.tsx`:

```tsx
import { ShoppingCart } from 'lucide-react'
import { monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { buildSeuMes } from '@/features/seu-mes/view-model'
import { Hero } from '@/features/seu-mes/hero'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { CategoriesCard } from '@/features/seu-mes/categories-card'
import { RecentCard } from '@/features/seu-mes/recent-card'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const today = todayInSaoPaulo()
  const { mes } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const { profile, categories, transactions } = await loadLedger()
  const v = buildSeuMes({ month, today, profile, categories, transactions })

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">Seu mês até agora</span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[26px]">Oi, {profile.displayName}.</h1>
        </div>
        <MonthNav month={month} label={v.label} />
      </header>

      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <Hero summary={v.summary} />

        <div className="flex flex-col gap-3 md:gap-4">
          {v.biggest ? (
            <Card className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-panel bg-sunken text-[#262626]"><ShoppingCart className="size-5" aria-hidden="true" /></span>
              <p>Seu maior gasto foi com <strong className="text-ink">{v.biggest.name}</strong>: <Money cents={v.biggest.cents} />.</p>
            </Card>
          ) : (
            <Card className="flex flex-col items-start gap-3.5 border-dashed">
              <p className="text-[17px] font-medium text-ink">
                {v.isCurrentMonth ? 'Seu mês começa aqui. Anote o primeiro gasto e veja ele ganhar forma.' : 'Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.'}
              </p>
              <Button href="/anotar">{v.isCurrentMonth ? 'Anotar primeiro gasto' : 'Anotar gasto'}</Button>
            </Card>
          )}
          <section className="flex flex-col gap-2 rounded-card bg-sunken p-4">
            <div className="flex justify-between"><span>Saldo total</span><Money cents={v.summary.saldoTotalCents} className="font-semibold text-ink" /></div>
            <div className="flex justify-between text-sm text-muted"><span>Guardado</span><Money cents={v.summary.guardadoTotalCents} /></div>
          </section>
        </div>

        {v.categories.length > 0 && <CategoriesCard categories={v.categories} />}
        {v.recent.length > 0 && <RecentCard recent={v.recent} />}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/seu-mes && npm run typecheck && npm run build`
Expected: PASS; build sem erros.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(seu-mes): dashboard com Disponível, categorias e últimos registros" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Teste de ponta a ponta e preparação para publicar

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/nucleo.spec.ts`, `netlify.toml`, `README.md` (substituir o gerado)

**Interfaces:**
- Consumes: todas as rotas das Tasks 7, 11 e 12; `SUPABASE_SECRET_KEY` só para apagar o usuário de teste.

- [ ] **Step 1: Configuração** — `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/entrar', reuseExistingServer: true, timeout: 120_000 },
})
```

- [ ] **Step 2: Teste que falha** — `tests/e2e/nucleo.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const signupEmail = `e2e-cadastro-${stamp}@teste.iris.dev`
const loginEmail = `e2e-entrar-${stamp}@teste.iris.dev`
const password = 'senha-forte-123'
let loginUserId = ''

// Cada projeto (celular, desktop) roda este arquivo em separado: cada um cria o seu usuário de login.
test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail, password, email_confirm: true, user_metadata: { display_name: 'Bia' },
  })
  if (error) throw error
  loginUserId = data.user.id
})

test.afterAll(async () => {
  if (loginUserId) await admin.auth.admin.deleteUser(loginUserId)
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const signup = data.users.find((u) => u.email === signupEmail)
  if (signup) await admin.auth.admin.deleteUser(signup.id)
})

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(loginEmail)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Oi, Bia.' })).toBeVisible()
}

test('criar cadastro, anotar gasto e entrada, ver o mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'O cadastro roda uma vez; o desktop é verificado no teste seguinte.')

  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar$/)

  await page.goto('/criar-cadastro')
  await page.getByLabel('Como podemos te chamar?').fill('Camila')
  await page.getByLabel('Seu e-mail').fill(signupEmail)
  await page.getByLabel('Crie uma senha').fill(password)
  await page.getByRole('button', { name: 'Criar meu cadastro' }).click()

  await expect(page.getByRole('heading', { name: 'Oi, Camila.' })).toBeVisible()
  await expect(page.getByText('Seu mês começa aqui.', { exact: false })).toBeVisible()

  await page.getByRole('link', { name: 'Anotar primeiro gasto' }).click()
  await page.getByLabel('Quanto foi?').fill('142,30')
  await page.getByRole('radio', { name: 'Mercado' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar gasto' }).click()

  await expect(page.getByRole('status')).toHaveText('Anotado. Seu mês já está atualizado.')
  await expect(page.getByTestId('disponivel')).toHaveText('\u2212R$\u00a0142,30')
  await expect(page.getByText('Seu maior gasto foi com')).toContainText('Mercado')

  await page.goto('/anotar?tipo=entrada')
  await page.getByLabel('Quanto entrou?').fill('5.000')
  await page.getByRole('radio', { name: 'Salário' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar entrada' }).click()

  await expect(page.getByRole('status')).toHaveText('Anotado. Mais R$\u00a05.000,00 no seu mês.')
  await expect(page.getByTestId('disponivel')).toHaveText('R$\u00a04.857,70')
})

test('mensagens de erro do formulário mantêm o que foi digitado', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  await entrar(page)
  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('12a')
  await page.getByRole('button', { name: 'Salvar gasto' }).click()
  await expect(page.getByText('Esse valor não parece certo. Use apenas números.')).toBeVisible()
  await expect(page.getByText('Escolha uma categoria para esse gasto.')).toBeVisible()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('12a')
})

test('desktop mostra o menu lateral', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await entrar(page)
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Seu mês' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('disponivel')).toBeVisible()
})
```

- [ ] **Step 3: Rodar e ajustar até passar**

Run: `npm run test:e2e`
Expected: 3 testes passando (2 no projeto celular, 1 no desktop). Se falhar, corrigir o código da tarefa responsável — não o teste — e registrar a causa no commit.

- [ ] **Step 4: Publicação preparada** — `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "24"
```

`README.md`:

```markdown
# Íris

App de finanças pessoais e familiares. Documentação do produto em `docs/`.

## Rodar localmente

1. `cp .env.example .env.local` e preencher com os dados do projeto Supabase de desenvolvimento.
2. `npm install`
3. `npx supabase db push` (aplica as migrações)
4. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras de dinheiro, datas, formulários e componentes
- `npm run test:db` — privacidade no banco (usa `SUPABASE_SECRET_KEY`)
- `npm run test:e2e` — fluxo completo no navegador (celular e desktop)
```

- [ ] **Step 5: Verificação completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e && npm run build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(e2e): fluxo de cadastro, anotar e Seu mês; preparação para Netlify" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> A publicação na Netlify **não** faz parte deste plano: ela só acontece com sua autorização explícita, depois de você testar localmente.

---

## Textos novos (fora da copy oficial) usados neste plano

- "Falta o seu nome." · "Falta a senha." · "Use até {n} caracteres." · "Escolha o dia." · "Crie uma nova senha." · "Salvar nova senha." · "Voltar" (recuperar senha)
- Mês sem registros (fora do mês atual): reaproveita "Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui." (estado vazio do Extrato)
- Formas de pagamento: Pix, Dinheiro, Boleto, Débito, Crédito, Outra forma

## Decisões que precisam de você antes de executar

- **D1. Confirmação de e-mail no cadastro.** O protótipo aprovado vai do cadastro direto ao app. Proposta: sem confirmação obrigatória (menos atrito); o e-mail é confirmado depois, sem bloquear. Alternativa: exigir confirmação e mostrar "Enviamos um link para {e-mail}" antes de entrar.
- **D2. Gasto pago com meta em "Para onde seu dinheiro vai".** Este plano conta só a parte que saiu do mês (para bater com o "Saiu"). Alternativa: contar o gasto inteiro na categoria. Afeta o Plano 5; a escolha pode esperar até lá.
