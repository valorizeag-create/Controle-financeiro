# Íris — Plano 2: Extrato, onboarding e ajustes básicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa passa por um onboarding curto e pulável (3 telas, saldo inicial opcional, convite para o primeiro gasto), encontra tudo o que entrou e saiu no Extrato (agrupado por dia, com busca e filtros), edita e exclui registros com confirmação, cuida das próprias categorias (criar, renomear, excluir levando os gastos para "Outros") e ajusta nome, senha e saldo inicial em Configurações — no celular e no desktop. Também fecha as quatro pendências herdadas do Plano 1.

**Architecture:** Mesma base do Plano 1: Next.js 16 (App Router, Server Components, Server Actions), Supabase com RLS, regras puras em `src/domain/` e em funções puras por área (`src/features/*/view-model.ts`, `schemas.ts`). O Extrato é calculado no servidor a partir do livro-razão já carregado por `loadLedger()` (filtros e busca por uma função pura testada). Exclusão de categoria (RN-27) é uma função SQL atômica (`delete_category`) chamada via RPC. O onboarding é um grupo de rotas próprio `(onboarding)`; o layout de `(app)` redireciona para `/boas-vindas` quem ainda não concluiu (`profiles.onboarded_at` nulo).

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2, Zod 4, lucide-react 1.x, Vitest 5 + Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/etapa-2-requisitos.md` (RF-05–09 menos instalar, RF-13, RF-19–21, RF-36–37, RF-51; RN-27), `docs/etapa-3-arquitetura.md` (§3 modelo, §6 páginas, §7 navegação, A1–A8), `docs/etapa-5-ui.md` (tokens), `docs/etapa-7-roteiro.md` (escopo do Plano 2), `docs/progresso.md` (pendências do Plano 1), `docs/decisoes-para-revisao.md`, protótipo aprovado (telas Extrato, Onb1–3, SaldoInicial, PrimeiroGasto, SeuMesVazio, Mais, Configuracoes, Estados), copy oficial (Claude Doc).

## Global Constraints

- Idioma pt-BR, moeda somente R$ (RN-28). Fuso fixo `America/Sao_Paulo`: "hoje" vem de `todayInSaoPaulo()` no servidor.
- Dinheiro sempre em **centavos inteiros**; máximo `MAX_CENTS = 9_999_999_999`. Texto → centavos só por `parseBRL`; centavos → texto por `formatBRL` (negativo `−R$ 142,30`, com NBSP).
- "Mês" = mês do calendário (A2); `parseMonthKey` aceita só 2000–2099. Mês efetivo de um registro = `effectiveDate(tx)` = `paid_on ?? occurred_on`, só `status = 'confirmed'` (A1 B).
- Datas de registro: gasto de 01/01/2000 até hoje + 365 dias; **entrada só até hoje** (servidor já aplica; o campo ganha `max` neste plano).
- Termos fixos: "cadastro" = acesso; "conta" = só conta a pagar. Nunca "conta" para o acesso (nem em `aria-label`).
- Todo texto visível vem da copy oficial ou da seção "Textos novos" no fim deste plano.
- Sem vermelho de alerta (V5): vermelho só para erro de campo/sistema. Sem exclamação em mensagens.
- Alvos de toque ≥ 44 px; texto 15–16 px no celular; contraste WCAG AA; toda confirmação é `role="alertdialog"` com foco no botão de cancelar e `Esc` fechando.
- Banco: **nunca editar** `supabase/migrations/20260922000001_nucleo.sql`; toda mudança vai em migração nova versionada. RLS preservada em todas as tabelas. A FK composta `transactions (category_id, user_id) → categories (id, user_id)` é `on delete no action` e o gatilho `protect_default_categories` impede apagar "Outros" — por isso excluir categoria passa pela função `delete_category`.
- Servidor: `requireUser()` (memoizado com `cache()` do React) no começo de toda Server Action e loader; validação sempre com Zod no servidor; formulários usam `FormState` de `src/lib/forms.ts` (`errorState`, `firstFieldErrors`, `readFields`) e mantêm o que foi digitado em caso de erro. `redirect()` nunca dentro de `try`.
- Aviso de sucesso entre páginas: `setFlash(texto)` grava o cookie `iris_flash` com o texto **puro** (o Next já codifica); `Toast` lê em toda troca de rota.
- Leituras do histórico completo sempre paginadas por `fetchAllPages` (páginas de 1.000).
- Depois de gravar dinheiro: `revalidatePath('/inicio')` e `revalidatePath('/extrato')`. Depois de mudar nome ou categorias: `revalidatePath('/', 'layout')`.
- Navegação: `BottomNav`, `Sidebar`, `MainFrame` e `Toast` são componentes cliente com `usePathname()` (o layout não re-renderiza em navegação cliente).
- Testes de componente: primeira linha `// @vitest-environment jsdom` e `afterEach(() => cleanup())` (sem `globals`). Server Actions são testadas com `@/lib/supabase/server`, `@/lib/flash`, `next/cache` e `next/navigation` mockados.
- Nenhuma chave secreta no navegador; `SUPABASE_SECRET_KEY` só em `tests/db` e `tests/e2e`.
- Shell do Windows: comandos em sintaxe POSIX (Git Bash). Caminho do projeto: `C:/Users/Joaov/Downloads/Planilha financeira`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Passos que dependem do Supabase local (`npx supabase db reset`, `npm run test:db`, `npm run test:e2e`) exigem Docker. Se o Docker ainda não estiver instalado, marque o RUN como pendente em `docs/progresso.md` — **nunca** enfraqueça ou pule o teste.

## Review Focus

Cinco situações que mais podem atrapalhar a pessoa e que nenhum teste de tarefa cobria na primeira versão do plano; cada uma ganhou teste na tarefa dona:

1. **Busca digitada "do jeito da pessoa"** — sem acento ("saude"), em maiúsculas ("MERCADO"), com parte do valor ("142", "142,3"), com "R$" colado ("r$142") ou com milhar ("1.234,56" / "1234,56"). Precisa encontrar o registro certo e nada além. → testes na **Task 9**.
2. **Registro editado que muda de mês** — a pessoa corrige a data de um gasto para o mês anterior: ele precisa sair do mês atual e aparecer no anterior, e a tela volta para o mês novo (senão parece que o gasto sumiu). → teste unitário na **Task 13** e ponta a ponta na **Task 18**.
3. **Onboarding interrompido** — quem fecha o app no meio (passo 2) volta ao onboarding na próxima entrada, em vez de cair num Seu mês sem saldo inicial; quem já concluiu nunca é forçado a ver de novo. → testes na **Task 15** e ponta a ponta na **Task 18**.
4. **Nome de categoria repetido com outra grafia** — "  pet " ou "PET" quando já existe "Pet" (inclusive nomes padrão como "mercado"): mensagem amigável no campo, nada de erro técnico, e o banco garante mesmo sob corrida. → testes nas **Tasks 5, 6 e 16**.
5. **Mudar senha com sessão antiga** — com `secure_password_change = true`, o Supabase recusa a troca se o login não for recente; a pessoa precisa de uma instrução clara, não de "Algo não saiu como esperado". → teste na **Task 17**.

---

## Estrutura de arquivos

```
supabase/migrations/20260925000001_categorias_e_onboarding.sql   NOVO: nomes únicos sem caixa, Outros fixa, delete_category, backfill onboarded_at
tests/db/helpers.ts                                  NOVO: admin, newUser, removeUsers, categoryId
tests/db/plano2.test.ts                              NOVO: regras de banco do Plano 2
tests/e2e/nucleo.spec.ts                             MOD: cadastro passa pelo onboarding; usuária de login já concluiu
tests/e2e/plano2.spec.ts                             NOVO: onboarding, extrato, categorias, configurações
src/
  app/
    (app)/layout.tsx                                 MOD: MainFrame + redireciona quem não concluiu o onboarding
    (app)/anotar/page.tsx                            MOD: passa "hoje" ao formulário; fechar com confirmação
    (app)/extrato/page.tsx                           NOVO: Extrato
    (app)/extrato/[id]/page.tsx                      NOVO: Editar gasto/entrada + Excluir
    (app)/categorias/page.tsx                        NOVO
    (app)/categorias/nova/page.tsx                   NOVO
    (app)/categorias/[id]/page.tsx                   NOVO
    (app)/mais/page.tsx                              NOVO
    (app)/configuracoes/page.tsx                     NOVO
    (app)/configuracoes/nome/page.tsx                NOVO
    (app)/configuracoes/saldo-inicial/page.tsx       NOVO
    (onboarding)/layout.tsx                          NOVO
    (onboarding)/boas-vindas/page.tsx                NOVO: 3 telas (?passo=1..3)
    (onboarding)/boas-vindas/saldo/page.tsx          NOVO: Quanto você tem hoje?
    (onboarding)/boas-vindas/primeiro-gasto/page.tsx NOVO
    (auth)/nova-senha/page.tsx                       MOD: vindo de Configurações mostra Voltar
  lib/flash.test.ts                                  NOVO: teste do setFlash
  ui/
    confirm.tsx (+ confirm.test.tsx)                 NOVO: ConfirmPanel, ConfirmAction
    list.tsx, page-header.tsx (+ list.test.tsx)      NOVO: listas de Mais/Configurações/Categorias
  features/
    shell/toast.tsx (+ toast.test.tsx)               MOD: prazo de 4 s sobrevive à troca de rota
    shell/nav-items.ts (+ nav-items.test.ts)         MOD: itens da barra e do menu, isActive, isSheetRoute
    shell/main-frame.tsx (+ main-frame.test.tsx)     NOVO: espaço da barra inferior só onde ela aparece
    shell/bottom-nav.tsx, sidebar.tsx (+ nav.test.tsx, sidebar.test.tsx)  MOD
    shell/sign-out-button.tsx                        NOVO: Sair da Íris? com confirmação
    registro/labels.ts                               NOVO: rótulos das formas de pagamento
    registro/form-values.ts (+ .test.ts)             NOVO: registro → valores do formulário
    registro/anotar-form.tsx (+ .test.tsx)           MOD: hoje/limites de data, modo edição, "sujo"
    registro/sheet-close.tsx (+ .test.tsx)           NOVO: Fechar com "Descartar este registro?"
    registro/actions.ts (+ actions.test.ts)          MOD: updateTransaction, deleteTransaction
    registro/queries.ts                              MOD: loadTransaction, categorias ordenadas
    extrato/view-model.ts (+ .test.ts)               NOVO: filtros, busca, agrupamento
    extrato/filters-bar.tsx (+ .test.tsx)            NOVO
    extrato/extrato-list.tsx (+ .test.tsx)           NOVO
    seu-mes/month-nav.tsx (+ .test.tsx)              MOD: basePath e query
    categorias/names.ts (+ .test.ts)                 NOVO: normalizar nome, ordem, erro de duplicado
    categorias/actions.ts (+ .test.ts)               NOVO
    categorias/category-form.tsx                     NOVO
    perfil/schemas.ts, actions.ts (+ actions.test.ts), queries.ts, forms.tsx   NOVO
    onboarding/gate.ts (+ .test.ts), slide.tsx (+ .test.tsx)                    NOVO
    auth/errors.ts (+ .test.ts), actions.ts, forms.tsx (+ forms.test.tsx)       NOVO/MOD
docs/progresso.md, docs/decisoes-para-revisao.md     MOD no fim
```

**Onde fica cada item de "Mais" e de "Configurações"** (nada aparece antes de existir; sem links mortos):

| Item | Plano |
|---|---|
| Mais → Categorias, Configurações, Sair da Íris | **2 (este)** |
| Mais → Contas | 3 |
| Mais → Cartões · Configurações → Seu dinheiro → Cartões | 4 |
| Barra inferior → Metas | 5 |
| Mais → Planejamento, Relatórios | 6 |
| Mais → Família (e "Família {nome}" sob o nome) | 7 |
| Configurações → Lembretes; App → Adicionar à tela de início | 8 |
| Configurações → Seus dados (Baixar meus dados, Excluir meu cadastro, Termos, Privacidade); trocar e-mail | 9 |

---

### Task 1: Aviso "Anotado." some mesmo se a pessoa trocar de página

**Files:**
- Modify: `src/features/shell/toast.tsx`
- Test: `src/features/shell/toast.test.tsx`

**Interfaces:**
- Consumes: `readFlash(cookieString): string | null` (`./flash-read`), `FLASH_COOKIE_NAME` (`./flash-name`), `usePathname()`.
- Produces: `Toast(): JSX.Element` (mesma assinatura). O prazo de 4 s fica num efeito ligado à mensagem, não à rota.

- [ ] **Step 1: Teste que falha** — substituir `src/features/shell/toast.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { FLASH_COOKIE_NAME } from './flash-name'

// O layout autenticado permanece montado entre navegações no App Router (é o
// mesmo layout para /anotar e /inicio), então o Toast relê o cookie a cada
// troca de rota. Mockamos usePathname para simular a troca sem remontar.
let pathname = '/anotar'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Toast } = await import('./toast')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
})

test('mostra o aviso ao navegar para a rota de destino após a Server Action', () => {
  pathname = '/anotar'
  const { rerender } = render(<Toast />)
  expect(screen.queryByRole('status')).toBeNull()

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  pathname = '/inicio'
  rerender(<Toast />)

  expect(screen.getByRole('status').textContent).toContain('Anotado.')
})

test('o aviso some depois de 4 s mesmo se a pessoa trocar de página antes', () => {
  vi.useFakeTimers()
  pathname = '/anotar'
  const { rerender } = render(<Toast />)

  document.cookie = `${FLASH_COOKIE_NAME}=Anotado.`
  pathname = '/inicio'
  rerender(<Toast />)
  expect(screen.getByRole('status').textContent).toContain('Anotado.')

  act(() => {
    vi.advanceTimersByTime(1000)
  })
  pathname = '/extrato'
  rerender(<Toast />)
  expect(screen.getByRole('status')).toBeTruthy()

  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(screen.queryByRole('status')).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell/toast.test.tsx`
Expected: FAIL no segundo teste — `expected <p role="status">…</p> to be null` (a troca para `/extrato` cancelou o prazo e o aviso ficou preso).

- [ ] **Step 3: Implementação** — substituir `src/features/shell/toast.tsx` por:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { FLASH_COOKIE_NAME } from './flash-name'
import { readFlash } from './flash-read'

function readAndClear(): string | null {
  const message = readFlash(document.cookie)
  if (document.cookie.split('; ').some((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))) {
    document.cookie = `${FLASH_COOKIE_NAME}=; path=/; max-age=0`
  }
  return message
}

// `id` diferencia duas mensagens iguais seguidas: cada uma ganha seu próprio prazo.
type Shown = { text: string; id: number }

export function Toast() {
  const [shown, setShown] = useState<Shown | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    // O layout autenticado fica montado entre navegações do App Router, então
    // precisamos reler o cookie a cada troca de rota — é assim que o aviso
    // aparece depois que a Server Action de /anotar redireciona para /inicio.
    const m = readAndClear()
    if (!m) return
    // Sincronizando com um sistema externo (cookie do navegador) que só existe
    // após a montagem — não há como saber esse valor durante o render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ text: m, id: Date.now() })
  }, [pathname])

  // O prazo de 4 s fica num efeito próprio, ligado à mensagem e não à rota:
  // trocar de página antes dos 4 s não cancela o prazo, e o aviso não fica preso.
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 4000)
    return () => clearTimeout(t)
  }, [shown])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-30 flex justify-center md:bottom-8">
      {shown && (
        <p role="status" className="flex items-center gap-2.5 rounded-card bg-brand-ink px-4 py-3.5 text-[15px] text-white shadow-[0_8px_24px_rgba(18,40,1,.16)]">
          <Check className="size-5 text-brand" aria-hidden="true" />
          {shown.text}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/shell/toast.test.tsx && npm run lint`
Expected: 2 testes passando; lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/toast.tsx src/features/shell/toast.test.tsx
git commit -m "fix(shell): aviso some em 4 s mesmo trocando de página" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Teste do `setFlash` de verdade

**Files:**
- Test: `src/lib/flash.test.ts` (novo)

**Interfaces:**
- Consumes: `setFlash(message: string): Promise<void>` (`src/lib/flash.ts`, sem mudança), `readFlash`, `FLASH_COOKIE_NAME`, `ResponseCookies` (a mesma classe que `cookies()` usa numa Server Action).

- [ ] **Step 1: Escrever o teste** — `src/lib/flash.test.ts`:

```ts
import { expect, test, vi } from 'vitest'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { readFlash } from '@/features/shell/flash-read'
import { FLASH_COOKIE_NAME } from '@/features/shell/flash-name'

// `cookies()` numa Server Action devolve um ResponseCookies; usamos a classe real
// para exercitar o próprio setFlash, inclusive a codificação feita pelo Next.
const jar = vi.hoisted(() => ({ store: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => jar.store }))

const { setFlash } = await import('./flash')

function flashSetCookie(headers: Headers): string {
  const all = headers.getSetCookie()
  const line = all.find((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))
  if (!line) throw new Error('setFlash não gravou o cookie')
  return line
}

test('setFlash grava o texto puro: o navegador lê exatamente a mensagem', async () => {
  const headers = new Headers()
  jar.store = new ResponseCookies(headers)

  await setFlash('Anotado. Mais R$ 5.000,00 no seu mês.')

  const line = flashSetCookie(headers)
  expect(readFlash(line.split(';')[0])).toBe('Anotado. Mais R$ 5.000,00 no seu mês.')
})

test('setFlash vale para o site todo, dura 30 s e só vai em navegação do próprio site', async () => {
  const headers = new Headers()
  jar.store = new ResponseCookies(headers)

  await setFlash('Alterações salvas.')

  const line = flashSetCookie(headers).toLowerCase()
  expect(line).toContain('path=/')
  expect(line).toContain('max-age=30')
  expect(line).toContain('samesite=lax')
})
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run src/lib/flash.test.ts`
Expected: PASS — é um teste de regressão do comportamento atual (a pendência do Plano 1 era a falta de cobertura do `setFlash`).

- [ ] **Step 3: Provar que o teste pega o erro antigo** — em `src/lib/flash.ts`, trocar temporariamente `store.set(FLASH_COOKIE, message, …)` por `store.set(FLASH_COOKIE, encodeURIComponent(message), …)` e rodar de novo:

Run: `npx vitest run src/lib/flash.test.ts`
Expected: FAIL — `expected 'Anotado.%20Mais%20R%24…' to be 'Anotado. Mais R$ 5.000,00 no seu mês.'` (dupla codificação).

Desfazer a mudança temporária:

```bash
git checkout -- src/lib/flash.ts
npx vitest run src/lib/flash.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/flash.test.ts
git commit -m "test(flash): cobre o setFlash com o serializador real de cookies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sem faixa vazia sob os painéis (Anotar e Editar)

**Files:**
- Modify: `src/features/shell/nav-items.ts`, `src/features/shell/bottom-nav.tsx`, `src/app/(app)/layout.tsx`
- Create: `src/features/shell/main-frame.tsx`
- Test: `src/features/shell/nav-items.test.ts` (novo), `src/features/shell/main-frame.test.tsx` (novo)

**Interfaces:**
- Produces: `isSheetRoute(pathname: string): boolean` — `true` para `/anotar`, `/anotar/...` e `/extrato/{id}` (painel de edição, Task 13); `MainFrame({ children }): JSX.Element` — área de conteúdo com `pb-28 md:pb-10` só quando a barra inferior aparece.

- [ ] **Step 1: Testes que falham**

`src/features/shell/nav-items.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isSheetRoute } from './nav-items'

test('painéis que cobrem a tela não têm barra inferior', () => {
  expect(isSheetRoute('/anotar')).toBe(true)
  expect(isSheetRoute('/anotar/gasto')).toBe(true)
  expect(isSheetRoute('/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/extrato')).toBe(false)
  expect(isSheetRoute('/extrato/a/b')).toBe(false)
  expect(isSheetRoute('/anotarx')).toBe(false)
  expect(isSheetRoute('/inicio')).toBe(false)
})
```

`src/features/shell/main-frame.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { MainFrame } = await import('./main-frame')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('reserva espaço para a barra inferior nas telas comuns', () => {
  pathname = '/inicio'
  const { container } = render(<MainFrame><p>conteúdo</p></MainFrame>)
  const frame = container.firstChild as HTMLElement
  expect(frame.className).toContain('pb-28')
  expect(frame.className).toContain('md:pb-10')
})

test('não deixa faixa vazia sob os painéis de Anotar e Editar', () => {
  for (const p of ['/anotar', '/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) {
    pathname = p
    const { container, unmount } = render(<MainFrame><p>conteúdo</p></MainFrame>)
    const frame = container.firstChild as HTMLElement
    expect(frame.className).not.toContain('pb-28')
    expect(frame.className).not.toContain('md:pb-10')
    unmount()
  }
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell/nav-items.test.ts src/features/shell/main-frame.test.tsx`
Expected: FAIL — `isSheetRoute is not a function` e `Failed to resolve import "./main-frame"`.

- [ ] **Step 3: Implementação**

`src/features/shell/nav-items.ts`:

```ts
import { House, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

// Cada plano acrescenta seu item aqui (Extrato e Mais na Task 8 deste plano, Metas no Plano 5).
export const NAV_ITEMS: NavItem[] = [{ href: '/inicio', label: 'Seu mês', icon: House }]

// Painéis que cobrem a tela inteira (Anotar e Editar registro) têm navegação
// própria: sem barra inferior e sem o espaço reservado para ela.
export function isSheetRoute(pathname: string): boolean {
  if (pathname === '/anotar' || pathname.startsWith('/anotar/')) return true
  return /^\/extrato\/[^/]+$/.test(pathname)
}
```

`src/features/shell/main-frame.tsx`:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { isSheetRoute } from './nav-items'

// O layout é Server Component e não sabe a rota atual; este invólucro cliente
// reserva o espaço da barra inferior só onde ela aparece. Nos painéis (Anotar,
// Editar) o espaço sobrava como uma faixa vazia no fim da tela.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className={`flex-1 ${isSheetRoute(pathname) ? '' : 'pb-28 md:pb-10'}`}>{children}</div>
}
```

Em `src/features/shell/bottom-nav.tsx`, trocar:

```tsx
import { NAV_ITEMS } from './nav-items'
```

por:

```tsx
import { NAV_ITEMS, isSheetRoute } from './nav-items'
```

e trocar:

```tsx
  // /anotar tem sua própria navegação (abas de gasto/entrada) — a barra
  // inferior competiria por espaço e esconderia a rota atual.
  if (pathname.startsWith('/anotar')) return null
```

por:

```tsx
  // Painéis (Anotar, Editar) têm navegação própria — a barra inferior
  // competiria por espaço e esconderia a rota atual.
  if (isSheetRoute(pathname)) return null
```

`src/app/(app)/layout.tsx`:

```tsx
import { requireUser, createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/features/shell/bottom-nav'
import { MainFrame } from '@/features/shell/main-frame'
import { Sidebar } from '@/features/shell/sidebar'
import { Toast } from '@/features/shell/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('display_name').single()
  return (
    <div className="flex min-h-dvh">
      <Sidebar displayName={profile?.display_name ?? ''} />
      <MainFrame>{children}</MainFrame>
      <BottomNav />
      <Toast />
    </div>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/shell && npm run typecheck`
Expected: todos os testes de `src/features/shell` passando (inclusive `nav.test.tsx`, que já esperava a barra escondida em `/anotar` e `/anotar/gasto`); tipos sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/nav-items.ts src/features/shell/nav-items.test.ts src/features/shell/main-frame.tsx src/features/shell/main-frame.test.tsx src/features/shell/bottom-nav.tsx "src/app/(app)/layout.tsx"
git commit -m "fix(shell): sem faixa vazia sob o Anotar no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Campo de data mostra os limites (entrada só até hoje)

**Files:**
- Modify: `src/features/registro/anotar-form.tsx`, `src/app/(app)/anotar/page.tsx`
- Test: `src/features/registro/anotar-form.test.tsx`

**Interfaces:**
- Consumes: `addDays(d: ISODate, n: number): ISODate`, `todayInSaoPaulo(): ISODate`, `type ISODate` (`@/domain/dates`).
- Produces: `AnotarForm({ kind, categories, today }: { kind: 'expense' | 'income'; categories: Category[]; today: ISODate })` — o campo "Dia" ganha `min="2000-01-01"` e `max` = hoje (entrada) ou hoje + 365 (gasto). É só dica no navegador; o servidor continua decidindo.

- [ ] **Step 1: Teste que falha** — substituir `src/features/registro/anotar-form.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ createTransaction: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), true]) }
})

import { AnotarForm } from './anotar-form'

const mockUseActionState = vi.mocked(useActionState)
const today = '2026-09-30'

const categories = [
  { id: '1', name: 'Casa', defaultKey: 'casa' },
  { id: '2', name: 'Mercado', defaultKey: 'mercado' },
]

afterEach(() => cleanup())

describe('AnotarForm', () => {
  test('gasto tem valor, categorias, quando e "Salvar gasto"', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto foi?').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
  })
  test('botão fica desativado enquanto salva (evita registro duplicado)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toHaveProperty('disabled', true)
  })
  test('entrada usa "Quanto entrou?" e "Salvar entrada"', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto entrou?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar entrada' })).toBeTruthy()
  })
  test('erro de data mostra input com aria-describedby e mensagem', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { date: 'Escolha o dia.' }, values: { when: 'other', date: '' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('aria-describedby')).toBe('date-error')
    expect(dateInput.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Escolha o dia.')).toBeTruthy()
  })
  test('entrada: o campo de outro dia não passa de hoje', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('max')).toBe('2026-09-30')
    expect(dateInput.getAttribute('min')).toBe('2000-01-01')
  })
  test('gasto: o campo de outro dia vai até um ano à frente', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    expect(screen.getByLabelText('Dia').getAttribute('max')).toBe('2027-09-30')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/anotar-form.test.tsx`
Expected: FAIL nos dois últimos testes — `expected null to be '2026-09-30'` (o campo não tem `max`).

- [ ] **Step 3: Implementação** — em `src/features/registro/anotar-form.tsx`:

Trocar o import:

```tsx
import type { Category } from './queries'
```

por:

```tsx
import type { Category } from './queries'
import { addDays, type ISODate } from '@/domain/dates'
```

Trocar a assinatura:

```tsx
export function AnotarForm({ kind, categories }: { kind: 'expense' | 'income'; categories: Category[] }) {
```

por:

```tsx
export function AnotarForm({ kind, categories, today }: { kind: 'expense' | 'income'; categories: Category[]; today: ISODate }) {
```

Trocar o campo de data:

```tsx
          <input
            type="date" name="date" defaultValue={v.date} aria-label="Dia"
```

por:

```tsx
          <input
            type="date" name="date" defaultValue={v.date} aria-label="Dia"
            min="2000-01-01" max={isExpense ? addDays(today, 365) : today}
```

Em `src/app/(app)/anotar/page.tsx`, trocar:

```tsx
import { loadCategories } from '@/features/registro/queries'
```

por:

```tsx
import { todayInSaoPaulo } from '@/domain/dates'
import { loadCategories } from '@/features/registro/queries'
```

e trocar:

```tsx
        <AnotarForm key={kind} kind={kind} categories={categories} />
```

por:

```tsx
        <AnotarForm key={kind} kind={kind} categories={categories} today={todayInSaoPaulo()} />
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/registro && npm run typecheck`
Expected: todos passando; tipos sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/anotar-form.tsx src/features/registro/anotar-form.test.tsx "src/app/(app)/anotar/page.tsx"
git commit -m "fix(anotar): campo de data mostra o limite (entrada só até hoje)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Banco — categorias próprias (RN-27) e onboarding

**Files:**
- Create: `supabase/migrations/20260925000001_categorias_e_onboarding.sql`, `tests/db/helpers.ts`, `tests/db/plano2.test.ts`

**Interfaces:**
- Consumes: tabelas e gatilhos da migração `20260922000001_nucleo.sql` (sem editá-la).
- Produces:
  - `categories.name` sempre guardado limpo (sem espaços nas pontas nem repetidos) — restrição `categories_name_normalized`; nome único por pessoa **sem diferenciar maiúsculas** — índice `categories_user_name_ci_uidx (user_id, lower(name))`; duplicado → erro Postgres `23505`; nome sujo → `23514`.
  - "Outros" não pode ser renomeada: `A categoria Outros não pode ser renomeada.`
  - `public.delete_category(p_category_id uuid) returns void` — atômica; move os gastos da categoria para "Outros" e apaga a categoria; recusa "Outros" (`A categoria Outros não pode ser excluída.`) e categoria de outra pessoa (`Categoria não encontrada.`); executável só por `authenticated`.
  - Cadastros existentes antes do Plano 2 ficam com `onboarded_at = created_at`.
  - `tests/db/helpers.ts`: `admin`, `url`, `publishable`, `newUser(name): Promise<TestUser>`, `removeUsers(...users)`, `categoryId(user, key): Promise<string>`, `type TestUser = { id: string; client: SupabaseClient }`.

- [ ] **Step 1: Ajudantes dos testes de banco** — `tests/db/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!

export const admin = createClient(url, secret, { auth: { persistSession: false } })

export type TestUser = { id: string; client: SupabaseClient }

export async function newUser(name: string): Promise<TestUser> {
  const email = `db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
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

export async function removeUsers(...users: (TestUser | undefined)[]): Promise<void> {
  const errors: unknown[] = []
  for (const u of users) {
    if (!u?.id) continue
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) errors.push(error)
  }
  if (errors.length > 0) throw errors[0]
}

export async function categoryId(user: TestUser, key: string): Promise<string> {
  const { data, error } = await user.client.from('categories').select('id').eq('default_key', key).single()
  if (error) throw error
  return data.id
}
```

- [ ] **Step 2: Testes que falham** — `tests/db/plano2.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await newUser('Ana')
  b = await newUser('Bia')
})

afterAll(async () => {
  await removeUsers(a, b)
})

async function newCategory(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.from('categories').insert({ user_id: user.id, name }).select('id').single()
  if (error) throw error
  return data.id
}

async function newExpense(user: TestUser, category: string, cents: number): Promise<string> {
  const { data, error } = await user.client
    .from('transactions')
    .insert({ user_id: user.id, kind: 'expense', amount_cents: cents, category_id: category, occurred_on: '2026-09-22' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

describe('nomes de categoria', () => {
  test('não repete nome da mesma pessoa, sem diferenciar maiúsculas', async () => {
    await newCategory(a, 'Pet')
    const upper = await a.client.from('categories').insert({ user_id: a.id, name: 'PET' })
    expect(upper.error?.code).toBe('23505')
    const defaultLower = await a.client.from('categories').insert({ user_id: a.id, name: 'mercado' })
    expect(defaultLower.error?.code).toBe('23505')
  })

  test('recusa nome com espaços sobrando (o app sempre limpa antes)', async () => {
    const edges = await a.client.from('categories').insert({ user_id: a.id, name: ' Viagem ' })
    expect(edges.error?.code).toBe('23514')
    const doubled = await a.client.from('categories').insert({ user_id: a.id, name: 'Pet  Shop' })
    expect(doubled.error?.code).toBe('23514')
  })

  test('pessoas diferentes podem usar o mesmo nome', async () => {
    const { error } = await b.client.from('categories').insert({ user_id: b.id, name: 'Pet' })
    expect(error).toBeNull()
  })

  test('renomear para um nome já usado também é barrado', async () => {
    const lazer = await categoryId(a, 'lazer')
    const { error } = await a.client.from('categories').update({ name: 'casa' }).eq('id', lazer)
    expect(error?.code).toBe('23505')
  })
})

describe('categorias padrão', () => {
  test('podem ser renomeadas e mantêm a identificação interna', async () => {
    const mercado = await categoryId(a, 'mercado')
    const { error } = await a.client.from('categories').update({ name: 'Feira' }).eq('id', mercado)
    expect(error).toBeNull()
    const { data } = await a.client.from('categories').select('name, default_key').eq('id', mercado).single()
    expect(data).toEqual({ name: 'Feira', default_key: 'mercado' })
    const back = await a.client.from('categories').update({ name: 'Mercado' }).eq('id', mercado)
    expect(back.error).toBeNull()
  })

  test('"Outros" não pode ser renomeada', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.from('categories').update({ name: 'Diversos' }).eq('id', outros)
    expect(error?.message).toContain('A categoria Outros não pode ser renomeada.')
  })
})

describe('excluir categoria (RN-27)', () => {
  test('move os gastos para "Outros", sem mudar valores, e apaga a categoria', async () => {
    const viagem = await newCategory(a, 'Viagem')
    const t1 = await newExpense(a, viagem, 12000)
    const t2 = await newExpense(a, viagem, 3450)

    const { error } = await a.client.rpc('delete_category', { p_category_id: viagem })
    expect(error).toBeNull()

    const outros = await categoryId(a, 'outros')
    const { data: moved } = await a.client
      .from('transactions')
      .select('id, category_id, amount_cents')
      .in('id', [t1, t2])
      .order('amount_cents')
    expect(moved).toEqual([
      { id: t2, category_id: outros, amount_cents: 3450 },
      { id: t1, category_id: outros, amount_cents: 12000 },
    ])
    const { data: gone } = await a.client.from('categories').select('id').eq('id', viagem)
    expect(gone).toEqual([])
  })

  test('categoria padrão (menos Outros) também pode ser excluída', async () => {
    const educacao = await categoryId(a, 'educacao')
    const { error } = await a.client.rpc('delete_category', { p_category_id: educacao })
    expect(error).toBeNull()
  })

  test('apagar direto uma categoria com gastos é barrado — por isso existe a função', async () => {
    const casaNova = await newCategory(a, 'Casa nova')
    await newExpense(a, casaNova, 500)
    const { error } = await a.client.from('categories').delete().eq('id', casaNova)
    expect(error?.code).toBe('23503')
  })

  test('"Outros" não pode ser excluída pela função', async () => {
    const outros = await categoryId(a, 'outros')
    const { error } = await a.client.rpc('delete_category', { p_category_id: outros })
    expect(error?.message).toContain('A categoria Outros não pode ser excluída.')
  })

  test('ninguém exclui a categoria de outra pessoa', async () => {
    const saudeA = await categoryId(a, 'saude')
    const { error } = await b.client.rpc('delete_category', { p_category_id: saudeA })
    expect(error?.message).toContain('Categoria não encontrada.')
    const { data } = await a.client.from('categories').select('id').eq('id', saudeA)
    expect(data).toEqual([{ id: saudeA }])
  })

  test('quem não entrou não chama a função', async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } })
    const saudeA = await categoryId(a, 'saude')
    const { error } = await anon.rpc('delete_category', { p_category_id: saudeA })
    expect(error).not.toBeNull()
  })
})

describe('perfil e onboarding', () => {
  test('cadastro novo começa sem onboarding concluído e com saldo inicial zero', async () => {
    const { data } = await a.client.from('profiles').select('onboarded_at, initial_balance_cents').single()
    expect(data).toEqual({ onboarded_at: null, initial_balance_cents: 0 })
  })

  test('a pessoa conclui o onboarding e grava o saldo inicial', async () => {
    const { error } = await a.client
      .from('profiles')
      .update({ initial_balance_cents: 600000, onboarded_at: '2026-09-25T12:00:00+00:00' })
      .eq('id', a.id)
    expect(error).toBeNull()
    const { data } = await a.client.from('profiles').select('onboarded_at, initial_balance_cents').single()
    expect(data?.initial_balance_cents).toBe(600000)
    expect(new Date(data!.onboarded_at).toISOString()).toBe('2026-09-25T12:00:00.000Z')
  })

  test('ninguém altera o perfil de outra pessoa', async () => {
    const { data } = await b.client.from('profiles').update({ initial_balance_cents: 1 }).eq('id', a.id).select()
    expect(data).toEqual([])
    const { data: still } = await a.client.from('profiles').select('initial_balance_cents').single()
    expect(still?.initial_balance_cents).toBe(600000)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx supabase db reset && npm run test:db`
Expected: FAIL em `tests/db/plano2.test.ts` — por exemplo `expected undefined to be '23505'` ("PET" é aceito pela restrição antiga, que diferencia maiúsculas), `Could not find the function public.delete_category(p_category_id)` e o teste de renomear "Outros". `tests/db/rls.test.ts` continua passando. Sem Docker: registrar o RUN como pendente em `docs/progresso.md` e seguir, sem mudar o teste.

- [ ] **Step 4: Migração** — `supabase/migrations/20260925000001_categorias_e_onboarding.sql`:

```sql
-- Plano 2: categorias próprias (RN-27, RF-20) e onboarding (RF-05, RF-06).
-- A migração 20260922000001_nucleo.sql não é editada; tudo muda aqui.

-- 1. Nomes de categoria guardados sempre limpos e únicos por pessoa sem
--    diferenciar maiúsculas: "Pet", "PET" e " pet " são a mesma categoria.
--    O app limpa o nome antes de gravar; a restrição é a rede de segurança.
update public.categories
  set name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  where name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

alter table public.categories drop constraint categories_user_id_name_key;

alter table public.categories
  add constraint categories_name_normalized check (name = regexp_replace(btrim(name), '\s+', ' ', 'g'));

create unique index categories_user_name_ci_uidx on public.categories (user_id, lower(name));

-- 2. "Outros" recebe os gastos de categorias excluídas; o texto da confirmação
--    diz 'vão para "Outros"', então ela também não pode ser renomeada.
--    (create or replace mantém dono e permissões da função.)
create or replace function public.protect_default_categories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.default_key = 'outros' and exists (select 1 from auth.users u where u.id = old.user_id) then
      raise exception 'A categoria Outros não pode ser excluída.';
    end if;
    return old;
  end if;

  if new.default_key is distinct from old.default_key then
    raise exception 'A chave da categoria padrão não pode mudar.';
  end if;
  if old.default_key = 'outros' and new.name is distinct from old.name then
    raise exception 'A categoria Outros não pode ser renomeada.';
  end if;
  return new;
end;
$$;

-- 3. Excluir categoria (RN-27): os gastos vão para "Outros" e a categoria é
--    apagada, tudo de uma vez (ou nada). Roda com o papel de quem chama
--    (security invoker), então a RLS continua valendo: só enxerga e altera o
--    que é da própria pessoa. O "for update" trava a categoria até o fim: um
--    gasto novo nela, gravado ao mesmo tempo, espera ou falha — nunca fica órfão.
create function public.delete_category(p_category_id uuid) returns void
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
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;
  if v_key = 'outros' then
    raise exception 'A categoria Outros não pode ser excluída.';
  end if;

  select c.id into v_outros
    from public.categories c
    where c.user_id = v_uid and c.default_key = 'outros';
  if v_outros is null then
    raise exception 'Categoria Outros não encontrada.' using errcode = 'P0002';
  end if;

  update public.transactions t
    set category_id = v_outros
    where t.category_id = p_category_id and t.user_id = v_uid;

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function public.delete_category(uuid) from public, anon;
grant execute on function public.delete_category(uuid) to authenticated;

-- 4. Onboarding: cadastros criados antes do Plano 2 já usam o app e não
--    precisam passar pelas telas de boas-vindas.
update public.profiles set onboarded_at = created_at where onboarded_at is null;
```

- [ ] **Step 5: Rodar e passar**

Run: `npx supabase db reset && npm run test:db`
Expected: `tests/db/rls.test.ts` (11) e `tests/db/plano2.test.ts` (15) passando.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260925000001_categorias_e_onboarding.sql tests/db/helpers.ts tests/db/plano2.test.ts
git commit -m "feat(db): nomes de categoria sem repetição, excluir categoria levando gastos para Outros, onboarding" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Nome e ordem das categorias

**Files:**
- Create: `src/features/categorias/names.ts`
- Modify: `src/features/registro/queries.ts` (só `fetchCategories` e um import)
- Test: `src/features/categorias/names.test.ts`

**Interfaces:**
- Produces:
  - `normalizeCategoryName(raw: string): string` — tira espaços das pontas e junta espaços repetidos (a mesma regra da restrição do banco).
  - `categoryNameSchema` — `z.object({ name })` que devolve `{ name: string }` já limpo; mensagens `Falta o nome.` e `Use até 40 caracteres.`
  - `DUPLICATE_CATEGORY = 'Você já tem uma categoria com esse nome.'`
  - `isDuplicateNameError(error: { code?: string } | null | undefined): boolean` — `true` para `23505`.
  - `orderCategories<T extends { defaultKey: string | null; sortOrder: number; name: string }>(cats: T[]): T[]` — ordem de criação, "Outros" sempre por último.
- `loadCategories()` e `loadLedger()` passam a devolver as categorias nessa ordem (os chips do Anotar também).

- [ ] **Step 1: Teste que falha** — `src/features/categorias/names.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { firstFieldErrors } from '@/lib/forms'
import { categoryNameSchema, isDuplicateNameError, normalizeCategoryName, orderCategories } from './names'

// Espaço não separável (o que alguns teclados e o "copiar e colar" inserem).
const NBSP = String.fromCharCode(0xa0)

describe('normalizeCategoryName', () => {
  test('tira espaços das pontas e junta os repetidos, sem mudar maiúsculas', () => {
    expect(normalizeCategoryName('  Pet   Shop ')).toBe('Pet Shop')
    expect(normalizeCategoryName(`\tCasa${NBSP}nova\n`)).toBe('Casa nova')
    expect(normalizeCategoryName('Saúde')).toBe('Saúde')
  })
})

describe('categoryNameSchema', () => {
  test('limpa o nome antes de validar', () => {
    expect(categoryNameSchema.parse({ name: '  pet ' })).toEqual({ name: 'pet' })
  })
  test('mensagens de nome vazio e longo', () => {
    const empty = categoryNameSchema.safeParse({ name: '   ' })
    expect(firstFieldErrors(empty.error!)).toEqual({ name: 'Falta o nome.' })
    const long = categoryNameSchema.safeParse({ name: 'a'.repeat(41) })
    expect(firstFieldErrors(long.error!)).toEqual({ name: 'Use até 40 caracteres.' })
    expect(categoryNameSchema.parse({ name: ` ${'a'.repeat(40)} ` }).name).toHaveLength(40)
  })
})

describe('isDuplicateNameError', () => {
  test('reconhece o erro de nome repetido do banco', () => {
    expect(isDuplicateNameError({ code: '23505' })).toBe(true)
    expect(isDuplicateNameError({ code: '23514' })).toBe(false)
    expect(isDuplicateNameError(null)).toBe(false)
    expect(isDuplicateNameError(undefined)).toBe(false)
  })
})

describe('orderCategories', () => {
  test('ordem de criação, com "Outros" sempre por último', () => {
    const cats = [
      { name: 'Casa', defaultKey: 'casa', sortOrder: 1 },
      { name: 'Outros', defaultKey: 'outros', sortOrder: 10 },
      { name: 'Pet', defaultKey: null, sortOrder: 11 },
      { name: 'Mercado', defaultKey: 'mercado', sortOrder: 2 },
    ]
    expect(orderCategories(cats).map((c) => c.name)).toEqual(['Casa', 'Mercado', 'Pet', 'Outros'])
  })
  test('empate de ordem cai para o nome', () => {
    const cats = [
      { name: 'Viagem', defaultKey: null, sortOrder: 0 },
      { name: 'Academia', defaultKey: null, sortOrder: 0 },
    ]
    expect(orderCategories(cats).map((c) => c.name)).toEqual(['Academia', 'Viagem'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/categorias/names.test.ts`
Expected: FAIL — `Failed to resolve import "./names"`.

- [ ] **Step 3: Implementação** — `src/features/categorias/names.ts`:

```ts
import { z } from 'zod'

// Mesma regra da restrição categories_name_normalized no banco.
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export const categoryNameSchema = z.object({
  name: z
    .string()
    .transform(normalizeCategoryName)
    .pipe(z.string().min(1, { error: 'Falta o nome.' }).max(40, { error: 'Use até 40 caracteres.' })),
})

export const DUPLICATE_CATEGORY = 'Você já tem uma categoria com esse nome.'

export function isDuplicateNameError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export function orderCategories<T extends { defaultKey: string | null; sortOrder: number; name: string }>(cats: T[]): T[] {
  return [...cats].sort((a, b) => {
    const lastA = a.defaultKey === 'outros' ? 1 : 0
    const lastB = b.defaultKey === 'outros' ? 1 : 0
    if (lastA !== lastB) return lastA - lastB
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
```

Em `src/features/registro/queries.ts`, acrescentar depois de `import { fetchAllPages } from './paging'`:

```ts
import { orderCategories } from '@/features/categorias/names'
```

e trocar a função `fetchCategories` inteira por:

```ts
async function fetchCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id, name, default_key, sort_order').order('sort_order')
  if (error) throw error
  const rows = data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    defaultKey: c.default_key as string | null,
    sortOrder: c.sort_order as number,
  }))
  return orderCategories(rows).map(({ id, name, defaultKey }) => ({ id, name, defaultKey }))
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/categorias && npm run typecheck`
Expected: 6 testes passando; tipos sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/categorias/names.ts src/features/categorias/names.test.ts src/features/registro/queries.ts
git commit -m "feat(categorias): nome limpo, aviso de nome repetido e Outros sempre por último" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Confirmação antes de ações sem volta

**Files:**
- Create: `src/ui/confirm.tsx`
- Test: `src/ui/confirm.test.tsx`

**Interfaces:**
- Produces:
  - `ConfirmPanel({ title, body, cancelLabel, onCancel, children }: { title: string; body?: string; cancelLabel: string; onCancel: () => void; children: ReactNode })` — painel `role="alertdialog"` `aria-modal="true"`, título por `aria-labelledby`, texto por `aria-describedby`, foco inicial no botão de cancelar, `Esc` chama `onCancel`. `children` = o controle de confirmar.
  - `ConfirmAction({ trigger, triggerAriaLabel, triggerClassName, title, body, confirmLabel, cancelLabel, action, fields }: { trigger: ReactNode; triggerAriaLabel?: string; triggerClassName?: string; title: string; body?: string; confirmLabel: string; cancelLabel: string; action: (formData: FormData) => void | Promise<void>; fields?: Record<string, string> })` — botão que abre o painel; confirmar envia `<form action={action}>` com `fields` ocultos (botão desativado enquanto envia); cancelar fecha e devolve o foco ao botão.

- [ ] **Step 1: Teste que falha** — `src/ui/confirm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmAction, ConfirmPanel } from './confirm'

afterEach(() => cleanup())

test('abre a confirmação com título, texto e foco em Cancelar; Cancelar fecha e devolve o foco', () => {
  render(
    <ConfirmAction
      trigger="Excluir"
      title="Excluir este gasto?"
      body="Seu mês será recalculado."
      confirmLabel="Excluir"
      cancelLabel="Cancelar"
      action={vi.fn()}
      fields={{ id: 'abc' }}
    />,
  )
  expect(screen.queryByRole('alertdialog')).toBeNull()
  const trigger = screen.getByRole('button', { name: 'Excluir' })
  fireEvent.click(trigger)

  const dialog = screen.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Seu mês será recalculado.').id)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
  const hidden = dialog.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement
  expect(hidden.value).toBe('abc')
  const confirm = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
  expect(confirm.textContent).toBe('Excluir')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Esc fecha a confirmação', () => {
  render(<ConfirmAction trigger="Sair" title="Sair da Íris?" confirmLabel="Sair" cancelLabel="Ficar" action={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
  expect(screen.getByRole('alertdialog', { name: 'Sair da Íris?' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('botão só com ícone usa o rótulo acessível', () => {
  render(
    <ConfirmAction
      trigger={<svg aria-hidden="true" />}
      triggerAriaLabel="Sair da Íris"
      title="Sair da Íris?"
      confirmLabel="Sair"
      cancelLabel="Ficar"
      action={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Sair da Íris' })).toBeTruthy()
})

test('ConfirmPanel chama onCancel no botão de cancelar e mostra o controle de confirmar', () => {
  const onCancel = vi.fn()
  render(
    <ConfirmPanel title="Descartar este registro?" body="O que você digitou não será salvo." cancelLabel="Continuar editando" onCancel={onCancel}>
      <a href="/inicio">Descartar</a>
    </ConfirmPanel>,
  )
  expect(screen.getByRole('link', { name: 'Descartar' }).getAttribute('href')).toBe('/inicio')
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/confirm.test.tsx`
Expected: FAIL — `Failed to resolve import "./confirm"`.

- [ ] **Step 3: Implementação** — `src/ui/confirm.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from './button'

type PanelProps = {
  title: string
  body?: string
  cancelLabel: string
  onCancel: () => void
  children: ReactNode
}

export function ConfirmPanel({ title, body, cancelLabel, onCancel, children }: PanelProps) {
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(18,40,1,.32)] md:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-sheet bg-card px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 shadow-sheet md:rounded-sheet md:pb-5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
        {body && <p id={bodyId} className="text-[15px]">{body}</p>}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" autoFocus onClick={onCancel}>{cancelLabel}</Button>
          {children}
        </div>
      </div>
    </div>
  )
}

function ConfirmSubmit({ children }: { children: ReactNode }) {
  // Desativa enquanto a ação roda: dois toques não excluem duas vezes.
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending} className="w-full md:w-auto">{children}</Button>
}

type ActionProps = {
  trigger: ReactNode
  triggerAriaLabel?: string
  triggerClassName?: string
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  action: (formData: FormData) => void | Promise<void>
  fields?: Record<string, string>
}

export function ConfirmAction({
  trigger, triggerAriaLabel, triggerClassName = '', title, body, confirmLabel, cancelLabel, action, fields = {},
}: ActionProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={triggerAriaLabel} className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <ConfirmPanel title={title} body={body} cancelLabel={cancelLabel} onCancel={close}>
          <form action={action} className="contents">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <ConfirmSubmit>{confirmLabel}</ConfirmSubmit>
          </form>
        </ConfirmPanel>
      )}
    </>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/ui && npm run lint`
Expected: todos os testes de `src/ui` passando; lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/ui/confirm.tsx src/ui/confirm.test.tsx
git commit -m "feat(ui): confirmação acessível antes de ações sem volta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Navegação — Extrato e Mais; Sair com confirmação

**Files:**
- Modify: `src/features/shell/nav-items.ts`, `src/features/shell/bottom-nav.tsx`, `src/features/shell/sidebar.tsx`
- Create: `src/features/shell/sign-out-button.tsx`
- Test: `src/features/shell/nav.test.tsx`, `src/features/shell/sidebar.test.tsx`, `src/features/shell/nav-items.test.ts`

**Interfaces:**
- Consumes: `ConfirmAction` (Task 7), `signOut(): Promise<void>` (`@/features/auth/actions`), `isSheetRoute` (Task 3).
- Produces:
  - `type NavItem = { href: string; label: string; icon: LucideIcon; match: string[] }`
  - `BOTTOM_NAV_ITEMS: NavItem[]` — Seu mês · Extrato · Mais (o botão Anotar entra na 3ª posição; Metas entra antes de Mais no Plano 5).
  - `SIDEBAR_ITEMS: NavItem[]` — Seu mês · Extrato · Categorias · Configurações.
  - `isActive(pathname: string, item: NavItem): boolean` — igual a um `match` ou começa com `match + '/'`.
  - `SignOutButton({ variant }: { variant: 'icon' | 'row' })`.

> Até a Task 17, o link "Mais" leva a uma página que ainda não existe (404). É esperado nesta ordem de tarefas; a Task 17 cria `/mais`.

- [ ] **Step 1: Testes que falham**

Substituir `src/features/shell/nav.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

// BottomNav usa usePathname (App Router não re-renderiza layouts em navegação
// client-side, então a página atual vem do próprio componente cliente).
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { BottomNav } = await import('./bottom-nav')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('barra inferior: Seu mês, Extrato, Anotar e Mais, nesta ordem', () => {
  render(<BottomNav />)
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Anotar', 'Mais'])
  expect(screen.getByRole('link', { name: 'Anotar' }).getAttribute('href')).toBe('/anotar')
})

test('barra inferior marca a página atual', () => {
  pathname = '/inicio'
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Extrato' }).getAttribute('aria-current')).toBeNull()
})

test('Categorias e Configurações ficam dentro de Mais', () => {
  for (const p of ['/mais', '/categorias', '/categorias/nova', '/configuracoes/nome']) {
    pathname = p
    const { unmount } = render(<BottomNav />)
    expect(screen.getByRole('link', { name: 'Mais' }).getAttribute('aria-current')).toBe('page')
    unmount()
  }
})

test('barra inferior fica escondida nos painéis de Anotar e Editar', () => {
  for (const p of ['/anotar', '/anotar/gasto', '/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90']) {
    pathname = p
    const { unmount } = render(<BottomNav />)
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull()
    unmount()
  }
})
```

Substituir `src/features/shell/sidebar.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// Sidebar importa `signOut`, uma server action que puxa @/lib/supabase/server
// (que usa 'server-only'); mockamos o módulo para manter este teste em jsdom.
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }))
let pathname = '/inicio'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { Sidebar } = await import('./sidebar')

afterEach(() => {
  cleanup()
  pathname = '/inicio'
})

test('menu lateral lista as áreas que já existem e marca a atual', () => {
  pathname = '/categorias/nova'
  render(<Sidebar displayName="Ana" />)
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Seu mês', 'Extrato', 'Categorias', 'Configurações'])
  expect(screen.getByRole('link', { name: 'Categorias' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Seu mês' }).getAttribute('aria-current')).toBeNull()
})

test('Sair da Íris pede confirmação: Sair ou Ficar', () => {
  render(<Sidebar displayName="Ana" />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da Íris' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Sair da Íris?' })
  expect(within(dialog).getByText('Seus dados continuam salvos.')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Sair' }).getAttribute('type')).toBe('submit')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ficar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
```

Substituir `src/features/shell/nav-items.test.ts` por:

```ts
import { expect, test } from 'vitest'
import { BOTTOM_NAV_ITEMS, SIDEBAR_ITEMS, isActive, isSheetRoute } from './nav-items'

test('painéis que cobrem a tela não têm barra inferior', () => {
  expect(isSheetRoute('/anotar')).toBe(true)
  expect(isSheetRoute('/anotar/gasto')).toBe(true)
  expect(isSheetRoute('/extrato/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true)
  expect(isSheetRoute('/extrato')).toBe(false)
  expect(isSheetRoute('/extrato/a/b')).toBe(false)
  expect(isSheetRoute('/anotarx')).toBe(false)
  expect(isSheetRoute('/inicio')).toBe(false)
})

test('isActive reconhece a página e as subpáginas, sem confundir prefixos', () => {
  const extrato = SIDEBAR_ITEMS.find((i) => i.href === '/extrato')!
  expect(isActive('/extrato', extrato)).toBe(true)
  expect(isActive('/extrato/abc', extrato)).toBe(true)
  expect(isActive('/extratos', extrato)).toBe(false)
  const mais = BOTTOM_NAV_ITEMS.find((i) => i.href === '/mais')!
  expect(isActive('/configuracoes', mais)).toBe(true)
  expect(isActive('/inicio', mais)).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/shell`
Expected: FAIL — a barra só tem `['Seu mês', 'Anotar']`; `BOTTOM_NAV_ITEMS`/`isActive` não existem; o menu lateral não tem Extrato; `Sair da Íris` não abre confirmação.

- [ ] **Step 3: Implementação**

`src/features/shell/nav-items.ts`:

```ts
import { Ellipsis, House, ReceiptText, SlidersHorizontal, Tag, type LucideIcon } from 'lucide-react'

// `match`: caminhos que marcam o item como atual (a página e as subpáginas).
export type NavItem = { href: string; label: string; icon: LucideIcon; match: string[] }

const SEU_MES: NavItem = { href: '/inicio', label: 'Seu mês', icon: House, match: ['/inicio'] }
const EXTRATO: NavItem = { href: '/extrato', label: 'Extrato', icon: ReceiptText, match: ['/extrato'] }

// Barra inferior (celular). O botão Anotar entra na 3ª posição (bottom-nav.tsx).
// Metas entra antes de Mais no Plano 5 (A5: Seu mês · Extrato · Anotar · Metas · Mais).
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  SEU_MES,
  EXTRATO,
  { href: '/mais', label: 'Mais', icon: Ellipsis, match: ['/mais', '/categorias', '/configuracoes'] },
]

// Menu lateral (desktop): todas as áreas que já existem, sem a página "Mais".
export const SIDEBAR_ITEMS: NavItem[] = [
  SEU_MES,
  EXTRATO,
  { href: '/categorias', label: 'Categorias', icon: Tag, match: ['/categorias'] },
  { href: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal, match: ['/configuracoes'] },
]

export function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Painéis que cobrem a tela inteira (Anotar e Editar registro) têm navegação
// própria: sem barra inferior e sem o espaço reservado para ela.
export function isSheetRoute(pathname: string): boolean {
  if (pathname === '/anotar' || pathname.startsWith('/anotar/')) return true
  return /^\/extrato\/[^/]+$/.test(pathname)
}
```

`src/features/shell/bottom-nav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { BOTTOM_NAV_ITEMS, isActive, isSheetRoute } from './nav-items'

export function BottomNav() {
  const pathname = usePathname()
  // Painéis (Anotar, Editar) têm navegação própria — a barra inferior
  // competiria por espaço e esconderia a rota atual.
  if (isSheetRoute(pathname)) return null
  const items = [...BOTTOM_NAV_ITEMS.slice(0, 2), 'anotar' as const, ...BOTTOM_NAV_ITEMS.slice(2)]
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid h-[72px] max-w-[480px] auto-cols-fr grid-flow-col items-start px-1 pt-2">
        {items.map((item) => {
          if (item === 'anotar') {
            return (
              <li key="anotar" className="flex justify-center">
                <Link href="/anotar" className="-mt-7 flex flex-col items-center gap-1 text-xs font-semibold text-brand-ink">
                  <span className="flex size-14 items-center justify-center rounded-full bg-brand shadow-[0_4px_12px_rgba(18,40,1,.1)]">
                    <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  Anotar
                </Link>
              </li>
            )
          }
          const active = isActive(pathname, item)
          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center gap-1 text-xs ${active ? 'font-semibold text-brand-ink' : 'font-medium text-inactive'}`}
              >
                <span className={`flex h-[30px] w-14 items-center justify-center rounded-full ${active ? 'bg-brand' : ''}`}>
                  <item.icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`src/features/shell/sign-out-button.tsx`:

```tsx
'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/features/auth/actions'
import { ConfirmAction } from '@/ui/confirm'

export function SignOutButton({ variant }: { variant: 'icon' | 'row' }) {
  const isIcon = variant === 'icon'
  return (
    <ConfirmAction
      trigger={
        isIcon ? (
          <LogOut className="size-[18px]" aria-hidden="true" />
        ) : (
          <>
            <LogOut className="size-5" strokeWidth={1.8} aria-hidden="true" />
            <span className="flex-1 text-left">Sair da Íris</span>
          </>
        )
      }
      triggerAriaLabel={isIcon ? 'Sair da Íris' : undefined}
      triggerClassName={
        isIcon
          ? 'flex size-11 items-center justify-center rounded-full text-inactive hover:bg-canvas'
          : 'flex min-h-[52px] w-full items-center gap-3.5 text-base text-ink'
      }
      title="Sair da Íris?"
      body="Seus dados continuam salvos."
      confirmLabel="Sair"
      cancelLabel="Ficar"
      action={signOut}
    />
  )
}
```

`src/features/shell/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Logo } from '@/ui/logo'
import { SIDEBAR_ITEMS, isActive } from './nav-items'
import { SignOutButton } from './sign-out-button'

export function Sidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-line bg-card px-3.5 py-6 md:flex">
      <div className="px-2"><Logo /></div>
      <Link href="/anotar" className="flex h-[46px] items-center justify-center gap-2 rounded-panel bg-brand font-semibold text-brand-ink">
        <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />Anotar
      </Link>
      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {SIDEBAR_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-control px-3 text-sm ${active ? 'bg-brand-wash font-semibold text-brand-ink' : 'font-medium text-inactive hover:bg-canvas'}`}
            >
              <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-3.5">
        <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
        <SignOutButton variant="icon" />
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/shell && npm run typecheck && npm run lint`
Expected: todos os testes de `src/features/shell` passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell
git commit -m "feat(shell): Extrato e Mais na navegação; sair pede confirmação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Extrato — filtros, busca e agrupamento por dia

**Files:**
- Create: `src/features/registro/labels.ts`, `src/features/extrato/view-model.ts`
- Modify: `src/features/registro/anotar-form.tsx` (passa a importar os rótulos)
- Test: `src/features/extrato/view-model.test.ts`

**Interfaces:**
- Consumes: `TxRow`, `Category` (`@/features/registro/queries`), `effectiveDate` (`@/domain/summary`), `dayLabel`, `monthLabel`, `monthOf`, `isInMonth`, `parseMonthKey` (`@/domain/dates`), `formatBRL` (`@/domain/money`).
- Produces:
  - `PAYMENT_LABELS: Record<string, string>` (`labels.ts`) — `pix → Pix`, `cash → Dinheiro`, `boleto → Boleto`, `debit → Débito`, `credit → Crédito`, `other → Outra forma`.
  - `type KindFilter = 'income' | 'expense' | null`
  - `interface ExtratoFilters { month: MonthKey; kind: KindFilter; categoryId: string | null; q: string }`
  - `MAX_QUERY_LENGTH = 60`
  - `parseExtratoFilters(sp: Record<string, string | string[] | undefined>, today: ISODate): ExtratoFilters` — `mes`, `tipo` (`entradas`/`gastos`), `categoria` (id; implica gastos), `q`.
  - `extratoParams(f: ExtratoFilters): Record<string, string>` e `extratoHref(f: ExtratoFilters): string` — endereço só com o necessário.
  - `normalizeText(s: string): string` — sem acento, minúsculas, espaços únicos.
  - `matchesQuery(texts: (string | null)[], cents: Cents, q: string): boolean` — cada palavra precisa aparecer nos textos ou, se tiver número, no valor ("142", "142,3", "1.234,56", "1234,56", "1234.56"; "R$" é ignorado).
  - `interface ExtratoRow { id: string; kind: 'income' | 'expense'; title: string; subtitle: string | null; cents: Cents }`
  - `interface ExtratoGroup { date: ISODate; label: string; rows: ExtratoRow[] }`
  - `type ExtratoEmpty = 'no-records' | 'no-results' | 'no-matches' | null`
  - `interface ExtratoView { filters: ExtratoFilters; monthLabel: string; groups: ExtratoGroup[]; empty: ExtratoEmpty; categoryName: string | null }`
  - `buildExtrato(input: { filters: ExtratoFilters; today: ISODate; categories: Category[]; transactions: TxRow[] }): ExtratoView`

- [ ] **Step 1: Teste que falha** — `src/features/extrato/view-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { TxRow } from '@/features/registro/queries'
import {
  buildExtrato, extratoHref, matchesQuery, normalizeText, parseExtratoFilters, type ExtratoFilters,
} from './view-model'

const row = (p: Partial<TxRow> & Pick<TxRow, 'id' | 'kind' | 'amountCents' | 'occurredOn'>): TxRow => ({
  categoryId: null, source: null, note: null, paymentMethod: null, status: 'confirmed', dueOn: null, paidOn: null,
  goalFundedCents: 0, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

const MERCADO = '11111111-1111-4111-8111-111111111111'
const SAUDE = '22222222-2222-4222-8222-222222222222'
const categories = [
  { id: MERCADO, name: 'Mercado', defaultKey: 'mercado' },
  { id: SAUDE, name: 'Saúde', defaultKey: 'saude' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Outros', defaultKey: 'outros' },
]
const today = '2026-09-22'
const transactions: TxRow[] = [
  row({ id: 't1', kind: 'expense', amountCents: 14230, occurredOn: '2026-09-22', categoryId: MERCADO, note: 'feira', paymentMethod: 'pix', createdAt: '2026-09-22T10:00:00Z' }),
  row({ id: 't2', kind: 'expense', amountCents: 123456, occurredOn: '2026-09-22', categoryId: SAUDE, createdAt: '2026-09-22T15:00:00Z' }),
  row({ id: 't3', kind: 'expense', amountCents: 3800, occurredOn: '2026-09-21', categoryId: MERCADO, note: 'Café' }),
  row({ id: 't4', kind: 'income', amountCents: 500000, occurredOn: '2026-09-05', source: 'Salário' }),
  row({ id: 't5', kind: 'expense', amountCents: 5000, occurredOn: '2026-08-30', categoryId: MERCADO }),
  row({ id: 't6', kind: 'expense', amountCents: 20000, occurredOn: '2026-08-25', paidOn: '2026-09-19', categoryId: SAUDE }),
]
const f = (p: Partial<ExtratoFilters> = {}): ExtratoFilters => ({ month: '2026-09', kind: null, categoryId: null, q: '', ...p })
const build = (filters: ExtratoFilters) => buildExtrato({ filters, today, categories, transactions })
const ids = (filters: ExtratoFilters) => build(filters).groups.flatMap((g) => g.rows.map((r) => r.id))

describe('parseExtratoFilters', () => {
  test('lê mês, tipo, categoria e busca; o que é inválido vira o padrão', () => {
    expect(parseExtratoFilters({}, today)).toEqual(f())
    expect(parseExtratoFilters({ mes: '2026-08', tipo: 'entradas', q: '  café ' }, today)).toEqual(f({ month: '2026-08', kind: 'income', q: 'café' }))
    expect(parseExtratoFilters({ mes: '1999-01', tipo: 'x', categoria: 'nao-e-id' }, today)).toEqual(f())
    expect(parseExtratoFilters({ tipo: 'gastos' }, today)).toEqual(f({ kind: 'expense' }))
  })
  test('categoria implica gastos e vence o tipo', () => {
    expect(parseExtratoFilters({ categoria: MERCADO, tipo: 'entradas' }, today)).toEqual(f({ kind: 'expense', categoryId: MERCADO }))
  })
  test('busca longa é cortada e parâmetro repetido usa o primeiro', () => {
    expect(parseExtratoFilters({ q: 'a'.repeat(80) }, today).q).toHaveLength(60)
    expect(parseExtratoFilters({ mes: ['2026-07', '2026-08'] }, today).month).toBe('2026-07')
  })
})

describe('extratoHref', () => {
  test('monta o endereço só com o necessário', () => {
    expect(extratoHref(f())).toBe('/extrato?mes=2026-09')
    expect(extratoHref(f({ kind: 'income', q: 'café' }))).toBe('/extrato?mes=2026-09&tipo=entradas&q=caf%C3%A9')
    expect(extratoHref(f({ kind: 'expense', categoryId: MERCADO }))).toBe(`/extrato?mes=2026-09&categoria=${MERCADO}`)
  })
  test('ida e volta: o endereço reproduz os mesmos filtros', () => {
    const original = f({ kind: 'expense', categoryId: MERCADO, q: 'feira' })
    const sp = Object.fromEntries(new URL(extratoHref(original), 'http://x').searchParams)
    expect(parseExtratoFilters(sp, today)).toEqual(original)
  })
})

describe('busca (Review Focus 1)', () => {
  test('ignora acento, maiúsculas e espaços', () => {
    expect(normalizeText('  Saúde   E  CAFÉ ')).toBe('saude e cafe')
    expect(matchesQuery(['Saúde', null], 100, 'saude')).toBe(true)
    expect(matchesQuery(['Mercado', 'Café'], 100, 'MERCADO cafe')).toBe(true)
    expect(matchesQuery(['Mercado', 'feira'], 100, 'mercado pix')).toBe(false)
  })
  test('encontra pelo valor, inteiro ou em parte, com vírgula, ponto, milhar ou R$', () => {
    expect(matchesQuery([], 14230, '142,30')).toBe(true)
    expect(matchesQuery([], 14230, '142,3')).toBe(true)
    expect(matchesQuery([], 14230, '142')).toBe(true)
    expect(matchesQuery([], 14230, 'R$ 142,30')).toBe(true)
    expect(matchesQuery([], 14230, 'r$142')).toBe(true)
    expect(matchesQuery([], 123456, '1.234,56')).toBe(true)
    expect(matchesQuery([], 123456, '1234,56')).toBe(true)
    expect(matchesQuery([], 123456, '1234.56')).toBe(true)
    expect(matchesQuery([], 14230, '999')).toBe(false)
  })
  test('busca vazia encontra tudo', () => {
    expect(matchesQuery(['Mercado'], 14230, '')).toBe(true)
    expect(matchesQuery(['Mercado'], 14230, '   ')).toBe(true)
  })
  test('no Extrato: nome, nota, origem, forma de pagamento e valor', () => {
    expect(ids(f({ q: 'saude' }))).toEqual(['t2', 't6'])
    expect(ids(f({ q: 'FEIRA' }))).toEqual(['t1'])
    expect(ids(f({ q: 'salario' }))).toEqual(['t4'])
    expect(ids(f({ q: 'pix' }))).toEqual(['t1'])
    expect(ids(f({ q: '1.234' }))).toEqual(['t2'])
    expect(ids(f({ q: 'cafe' }))).toEqual(['t3'])
  })
})

describe('buildExtrato', () => {
  test('agrupa pelo dia efetivo, do mais recente, com Hoje e Ontem', () => {
    const v = build(f())
    expect(v.monthLabel).toBe('setembro de 2026')
    expect(v.groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '19 de setembro', '5 de setembro'])
    expect(v.groups[0].rows.map((r) => r.id)).toEqual(['t2', 't1'])
    expect(v.groups[0].rows[1]).toEqual({ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230 })
    expect(v.groups[3].rows[0]).toEqual({ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000 })
    expect(v.empty).toBeNull()
  })
  test('conta paga com atraso aparece no dia em que foi paga (A1)', () => {
    const v = build(f())
    expect(v.groups.find((g) => g.date === '2026-09-19')?.rows.map((r) => r.id)).toEqual(['t6'])
    expect(ids(f({ month: '2026-08' }))).toEqual(['t5'])
  })
  test('filtra entradas, gastos e categoria', () => {
    expect(ids(f({ kind: 'income' }))).toEqual(['t4'])
    expect(ids(f({ kind: 'expense' }))).toEqual(['t2', 't1', 't3', 't6'])
    const v = build(f({ kind: 'expense', categoryId: MERCADO }))
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['t1', 't3'])
    expect(v.categoryName).toBe('Mercado')
  })
  test('busca vale dentro do mês escolhido', () => {
    expect(ids(f({ q: 'mercado' }))).toEqual(['t1', 't3'])
    expect(ids(f({ month: '2026-08', q: 'mercado' }))).toEqual(['t5'])
  })
  test('categoria que não é da pessoa é ignorada', () => {
    const v = build(f({ kind: 'expense', categoryId: '99999999-9999-4999-8999-999999999999' }))
    expect(v.filters.categoryId).toBeNull()
    expect(v.categoryName).toBeNull()
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['t2', 't1', 't3', 't6'])
  })
  test('estados vazios: sem registros, busca sem resultado e filtro sem resultado', () => {
    expect(build(f({ month: '2026-10' })).empty).toBe('no-records')
    expect(build(f({ q: 'xyz' })).empty).toBe('no-results')
    expect(build(f({ month: '2026-10', q: 'xyz' })).empty).toBe('no-results')
    expect(build(f({ month: '2026-08', kind: 'income' })).empty).toBe('no-matches')
  })
  test('registro pendente (conta a pagar, Plano 3) não aparece', () => {
    const v = buildExtrato({
      filters: f(), today, categories,
      transactions: [row({ id: 'p1', kind: 'expense', amountCents: 100, occurredOn: '2026-09-10', dueOn: '2026-09-10', status: 'pending', categoryId: MERCADO })],
    })
    expect(v.groups).toEqual([])
    expect(v.empty).toBe('no-records')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/extrato/view-model.test.ts`
Expected: FAIL — `Failed to resolve import "./view-model"`.

- [ ] **Step 3: Implementação**

`src/features/registro/labels.ts`:

```ts
export const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  debit: 'Débito',
  credit: 'Crédito',
  other: 'Outra forma',
}
```

Em `src/features/registro/anotar-form.tsx`, trocar:

```tsx
const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix', cash: 'Dinheiro', boleto: 'Boleto', debit: 'Débito', credit: 'Crédito', other: 'Outra forma',
}
```

por:

```tsx
import { PAYMENT_LABELS } from './labels'
```

(mover essa linha para junto dos outros imports, logo depois de `import type { Category } from './queries'`).

`src/features/extrato/view-model.ts`:

```ts
import { dayLabel, isInMonth, monthLabel, monthOf, parseMonthKey, type ISODate, type MonthKey } from '@/domain/dates'
import { formatBRL, type Cents } from '@/domain/money'
import { effectiveDate } from '@/domain/summary'
import type { Category, TxRow } from '@/features/registro/queries'
import { PAYMENT_LABELS } from '@/features/registro/labels'

export type KindFilter = 'income' | 'expense' | null

export interface ExtratoFilters {
  month: MonthKey
  kind: KindFilter
  categoryId: string | null
  q: string
}

export const MAX_QUERY_LENGTH = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SearchParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function parseExtratoFilters(sp: SearchParams, today: ISODate): ExtratoFilters {
  const categoria = first(sp.categoria)
  const tipo = first(sp.tipo)
  const categoryId = categoria && UUID.test(categoria) ? categoria : null
  // Categoria só existe em gastos: escolher uma categoria já filtra gastos.
  const kind: KindFilter = categoryId ? 'expense' : tipo === 'entradas' ? 'income' : tipo === 'gastos' ? 'expense' : null
  return {
    month: parseMonthKey(first(sp.mes)) ?? monthOf(today),
    kind,
    categoryId,
    q: (first(sp.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH),
  }
}

export function extratoParams(f: ExtratoFilters): Record<string, string> {
  const p: Record<string, string> = { mes: f.month }
  if (f.categoryId) p.categoria = f.categoryId
  else if (f.kind) p.tipo = f.kind === 'income' ? 'entradas' : 'gastos'
  if (f.q) p.q = f.q
  return p
}

export function extratoHref(f: ExtratoFilters): string {
  return `/extrato?${new URLSearchParams(extratoParams(f)).toString()}`
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Formas do mesmo valor que a pessoa pode digitar: "1.234,56", "1234,56", "1234.56".
function valueCandidates(cents: Cents): string[] {
  // formatBRL devolve "R$" + espaço não separável + número; \s cobre esse espaço.
  const grouped = formatBRL(cents).replace(/^R\$\s/, '')
  const plain = grouped.replace(/\./g, '')
  return [grouped, plain, plain.replace(',', '.')]
}

export function matchesQuery(texts: (string | null)[], cents: Cents, q: string): boolean {
  const tokens = normalizeText(q)
    .split(' ')
    .map((t) => t.replace(/^r\$/, ''))
    .filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = normalizeText(texts.filter((t): t is string => Boolean(t)).join(' '))
  const values = valueCandidates(cents)
  return tokens.every((t) => haystack.includes(t) || (/\d/.test(t) && values.some((v) => v.includes(t))))
}

export interface ExtratoRow {
  id: string
  kind: 'income' | 'expense'
  title: string
  subtitle: string | null
  cents: Cents
}

export interface ExtratoGroup {
  date: ISODate
  label: string
  rows: ExtratoRow[]
}

export type ExtratoEmpty = 'no-records' | 'no-results' | 'no-matches' | null

export interface ExtratoView {
  filters: ExtratoFilters
  monthLabel: string
  groups: ExtratoGroup[]
  empty: ExtratoEmpty
  categoryName: string | null
}

export function buildExtrato(input: {
  filters: ExtratoFilters
  today: ISODate
  categories: Category[]
  transactions: TxRow[]
}): ExtratoView {
  const { today, categories, transactions } = input
  const nameOf = new Map(categories.map((c) => [c.id, c.name]))
  const categoryId = input.filters.categoryId && nameOf.has(input.filters.categoryId) ? input.filters.categoryId : null
  const filters: ExtratoFilters = { ...input.filters, categoryId }

  const inMonth = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, filters.month)
  })

  const visible = inMonth.filter((t) => {
    if (filters.kind && t.kind !== filters.kind) return false
    if (categoryId && t.categoryId !== categoryId) return false
    const categoryName = t.categoryId ? nameOf.get(t.categoryId) ?? null : null
    const payment = t.paymentMethod ? PAYMENT_LABELS[t.paymentMethod] ?? null : null
    return matchesQuery([categoryName, t.note, t.source, payment], t.amountCents, filters.q)
  })

  const sorted = [...visible].sort((a, b) => {
    const byDate = effectiveDate(b)!.localeCompare(effectiveDate(a)!)
    if (byDate !== 0) return byDate
    const byCreation = b.createdAt.localeCompare(a.createdAt)
    if (byCreation !== 0) return byCreation
    return a.id.localeCompare(b.id)
  })

  const groups: ExtratoGroup[] = []
  for (const t of sorted) {
    const date = effectiveDate(t)!
    let group = groups[groups.length - 1]
    if (!group || group.date !== date) {
      group = { date, label: dayLabel(date, today), rows: [] }
      groups.push(group)
    }
    group.rows.push(toRow(t, nameOf))
  }

  const empty: ExtratoEmpty = visible.length > 0 ? null : filters.q ? 'no-results' : inMonth.length === 0 ? 'no-records' : 'no-matches'

  return {
    filters,
    monthLabel: monthLabel(filters.month),
    groups,
    empty,
    categoryName: categoryId ? nameOf.get(categoryId) ?? null : null,
  }
}

function toRow(t: TxRow, nameOf: Map<string, string>): ExtratoRow {
  if (t.kind === 'income') {
    return { id: t.id, kind: 'income', title: t.source ?? 'Entrada', subtitle: null, cents: t.amountCents }
  }
  const category = nameOf.get(t.categoryId ?? '') ?? 'Outros'
  return {
    id: t.id,
    kind: 'expense',
    title: t.note ? `${category} · ${t.note}` : category,
    subtitle: t.paymentMethod ? PAYMENT_LABELS[t.paymentMethod] ?? null : null,
    cents: t.amountCents,
  }
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/extrato src/features/registro && npm run typecheck`
Expected: todos passando; tipos sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/labels.ts src/features/registro/anotar-form.tsx src/features/extrato/view-model.ts src/features/extrato/view-model.test.ts
git commit -m "feat(extrato): filtros, busca sem acento e por valor, agrupamento por dia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Página do Extrato

**Files:**
- Modify: `src/features/seu-mes/month-nav.tsx`
- Create: `src/features/extrato/filters-bar.tsx`, `src/features/extrato/extrato-list.tsx`, `src/app/(app)/extrato/page.tsx`
- Test: `src/features/seu-mes/month-nav.test.tsx`, `src/features/extrato/filters-bar.test.tsx`, `src/features/extrato/extrato-list.test.tsx`

**Interfaces:**
- Consumes: `ExtratoView`, `ExtratoFilters`, `extratoHref`, `extratoParams`, `parseExtratoFilters`, `buildExtrato`, `MAX_QUERY_LENGTH` (Task 9); `loadLedger()`; `Card`, `Button`, `Money`.
- Produces:
  - `MonthNav({ month, label, basePath, query }: { month: MonthKey; label: string; basePath?: string; query?: Record<string, string> })` — `basePath` padrão `/inicio`; links `${basePath}?mes=AAAA-MM&…query`.
  - `FiltersBar({ filters, categories, categoryName }: { filters: ExtratoFilters; categories: Category[]; categoryName: string | null })` — busca (`GET /extrato`, campo `q`, mantém mês/tipo/categoria), chips Entradas · Gastos · Categoria.
  - `ExtratoList({ view }: { view: ExtratoView })` — grupos por dia (cada linha é link para `/extrato/{id}`) e os três estados vazios.
  - Rota `/extrato?mes&tipo&categoria&q`.

- [ ] **Step 1: Testes que falham**

Acrescentar ao fim de `src/features/seu-mes/month-nav.test.tsx`:

```tsx
test('no Seu mês, as setas levam aos meses vizinhos', () => {
  render(<MonthNav month="2026-01" label="janeiro de 2026" />)
  expect(screen.getByRole('link', { name: 'Mês anterior' }).getAttribute('href')).toBe('/inicio?mes=2025-12')
  expect(screen.getByRole('link', { name: 'Próximo mês' }).getAttribute('href')).toBe('/inicio?mes=2026-02')
})

test('no Extrato, as setas mantêm os filtros', () => {
  render(<MonthNav month="2026-09" label="setembro de 2026" basePath="/extrato" query={{ tipo: 'entradas', q: 'café' }} />)
  expect(screen.getByRole('link', { name: 'Mês anterior' }).getAttribute('href')).toBe('/extrato?mes=2026-08&tipo=entradas&q=caf%C3%A9')
})
```

`src/features/extrato/extrato-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ExtratoList } from './extrato-list'
import type { ExtratoView } from './view-model'

afterEach(() => cleanup())

// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)

const base: ExtratoView = {
  filters: { month: '2026-09', kind: null, categoryId: null, q: '' },
  monthLabel: 'setembro de 2026',
  groups: [],
  empty: null,
  categoryName: null,
}

test('lista agrupada por dia; cada registro abre a edição', () => {
  render(
    <ExtratoList
      view={{
        ...base,
        groups: [
          { date: '2026-09-22', label: 'Hoje', rows: [{ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230 }] },
          { date: '2026-09-05', label: '5 de setembro', rows: [{ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000 }] },
        ],
      }}
    />,
  )
  const hoje = screen.getByRole('region', { name: 'Hoje' })
  const gasto = within(hoje).getByRole('link', { name: /Mercado · feira/ })
  expect(gasto.getAttribute('href')).toBe('/extrato/t1')
  expect(gasto.textContent).toContain('Pix')
  expect(gasto.textContent).toContain(`− R$${NBSP}142,30`)
  const entrada = within(screen.getByRole('region', { name: '5 de setembro' })).getByRole('link', { name: /Salário/ })
  expect(entrada.textContent).toContain(`+ R$${NBSP}5.000,00`)
})

test('sem registros no mês: convite para anotar', () => {
  render(<ExtratoList view={{ ...base, empty: 'no-records' }} />)
  expect(screen.getByText('Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Anotar gasto' }).getAttribute('href')).toBe('/anotar')
})

test('busca sem resultado repete o termo', () => {
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, q: 'xyz' }, empty: 'no-results' }} />)
  expect(screen.getByText('Nada encontrado para "xyz". Tente outra palavra ou um valor.')).toBeTruthy()
})

test('filtro sem resultado oferece limpar os filtros do mês', () => {
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, kind: 'income' }, empty: 'no-matches' }} />)
  expect(screen.getByText('Nenhum registro com esses filtros.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Limpar filtros' }).getAttribute('href')).toBe('/extrato?mes=2026-09')
})
```

`src/features/extrato/filters-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FiltersBar } from './filters-bar'

afterEach(() => cleanup())

const MERCADO = '11111111-1111-4111-8111-111111111111'
const categories = [
  { id: MERCADO, name: 'Mercado', defaultKey: 'mercado' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Outros', defaultKey: 'outros' },
]

test('busca envia para /extrato mantendo mês e filtros', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'income', categoryId: null, q: 'sal' }} categories={categories} categoryName={null} />)
  const search = screen.getByRole('searchbox', { name: 'Buscar' })
  expect(search.getAttribute('placeholder')).toBe('Buscar por nome, valor ou categoria')
  expect((search as HTMLInputElement).value).toBe('sal')
  const form = screen.getByRole('search')
  expect(form.getAttribute('action')).toBe('/extrato')
  expect((form.querySelector('input[name="mes"]') as HTMLInputElement).value).toBe('2026-09')
  expect((form.querySelector('input[name="tipo"]') as HTMLInputElement).value).toBe('entradas')
})

test('Entradas e Gastos alternam; o ativo aparece marcado e desmarca ao tocar de novo', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'income', categoryId: null, q: '' }} categories={categories} categoryName={null} />)
  const entradas = screen.getByRole('link', { name: 'Entradas' })
  expect(entradas.getAttribute('aria-current')).toBe('true')
  expect(entradas.getAttribute('href')).toBe('/extrato?mes=2026-09')
  expect(screen.getByRole('link', { name: 'Gastos' }).getAttribute('href')).toBe('/extrato?mes=2026-09&tipo=gastos')
})

test('Categoria abre a lista; escolher filtra, escolher de novo limpa', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'expense', categoryId: MERCADO, q: '' }} categories={categories} categoryName="Mercado" />)
  const group = screen.getByRole('group', { name: 'Categoria' })
  expect(group.querySelector('summary')?.textContent).toBe('Mercado')
  const mercado = within(group).getByRole('link', { name: 'Mercado' })
  expect(mercado.getAttribute('aria-current')).toBe('true')
  expect(mercado.getAttribute('href')).toBe('/extrato?mes=2026-09')
  expect(within(group).getByRole('link', { name: 'Outros' }).getAttribute('href')).toBe('/extrato?mes=2026-09&categoria=33333333-3333-4333-8333-333333333333')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/seu-mes/month-nav.test.tsx src/features/extrato`
Expected: FAIL — `Failed to resolve import "./extrato-list"` / `"./filters-bar"`, e o teste do MonthNav no Extrato recebe `/inicio?mes=2026-08`.

- [ ] **Step 3: Implementação**

`src/features/seu-mes/month-nav.tsx`:

```tsx
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, type MonthKey } from '@/domain/dates'

type Props = { month: MonthKey; label: string; basePath?: string; query?: Record<string, string> }

export function MonthNav({ month, label, basePath = '/inicio', query = {} }: Props) {
  const link = 'flex size-11 items-center justify-center rounded-control text-[#262626] hover:bg-canvas'
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
  // `mes` primeiro no endereço; `query` (tipo, categoria, busca) nunca traz `mes`.
  const href = (m: MonthKey) => `${basePath}?${new URLSearchParams({ mes: m, ...query }).toString()}`
  return (
    <nav aria-label="Mês" className="flex h-[46px] items-center self-start rounded-panel border border-line bg-card">
      <Link href={href(addMonths(month, -1))} aria-label="Mês anterior" className={link}><ChevronLeft className="size-[18px]" aria-hidden="true" /></Link>
      <span className="px-1.5 text-sm font-semibold text-ink">{capitalized}</span>
      <Link href={href(addMonths(month, 1))} aria-label="Próximo mês" className={link}><ChevronRight className="size-[18px]" aria-hidden="true" /></Link>
    </nav>
  )
}
```

`src/features/extrato/filters-bar.tsx`:

```tsx
import Link from 'next/link'
import { ChevronDown, Search } from 'lucide-react'
import type { Category } from '@/features/registro/queries'
import { MAX_QUERY_LENGTH, extratoHref, type ExtratoFilters } from './view-model'

const chip = (active: boolean) =>
  `flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ${
    active ? 'border-[1.5px] border-selected bg-brand-wash font-semibold text-brand-ink' : 'border border-control bg-card font-medium text-[#262626]'
  }`

type Props = { filters: ExtratoFilters; categories: Category[]; categoryName: string | null }

export function FiltersBar({ filters, categories, categoryName }: Props) {
  const withFilters = (patch: Partial<ExtratoFilters>) => extratoHref({ ...filters, ...patch })
  const isIncome = filters.kind === 'income'
  const isExpense = filters.kind === 'expense' && !filters.categoryId

  return (
    <div className="flex flex-col gap-3.5">
      <form role="search" action="/extrato" className="flex h-12 items-center gap-2.5 rounded-panel border border-control bg-card px-3.5 text-muted">
        <input type="hidden" name="mes" value={filters.month} />
        {filters.categoryId && <input type="hidden" name="categoria" value={filters.categoryId} />}
        {!filters.categoryId && filters.kind && <input type="hidden" name="tipo" value={isIncome ? 'entradas' : 'gastos'} />}
        <Search className="size-[18px] shrink-0" aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          aria-label="Buscar"
          placeholder="Buscar por nome, valor ou categoria"
          maxLength={MAX_QUERY_LENGTH}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </form>

      <nav aria-label="Filtros" className="flex flex-wrap gap-2">
        <Link href={withFilters({ kind: isIncome ? null : 'income', categoryId: null })} aria-current={isIncome ? 'true' : undefined} className={chip(isIncome)}>
          Entradas
        </Link>
        <Link href={withFilters({ kind: isExpense ? null : 'expense', categoryId: null })} aria-current={isExpense ? 'true' : undefined} className={chip(isExpense)}>
          Gastos
        </Link>
        <details role="group" aria-label="Categoria" className="relative">
          <summary className={`${chip(Boolean(filters.categoryId))} cursor-pointer list-none`}>
            {categoryName ?? 'Categoria'}
            <ChevronDown className="size-4" aria-hidden="true" />
          </summary>
          <ul className="absolute left-0 top-12 z-10 flex max-h-72 w-56 flex-col overflow-y-auto rounded-card border border-line bg-card py-1 shadow-sheet">
            {categories.map((c) => {
              const selected = filters.categoryId === c.id
              return (
                <li key={c.id}>
                  <Link
                    href={withFilters(selected ? { categoryId: null, kind: null } : { categoryId: c.id, kind: 'expense' })}
                    aria-current={selected ? 'true' : undefined}
                    className={`flex min-h-11 items-center px-4 text-[15px] ${selected ? 'bg-brand-wash font-semibold text-brand-ink' : 'text-ink hover:bg-canvas'}`}
                  >
                    {c.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </details>
      </nav>
    </div>
  )
}
```

`src/features/extrato/extrato-list.tsx`:

```tsx
import Link from 'next/link'
import { ArrowDownLeft, Receipt } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { Money } from '@/ui/money'
import { extratoHref, type ExtratoView } from './view-model'

export function ExtratoList({ view }: { view: ExtratoView }) {
  if (view.empty === 'no-records') {
    return (
      <Card className="flex flex-col items-start gap-3.5 border-dashed">
        <p className="text-[17px] font-medium text-ink">Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.</p>
        <Button href="/anotar">Anotar gasto</Button>
      </Card>
    )
  }
  if (view.empty === 'no-results') {
    return <p className="px-1 py-6 text-center text-[15px]">{`Nada encontrado para "${view.filters.q}". Tente outra palavra ou um valor.`}</p>
  }
  if (view.empty === 'no-matches') {
    return (
      <div className="flex flex-col items-center gap-3 px-1 py-6 text-center">
        <p className="text-[15px]">Nenhum registro com esses filtros.</p>
        <Button href={extratoHref({ month: view.filters.month, kind: null, categoryId: null, q: '' })} variant="secondary">Limpar filtros</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {view.groups.map((g) => (
        <section key={g.date} aria-labelledby={`dia-${g.date}`} className="flex flex-col gap-2">
          <h2 id={`dia-${g.date}`} className="px-1 text-sm font-semibold text-inactive">{g.label}</h2>
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {g.rows.map((r) => (
              <li key={r.id} className="border-b border-line last:border-b-0">
                <Link href={`/extrato/${r.id}`} className="flex min-h-[68px] items-center gap-3 px-4 py-3.5 hover:bg-canvas">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-panel ${r.kind === 'income' ? 'bg-brand-wash text-brand-text-hover' : 'bg-sunken text-[#262626]'}`}>
                    {r.kind === 'income' ? <ArrowDownLeft className="size-5" aria-hidden="true" /> : <Receipt className="size-5" aria-hidden="true" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] text-ink">{r.title}</span>
                    {r.subtitle && <span className="text-[13px] text-muted">{r.subtitle}</span>}
                  </span>
                  <span className={`num shrink-0 text-[15px] ${r.kind === 'income' ? 'font-semibold text-brand-text-hover' : 'font-medium text-ink'}`}>
                    {r.kind === 'income' ? '+ ' : '− '}<Money cents={r.cents} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

`src/app/(app)/extrato/page.tsx`:

```tsx
import { todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { FiltersBar } from '@/features/extrato/filters-bar'
import { ExtratoList } from '@/features/extrato/extrato-list'
import { buildExtrato, extratoParams, parseExtratoFilters } from '@/features/extrato/view-model'

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const today = todayInSaoPaulo()
  const filters = parseExtratoFilters(await searchParams, today)
  const { categories, transactions } = await loadLedger()
  const view = buildExtrato({ filters, today, categories, transactions })
  // As setas do mês mantêm tipo, categoria e busca.
  const query = Object.fromEntries(Object.entries(extratoParams(view.filters)).filter(([key]) => key !== 'mes'))

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">Tudo o que entrou e saiu</h1>
        <MonthNav month={view.filters.month} label={view.monthLabel} basePath="/extrato" query={query} />
      </header>
      <FiltersBar filters={view.filters} categories={categories} categoryName={view.categoryName} />
      <ExtratoList view={view} />
    </main>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/seu-mes src/features/extrato && npm run typecheck && npm run lint`
Expected: todos passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/seu-mes/month-nav.tsx src/features/seu-mes/month-nav.test.tsx src/features/extrato "src/app/(app)/extrato/page.tsx"
git commit -m "feat(extrato): página com busca, filtros, dias e estados vazios" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Formulário do Anotar em modo edição

**Files:**
- Create: `src/features/registro/form-values.ts`
- Modify: `src/features/registro/anotar-form.tsx`
- Test: `src/features/registro/form-values.test.ts`, `src/features/registro/anotar-form.test.tsx`

**Interfaces:**
- Consumes: `addDays`, `type ISODate`; `PAYMENT_LABELS` (Task 9); `createTransaction` e — a partir desta tarefa — `updateTransaction` de `./actions` (a ação real chega na Task 13; aqui ela é declarada como stub para o formulário compilar, ver Step 3).
- Produces:
  - `centsToInput(cents: Cents): string` — `14230 → "142,30"`, `500000 → "5000,00"` (aceito de volta por `parseBRL`).
  - `type EditableRecord = { id: string; kind: 'income' | 'expense'; amountCents: Cents; categoryId: string | null; source: string | null; note: string | null; paymentMethod: string | null; occurredOn: ISODate }`
  - `recordToFormValues(r: EditableRecord, today: ISODate): Record<string, string>` — `when` = `today`/`yesterday`/`other` (+ `date`).
  - `AnotarForm({ kind, categories, today, record }: { kind: 'expense' | 'income'; categories: Category[]; today: ISODate; record?: EditableRecord })` — com `record`: campos preenchidos, `<input type="hidden" name="id">`, ação `updateTransaction`, botão "Salvar alterações", "Mais detalhes" aberto se houver nota ou forma de pagamento. Sempre: `data-dirty="true"` no `<form>` depois que a pessoa digita ou quando há erro (usado pela Task 12).

- [ ] **Step 1: Testes que falham**

`src/features/registro/form-values.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseBRL } from '@/domain/money'
import { centsToInput, recordToFormValues, type EditableRecord } from './form-values'

describe('centsToInput', () => {
  test('mostra o valor como a pessoa digitaria, e ele volta igual', () => {
    for (const [cents, text] of [[14230, '142,30'], [500000, '5000,00'], [5, '0,05'], [9_999_999_999, '99999999,99']] as const) {
      expect(centsToInput(cents)).toBe(text)
      expect(parseBRL(centsToInput(cents))).toBe(cents)
    }
  })
})

describe('recordToFormValues', () => {
  const base: EditableRecord = {
    id: 'r1', kind: 'expense', amountCents: 14230, categoryId: 'c1', source: null, note: 'feira', paymentMethod: 'pix', occurredOn: '2026-09-30',
  }
  test('registro de hoje e de ontem usam os atalhos', () => {
    expect(recordToFormValues(base, '2026-09-30')).toEqual({
      amount: '142,30', categoryId: 'c1', source: '', note: 'feira', paymentMethod: 'pix', when: 'today', date: '',
    })
    expect(recordToFormValues(base, '2026-10-01')).toMatchObject({ when: 'yesterday', date: '' })
  })
  test('outro dia leva a data', () => {
    expect(recordToFormValues({ ...base, occurredOn: '2026-08-15' }, '2026-09-30')).toMatchObject({ when: 'other', date: '2026-08-15' })
  })
  test('entrada leva a origem e deixa categoria vazia', () => {
    const r = recordToFormValues({ ...base, kind: 'income', categoryId: null, source: 'Salário', note: null, paymentMethod: null }, '2026-09-30')
    expect(r).toMatchObject({ categoryId: '', source: 'Salário', note: '', paymentMethod: '' })
  })
})
```

Substituir `src/features/registro/anotar-form.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), true]) }
})

import { AnotarForm } from './anotar-form'
import { createTransaction, updateTransaction } from './actions'

const mockUseActionState = vi.mocked(useActionState)
const today = '2026-09-30'

const categories = [
  { id: '1', name: 'Casa', defaultKey: 'casa' },
  { id: '2', name: 'Mercado', defaultKey: 'mercado' },
]

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

describe('AnotarForm', () => {
  test('gasto tem valor, categorias, quando e "Salvar gasto"', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto foi?').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
    expect(mockUseActionState.mock.calls[0][0]).toBe(createTransaction)
  })
  test('botão fica desativado enquanto salva (evita registro duplicado)', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(screen.getByRole('button', { name: 'Salvar gasto' })).toHaveProperty('disabled', true)
  })
  test('entrada usa "Quanto entrou?" e "Salvar entrada"', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    expect(screen.getByLabelText('Quanto entrou?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar entrada' })).toBeTruthy()
  })
  test('erro de data mostra input com aria-describedby e mensagem', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { date: 'Escolha o dia.' }, values: { when: 'other', date: '' } },
      vi.fn(),
      false,
    ])
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('aria-describedby')).toBe('date-error')
    expect(dateInput.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Escolha o dia.')).toBeTruthy()
  })
  test('entrada: o campo de outro dia não passa de hoje', () => {
    render(<AnotarForm kind="income" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    const dateInput = screen.getByLabelText('Dia')
    expect(dateInput.getAttribute('max')).toBe('2026-09-30')
    expect(dateInput.getAttribute('min')).toBe('2000-01-01')
  })
  test('gasto: o campo de outro dia vai até um ano à frente', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Outro dia' }))
    expect(screen.getByLabelText('Dia').getAttribute('max')).toBe('2027-09-30')
  })
})

describe('AnotarForm editando', () => {
  const gasto = {
    id: 'r1', kind: 'expense' as const, amountCents: 14230, categoryId: '2', source: null, note: 'feira', paymentMethod: 'pix', occurredOn: '2026-08-15',
  }
  test('vem preenchido com o registro e salva alterações', () => {
    render(<AnotarForm kind="expense" categories={categories} today={today} record={gasto} />)
    expect(mockUseActionState.mock.calls[0][0]).toBe(updateTransaction)
    expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('142,30')
    expect(screen.getByRole('radio', { name: 'Mercado' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Outro dia' })).toHaveProperty('checked', true)
    expect((screen.getByLabelText('Dia') as HTMLInputElement).value).toBe('2026-08-15')
    expect((screen.getByLabelText('Uma nota, se quiser') as HTMLInputElement).value).toBe('feira')
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('pix')
    expect(screen.getByText('Mais detalhes').closest('details')?.open).toBe(true)
    const hidden = document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement
    expect(hidden.value).toBe('r1')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
  })
  test('entrada de ontem vem com a origem e "Ontem" marcados', () => {
    render(
      <AnotarForm
        kind="income"
        categories={categories}
        today={today}
        record={{ ...gasto, kind: 'income', categoryId: null, source: 'Salário', note: null, paymentMethod: null, occurredOn: '2026-09-29' }}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Salário' })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Ontem' })).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
  })
})

describe('formulário "sujo" (para pedir confirmação ao fechar)', () => {
  test('fica marcado depois que a pessoa digita', () => {
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} />)
    const form = container.querySelector('form')!
    expect(form.getAttribute('data-dirty')).toBeNull()
    fireEvent.input(screen.getByLabelText('Quanto foi?'), { target: { value: '10' } })
    expect(form.getAttribute('data-dirty')).toBe('true')
  })
  test('depois de um erro, o que foi digitado ainda não foi salvo', () => {
    mockUseActionState.mockReturnValueOnce([
      { status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } },
      vi.fn(),
      false,
    ])
    const { container } = render(<AnotarForm kind="expense" categories={categories} today={today} />)
    expect(container.querySelector('form')!.getAttribute('data-dirty')).toBe('true')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/form-values.test.ts src/features/registro/anotar-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./form-values"`; no formulário, `expected '' to be '142,30'` e `data-dirty` nulo.

- [ ] **Step 3: Implementação**

`src/features/registro/form-values.ts`:

```ts
import { addDays, type ISODate } from '@/domain/dates'
import type { Cents } from '@/domain/money'

// Sem separador de milhar: "5000,00" é o que a pessoa digitaria e parseBRL aceita de volta.
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export type EditableRecord = {
  id: string
  kind: 'income' | 'expense'
  amountCents: Cents
  categoryId: string | null
  source: string | null
  note: string | null
  paymentMethod: string | null
  occurredOn: ISODate
}

export function recordToFormValues(r: EditableRecord, today: ISODate): Record<string, string> {
  const when = r.occurredOn === today ? 'today' : r.occurredOn === addDays(today, -1) ? 'yesterday' : 'other'
  return {
    amount: centsToInput(r.amountCents),
    categoryId: r.categoryId ?? '',
    source: r.source ?? '',
    note: r.note ?? '',
    paymentMethod: r.paymentMethod ?? '',
    when,
    date: when === 'other' ? r.occurredOn : '',
  }
}
```

Em `src/features/registro/actions.ts`, acrescentar ao fim um **stub temporário** (a Task 13 substitui o arquivo inteiro pela versão real):

```ts
// Stub temporário: a Task 13 implementa a edição de verdade.
export async function updateTransaction(_: FormState, _fd: FormData): Promise<FormState> {
  return errorState({ message: SAVE_FAILED })
}
```

`src/features/registro/anotar-form.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { idle } from '@/lib/forms'
import { addDays, type ISODate } from '@/domain/dates'
import { createTransaction, updateTransaction } from './actions'
import type { Category } from './queries'
import { PAYMENT_LABELS } from './labels'
import { recordToFormValues, type EditableRecord } from './form-values'

const chip =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-control bg-card px-3 text-[15px] font-medium text-[#262626] has-[:checked]:border-[1.5px] has-[:checked]:border-selected has-[:checked]:bg-brand-wash has-[:checked]:font-semibold has-[:checked]:text-brand-ink has-[:focus-visible]:shadow-[0_0_0_3px_rgba(160,232,112,.45)]'

const SOURCES = ['Salário', 'Freela', 'Presente', 'Outros']

type Props = { kind: 'expense' | 'income'; categories: Category[]; today: ISODate; record?: EditableRecord }

export function AnotarForm({ kind, categories, today, record }: Props) {
  const [state, action, pending] = useActionState(record ? updateTransaction : createTransaction, idle)
  const err = state.status === 'error' ? state : null
  const v = err?.values ?? (record ? recordToFormValues(record, today) : {})
  const e = err?.fieldErrors ?? {}
  const [when, setWhen] = useState(v.when || 'today')
  // "Sujo" = há algo digitado que ainda não foi salvo; o botão Fechar pergunta antes de descartar.
  const [touched, setTouched] = useState(false)
  const isExpense = kind === 'expense'
  const hasDetails = Boolean(v.note || v.paymentMethod)

  return (
    <form
      key={err ? err.submission : 'idle'}
      action={action}
      noValidate
      onInput={() => setTouched(true)}
      onChange={() => setTouched(true)}
      data-dirty={touched || err ? 'true' : undefined}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      {record && <input type="hidden" name="id" value={record.id} />}

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

      <fieldset className="flex flex-col gap-2.5" aria-describedby={e.date ? 'date-error' : undefined}>
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
          <input
            type="date" name="date" defaultValue={v.date} aria-label="Dia"
            min="2000-01-01" max={isExpense ? addDays(today, 365) : today}
            aria-invalid={e.date ? true : undefined} aria-describedby={e.date ? 'date-error' : undefined}
            className="h-12 rounded-control border border-control px-3.5 text-base"
          />
        )}
        {e.date && <span id="date-error" className="text-sm text-error-ink">{e.date}</span>}
      </fieldset>

      {isExpense && (
        <details open={hasDetails} className="group border-y border-line">
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
        {record ? 'Salvar alterações' : isExpense ? 'Salvar gasto' : 'Salvar entrada'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/registro && npm run typecheck && npm run lint`
Expected: todos passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/form-values.ts src/features/registro/form-values.test.ts src/features/registro/anotar-form.tsx src/features/registro/anotar-form.test.tsx src/features/registro/actions.ts
git commit -m "feat(registro): formulário do Anotar também edita e sabe quando há algo não salvo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Fechar com "Descartar este registro?"

**Files:**
- Create: `src/features/registro/sheet-close.tsx`
- Modify: `src/app/(app)/anotar/page.tsx`
- Test: `src/features/registro/sheet-close.test.tsx`

**Interfaces:**
- Consumes: `ConfirmPanel` (Task 7), `Button`; o atributo `data-dirty="true"` no formulário (Task 11).
- Produces: `SheetClose({ href }: { href: string })` — botão "Fechar" (X). Sem nada digitado, navega direto para `href`; com algo digitado, pergunta "Descartar este registro?" · "O que você digitou não será salvo." → "Descartar" (vai para `href`) · "Continuar editando".

- [ ] **Step 1: Teste que falha** — `src/features/registro/sheet-close.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SheetClose } from './sheet-close'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

test('é um link para o destino, com nome acessível "Fechar"', () => {
  render(<SheetClose href="/inicio" />)
  expect(screen.getByRole('link', { name: 'Fechar' }).getAttribute('href')).toBe('/inicio')
})

test('com algo digitado, pergunta antes de descartar', () => {
  const form = document.createElement('form')
  form.setAttribute('data-dirty', 'true')
  document.body.appendChild(form)

  render(<SheetClose href="/extrato?mes=2026-09" />)
  fireEvent.click(screen.getByRole('link', { name: 'Fechar' }))

  const dialog = screen.getByRole('alertdialog', { name: 'Descartar este registro?' })
  expect(dialog.textContent).toContain('O que você digitou não será salvo.')
  expect(screen.getByRole('link', { name: 'Descartar' }).getAttribute('href')).toBe('/extrato?mes=2026-09')

  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/sheet-close.test.tsx`
Expected: FAIL — `Failed to resolve import "./sheet-close"`.

- [ ] **Step 3: Implementação** — `src/features/registro/sheet-close.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/ui/button'
import { ConfirmPanel } from '@/ui/confirm'

export function SheetClose({ href }: { href: string }) {
  const [asking, setAsking] = useState(false)
  const keepEditing = useCallback(() => setAsking(false), [])

  return (
    <>
      <Link
        href={href}
        aria-label="Fechar"
        onClick={(e) => {
          // O formulário marca data-dirty quando há algo digitado e não salvo.
          if (document.querySelector('form[data-dirty="true"]')) {
            e.preventDefault()
            setAsking(true)
          }
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sunken text-[#262626]"
      >
        <X className="size-5" aria-hidden="true" />
      </Link>
      {asking && (
        <ConfirmPanel title="Descartar este registro?" body="O que você digitou não será salvo." cancelLabel="Continuar editando" onCancel={keepEditing}>
          <Button href={href} className="w-full md:w-auto">Descartar</Button>
        </ConfirmPanel>
      )}
    </>
  )
}
```

`src/app/(app)/anotar/page.tsx`:

```tsx
import Link from 'next/link'
import { todayInSaoPaulo } from '@/domain/dates'
import { loadCategories } from '@/features/registro/queries'
import { AnotarForm } from '@/features/registro/anotar-form'
import { SheetClose } from '@/features/registro/sheet-close'

export default async function AnotarPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const kind = tipo === 'entrada' ? 'income' : 'expense'
  const categories = await loadCategories()
  const tab = (active: boolean) =>
    `flex h-11 items-center justify-center rounded-control text-[15px] ${active ? 'bg-card font-semibold text-ink shadow-[0_1px_2px_rgba(18,40,1,.08)]' : 'font-medium text-inactive'}`

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-label="Anotar" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <nav aria-label="Tipo de registro" className="grid flex-1 grid-cols-2 gap-1 rounded-panel bg-sunken p-1">
            <Link href="/anotar" aria-current={kind === 'expense' ? 'page' : undefined} className={tab(kind === 'expense')}>Saiu dinheiro</Link>
            <Link href="/anotar?tipo=entrada" aria-current={kind === 'income' ? 'page' : undefined} className={tab(kind === 'income')}>Entrou dinheiro</Link>
          </nav>
          <SheetClose href="/inicio" />
        </div>
        <AnotarForm key={kind} kind={kind} categories={categories} today={todayInSaoPaulo()} />
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/registro && npm run typecheck && npm run lint`
Expected: todos passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/sheet-close.tsx src/features/registro/sheet-close.test.tsx "src/app/(app)/anotar/page.tsx"
git commit -m "feat(anotar): fechar com algo digitado pergunta antes de descartar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Editar e excluir registro

**Files:**
- Modify: `src/features/registro/actions.ts` (substituir inteiro), `src/features/registro/queries.ts` (substituir inteiro)
- Create: `src/app/(app)/extrato/[id]/page.tsx`
- Test: `src/features/registro/actions.test.ts`

**Interfaces:**
- Consumes: `makeExpenseSchema`, `makeIncomeSchema` (`./schemas`), `monthOf`, `todayInSaoPaulo`, `setFlash`, `ConfirmAction`, `SheetClose`, `AnotarForm` (modo edição), `orderCategories`.
- Produces:
  - `createTransaction(_: FormState, fd: FormData): Promise<FormState>` (igual, agora também revalida `/extrato`).
  - `updateTransaction(_: FormState, fd: FormData): Promise<FormState>` — lê `id` (uuid) e o tipo gravado no banco (nunca o do formulário); valida pelas regras do tipo; grava; aviso "Alterações salvas."; redireciona para `/extrato?mes={mês da nova data}`. Erros devolvem `FormState` com o que foi digitado.
  - `deleteTransaction(fd: FormData): Promise<void>` — exclui; aviso "Excluído. Seu mês já está atualizado."; redireciona para `/extrato?mes={mês do registro}`; falha do banco → `/extrato/{id}?erro=1`; id inválido ou inexistente → `/extrato`.
  - `loadTransaction(id: string): Promise<TxRow | null>`.
  - Rota `/extrato/[id]` — painel "Editar gasto" / "Editar entrada" com Fechar, formulário e "Excluir" (confirmação "Excluir este gasto?"/"Excluir esta entrada?" · "Seu mês será recalculado." → Excluir · Cancelar).

- [ ] **Step 1: Teste que falha** — `src/features/registro/actions.test.ts`:

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

const { updateTransaction, deleteTransaction } = await import('./actions')

type Call = { op: string; id?: unknown; payload?: unknown }
const calls: Call[] = []

function fakeSupabase(s: { kind: 'income' | 'expense' | null; changedRows?: number; deleted?: { occurred_on: string }[]; deleteFails?: boolean }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: s.kind ? { kind: s.kind } : null, error: null }) }),
      }),
      update: (payload: unknown) => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            calls.push({ op: `update:${table}`, id, payload })
            return { data: Array.from({ length: s.changedRows ?? 1 }, () => ({ id })), error: null }
          },
        }),
      }),
      delete: () => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            calls.push({ op: `delete:${table}`, id })
            return s.deleteFails ? { data: null, error: { message: 'falhou' } } : { data: s.deleted ?? [], error: null }
          },
        }),
      }),
    }),
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
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

afterEach(() => vi.useRealTimers())

describe('updateTransaction', () => {
  test('gasto movido para o mês anterior: salva e volta ao Extrato do novo mês (Review Focus 2)', async () => {
    h.supabase = fakeSupabase({ kind: 'expense' })
    const url = await redirectOf(
      updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'other', date: '2026-08-15', note: 'feira', paymentMethod: 'pix' })),
    )
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([
      { op: 'update:transactions', id: ID, payload: { amount_cents: 15000, category_id: CAT, note: 'feira', payment_method: 'pix', occurred_on: '2026-08-15' } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/inicio')
    expect(h.revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  test('entrada segue as regras de entrada: data de amanhã é recusada', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '10', source: 'Salário', when: 'other', date: '2026-10-01' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { date: 'Escolha o dia.' }, values: { amount: '10' } })
    expect(calls).toEqual([])
  })

  test('o tipo vem do banco, não do formulário', async () => {
    h.supabase = fakeSupabase({ kind: 'income' })
    await redirectOf(updateTransaction({ status: 'idle' }, form({ id: ID, kind: 'expense', amount: '10', source: 'Freela', when: 'today', date: '' })))
    expect(calls[0].payload).toEqual({ amount_cents: 1000, source: 'Freela', occurred_on: '2026-09-30' })
  })

  test('id inválido ou de registro que a pessoa não vê não grava nada', async () => {
    h.supabase = fakeSupabase({ kind: null })
    for (const id of ['nao-e-id', ID]) {
      const state = await updateTransaction({ status: 'idle' }, form({ id, amount: '10', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
      expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '10' } })
    }
    expect(calls).toEqual([])
  })

  test('se nenhuma linha mudou, avisa e mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', changedRows: 0 })
    const state = await updateTransaction({ status: 'idle' }, form({ id: ID, amount: '150', categoryId: CAT, when: 'today', date: '', note: '', paymentMethod: '' }))
    expect(state).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '150' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteTransaction', () => {
  test('exclui e volta ao mês do registro com o aviso', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleted: [{ occurred_on: '2026-08-12' }] })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe('/extrato?mes=2026-08')
    expect(calls).toEqual([{ op: 'delete:transactions', id: ID }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('falha no banco volta para a edição com aviso de erro', async () => {
    h.supabase = fakeSupabase({ kind: 'expense', deleteFails: true })
    const url = await redirectOf(deleteTransaction(form({ id: ID })))
    expect(url).toBe(`/extrato/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido ou registro que já não existe volta ao Extrato sem aviso', async () => {
    h.supabase = fakeSupabase({ kind: null, deleted: [] })
    expect(await redirectOf(deleteTransaction(form({ id: 'x' })))).toBe('/extrato')
    expect(calls).toEqual([])
    expect(await redirectOf(deleteTransaction(form({ id: ID })))).toBe('/extrato')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/registro/actions.test.ts`
Expected: FAIL — `deleteTransaction is not a function` e o stub de `updateTransaction` devolve erro em vez de redirecionar (`esperava um redirecionamento`).

- [ ] **Step 3: Implementação**

`src/features/registro/actions.ts` (arquivo inteiro, substitui o stub da Task 11):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { monthOf, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { makeExpenseSchema, makeIncomeSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const EXPENSE_FIELDS = ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod'] as const
const INCOME_FIELDS = ['amount', 'source', 'when', 'date'] as const
const ALL_FIELDS = ['amount', 'categoryId', 'source', 'when', 'date', 'note', 'paymentMethod'] as const
const recordId = z.uuid()

function refreshMoneyViews() {
  revalidatePath('/inicio')
  revalidatePath('/extrato')
}

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, EXPENSE_FIELDS)
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
    const values = readFields(fd, INCOME_FIELDS)
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

  refreshMoneyViews()
  redirect('/inicio')
}

export async function updateTransaction(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const today = todayInSaoPaulo()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  const id = parsedId.success ? parsedId.data : null
  const supabase = await createClient()

  // O tipo vem do banco (a RLS só devolve registros da própria pessoa), nunca do formulário.
  const existing = id ? (await supabase.from('transactions').select('kind').eq('id', id).maybeSingle()).data : null
  if (!id || !existing) return errorState({ message: SAVE_FAILED, values: readFields(fd, ALL_FIELDS) })

  let occurredOn: ISODate
  if (existing.kind === 'income') {
    const values = readFields(fd, INCOME_FIELDS)
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { data, error } = await supabase
      .from('transactions')
      .update({ amount_cents: d.amountCents, source: d.source, occurred_on: d.occurredOn })
      .eq('id', id)
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  } else {
    const values = readFields(fd, EXPENSE_FIELDS)
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { data, error } = await supabase
      .from('transactions')
      .update({ amount_cents: d.amountCents, category_id: d.categoryId, note: d.note, payment_method: d.paymentMethod, occurred_on: d.occurredOn })
      .eq('id', id)
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  }

  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  // Se a data mudou de mês, a pessoa vê o registro onde ele foi parar.
  redirect(`/extrato?mes=${monthOf(occurredOn)}`)
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/extrato')
  const id = parsedId.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('occurred_on')
  if (error) redirect(`/extrato/${id}?erro=1`)
  const deleted = data?.[0]
  if (!deleted) redirect('/extrato')
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato?mes=${monthOf(deleted.occurred_on)}`)
}
```

`src/features/registro/queries.ts` (arquivo inteiro):

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { CategorizedTx } from '@/domain/breakdown'
import { orderCategories } from '@/features/categorias/names'
import { fetchAllPages } from './paging'

export type Profile = { displayName: string; initialBalanceCents: number }
export type Category = { id: string; name: string; defaultKey: string | null }
export interface TxRow extends CategorizedTx {
  id: string
  source: string | null
  note: string | null
  paymentMethod: string | null
  createdAt: string
}

type TxRawRow = {
  id: string
  kind: string
  amount_cents: number
  category_id: string | null
  source: string | null
  note: string | null
  payment_method: string | null
  occurred_on: string
  status: string
  due_on: string | null
  paid_on: string | null
  created_at: string
}

const TX_COLUMNS = 'id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at'

function toTxRow(t: TxRawRow): TxRow {
  return {
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
  }
}

async function fetchCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id, name, default_key, sort_order').order('sort_order')
  if (error) throw error
  const rows = data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    defaultKey: c.default_key as string | null,
    sortOrder: c.sort_order as number,
  }))
  return orderCategories(rows).map(({ id, name, defaultKey }) => ({ id, name, defaultKey }))
}

export async function loadCategories(): Promise<Category[]> {
  await requireUser()
  const supabase = await createClient()
  return fetchCategories(supabase)
}

export async function loadTransaction(id: string): Promise<TxRow | null> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').select(TX_COLUMNS).eq('id', id).maybeSingle<TxRawRow>()
  if (error) throw error
  return data ? toTxRow(data) : null
}

export async function loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }> {
  await requireUser()
  const supabase = await createClient()
  const [profile, categories, rawTxs] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    fetchCategories(supabase),
    fetchAllPages<TxRawRow>(async (from, to) => {
      const { data, error } = await supabase
        .from('transactions')
        .select(TX_COLUMNS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
      return { data, error }
    }),
  ])
  if (profile.error) throw profile.error
  return {
    profile: { displayName: profile.data.display_name, initialBalanceCents: Number(profile.data.initial_balance_cents) },
    categories,
    transactions: rawTxs.map(toTxRow),
  }
}
```

`src/app/(app)/extrato/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { deleteTransaction } from '@/features/registro/actions'
import { AnotarForm } from '@/features/registro/anotar-form'
import { loadCategories, loadTransaction } from '@/features/registro/queries'
import { SheetClose } from '@/features/registro/sheet-close'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function EditarRegistroPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const [tx, categories] = await Promise.all([loadTransaction(id), loadCategories()])
  // Contas a pagar/receber (pendentes) ganham tela própria no Plano 3.
  if (!tx || tx.status !== 'confirmed') notFound()

  const isExpense = tx.kind === 'expense'
  const record = {
    id: tx.id, kind: tx.kind, amountCents: tx.amountCents, categoryId: tx.categoryId, source: tx.source,
    note: tx.note, paymentMethod: tx.paymentMethod, occurredOn: tx.occurredOn,
  }

  return (
    <div className="min-h-dvh bg-[rgba(18,40,1,.32)] md:flex md:justify-end">
      <section aria-labelledby="editar-titulo" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-card px-4 pb-8 pt-4 md:mx-0 md:w-[480px] md:max-w-none md:px-7 md:shadow-sheet">
        <div className="flex items-center gap-2">
          <h1 id="editar-titulo" className="flex-1 text-xl font-semibold tracking-tight text-ink">{isExpense ? 'Editar gasto' : 'Editar entrada'}</h1>
          <SheetClose href={`/extrato?mes=${monthOf(tx.paidOn ?? tx.occurredOn)}`} />
        </div>
        {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
        <AnotarForm kind={tx.kind} categories={categories} today={todayInSaoPaulo()} record={record} />
        <ConfirmAction
          trigger="Excluir"
          triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
          title={isExpense ? 'Excluir este gasto?' : 'Excluir esta entrada?'}
          body="Seu mês será recalculado."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          action={deleteTransaction}
          fields={{ id: tx.id }}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/registro && npm run typecheck && npm run lint && npm run build`
Expected: todos passando; tipos, lint e build sem erros (a rota `/extrato/[id]` aparece como dinâmica no resumo do build).

- [ ] **Step 5: Commit**

```bash
git add src/features/registro/actions.ts src/features/registro/actions.test.ts src/features/registro/queries.ts "src/app/(app)/extrato/[id]/page.tsx"
git commit -m "feat(extrato): editar e excluir registro com confirmação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Perfil — saldo inicial e nome

**Files:**
- Create: `src/features/perfil/schemas.ts`, `src/features/perfil/queries.ts`, `src/features/perfil/actions.ts`, `src/features/perfil/forms.tsx`
- Test: `src/features/perfil/actions.test.ts`, `src/features/perfil/forms.test.tsx`

**Interfaces:**
- Consumes: `parseBRL`, `signUpSchema` (`@/features/auth/schemas`), `requireUser`, `createClient`, `setFlash`, `FormState` helpers, `TextField`, `Button`, `FormAlert`.
- Produces:
  - `initialBalanceSchema` — `{ initialBalance: string }` → `{ initialBalanceCents: number }`; vazio = 0; negativo ou texto inválido → `Esse valor não parece certo. Use apenas números.`
  - `displayNameSchema = signUpSchema.pick({ displayName: true })` — `Falta o seu nome.` / `Use até 60 caracteres.`
  - `type ProfileDetails = { displayName: string; email: string; initialBalanceCents: number; onboardedAt: string | null; categoriesCount: number }` e `loadProfile(): Promise<ProfileDetails>` (`queries.ts`, server-only).
  - Server Actions: `completeOnboardingBalance(_: FormState, fd: FormData): Promise<FormState>` (grava saldo + `onboarded_at`, vai para `/boas-vindas/primeiro-gasto`); `skipOnboardingBalance(): Promise<void>` (só `onboarded_at`; falha → `/boas-vindas/saldo?erro=1`); `updateInitialBalance(_: FormState, fd: FormData): Promise<FormState>` (aviso "Alterações salvas.", vai para `/configuracoes`); `updateDisplayName(_: FormState, fd: FormData): Promise<FormState>` (idem; revalida o layout, porque o nome aparece no menu lateral).
  - `InitialBalanceForm({ action, submitLabel, defaultValue }: { action: (s: FormState, fd: FormData) => Promise<FormState>; submitLabel: string; defaultValue?: string })` e `NameForm({ defaultValue }: { defaultValue: string })`.

- [ ] **Step 1: Testes que falham**

`src/features/perfil/actions.test.ts`:

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

const { completeOnboardingBalance, skipOnboardingBalance, updateDisplayName, updateInitialBalance } = await import('./actions')

type Call = { op: string; id: unknown; payload: unknown }
const calls: Call[] = []

function fakeSupabase(s: { fails?: boolean } = {}) {
  return {
    from: (table: string) => ({
      update: (payload: unknown) => ({
        eq: async (_col: string, id: unknown) => {
          calls.push({ op: `update:${table}`, id, payload })
          return { error: s.fails ? { message: 'falhou' } : null }
        },
      }),
    }),
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

const NOW = '2026-09-30T15:00:00.000Z'
const WRONG_VALUE = 'Esse valor não parece certo. Use apenas números.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
  h.supabase = fakeSupabase()
})

afterEach(() => vi.useRealTimers())

describe('onboarding: Quanto você tem hoje?', () => {
  test('grava o saldo inicial, conclui o onboarding e segue para o primeiro gasto', async () => {
    const url = await redirectOf(completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: 'R$ 6.000' })))
    expect(url).toBe('/boas-vindas/primeiro-gasto')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { initial_balance_cents: 600000, onboarded_at: NOW } }])
  })
  test('campo vazio vale R$ 0,00 (é opcional)', async () => {
    await redirectOf(completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: '  ' })))
    expect(calls[0].payload).toEqual({ initial_balance_cents: 0, onboarded_at: NOW })
  })
  test('valor negativo ou estranho é recusado sem gravar', async () => {
    for (const raw of ['-100', '12a']) {
      const state = await completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: raw }))
      expect(state).toMatchObject({ status: 'error', fieldErrors: { initialBalance: WRONG_VALUE }, values: { initialBalance: raw } })
    }
    expect(calls).toEqual([])
  })
  test('falha no banco mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase({ fails: true })
    const state = await completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: '6.000' }))
    expect(state).toMatchObject({
      status: 'error',
      message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.',
      values: { initialBalance: '6.000' },
    })
  })
  test('Pular conclui o onboarding sem mexer no saldo', async () => {
    expect(await redirectOf(skipOnboardingBalance())).toBe('/boas-vindas/primeiro-gasto')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { onboarded_at: NOW } }])
  })
  test('Pular com falha no banco volta para a mesma tela com aviso', async () => {
    h.supabase = fakeSupabase({ fails: true })
    expect(await redirectOf(skipOnboardingBalance())).toBe('/boas-vindas/saldo?erro=1')
  })
})

describe('Configurações', () => {
  test('muda o saldo inicial e avisa', async () => {
    const url = await redirectOf(updateInitialBalance({ status: 'idle' }, form({ initialBalance: '1.500,50' })))
    expect(url).toBe('/configuracoes')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { initial_balance_cents: 150050 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/inicio')
  })
  test('muda o nome, sem espaços sobrando, e atualiza o menu lateral', async () => {
    const url = await redirectOf(updateDisplayName({ status: 'idle' }, form({ displayName: '  Joana ' })))
    expect(url).toBe('/configuracoes')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { display_name: 'Joana' } }])
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
  test('nome vazio pede o nome', async () => {
    const state = await updateDisplayName({ status: 'idle' }, form({ displayName: '   ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { displayName: 'Falta o seu nome.' } })
    expect(calls).toEqual([])
  })
})
```

`src/features/perfil/forms.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({ updateDisplayName: vi.fn() }))

const { InitialBalanceForm, NameForm } = await import('./forms')

afterEach(() => cleanup())

test('saldo inicial: rótulo, dica ligada ao campo e botão', () => {
  render(<InitialBalanceForm action={vi.fn()} submitLabel="Salvar e continuar" />)
  const input = screen.getByLabelText('Somando banco, carteira e dinheiro guardado')
  expect(input.getAttribute('inputmode')).toBe('decimal')
  expect(input.getAttribute('aria-describedby')).toBe('initialBalance-hint')
  expect(screen.getByText('Não precisa ser exato. Um valor aproximado já ajuda a enxergar.').id).toBe('initialBalance-hint')
  expect(screen.getByRole('button', { name: 'Salvar e continuar' })).toBeTruthy()
})

test('em Configurações, o saldo vem com o valor atual', () => {
  render(<InitialBalanceForm action={vi.fn()} submitLabel="Salvar alterações" defaultValue="6000,00" />)
  expect((screen.getByLabelText('Somando banco, carteira e dinheiro guardado') as HTMLInputElement).value).toBe('6000,00')
})

test('nome: campo com o nome atual e Salvar alterações', () => {
  render(<NameForm defaultValue="Camila" />)
  expect((screen.getByLabelText('Como podemos te chamar?') as HTMLInputElement).value).toBe('Camila')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/perfil`
Expected: FAIL — `Failed to resolve import "./actions"` / `"./forms"`.

- [ ] **Step 3: Implementação**

`src/features/perfil/schemas.ts`:

```ts
import { z } from 'zod'
import { parseBRL } from '@/domain/money'
import { signUpSchema } from '@/features/auth/schemas'

// Saldo inicial é opcional: vazio vale zero. Negativo não é aceito nesta versão
// (parseBRL não aceita sinal), e o texto de erro é o mesmo do Anotar.
export const initialBalanceSchema = z
  .object({
    initialBalance: z.string().transform((raw, ctx) => {
      if (raw.trim() === '') return 0
      const cents = parseBRL(raw)
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Esse valor não parece certo. Use apenas números.' })
        return z.NEVER
      }
      return cents
    }),
  })
  .transform(({ initialBalance }) => ({ initialBalanceCents: initialBalance }))

export const displayNameSchema = signUpSchema.pick({ displayName: true })
```

`src/features/perfil/queries.ts`:

```ts
import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'

export type ProfileDetails = {
  displayName: string
  email: string
  initialBalanceCents: number
  onboardedAt: string | null
  categoriesCount: number
}

export async function loadProfile(): Promise<ProfileDetails> {
  const user = await requireUser()
  const supabase = await createClient()
  const [profile, categories] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents, onboarded_at').single(),
    supabase.from('categories').select('id', { count: 'exact', head: true }),
  ])
  if (profile.error) throw profile.error
  if (categories.error) throw categories.error
  return {
    displayName: profile.data.display_name,
    email: user.email,
    initialBalanceCents: Number(profile.data.initial_balance_cents),
    onboardedAt: profile.data.onboarded_at,
    categoriesCount: categories.count ?? 0,
  }
}
```

`src/features/perfil/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { displayNameSchema, initialBalanceSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

export async function completeOnboardingBalance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['initialBalance'] as const)
  const parsed = initialBalanceSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ initial_balance_cents: parsed.data.initialBalanceCents, onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  redirect('/boas-vindas/primeiro-gasto')
}

export async function skipOnboardingBalance(): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id)
  if (error) redirect('/boas-vindas/saldo?erro=1')
  redirect('/boas-vindas/primeiro-gasto')
}

export async function updateInitialBalance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['initialBalance'] as const)
  const parsed = initialBalanceSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ initial_balance_cents: parsed.data.initialBalanceCents }).eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  revalidatePath('/inicio')
  redirect('/configuracoes')
}

export async function updateDisplayName(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['displayName'] as const)
  const parsed = displayNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ display_name: parsed.data.displayName }).eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  // O nome aparece no menu lateral (layout) e no Seu mês.
  revalidatePath('/', 'layout')
  redirect('/configuracoes')
}
```

`src/features/perfil/forms.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'
import { updateDisplayName } from './actions'

type Action = (state: FormState, fd: FormData) => Promise<FormState>

export function InitialBalanceForm({ action, submitLabel, defaultValue = '' }: { action: Action; submitLabel: string; defaultValue?: string }) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  const error = err?.fieldErrors?.initialBalance
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-1 flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5 pt-3">
        <label htmlFor="initialBalance" className="text-[15px] font-medium">Somando banco, carteira e dinheiro guardado</label>
        <input
          id="initialBalance"
          name="initialBalance"
          inputMode="decimal"
          autoComplete="off"
          placeholder="R$ 0,00"
          defaultValue={err?.values?.initialBalance ?? defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'initialBalance-error' : 'initialBalance-hint'}
          className={`num h-16 border-0 border-b-2 bg-transparent text-[40px] font-bold text-brand-ink outline-none placeholder:text-[#a3a3a3] ${error ? 'border-error-ink' : 'border-brand'}`}
        />
        {error && <span id="initialBalance-error" className="text-sm text-error-ink">{error}</span>}
      </div>
      <p id="initialBalance-hint" className="text-sm text-muted">Não precisa ser exato. Um valor aproximado já ajuda a enxergar.</p>
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <div className="flex-1" />
      <Button type="submit" disabled={pending} className="h-[52px]">{submitLabel}</Button>
    </form>
  )
}

export function NameForm({ defaultValue }: { defaultValue: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayName, idle)
  const err = state.status === 'error' ? state : null
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
      <TextField
        name="displayName"
        label="Como podemos te chamar?"
        autoComplete="given-name"
        defaultValue={err?.values?.displayName ?? defaultValue}
        error={err?.fieldErrors?.displayName}
      />
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending}>Salvar alterações</Button>
    </form>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/perfil && npm run typecheck && npm run lint`
Expected: 12 testes passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/perfil
git commit -m "feat(perfil): saldo inicial e nome, com validação no servidor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Onboarding (boas-vindas, saldo inicial, primeiro gasto)

**Files:**
- Create: `src/features/onboarding/gate.ts`, `src/features/onboarding/slide.tsx`, `src/app/(onboarding)/layout.tsx`, `src/app/(onboarding)/boas-vindas/page.tsx`, `src/app/(onboarding)/boas-vindas/saldo/page.tsx`, `src/app/(onboarding)/boas-vindas/primeiro-gasto/page.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/features/auth/actions.ts` (só o `redirect` do `signUp`)
- Test: `src/features/onboarding/gate.test.ts`, `src/features/onboarding/slide.test.tsx`

**Interfaces:**
- Consumes: `loadProfile()`, `completeOnboardingBalance`, `skipOnboardingBalance`, `InitialBalanceForm` (Task 14); `Button`, `FormAlert`.
- Produces:
  - `needsOnboarding(profile: { onboarded_at: string | null } | null): boolean` — `true` só quando o perfil existe e `onboarded_at` é nulo.
  - `parseStep(raw: string | undefined): 1 | 2 | 3`; `SLIDES` (3 telas da copy); `OnboardingSlide({ step }: { step: 1 | 2 | 3 })`.
  - **Roteamento:** o layout de `(app)` lê `display_name, onboarded_at`; se `needsOnboarding`, `redirect('/boas-vindas')`. Isso vale para cadastro por e-mail, por Google (o retorno cai em `/inicio`) e para quem entra depois de ter parado no meio. `/boas-vindas` e `/boas-vindas/saldo` mandam para `/inicio` quem já concluiu. `/boas-vindas/primeiro-gasto` não tem trava (é o passo depois de concluir). "Concluído" = salvou ou pulou "Quanto você tem hoje?".
  - Fluxo: `/boas-vindas?passo=1` → `?passo=2` → `?passo=3` → (Começar ou Pular em qualquer tela) `/boas-vindas/saldo` → (Salvar e continuar ou Pular) `/boas-vindas/primeiro-gasto` → "Anotar agora" (`/anotar`) ou "Depois" (`/inicio`). O passo "Adicionar à tela de início" entra entre saldo e primeiro gasto no Plano 8.

- [ ] **Step 1: Testes que falham**

`src/features/onboarding/gate.test.ts`:

```ts
import { expect, test } from 'vitest'
import { needsOnboarding } from './gate'

test('cadastro que não concluiu (inclusive quem parou no meio) vai para as boas-vindas (Review Focus 3)', () => {
  expect(needsOnboarding({ onboarded_at: null })).toBe(true)
})

test('quem já concluiu nunca é mandado de volta', () => {
  expect(needsOnboarding({ onboarded_at: '2026-09-25T12:00:00+00:00' })).toBe(false)
})

test('sem perfil legível (falha momentânea) não redireciona, para não prender a pessoa num vai e vem', () => {
  expect(needsOnboarding(null)).toBe(false)
})
```

`src/features/onboarding/slide.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OnboardingSlide, parseStep } from './slide'

afterEach(() => cleanup())

describe('parseStep', () => {
  test('aceita 1, 2 e 3; o resto volta ao começo', () => {
    expect(parseStep(undefined)).toBe(1)
    expect(parseStep('2')).toBe(2)
    expect(parseStep('3')).toBe(3)
    expect(parseStep('4')).toBe(1)
    expect(parseStep('abc')).toBe(1)
  })
})

describe('OnboardingSlide', () => {
  test('primeira tela: texto da copy, Próximo e Pular', () => {
    render(<OnboardingSlide step={1} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Aqui, tudo começa com um gasto.' })).toBeTruthy()
    expect(screen.getByText('Anote o que entrou e o que saiu, em segundos. A Íris organiza o resto.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Próximo' }).getAttribute('href')).toBe('/boas-vindas?passo=2')
    expect(screen.getByRole('link', { name: 'Pular' }).getAttribute('href')).toBe('/boas-vindas/saldo')
  })
  test('segunda tela', () => {
    render(<OnboardingSlide step={2} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Veja para onde seu dinheiro vai.' })).toBeTruthy()
    expect(screen.getByText('Cada registro vai para uma categoria. Com poucos dias, seu mês já começa a fazer sentido.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Próximo' }).getAttribute('href')).toBe('/boas-vindas?passo=3')
  })
  test('última tela troca Próximo por Começar', () => {
    render(<OnboardingSlide step={3} />)
    expect(screen.getByRole('heading', { level: 1, name: 'No seu ritmo.' })).toBeTruthy()
    expect(screen.getByText('Esqueceu de anotar? Tudo bem. É só continuar de onde parou.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Próximo' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Começar' }).getAttribute('href')).toBe('/boas-vindas/saldo')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/onboarding`
Expected: FAIL — `Failed to resolve import "./gate"` / `"./slide"`.

- [ ] **Step 3: Implementação**

`src/features/onboarding/gate.ts`:

```ts
// Quem ainda não concluiu o onboarding (cadastro novo ou quem fechou o app no
// meio) volta a ele. Sem perfil legível (erro momentâneo), não redireciona:
// evita um vai e vem entre /inicio e /boas-vindas.
export function needsOnboarding(profile: { onboarded_at: string | null } | null): boolean {
  return profile !== null && profile.onboarded_at === null
}
```

`src/features/onboarding/slide.tsx`:

```tsx
import Link from 'next/link'
import { Clock, Eye, PenLine, type LucideIcon } from 'lucide-react'
import { Button } from '@/ui/button'

export const SLIDES: { title: string; body: string; icon: LucideIcon }[] = [
  { title: 'Aqui, tudo começa com um gasto.', body: 'Anote o que entrou e o que saiu, em segundos. A Íris organiza o resto.', icon: PenLine },
  { title: 'Veja para onde seu dinheiro vai.', body: 'Cada registro vai para uma categoria. Com poucos dias, seu mês já começa a fazer sentido.', icon: Eye },
  { title: 'No seu ritmo.', body: 'Esqueceu de anotar? Tudo bem. É só continuar de onde parou.', icon: Clock },
]

export function parseStep(raw: string | undefined): 1 | 2 | 3 {
  return raw === '2' ? 2 : raw === '3' ? 3 : 1
}

export function OnboardingSlide({ step }: { step: 1 | 2 | 3 }) {
  const slide = SLIDES[step - 1]
  const Icon = slide.icon
  const last = step === 3
  return (
    <>
      <div className="flex justify-end px-4 pt-3">
        <Link href="/boas-vindas/saldo" className="flex h-11 items-center px-3 text-[15px] font-medium text-brand-text">Pular</Link>
      </div>
      <div className="mx-6 mt-2 flex h-[300px] items-center justify-center rounded-[24px] bg-brand-wash md:h-[260px]">
        <span className="flex size-[136px] items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_24px_rgba(18,40,1,.1)]">
          <Icon className="size-[60px]" strokeWidth={1.6} aria-hidden="true" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-6 pb-8 pt-8">
        <div aria-hidden="true" className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-2 rounded-full ${i === step ? 'w-6 bg-selected' : 'w-2 bg-[#d4d4d4]'}`} />
          ))}
        </div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{slide.title}</h1>
        <p className="text-[17px] leading-relaxed">{slide.body}</p>
        <div className="flex-1" />
        <Button href={last ? '/boas-vindas/saldo' : `/boas-vindas?passo=${step + 1}`} className="h-[52px]">
          {last ? 'Começar' : 'Próximo'}
        </Button>
      </div>
    </>
  )
}
```

`src/app/(onboarding)/layout.tsx`:

```tsx
import { requireUser } from '@/lib/supabase/server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-card md:my-10 md:min-h-[760px] md:rounded-hero md:border md:border-line">
      {children}
    </main>
  )
}
```

`src/app/(onboarding)/boas-vindas/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { loadProfile } from '@/features/perfil/queries'
import { OnboardingSlide, parseStep } from '@/features/onboarding/slide'

export default async function BoasVindasPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  const [{ passo }, profile] = await Promise.all([searchParams, loadProfile()])
  if (profile.onboardedAt) redirect('/inicio')
  return <OnboardingSlide step={parseStep(passo)} />
}
```

`src/app/(onboarding)/boas-vindas/saldo/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { loadProfile } from '@/features/perfil/queries'
import { completeOnboardingBalance, skipOnboardingBalance } from '@/features/perfil/actions'
import { InitialBalanceForm } from '@/features/perfil/forms'
import { FormAlert } from '@/ui/form-alert'

export default async function SaldoInicialOnboardingPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [{ erro }, profile] = await Promise.all([searchParams, loadProfile()])
  if (profile.onboardedAt) redirect('/inicio')
  return (
    <div className="flex flex-1 flex-col gap-[18px] px-6 pb-8 pt-3">
      <form action={skipOnboardingBalance} className="flex justify-end">
        <button type="submit" className="flex h-11 items-center px-3 text-[15px] font-medium text-brand-text">Pular</button>
      </form>
      <header className="flex flex-col gap-2.5 pt-6">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Quanto você tem hoje?</h1>
        <p className="text-base leading-relaxed">É o ponto de partida do seu Saldo total. É opcional, e dá para mudar depois em Configurações.</p>
      </header>
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <InitialBalanceForm action={completeOnboardingBalance} submitLabel="Salvar e continuar" />
    </div>
  )
}
```

`src/app/(onboarding)/boas-vindas/primeiro-gasto/page.tsx`:

```tsx
import { Coffee } from 'lucide-react'
import { Button } from '@/ui/button'

export default function PrimeiroGastoPage() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-6 pb-8 pt-3">
      <div className="h-11" />
      <div className="flex h-[300px] items-center justify-center rounded-[24px] bg-brand-wash md:h-[260px]">
        <span className="flex size-[136px] items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_24px_rgba(18,40,1,.1)]">
          <Coffee className="size-[60px]" strokeWidth={1.6} aria-hidden="true" />
        </span>
      </div>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">Que tal anotar seu primeiro gasto?</h1>
      <p className="text-[17px] leading-relaxed">Pode ser o último café.</p>
      <div className="flex-1" />
      <div className="flex flex-col gap-2">
        <Button href="/anotar" className="h-[52px]">Anotar agora</Button>
        <Button href="/inicio" variant="ghost">Depois</Button>
      </div>
    </div>
  )
}
```

`src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireUser, createClient } from '@/lib/supabase/server'
import { needsOnboarding } from '@/features/onboarding/gate'
import { BottomNav } from '@/features/shell/bottom-nav'
import { MainFrame } from '@/features/shell/main-frame'
import { Sidebar } from '@/features/shell/sidebar'
import { Toast } from '@/features/shell/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('display_name, onboarded_at').single()
  // Cadastro novo (e-mail ou Google) e quem parou no meio do onboarding vão para as boas-vindas.
  if (needsOnboarding(profile)) redirect('/boas-vindas')
  return (
    <div className="flex min-h-dvh">
      <Sidebar displayName={profile?.display_name ?? ''} />
      <MainFrame>{children}</MainFrame>
      <BottomNav />
      <Toast />
    </div>
  )
}
```

Em `src/features/auth/actions.ts`, dentro de `signUp`, trocar a última linha:

```ts
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/inicio')
}

export async function signIn(
```

por:

```ts
  if (error) return errorState({ message: UNEXPECTED, values })
  redirect('/boas-vindas')
}

export async function signIn(
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/features/onboarding && npm run typecheck && npm run lint && npm run build`
Expected: 7 testes passando; tipos, lint e build sem erros (`/boas-vindas`, `/boas-vindas/saldo`, `/boas-vindas/primeiro-gasto` no resumo do build).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding "src/app/(onboarding)" "src/app/(app)/layout.tsx" src/features/auth/actions.ts
git commit -m "feat(onboarding): boas-vindas puláveis, saldo inicial e primeiro gasto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Categorias (listar, criar, renomear, excluir)

**Files:**
- Create: `src/ui/list.tsx`, `src/ui/page-header.tsx`, `src/features/categorias/actions.ts`, `src/features/categorias/category-form.tsx`, `src/app/(app)/categorias/page.tsx`, `src/app/(app)/categorias/nova/page.tsx`, `src/app/(app)/categorias/[id]/page.tsx`
- Test: `src/ui/list.test.tsx`, `src/features/categorias/actions.test.ts`, `src/features/categorias/category-form.test.tsx`

**Interfaces:**
- Consumes: `categoryNameSchema`, `DUPLICATE_CATEGORY`, `isDuplicateNameError` (Task 6); `delete_category` (Task 5); `loadCategories`; `ConfirmAction` (Task 7); `TextField`, `Button`, `FormAlert`.
- Produces:
  - UI: `ListSection({ title, children })`, `ListCard({ children })`, `ListRow({ children })`, `RowLink({ href, title, caption, value, icon }: { href: string; title: string; caption?: string; value?: string; icon?: ReactNode })`, `RowStatic({ title, caption }: { title: string; caption?: string })`, `PageHeader({ title, backHref, backOnMobileOnly }: { title: string; backHref: string; backOnMobileOnly?: boolean })`.
  - Server Actions: `createCategory(_: FormState, fd: FormData): Promise<FormState>` ("Categoria criada."), `renameCategory(_: FormState, fd: FormData): Promise<FormState>` ("Alterações salvas."), `deleteCategory(fd: FormData): Promise<void>` ("Categoria excluída."; falha → `/categorias/{id}?erro=1`). Nome repetido → erro no campo `Você já tem uma categoria com esse nome.`
  - `CategoryForm({ action, submitLabel, category }: { action: (s: FormState, fd: FormData) => Promise<FormState>; submitLabel: string; category?: { id: string; name: string } })`.
  - Rotas `/categorias`, `/categorias/nova`, `/categorias/[id]` ("Outros" não tem página de edição: volta para a lista).

- [ ] **Step 1: Testes que falham**

`src/ui/list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ListCard, ListRow, ListSection, RowLink, RowStatic } from './list'
import { PageHeader } from './page-header'

afterEach(() => cleanup())

test('linha com link mostra rótulo, valor e seta; linha fixa não é link', () => {
  render(
    <ListSection title="Seu dinheiro">
      <ListCard>
        <ListRow><RowLink href="/configuracoes/saldo-inicial" caption="Quanto você tinha ao começar" title="R$ 6.000,00" /></ListRow>
        <ListRow><RowLink href="/categorias" title="Categorias" value="11" /></ListRow>
        <ListRow><RowStatic caption="E-mail" title="ana@teste.iris.dev" /></ListRow>
      </ListCard>
    </ListSection>,
  )
  expect(screen.getByRole('region', { name: 'Seu dinheiro' })).toBeTruthy()
  const saldo = screen.getByRole('link', { name: /Quanto você tinha ao começar/ })
  expect(saldo.getAttribute('href')).toBe('/configuracoes/saldo-inicial')
  expect(saldo.textContent).toContain('R$ 6.000,00')
  expect(screen.getByRole('link', { name: /Categorias/ }).textContent).toContain('11')
  expect(screen.getByText('ana@teste.iris.dev').closest('a')).toBeNull()
})

test('cabeçalho tem título e Voltar; em páginas principais o Voltar some no desktop', () => {
  const { rerender } = render(<PageHeader title="Criar categoria" backHref="/categorias" />)
  expect(screen.getByRole('heading', { level: 1, name: 'Criar categoria' })).toBeTruthy()
  const back = screen.getByRole('link', { name: 'Voltar' })
  expect(back.getAttribute('href')).toBe('/categorias')
  expect(back.className).not.toContain('md:hidden')
  rerender(<PageHeader title="Configurações" backHref="/mais" backOnMobileOnly />)
  expect(screen.getByRole('link', { name: 'Voltar' }).className).toContain('md:hidden')
})
```

`src/features/categorias/category-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CategoryForm } from './category-form'

afterEach(() => cleanup())

test('criar: campo Nome com a dica da copy', () => {
  render(<CategoryForm action={vi.fn()} submitLabel="Criar categoria" />)
  const input = screen.getByLabelText('Nome')
  expect((input as HTMLInputElement).value).toBe('')
  expect(screen.getByText('Dê um nome que faça sentido para você.').id).toBe(input.getAttribute('aria-describedby'))
  expect(screen.getByRole('button', { name: 'Criar categoria' })).toBeTruthy()
  expect(document.querySelector('input[name="id"]')).toBeNull()
})

test('renomear: vem com o nome atual e o id escondido', () => {
  render(<CategoryForm action={vi.fn()} submitLabel="Salvar alterações" category={{ id: 'c1', name: 'Pet' }} />)
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Pet')
  expect((document.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('c1')
})
```

`src/features/categorias/actions.test.ts`:

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

const { createCategory, deleteCategory, renameCategory } = await import('./actions')

type Call = { op: string; id?: unknown; payload?: unknown }
const calls: Call[] = []

function fakeSupabase(s: {
  lastOrder?: number | null
  insertError?: { code: string } | null
  updateRows?: number
  updateError?: { code: string } | null
  rpcError?: { message: string } | null
}) {
  return {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: s.lastOrder == null ? [] : [{ sort_order: s.lastOrder }], error: null }),
        }),
      }),
      insert: async (payload: unknown) => {
        calls.push({ op: `insert:${table}`, payload })
        return { error: s.insertError ?? null }
      },
      update: (payload: unknown) => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            calls.push({ op: `update:${table}`, id, payload })
            if (s.updateError) return { data: null, error: s.updateError }
            return { data: Array.from({ length: s.updateRows ?? 1 }, () => ({ id })), error: null }
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, payload: args })
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
const DUPLICATE = 'Você já tem uma categoria com esse nome.'

beforeEach(() => {
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
})

describe('createCategory', () => {
  test('cria com o nome limpo, depois das outras, e avisa', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10 })
    const url = await redirectOf(createCategory({ status: 'idle' }, form({ name: '  Pet   Shop ' })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'insert:categories', payload: { user_id: 'u1', name: 'Pet Shop', sort_order: 11 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Categoria criada.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('nome repetido com outra grafia vira mensagem no campo (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10, insertError: { code: '23505' } })
    const state = await createCategory({ status: 'idle' }, form({ name: '  pet ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: DUPLICATE }, values: { name: '  pet ' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('nome vazio não chega ao banco', async () => {
    h.supabase = fakeSupabase({ lastOrder: 10 })
    const state = await createCategory({ status: 'idle' }, form({ name: '   ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' } })
    expect(calls).toEqual([])
  })

  test('primeira categoria própria de quem apagou todas as outras', async () => {
    h.supabase = fakeSupabase({ lastOrder: null })
    await redirectOf(createCategory({ status: 'idle' }, form({ name: 'Pet' })))
    expect(calls[0].payload).toMatchObject({ sort_order: 1 })
  })
})

describe('renameCategory', () => {
  test('renomeia e avisa', async () => {
    h.supabase = fakeSupabase({})
    const url = await redirectOf(renameCategory({ status: 'idle' }, form({ id: ID, name: 'Bichos' })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'update:categories', id: ID, payload: { name: 'Bichos' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
  })

  test('nome já usado vira mensagem no campo', async () => {
    h.supabase = fakeSupabase({ updateError: { code: '23505' } })
    const state = await renameCategory({ status: 'idle' }, form({ id: ID, name: 'MERCADO' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { name: DUPLICATE } })
  })

  test('categoria que a pessoa não vê (ou Outros) não muda', async () => {
    h.supabase = fakeSupabase({ updateRows: 0 })
    const state = await renameCategory({ status: 'idle' }, form({ id: ID, name: 'Bichos' }))
    expect(state).toMatchObject({ status: 'error', message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.' })
    const invalid = await renameCategory({ status: 'idle' }, form({ id: 'x', name: 'Bichos' }))
    expect(invalid).toMatchObject({ status: 'error' })
  })
})

describe('deleteCategory', () => {
  test('chama a função do banco que move os gastos para Outros', async () => {
    h.supabase = fakeSupabase({})
    const url = await redirectOf(deleteCategory(form({ id: ID })))
    expect(url).toBe('/categorias')
    expect(calls).toEqual([{ op: 'rpc:delete_category', payload: { p_category_id: ID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Categoria excluída.')
  })

  test('falha volta para a categoria com aviso de erro', async () => {
    h.supabase = fakeSupabase({ rpcError: { message: 'A categoria Outros não pode ser excluída.' } })
    expect(await redirectOf(deleteCategory(form({ id: ID })))).toBe(`/categorias/${ID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('id inválido volta para a lista sem chamar o banco', async () => {
    h.supabase = fakeSupabase({})
    expect(await redirectOf(deleteCategory(form({ id: 'x' })))).toBe('/categorias')
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/list.test.tsx src/features/categorias`
Expected: FAIL — `Failed to resolve import "./list"`, `"./page-header"`, `"./category-form"`, `"./actions"`.

- [ ] **Step 3: Implementação**

`src/ui/list.tsx`:

```tsx
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

function slug(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function ListSection({ title, children }: { title: string; children: ReactNode }) {
  const id = `secao-${slug(title)}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-sm font-semibold text-inactive">{title}</h2>
      {children}
    </section>
  )
}

export function ListCard({ children }: { children: ReactNode }) {
  return <ul className="rounded-card border border-line bg-card px-4 py-1">{children}</ul>
}

export function ListRow({ children }: { children: ReactNode }) {
  return <li className="border-b border-line last:border-b-0">{children}</li>
}

type RowLinkProps = { href: string; title: string; caption?: string; value?: string; icon?: ReactNode }

export function RowLink({ href, title, caption, value, icon }: RowLinkProps) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3.5 text-ink">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {caption && <span className="text-[13px] text-muted">{caption}</span>}
        <span className="truncate text-[15px]">{title}</span>
      </span>
      {value && <span className="text-sm text-muted">{value}</span>}
      <ChevronRight className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}

export function RowStatic({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-0.5 text-ink">
      {caption && <span className="text-[13px] text-muted">{caption}</span>}
      <span className="truncate text-[15px]">{title}</span>
    </div>
  )
}
```

`src/ui/page-header.tsx`:

```tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Props = { title: string; backHref: string; backOnMobileOnly?: boolean }

// Páginas principais (Categorias, Configurações) voltam para "Mais" no celular;
// no desktop o menu lateral já leva a elas, então o Voltar some.
export function PageHeader({ title, backHref, backOnMobileOnly = false }: Props) {
  return (
    <header className="flex items-center gap-2">
      <Link
        href={backHref}
        aria-label="Voltar"
        className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-sunken ${backOnMobileOnly ? 'md:hidden' : ''}`}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">{title}</h1>
    </header>
  )
}
```

`src/features/categorias/category-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/button'
import { FormAlert } from '@/ui/form-alert'
import { TextField } from '@/ui/text-field'
import { idle, type FormState } from '@/lib/forms'

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>
  submitLabel: string
  category?: { id: string; name: string }
}

export function CategoryForm({ action, submitLabel, category }: Props) {
  const [state, formAction, pending] = useActionState(action, idle)
  const err = state.status === 'error' ? state : null
  return (
    <form key={err ? err.submission : 'idle'} action={formAction} noValidate className="flex flex-col gap-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <TextField
        name="name"
        label="Nome"
        hint="Dê um nome que faça sentido para você."
        autoComplete="off"
        defaultValue={err?.values?.name ?? category?.name ?? ''}
        error={err?.fieldErrors?.name}
      />
      {err?.message && <FormAlert>{err.message}</FormAlert>}
      <Button type="submit" disabled={pending}>{submitLabel}</Button>
    </form>
  )
}
```

`src/features/categorias/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { DUPLICATE_CATEGORY, categoryNameSchema, isDuplicateNameError } from './names'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const categoryIdSchema = z.uuid()

// Nomes de categoria aparecem no Anotar, no Extrato e no Seu mês.
function refreshCategoryViews() {
  revalidatePath('/', 'layout')
}

export async function createCategory(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['name'] as const)
  const parsed = categoryNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { data: last, error: orderError } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  if (orderError) return errorState({ message: SAVE_FAILED, values })

  const { error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, name: parsed.data.name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
  if (isDuplicateNameError(error)) return errorState({ fieldErrors: { name: DUPLICATE_CATEGORY }, values })
  if (error) return errorState({ message: SAVE_FAILED, values })

  await setFlash('Categoria criada.')
  refreshCategoryViews()
  redirect('/categorias')
}

export async function renameCategory(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['name'] as const)
  const parsedId = categoryIdSchema.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const parsed = categoryNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').update({ name: parsed.data.name }).eq('id', parsedId.data).select('id')
  if (isDuplicateNameError(error)) return errorState({ fieldErrors: { name: DUPLICATE_CATEGORY }, values })
  if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })

  await setFlash('Alterações salvas.')
  refreshCategoryViews()
  redirect('/categorias')
}

export async function deleteCategory(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = categoryIdSchema.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/categorias')
  const id = parsedId.data
  const supabase = await createClient()
  // Atômico no banco: os gastos vão para "Outros" e a categoria some (RN-27).
  const { error } = await supabase.rpc('delete_category', { p_category_id: id })
  if (error) redirect(`/categorias/${id}?erro=1`)
  await setFlash('Categoria excluída.')
  refreshCategoryViews()
  redirect('/categorias')
}
```

`src/app/(app)/categorias/page.tsx`:

```tsx
import { loadCategories } from '@/features/registro/queries'
import { Button } from '@/ui/button'
import { ListCard, ListRow, RowLink, RowStatic } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'

export default async function CategoriasPage() {
  const categories = await loadCategories()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Para onde seu dinheiro vai" backHref="/mais" backOnMobileOnly />
      <p className="text-[15px]">Cada gasto vai para um lugar. Assim fica fácil enxergar o todo.</p>
      <ListCard>
        {categories.map((c) => (
          <ListRow key={c.id}>
            {/* "Outros" recebe os gastos de categorias excluídas: não é renomeada nem excluída. */}
            {c.defaultKey === 'outros' ? <RowStatic title={c.name} /> : <RowLink href={`/categorias/${c.id}`} title={c.name} />}
          </ListRow>
        ))}
      </ListCard>
      <Button href="/categorias/nova">Criar categoria</Button>
    </main>
  )
}
```

`src/app/(app)/categorias/nova/page.tsx`:

```tsx
import { createCategory } from '@/features/categorias/actions'
import { CategoryForm } from '@/features/categorias/category-form'
import { PageHeader } from '@/ui/page-header'

export default function NovaCategoriaPage() {
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Criar categoria" backHref="/categorias" />
      <CategoryForm action={createCategory} submitLabel="Criar categoria" />
    </main>
  )
}
```

`src/app/(app)/categorias/[id]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { deleteCategory, renameCategory } from '@/features/categorias/actions'
import { CategoryForm } from '@/features/categorias/category-form'
import { loadCategories } from '@/features/registro/queries'
import { ConfirmAction } from '@/ui/confirm'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }

export default async function CategoriaPage({ params, searchParams }: Props) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(id).success) notFound()
  const category = (await loadCategories()).find((c) => c.id === id)
  if (!category) notFound()
  if (category.defaultKey === 'outros') redirect('/categorias')

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title={category.name} backHref="/categorias" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <CategoryForm action={renameCategory} submitLabel="Salvar alterações" category={{ id: category.id, name: category.name }} />
      <ConfirmAction
        trigger="Excluir"
        triggerClassName="flex min-h-12 items-center justify-center rounded-panel border border-control bg-card px-5 text-base font-semibold text-ink hover:bg-canvas"
        title={`Excluir a categoria "${category.name}"?`}
        body={'Os gastos desta categoria vão para "Outros". Nada será apagado.'}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        action={deleteCategory}
        fields={{ id: category.id }}
      />
    </main>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npx vitest run src/ui src/features/categorias && npm run typecheck && npm run lint`
Expected: todos passando; tipos e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/ui/list.tsx src/ui/page-header.tsx src/ui/list.test.tsx src/features/categorias "src/app/(app)/categorias"
git commit -m "feat(categorias): criar, renomear e excluir levando os gastos para Outros" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Mais, Configurações e mudar senha

**Files:**
- Create: `src/features/auth/errors.ts`, `src/app/(app)/mais/page.tsx`, `src/app/(app)/configuracoes/page.tsx`, `src/app/(app)/configuracoes/nome/page.tsx`, `src/app/(app)/configuracoes/saldo-inicial/page.tsx`
- Modify: `src/features/auth/actions.ts` (`updatePassword`), `src/features/auth/forms.tsx` (`NewPasswordForm`), `src/app/(auth)/nova-senha/page.tsx`
- Test: `src/features/auth/errors.test.ts`, `src/features/auth/forms.test.tsx`

**Interfaces:**
- Consumes: `loadProfile()`, `updateInitialBalance`, `InitialBalanceForm`, `NameForm` (Task 14); `centsToInput` (Task 11); `formatBRL`; `ListSection`, `ListCard`, `ListRow`, `RowLink`, `RowStatic`, `PageHeader` (Task 16); `SignOutButton` (Task 8); `setFlash`.
- Produces:
  - `passwordUpdateMessage(code: string | undefined): string` — `reauthentication_needed` → "Por segurança, saia e entre de novo antes de mudar a senha."; `same_password` → "Essa já é a sua senha. Escolha uma diferente."; outros → "Algo não saiu como esperado do nosso lado. Tente novamente em instantes."
  - `updatePassword` usa essa mensagem; com `from=configuracoes` no formulário, aviso "Alterações salvas." e volta para `/configuracoes`.
  - `NewPasswordForm({ from }: { from?: 'configuracoes' })`.
  - `/nova-senha?de=configuracoes` mostra "Voltar" para `/configuracoes`.
  - Rotas `/mais`, `/configuracoes`, `/configuracoes/nome`, `/configuracoes/saldo-inicial`.

- [ ] **Step 1: Testes que falham**

`src/features/auth/errors.test.ts`:

```ts
import { expect, test } from 'vitest'
import { passwordUpdateMessage } from './errors'

test('sessão antiga pede para entrar de novo, com instrução clara (Review Focus 5)', () => {
  expect(passwordUpdateMessage('reauthentication_needed')).toBe('Por segurança, saia e entre de novo antes de mudar a senha.')
})

test('senha igual à atual', () => {
  expect(passwordUpdateMessage('same_password')).toBe('Essa já é a sua senha. Escolha uma diferente.')
})

test('qualquer outro erro usa a mensagem geral', () => {
  expect(passwordUpdateMessage('unexpected_failure')).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  expect(passwordUpdateMessage(undefined)).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
})
```

`src/features/auth/forms.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  signUp: vi.fn(), signIn: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(),
}))

const { NewPasswordForm } = await import('./forms')

afterEach(() => cleanup())

test('vindo de Configurações, o formulário avisa de onde veio', () => {
  render(<NewPasswordForm from="configuracoes" />)
  expect((document.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement).value).toBe('configuracoes')
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeTruthy()
})

test('pelo link do e-mail, não há campo de origem', () => {
  render(<NewPasswordForm />)
  expect(document.querySelector('input[name="from"]')).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/auth`
Expected: FAIL — `Failed to resolve import "./errors"`; no formulário, `Cannot read properties of null (reading 'value')`.

- [ ] **Step 3: Implementação**

`src/features/auth/errors.ts`:

```ts
export const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'

// Com secure_password_change ligado (supabase/config.toml), trocar a senha
// exige login recente; o Supabase responde "reauthentication_needed".
export function passwordUpdateMessage(code: string | undefined): string {
  if (code === 'reauthentication_needed') return 'Por segurança, saia e entre de novo antes de mudar a senha.'
  if (code === 'same_password') return 'Essa já é a sua senha. Escolha uma diferente.'
  return UNEXPECTED
}
```

Em `src/features/auth/actions.ts`:

Trocar os imports do topo:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { newPasswordSchema, resetSchema, signInSchema, signUpSchema } from './schemas'

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
```

por:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { setFlash } from '@/lib/flash'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { UNEXPECTED, passwordUpdateMessage } from './errors'
import { newPasswordSchema, resetSchema, signInSchema, signUpSchema } from './schemas'
```

e trocar a função `updatePassword` inteira por:

```ts
export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(readFields(fd, ['password'] as const))
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error) })
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return errorState({ message: passwordUpdateMessage(error.code) })
  if (fd.get('from') === 'configuracoes') {
    await setFlash('Alterações salvas.')
    redirect('/configuracoes')
  }
  redirect('/inicio')
}
```

Em `src/features/auth/forms.tsx`, trocar a função `NewPasswordForm` inteira por:

```tsx
export function NewPasswordForm({ from }: { from?: 'configuracoes' }) {
  const f = useForm(updatePassword)
  return (
    <form key={f.key} action={f.formAction} noValidate className="flex flex-col gap-4">
      {from && <input type="hidden" name="from" value={from} />}
      <TextField name="password" type="password" label="Crie uma senha" autoComplete="new-password" hint="Pelo menos 8 caracteres." error={f.errors.password} />
      {f.message && <FormAlert>{f.message}</FormAlert>}
      <Button type="submit" disabled={f.pending}>Salvar nova senha</Button>
    </form>
  )
}
```

`src/app/(auth)/nova-senha/page.tsx`:

```tsx
import Link from 'next/link'
import { NewPasswordForm } from '@/features/auth/forms'

export default async function NovaSenhaPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams
  const fromSettings = de === 'configuracoes'
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Crie uma nova senha.</h1>
      <NewPasswordForm from={fromSettings ? 'configuracoes' : undefined} />
      {fromSettings && (
        <Link href="/configuracoes" className="flex min-h-11 items-center justify-center font-medium text-brand-text">Voltar</Link>
      )}
    </>
  )
}
```

`src/app/(app)/mais/page.tsx`:

```tsx
import { SlidersHorizontal, Tag } from 'lucide-react'
import { loadProfile } from '@/features/perfil/queries'
import { SignOutButton } from '@/features/shell/sign-out-button'
import { ListCard, ListRow, RowLink } from '@/ui/list'

// Itens que ainda não existem (Contas, Cartões, Planejamento, Relatórios, Família)
// entram aqui nos planos 3 a 7; nada de link para tela que não existe.
export default async function MaisPage() {
  const profile = await loadProfile()
  const initial = profile.displayName.trim().charAt(0).toUpperCase()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex items-center gap-3 pb-1">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-ink">{initial}</span>
        <h1 className="text-lg font-semibold text-ink">{profile.displayName}</h1>
      </header>
      <nav aria-label="Mais opções">
        <ListCard>
          <ListRow><RowLink href="/categorias" title="Categorias" icon={<Tag className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
        </ListCard>
      </nav>
      <ListCard>
        <ListRow><RowLink href="/configuracoes" title="Configurações" icon={<SlidersHorizontal className="size-5" strokeWidth={1.8} aria-hidden="true" />} /></ListRow>
        <ListRow><SignOutButton variant="row" /></ListRow>
      </ListCard>
    </main>
  )
}
```

`src/app/(app)/configuracoes/page.tsx`:

```tsx
import { formatBRL } from '@/domain/money'
import { loadProfile } from '@/features/perfil/queries'
import { ListCard, ListRow, ListSection, RowLink, RowStatic } from '@/ui/list'
import { PageHeader } from '@/ui/page-header'

// Seções que chegam depois: Cartões (Plano 4), Lembretes e App (Plano 8),
// Seus dados e troca de e-mail (Plano 9).
export default async function ConfiguracoesPage() {
  const p = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-[18px] px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Configurações" backHref="/mais" backOnMobileOnly />
      <ListSection title="Seu cadastro">
        <ListCard>
          <ListRow><RowLink href="/configuracoes/nome" caption="Nome" title={p.displayName} /></ListRow>
          <ListRow><RowStatic caption="E-mail" title={p.email} /></ListRow>
          <ListRow><RowLink href="/nova-senha?de=configuracoes" title="Mudar senha" /></ListRow>
        </ListCard>
      </ListSection>
      <ListSection title="Seu dinheiro">
        <ListCard>
          <ListRow><RowLink href="/configuracoes/saldo-inicial" caption="Quanto você tinha ao começar" title={formatBRL(p.initialBalanceCents)} /></ListRow>
          <ListRow><RowLink href="/categorias" title="Categorias" value={String(p.categoriesCount)} /></ListRow>
        </ListCard>
      </ListSection>
    </main>
  )
}
```

`src/app/(app)/configuracoes/nome/page.tsx`:

```tsx
import { loadProfile } from '@/features/perfil/queries'
import { NameForm } from '@/features/perfil/forms'
import { PageHeader } from '@/ui/page-header'

export default async function NomePage() {
  const profile = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Nome" backHref="/configuracoes" />
      <NameForm defaultValue={profile.displayName} />
    </main>
  )
}
```

`src/app/(app)/configuracoes/saldo-inicial/page.tsx`:

```tsx
import { loadProfile } from '@/features/perfil/queries'
import { updateInitialBalance } from '@/features/perfil/actions'
import { InitialBalanceForm } from '@/features/perfil/forms'
import { centsToInput } from '@/features/registro/form-values'
import { PageHeader } from '@/ui/page-header'

export default async function SaldoInicialPage() {
  const profile = await loadProfile()
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Quanto você tinha ao começar" backHref="/configuracoes" />
      <p className="text-[15px]">É o ponto de partida do seu Saldo total.</p>
      <InitialBalanceForm action={updateInitialBalance} submitLabel="Salvar alterações" defaultValue={centsToInput(profile.initialBalanceCents)} />
    </main>
  )
}
```

- [ ] **Step 4: Rodar e passar**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: toda a suíte unitária passando; tipos, lint e build sem erros (`/mais`, `/configuracoes`, `/configuracoes/nome`, `/configuracoes/saldo-inicial` no resumo).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth "src/app/(auth)/nova-senha/page.tsx" "src/app/(app)/mais" "src/app/(app)/configuracoes"
git commit -m "feat(configuracoes): Mais, Configurações, nome, saldo inicial e mudar senha" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Ponta a ponta, verificação completa e registro

**Files:**
- Modify: `tests/e2e/nucleo.spec.ts`, `docs/progresso.md`, `docs/decisoes-para-revisao.md`
- Create: `tests/e2e/plano2.spec.ts`

**Interfaces:**
- Consumes: todas as rotas deste plano; `SUPABASE_SECRET_KEY` (só para criar/apagar pessoas de teste e preparar registros); `todayInSaoPaulo`, `addMonths`, `monthOf` (`src/domain/dates`).

- [ ] **Step 1: Ajustar o teste do Plano 1** — substituir `tests/e2e/nucleo.spec.ts` por:

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
// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)

// Cada projeto (celular, desktop) roda este arquivo em separado: cada um cria o seu usuário de login.
// A usuária de login já concluiu o onboarding (o fluxo de boas-vindas é testado em plano2.spec.ts).
test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail, password, email_confirm: true, user_metadata: { display_name: 'Bia' },
  })
  if (error) throw error
  loginUserId = data.user.id
  const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', loginUserId)
  if (e2) throw e2
})

test.afterAll(async () => {
  if (loginUserId) await admin.auth.admin.deleteUser(loginUserId)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const signup = data.users.find((u) => u.email === signupEmail)
    if (signup) {
      await admin.auth.admin.deleteUser(signup.id)
      break
    }
    if (data.users.length < 1000) break
    page += 1
  }
})

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(loginEmail)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Oi, Bia.' })).toBeVisible()
}

test('criar cadastro, passar pelo onboarding, anotar gasto e entrada, ver o mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'O cadastro roda uma vez; o desktop é verificado no teste seguinte.')

  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar$/)

  await page.goto('/criar-cadastro')
  await page.getByLabel('Como podemos te chamar?').fill('Camila')
  await page.getByLabel('Seu e-mail').fill(signupEmail)
  await page.getByLabel('Crie uma senha').fill(password)
  await page.getByRole('button', { name: 'Criar meu cadastro' }).click()

  await expect(page.getByRole('heading', { name: 'Aqui, tudo começa com um gasto.' })).toBeVisible()
  await page.getByRole('link', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Quanto você tem hoje?' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  await page.getByRole('link', { name: 'Depois' }).click()

  await expect(page.getByRole('heading', { name: 'Oi, Camila.' })).toBeVisible()
  await expect(page.getByText('Seu mês começa aqui.', { exact: false })).toBeVisible()

  await page.getByRole('link', { name: 'Anotar primeiro gasto' }).click()
  await page.getByLabel('Quanto foi?').fill('142,30')
  await page.getByRole('radio', { name: 'Mercado' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar gasto' }).click()

  await expect(page.getByRole('status')).toHaveText('Anotado. Seu mês já está atualizado.')
  await expect(page.getByTestId('disponivel')).toHaveText(`−R$${NBSP}142,30`)
  await expect(page.getByText('Seu maior gasto foi com')).toContainText('Mercado')

  await page.goto('/anotar?tipo=entrada')
  await page.getByLabel('Quanto entrou?').fill('5.000')
  await page.getByRole('radio', { name: 'Salário' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar entrada' }).click()

  await expect(page.getByRole('status')).toHaveText(`Anotado. Mais R$${NBSP}5.000,00 no seu mês.`)
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}4.857,70`)
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
  const menu = page.getByRole('complementary')
  await expect(menu.getByRole('link', { name: 'Seu mês' })).toHaveAttribute('aria-current', 'page')
  await expect(menu.getByRole('link', { name: 'Extrato' })).toBeVisible()
  await expect(page.getByTestId('disponivel')).toBeVisible()
})
```


- [ ] **Step 2: Testes do Plano 2** — `tests/e2e/plano2.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)

async function makeUser(name: string, opts: { onboarded: boolean }): Promise<{ id: string; email: string }> {
  const email = `e2e-p2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  if (opts.onboarded) {
    const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
    if (e2) throw e2
  }
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

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
})

test('onboarding: quem parou no meio volta a ele; quem concluiu não vê de novo', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi', { onboarded: false })
  await entrar(page, u.email)

  await expect(page).toHaveURL(/\/boas-vindas$/)
  await expect(page.getByRole('heading', { name: 'Aqui, tudo começa com um gasto.' })).toBeVisible()
  await page.getByRole('link', { name: 'Próximo' }).click()
  await expect(page.getByRole('heading', { name: 'Veja para onde seu dinheiro vai.' })).toBeVisible()

  // Fechou o app no passo 2: qualquer tela do app leva de volta ao onboarding (Review Focus 3).
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/boas-vindas$/)

  await page.goto('/boas-vindas?passo=3')
  await expect(page.getByRole('heading', { name: 'No seu ritmo.' })).toBeVisible()
  await page.getByRole('link', { name: 'Começar' }).click()
  await expect(page.getByRole('heading', { name: 'Quanto você tem hoje?' })).toBeVisible()
  await page.getByLabel('Somando banco, carteira e dinheiro guardado').fill('6.000')
  await page.getByRole('button', { name: 'Salvar e continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  await page.getByRole('link', { name: 'Depois' }).click()
  await expect(page.getByRole('heading', { name: 'Oi, Davi.' })).toBeVisible()
  await expect(page.getByText('Saldo total', { exact: true }).locator('..')).toContainText(`R$${NBSP}6.000,00`)

  await page.goto('/boas-vindas')
  await expect(page).toHaveURL(/\/inicio$/)
})

test('onboarding pulável: Pular leva ao primeiro gasto e "Anotar agora" abre o Anotar', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Eva', { onboarded: false })
  await entrar(page, u.email)
  await page.getByRole('link', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Quanto você tem hoje?' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  await page.getByRole('link', { name: 'Anotar agora' }).click()
  await expect(page.getByLabel('Quanto foi?')).toBeVisible()
})

test('extrato: busca, filtro, editar (inclusive mudando de mês) e excluir', async ({ page }) => {
  const u = await makeUser('Gil', { onboarded: true })
  const today = todayInSaoPaulo()
  const prevMonth = addMonths(monthOf(today), -1)
  const mercado = await categoryOf(u.id, 'mercado')
  const saude = await categoryOf(u.id, 'saude')
  await addTx(u.id, { kind: 'expense', amount_cents: 14230, category_id: mercado, note: 'feira', payment_method: 'pix', occurred_on: today })
  await addTx(u.id, { kind: 'expense', amount_cents: 8100, category_id: saude, occurred_on: today })
  await addTx(u.id, { kind: 'income', amount_cents: 500000, source: 'Salário', occurred_on: today })

  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Gil.' })).toBeVisible()
  await page.getByRole('link', { name: 'Extrato', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tudo o que entrou e saiu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Buscar' })
  await search.fill('saude')
  await search.press('Enter')
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('142,3')
  await page.getByRole('searchbox', { name: 'Buscar' }).press('Enter')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('xyz')
  await page.getByRole('searchbox', { name: 'Buscar' }).press('Enter')
  await expect(page.getByText('Nada encontrado para "xyz". Tente outra palavra ou um valor.')).toBeVisible()

  await page.goto('/extrato')
  await page.getByRole('link', { name: 'Entradas' }).click()
  await expect(page.getByRole('link', { name: /Salário/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.goto('/extrato')
  await page.getByRole('link', { name: /Mercado · feira/ }).click()
  await expect(page.getByRole('heading', { name: 'Editar gasto' })).toBeVisible()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('142,30')
  await page.getByLabel('Quanto foi?').fill('150')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toContainText(`R$${NBSP}150,00`)

  // Review Focus 2: a data vai para o mês anterior; o registro aparece lá e sai do mês atual.
  await page.getByRole('link', { name: /Mercado · feira/ }).click()
  await page.getByRole('radio', { name: 'Outro dia' }).check({ force: true })
  await page.getByLabel('Dia').fill(`${prevMonth}-15`)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page).toHaveURL(new RegExp(`/extrato\\?mes=${prevMonth}$`))
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toBeVisible()
  await page.goto('/extrato')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Saúde.*81,00/ }).click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  await expect(dialog).toContainText('Seu mês será recalculado.')
  await dialog.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByRole('status')).toHaveText('Excluído. Seu mês já está atualizado.')
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toHaveCount(0)
})

test('fechar o Anotar com algo digitado pergunta antes de descartar', async ({ page }) => {
  const u = await makeUser('Hugo', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Hugo.' })).toBeVisible()
  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('25')
  await page.getByRole('link', { name: 'Fechar' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Descartar este registro?' })
  await expect(dialog).toContainText('O que você digitou não será salvo.')
  await dialog.getByRole('button', { name: 'Continuar editando' }).click()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('25')
  await page.getByRole('link', { name: 'Fechar' }).click()
  await page.getByRole('alertdialog').getByRole('link', { name: 'Descartar' }).click()
  await expect(page).toHaveURL(/\/inicio$/)
})

test('categorias: criar, nome repetido, renomear e excluir levando os gastos para Outros', async ({ page }) => {
  const u = await makeUser('Iara', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Iara.' })).toBeVisible()

  await page.goto('/categorias')
  await expect(page.getByRole('heading', { name: 'Para onde seu dinheiro vai' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Outros' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Criar categoria' }).click()
  await page.getByLabel('Nome').fill('Pet')
  await page.getByRole('button', { name: 'Criar categoria' }).click()
  await expect(page.getByRole('status')).toHaveText('Categoria criada.')

  // Review Focus 4: outra grafia do mesmo nome.
  await page.getByRole('link', { name: 'Criar categoria' }).click()
  await page.getByLabel('Nome').fill('  pet ')
  await page.getByRole('button', { name: 'Criar categoria' }).click()
  await expect(page.getByText('Você já tem uma categoria com esse nome.')).toBeVisible()
  await expect(page.getByLabel('Nome')).toHaveValue('  pet ')

  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('30')
  await page.getByRole('radio', { name: 'Pet' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar gasto' }).click()
  await expect(page.getByRole('status')).toHaveText('Anotado. Seu mês já está atualizado.')

  await page.goto('/categorias')
  await page.getByRole('link', { name: 'Pet' }).click()
  await page.getByLabel('Nome').fill('Bichos')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.getByRole('link', { name: 'Bichos' }).click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir a categoria "Bichos"?' })
  await expect(dialog).toContainText('Os gastos desta categoria vão para "Outros". Nada será apagado.')
  await dialog.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByRole('status')).toHaveText('Categoria excluída.')
  await expect(page.getByRole('link', { name: 'Bichos' })).toHaveCount(0)

  await page.goto('/extrato')
  await expect(page.getByRole('link', { name: /Outros.*30,00/ })).toContainText(`R$${NBSP}30,00`)
})

test('configurações: nome, saldo inicial e sair com confirmação', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'Usa a barra inferior (Mais).')
  const u = await makeUser('Joana', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Joana.' })).toBeVisible()

  await page.getByRole('link', { name: 'Mais' }).click()
  await page.getByRole('link', { name: 'Configurações' }).click()
  await expect(page.getByText(u.email)).toBeVisible()

  await page.getByRole('link', { name: /Nome/ }).click()
  await page.getByLabel('Como podemos te chamar?').fill('Jo')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.getByRole('link', { name: /Quanto você tinha ao começar/ }).click()
  await page.getByLabel('Somando banco, carteira e dinheiro guardado').fill('1.500,50')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.goto('/inicio')
  await expect(page.getByRole('heading', { name: 'Oi, Jo.' })).toBeVisible()
  await expect(page.getByText('Saldo total', { exact: true }).locator('..')).toContainText(`R$${NBSP}1.500,50`)

  await page.goto('/mais')
  await page.getByRole('button', { name: 'Sair da Íris' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Sair da Íris?' })
  await expect(dialog).toContainText('Seus dados continuam salvos.')
  await dialog.getByRole('button', { name: 'Ficar' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sair da Íris' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
})
```


- [ ] **Step 3: Rodar e ajustar até passar**

Run: `npx supabase db reset && npm run test:e2e`
Expected: `nucleo.spec.ts` 3 testes (2 no celular, 1 no desktop) e `plano2.spec.ts` 9 execuções (celular: 6; desktop: 3 — extrato, fechar com confirmação e categorias; os demais são pulados no desktop). Se falhar, corrigir o código da tarefa responsável — nunca o teste — e registrar a causa no commit. Sem Docker: registrar como pendente em `docs/progresso.md`.

- [ ] **Step 4: Verificação completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e && npm run build`
Expected: tudo verde.

- [ ] **Step 5: Registrar progresso e decisões** — em `docs/progresso.md`, acrescentar ao fim:

```markdown

## Plano 2 — Extrato, onboarding e ajustes básicos · concluído em {data}

**Entregue**
- Onboarding pulável: 3 telas, "Quanto você tem hoje?" (saldo inicial), convite para o primeiro gasto. Quem não concluiu volta a ele ao abrir o app.
- Extrato: tudo o que entrou e saiu, por dia, com busca (nome, nota, origem, forma de pagamento e valor, sem acento) e filtros Entradas, Gastos, Categoria e mês.
- Editar e excluir registros (com confirmação); fechar o Anotar com algo digitado pergunta antes de descartar.
- Categorias: criar, renomear, excluir levando os gastos para "Outros"; nome sem repetição (maiúsculas e espaços não contam).
- Mais e Configurações: nome, e-mail, mudar senha, saldo inicial, categorias, sair com confirmação.
- Pendências do Plano 1 resolvidas: aviso some em 4 s mesmo trocando de página; teste do setFlash; sem faixa vazia sob o Anotar; campo de data da entrada limitado a hoje.

**Testes**
- Unitários e de componentes: {n} passando. Tipos, lint e build sem erros.
- Banco ({n} testes) e ponta a ponta ({n} execuções): {rodados | pendentes do Docker}.
```

Em `docs/decisoes-para-revisao.md`, acrescentar antes de `## Textos novos usados (fora da copy oficial)`:

```markdown
## Plano 2

| # | Decisão | Motivo |
|---|---|---|
| 12 | Barra inferior com 4 itens até existir Metas: Seu mês · Extrato · Anotar · Mais. Metas entra no Plano 5. | Não mostrar botão que leva a tela vazia. |
| 13 | Menu lateral lista as áreas diretamente (Seu mês, Extrato, Categorias, Configurações); "Mais" é só do celular. | No desktop há espaço; o "Mais" existe para caber na barra do celular. |
| 14 | Onboarding "concluído" = salvou ou pulou "Quanto você tem hoje?". Quem para antes volta às boas-vindas ao abrir o app; quem concluiu nunca volta. Cadastros anteriores ao Plano 2 contam como concluídos. | Garante que ninguém caia no Seu mês sem ter visto o saldo inicial, sem prender quem já usa. |
| 15 | Saldo inicial em branco vale R$ 0,00; valor negativo não é aceito nesta versão. | É opcional; negativo pede texto próprio (dívida), que não está na copy. |
| 16 | Período do Extrato = mês, com as mesmas setas do Seu mês; a busca vale dentro do mês escolhido. | Coerente com o "Seu mês"; evita misturar meses sem aviso. |
| 17 | Busca por valor aceita parte do número ("142" encontra R$ 142,30), com ou sem milhar, vírgula, ponto ou "R$". | É como a pessoa lembra do valor. |
| 18 | Tocar num registro abre a edição (o mesmo formulário do Anotar); "Excluir" fica dentro da edição, com confirmação. | Um toque a menos que um menu de ações; excluir sempre confirmado. |
| 19 | Depois de editar, a tela volta ao Extrato no mês do registro — se a data mudou de mês, no mês novo. | A pessoa vê onde o registro foi parar. |
| 20 | "Outros" não pode ser renomeada (nem excluída) e fica sempre por último; categorias padrão podem ser renomeadas e excluídas. | A confirmação diz 'vão para "Outros"'; o nome precisa continuar verdadeiro. |
| 21 | Nomes de categoria não diferenciam maiúsculas nem espaços extras; acentos diferenciam ("Saude" ≠ "Saúde"). | Evita duplicatas óbvias sem instalar extensão de acentos no banco. |
| 22 | E-mail aparece em Configurações só para leitura; trocar e-mail fica para o Plano 9. | Trocar e-mail exige confirmação por e-mail (SMTP próprio, Plano 8/9). |
| 23 | "Mudar senha" usa a tela "Crie uma nova senha."; com login antigo, a Íris pede para sair e entrar de novo. | O Supabase exige login recente para trocar senha (decisão 9). |
| 24 | "Sair da Íris?" pede confirmação também no menu lateral do desktop. | Mesmo comportamento em todo lugar. |
| 25 | Fechar Anotar/Editar com algo digitado pergunta "Descartar este registro?". | Evita perder o que foi digitado por um toque sem querer. |
```

e acrescentar ao fim da seção "Textos novos usados (fora da copy oficial)" a linha:

```markdown
Plano 2: ver a seção "Textos novos" do plano `docs/superpowers/plans/2026-09-25-iris-plano-2-extrato-onboarding.md`.
```

Preencher `{data}` e `{n}` com os valores reais da execução.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/nucleo.spec.ts tests/e2e/plano2.spec.ts docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "test(e2e): onboarding, extrato, categorias e configurações; progresso do Plano 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rodar localmente

1. Docker em execução; `npx supabase start` e `.env.local` preenchido (ver `.env.example`).
2. `npx supabase db reset` — aplica `20260922000001_nucleo.sql` e `20260925000001_categorias_e_onboarding.sql`.
3. `npm run dev` → http://localhost:3000

## Testes

- `npm test` — regras, formulários, ações (com Supabase simulado) e componentes
- `npm run test:db` — privacidade, categorias e onboarding no banco (usa `SUPABASE_SECRET_KEY`)
- `npm run test:e2e` — fluxos no navegador (celular e desktop)

---

## Autorrevisão do plano

**Cobertura do escopo**

| Pedido | Onde |
|---|---|
| Pendência: prazo do aviso sobrevive à troca de rota + teste com relógio falso | Task 1 |
| Pendência: teste que exercita o `setFlash` | Task 2 |
| Pendência: sem faixa vazia sob o Anotar no celular | Task 3 (MainFrame + `isSheetRoute`) |
| Pendência: campo de data da entrada com `max` = hoje | Task 4 (e mantido na Task 11) |
| RF-36/37 Extrato agrupado por dia (data efetiva), busca (nome, nota, origem, categoria, valor), filtros Entradas · Gastos · Categoria · Período (mês) | Tasks 9–10 |
| RF-13 editar (formulário do Anotar em modo edição) e excluir com a confirmação aprovada | Tasks 11, 13 |
| Estados vazio e sem resultado do Extrato | Tasks 9–10 |
| "Extrato" na barra inferior e no menu lateral | Task 8 |
| RF-05 três telas puláveis; RF-06 saldo inicial opcional; RF-09 primeiro gasto; `onboarded_at`; como o app encaminha quem não concluiu | Tasks 5, 14, 15 |
| RF-07 instalar — fora (Plano 8), documentado | Task 15 (Interfaces), tabela de "Mais" |
| RF-51 nome, e-mail (só leitura), senha, saldo inicial; Mais e Configurações sem links mortos | Tasks 14, 17 |
| RF-19/20 categorias: listar, criar, renomear (padrão também), excluir com RN-27 atômico; "Outros" protegida; nome único sem caixa/espaços | Tasks 5, 6, 16 |
| Navegação com 4 itens até Metas; menu lateral com as áreas existentes | Task 8 |
| Migração nova (sem editar a do Plano 1), RLS preservada, testes de banco para cada regra nova | Task 5 |
| Testes unitários, de componente e ponta a ponta | Todas; Task 18 |
| Textos fora da copy listados | Seção "Textos novos" |

**Busca por marcadores proibidos:** nenhum "TBD", "a definir", "similar à Task N" ou passo de código sem código. Os únicos marcadores são `{data}` e `{n}` no texto de `docs/progresso.md` (Task 18, Step 5), que são valores da execução, não código.

**Consistência de tipos e nomes** (conferida entre tarefas): `isSheetRoute` (Tasks 3, 8); `ConfirmPanel`/`ConfirmAction` (7 → 8, 12, 13, 16); `PAYMENT_LABELS` (9 → 11); `ExtratoFilters`/`extratoParams`/`extratoHref` (9 → 10); `EditableRecord`/`centsToInput` (11 → 13, 17); `updateTransaction` stub (11) substituído pela versão real (13) com a mesma assinatura; `loadProfile`/`ProfileDetails` (14 → 15, 17); `InitialBalanceForm` (14 → 15, 17); `needsOnboarding` (15); `categoryNameSchema`/`DUPLICATE_CATEGORY`/`isDuplicateNameError`/`orderCategories` (6 → 13, 16); `delete_category(p_category_id uuid)` (5 → 16); `SignOutButton` (8 → 17); `ListSection`/`ListCard`/`ListRow`/`RowLink`/`RowStatic`/`PageHeader` (16 → 17). `Category` continua `{ id, name, defaultKey }` (a ordem é aplicada antes do mapeamento, sem mudar o tipo).

**Review Focus → testes:** 1 → Task 9 (`busca (Review Focus 1)`); 2 → Task 13 (`gasto movido para o mês anterior…`) e Task 18; 3 → Task 15 (`gate.test.ts`) e Task 18; 4 → Tasks 5, 6 e 16 (`nome repetido com outra grafia…`) e Task 18; 5 → Task 17 (`errors.test.ts`).

**Ajustes feitos nesta revisão:** o `MonthNav` monta o endereço com `mes` primeiro (os links do Seu mês ficam iguais aos do Plano 1); a desestruturação com variável sem uso na página do Extrato foi trocada por um filtro; o teste do filtro de categoria passou a ler o `<summary>` diretamente; o painel de edição fecha para o mês da **data efetiva** (`paid_on ?? occurred_on`); `updateTransaction` lê o tipo do banco, não do formulário (teste próprio); valores em reais nos testes usam a constante `NBSP = String.fromCharCode(0xa0)` (o espaço não separável de `formatBRL`) em vez de um caractere invisível no código; seletores de ponta a ponta que poderiam casar com a lista de categorias do filtro passaram a incluir o valor (`/Saúde.*81,00/`, `/Outros.*30,00/`); contagens esperadas conferidas (Task 14: 12 testes; e2e do Plano 2: 9 execuções).

---

## Conflitos encontrados na especificação

1. **Protótipo do Extrato × roteiro:** o protótipo mostra o chip "Cartão" e não mostra "Período"; a copy lista "Período" e o filtro por cartão é do Plano 4 (RF-60). Aqui: sem "Cartão"; Período = seletor de mês.
2. **Protótipo "Mais" × terminologia:** o segundo grupo usa `aria-label="Conta"` — proibido ("conta" é só conta a pagar). Não foi usado.
3. **Texto aprovado "Somando banco, carteira e dinheiro guardado" × terminologia:** "conta" aqui é conta bancária. Mantido por ser texto já aprovado; fica para sua revisão.
4. **RF-51 (editar e-mail) × escopo deste plano (e-mail só leitura):** troca de e-mail adiada para o Plano 9.
5. **Protótipo SaldoInicial:** "Pular" e "Salvar e continuar" levam a "Instalar" (Plano 8); aqui levam direto ao primeiro gasto.
6. **Copy só tem "Excluir este gasto?":** a exclusão de entrada precisou de texto novo.
7. **A5 (barra com Metas) × roteiro (Metas no Plano 5):** barra com 4 itens até lá.
8. **RN-27 × "Outros" renomeável:** a especificação não dizia; renomear "Outros" tornaria falso o texto aprovado da confirmação, então foi bloqueado.

---

## Decisões tomadas neste plano

| # | Decisão | Motivo |
|---|---|---|
| 1 | Barra inferior: Seu mês · Extrato · Anotar · Mais (4 itens) até o Plano 5 trazer Metas. | Nenhum botão leva a tela vazia. |
| 2 | Menu lateral (desktop): Seu mês, Extrato, Categorias, Configurações; sem "Mais". | Desktop tem espaço; "Mais" existe por causa da barra do celular. |
| 3 | O layout do app manda para `/boas-vindas` quem tem `onboarded_at` nulo; concluir = salvar ou pular o saldo inicial; cadastros anteriores ao Plano 2 ficam como concluídos (migração). | Um só ponto de controle, que vale para e-mail, Google e quem parou no meio. |
| 4 | Telas de boas-vindas com endereço próprio (`?passo=1..3`), funcionando sem JavaScript; voltar do navegador funciona; `/boas-vindas` depois de concluir leva ao Seu mês. | Simples, testável e acessível. |
| 5 | Saldo inicial vazio = R$ 0,00; negativo recusado com a mensagem de valor já existente. | Opcional por definição; negativo pediria copy nova. |
| 6 | Extrato: período = mês (setas); busca e filtros valem dentro do mês. | Mesmo modelo mental do Seu mês. |
| 7 | Busca sem acento/maiúsculas; várias palavras precisam todas aparecer; valor encontra por parte do número. | "saude", "mercado pix", "142" funcionam como a pessoa espera. |
| 8 | Registros pendentes (contas a pagar/receber) não aparecem no Extrato nem são editáveis por ele até o Plano 3. | Eles têm tela e regras próprias (RN-11/12). |
| 9 | Tocar no registro abre a edição; "Excluir" dentro dela, com confirmação; depois de salvar ou excluir, volta ao mês do registro. | Menos toques; a pessoa vê o resultado. |
| 10 | O tipo (gasto/entrada) não muda na edição; o servidor usa o tipo gravado. | Mudar o tipo apagaria categoria ou origem; é mais claro excluir e anotar de novo. |
| 11 | "Descartar este registro?" ao fechar Anotar/Editar com algo digitado. | Texto aprovado da copy; evita perda acidental. |
| 12 | "Outros" não pode ser renomeada nem excluída e fica sempre por último; as demais padrão podem ser renomeadas e excluídas. | Mantém verdadeiro o texto de exclusão; RF-20. |
| 13 | Nome de categoria: sem diferenciar maiúsculas e espaços extras; acentos diferenciam; até 40 caracteres; categoria nova entra antes de "Outros". | Evita duplicatas sem extensão de banco. |
| 14 | E-mail só leitura; troca de e-mail no Plano 9. | Exige confirmação por e-mail. |
| 15 | "Mudar senha" reaproveita `/nova-senha` (com Voltar e aviso "Alterações salvas." quando vem de Configurações); login antigo recebe instrução clara. | Reuso da tela aprovada; regra de segurança do Supabase. |
| 16 | "Sair da Íris?" com confirmação no celular e no desktop. | Consistência. |

## Textos novos

Fora da copy oficial e dos textos já aprovados; precisam da sua aprovação:

- Edição: "Editar gasto" · "Editar entrada" · "Salvar alterações"
- Excluir entrada: "Excluir esta entrada?" (o corpo "Seu mês será recalculado." é da copy)
- Depois de excluir: "Excluído. Seu mês já está atualizado."
- Extrato, filtro sem resultado: "Nenhum registro com esses filtros." · "Limpar filtros"
- Rótulos acessíveis (lidos por leitor de tela): "Buscar" (do protótipo), "Filtros", "Categoria" (grupo do filtro), "Mais opções" (do protótipo), "Voltar", "Fechar"
- Categorias: "Nome" (rótulo do campo) · "Falta o nome." · "Você já tem uma categoria com esse nome." · "Excluir a categoria "{nome}"?" · "Categoria excluída." · "Criar categoria" (título da tela; o botão já é da copy)
- Configurações: "Nome" (título da tela de nome) · "É o ponto de partida do seu Saldo total." (recorte do texto aprovado, na tela de saldo inicial)
- Senha: "Por segurança, saia e entre de novo antes de mudar a senha." · "Essa já é a sua senha. Escolha uma diferente."
- Navegação: "Extrato", "Mais", "Categorias", "Configurações", "Sair da Íris", "Seu cadastro", "Seu dinheiro", "E-mail", "Mudar senha" — já presentes no protótipo aprovado.
