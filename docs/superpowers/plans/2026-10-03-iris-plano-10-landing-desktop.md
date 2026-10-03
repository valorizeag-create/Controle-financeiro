# Íris — Plano 10: Landing e desktop completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem ainda não tem cadastro chega em `/` e encontra a landing com as seções 1–9 da copy oficial, rápida, estática e sem rastreador; quem já entrou vai direto para o Seu mês. No desktop, as telas com conteúdo (Seu mês, mês da família, Relatórios, Planejamento, Contas, Extrato, Metas, meta, Família, Configurações, Instalar, Cartões) ganham layout próprio a partir de 1024 px, sem mexer no celular. O plano deixa prontas as duas conferências finais do mandato: acessibilidade com axe (celular e desktop) e a conferência de textos contra a copy e as listas de "Textos novos".

**Architecture:** Quatro partes. **(1) Landing:** `src/features/landing/` guarda os textos (copia verbatim da copy, com três adaptações de terminologia), a regra da seção Confiança (o item "Seus dados são seus." só aparece com os textos jurídicos prontos **e** a liberação do dono) e componentes só de servidor; `src/app/page.tsx` é estática (`dynamic = 'force-static'`) e não lê sessão. O proxy manda quem tem sessão de `/` para `/inicio` antes de qualquer renderização (`/` entra em `ANON_ONLY`). SEO pelos arquivos de metadados do Next (`robots.ts`, `sitemap.ts`, `opengraph-image.png` estático gerado por `npm run icons`). **(2) Desktop:** uma primitiva `Columns`/`MainColumn`/`AsideColumn` em `src/ui/columns.tsx` que só posiciona (a ordem do DOM continua a do celular) e a troca do ponto de quebra das grades de `md` para `lg`. **(3) Acessibilidade:** "Pular para o conteúdo", anel de foco com contraste, área segura no aviso "Sem conexão", pendências de acessibilidade do Plano 7 e testes axe (`@axe-core/playwright`, única dependência nova, só de desenvolvimento). **(4) Conferência de textos:** `npm run textos` extrai os textos visíveis de `src/`, `public/` e dos modelos de e-mail e os compara com uma cópia local da copy e com as listas de textos aprovados/para aprovação; texto fora das listas faz o comando falhar.

**Tech Stack:** Next.js 16.3 (App Router, metadados por arquivo, proxy), React 19.2, TypeScript, Tailwind CSS 4, Vitest 5 + Testing Library (jsdom), Playwright 1.63, `@axe-core/playwright` (nova, devDependency), `typescript` (já instalado; usado pelo extrator de textos), `sharp` (já usado por `scripts/gerar-icones.mjs`). **Nenhuma migração.**

**Spec:** `docs/etapa-2-requisitos.md` (RF-55, RF-56, RF-57, RNF-01, RNF-02, RNF-04, RNF-05, RNF-08, §1.1 terminologia), `docs/etapa-3-arquitetura.md` (§1 landing + app no mesmo projeto; §6 `/` = "Seções 1–9 da copy"; §7 "Desktop: menu lateral fixo… Nada de telas esticadas do celular"), `docs/etapa-5-ui.md` (tokens, V2, V3, V5, V6, V7), `docs/etapa-7-roteiro.md` (Plano 10), `docs/decisoes-para-revisao.md` (decisões 1–156, obrigatórias, com as substituições registradas; em especial 11, 13, 24, 90, 110, 115, 154 e os conflitos 1, 2, 3 e 9 do Plano 9), `docs/progresso.md` (pendências marcadas "Plano 10"), `README.md` (lista de lançamento, item 20), copy oficial (Claude Doc "Íris — Documento-base de comunicação", revisão 11: "6. Copy da landing page", Seções 1–9 e "Meta (SEO)"; "Rótulos e botões"; "9. Princípios de copy"), protótipo aprovado (`Desktop.dc.html`, `Desktop-Anotar.dc.html`; a landing **não** tem protótipo).

## Global Constraints

- **A copy oficial é a única fonte de texto.** Seções 1–9 verbatim, na ordem da copy. O que não está nela está em "Textos novos", para aprovação. Prioridade: decisões aprovadas > copy > manual visual (V3–V7) > protótipo. Tom calmo: sem exclamação, sem urgência, a culpa nunca é da pessoa. **"cadastro" = acesso da pessoa; "conta" = só conta a pagar** (nunca "sua conta", "conta bancária", nem em `aria-label`); as expressões de cálculo da copy ("fazer contas", "conta difícil", "A Íris faz as contas") ficam como estão. **Nunca "baixe o app"**, "download do app" nem selo de loja.
- **Promessas honestas (RF-57, copy §9 "Prometer só o que existe").** A seção Confiança mostra "Seus dados são seus." só quando `isLegalReady(CONTROLLER)` **e** `DATA_RIGHTS_RELEASED === true` (o dono liga depois dos itens 16 a 18 da lista de lançamento). Nenhuma frase diz "dados no Brasil", "seguro", "criptografado" ou qualquer número de usuários, depoimento ou nota (RNF-07 continua decisão do dono).
- **Landing sem dado pessoal e sem rastreio:** `src/app/page.tsx` e `src/features/landing/**` não importam `@/lib/supabase/*`, `next/headers` nem `cookies()`; não têm `'use client'`; `export const dynamic = 'force-static'`. Nada de analytics, pixel, script de terceiros, fonte externa (só Geist via `next/font`, como hoje), imagem remota ou vídeo. Open Graph sem Twitter/Facebook SDK.
- **`/` por sessão:** visitante vê a landing; quem tem sessão é levado pelo proxy para `/inicio` (de lá, quem não terminou o onboarding vai para `/boas-vindas`, como hoje). A decisão é do proxy (`isAnonOnlyPath('/')`), nunca da página.
- **Segurança que não muda:** caminhos públicos só por correspondência exata em `src/features/auth/routes.ts` (este plano acrescenta `/robots.txt` e `/sitemap.xml`); o id da pessoa só de `requireUser()`; nenhuma chave de serviço em `src/` (`src/features/notificacoes/no-service-key.test.ts` continua passando sem alteração); módulos `'use server'` exportam só funções async; redirecionamentos só para caminho interno fixo; nenhuma política de RLS muda; **nenhuma migração**.
- **Desktop (RNF-02):** duas colunas a partir de **1024 px** (`lg:`); de 768 a 1023 px, uma coluna ao lado do menu lateral; abaixo de 768 px, nada muda. **A ordem do DOM é sempre a do celular** (o desktop só posiciona; ordem de foco = ordem de leitura do celular). Sem `order-*` nem `flex-row-reverse` para reordenar conteúdo. Largura útil das telas largas: `lg:max-w-[1180px]` (a mesma do Seu mês).
- **Celular sem regressão:** a 375 px nenhuma tela rola na horizontal; alvos de toque ≥ 44 px; texto 15–16 px; controles 44–52 px (V3). Toda mudança visual tem teste (classe/posição em jsdom, geometria no e2e).
- **WCAG 2.2 AA (RNF-05):** contraste AA; foco visível com contraste ≥ 3:1; um `h1` por página; marcos (`header`/`banner`, `main`, `footer`/`contentinfo`, `nav` com nome); "Pular para o conteúdo"; nada depende só de cor. Testes axe com as etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, **sem desligar regra nenhuma**.
- **Visual:** só os tokens de `src/app/globals.css` (Etapa 5); logo provisório (`src/ui/logo.tsx`, V2) — **nunca o trevo da Ramtabs**; Lucide com contorno 1.8; sem vermelho fora de erro; sem modo escuro (V7).
- Antes de escrever código Next, ler em `node_modules/next/dist/docs/01-app/` (Next 16 difere do que você conhece; `AGENTS.md`): `03-api-reference/03-file-conventions/01-metadata/robots.md`, `sitemap.md`, `opengraph-image.md`, `03-api-reference/04-functions/generate-metadata.md` (`metadataBase`, `alternates`, `openGraph`), `02-guides/caching-without-cache-components.md` (`dynamic = 'force-static'`), `03-api-reference/03-file-conventions/proxy.md`. `params`/`searchParams` são `Promise`.
- **Testes de componente:** primeira linha `// @vitest-environment jsdom`, `afterEach(() => cleanup())`, sem `globals`; páginas com dados seguem o padrão de `src/app/(app)/configuracoes/page.test.tsx` (mocks de `server-only`, das consultas e dos componentes vizinhos). **Nunca remover** um filtro de segurança nem afrouxar uma afirmação para um teste passar.
- **e2e:** usuários com prefixo único por arquivo, worker e execução; limpeza só do próprio prefixo; nomes de papel exatos (`{ name, exact: true }`).
- Shell: Git Bash (POSIX). Projeto: `C:/Users/Joaov/Downloads/Planilha financeira`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca commitar `.claude/` nem `.env.local`.
- Passos que dependem do Supabase local (`npm run test:db`, a parte com cadastro de `npm run test:e2e`) exigem Docker. Sem Docker: conferir com `npx tsc --noEmit` e `npx playwright test --list`, rodar o que não precisa de banco (as páginas públicas) e marcar o resto como **pendente** em `docs/progresso.md` — **nunca** enfraquecer, pular ou apagar um teste.

## Review Focus

Cinco situações que o escopo não cobre de forma explícita e que mais podem machucar alguém; cada uma tem teste na tarefa dona:

1. **Quem já entrou abre `/` (favorito antigo, link compartilhado, logo das páginas legais), ou um visitante chega com um cookie vencido** — Expectativa: quem tem sessão nunca vê a landing nem um flash dela, cai no Seu mês; o cookie vencido mostra a landing, não um erro nem "Entrar". → **Task 4** (`/ é só para quem não entrou`), e2e **Task 11** (`quem entrou e abre / vai para o Seu mês`).
2. **Largura intermediária (768–1023 px: tablet, notebook pequeno, janela dividida) e 375 px** — o menu lateral aparece em 768 e sobram ~450 px; uma grade de 3 colunas ali vira colunas de 140 px. Expectativa: uma coluna legível entre 768 e 1023, duas a partir de 1024, nenhuma rolagem horizontal em 375. → **Task 5** (`as grades do mês só abrem em três colunas a partir de 1024 px`), e2e **Task 11** (larguras 375, 800 e 1024).
3. **Teclado e leitor de tela nas telas de duas colunas** — Expectativa: o primeiro Tab mostra "Pular para o conteúdo", Enter leva o foco ao conteúdo; a ordem do foco é a do celular (resumo, lista, lateral), nunca saltando entre colunas sem sentido; o anel de foco é visível em fundo branco e verde. → **Task 2** (`pular para o conteúdo vem antes do menu`, `anel de foco com contraste`), **Tasks 6–8** (cada tela: `a ordem do DOM continua a do celular`), e2e **Task 11** (`primeiro Tab`).
4. **A landing prometendo o que ainda não está pronto para o lançamento** — exportação e exclusão existem, mas a política está em rascunho e o banco nunca rodou (README, itens 16–18). Expectativa: "Seus dados são seus." fica fora até o dono liberar; Termos e Privacidade em rascunho não entram no sitemap; nenhuma frase sobre "dados no Brasil". → **Task 1** (`Confiança: "Seus dados são seus." só com…`), **Task 4** (`sitemap: Termos e Privacidade só quando prontos`), e2e **Task 11**.
5. **Texto novo entrando sem aprovação (RNF-08)** — Expectativa: a conferência de textos acusa qualquer texto visível que não esteja na copy nem numa lista de "Textos novos", com arquivo e linha, e o comando termina com erro; um texto técnico só é ignorado com motivo escrito. → **Task 10** (`classify`, `texto fora das listas faz o comando falhar`, `ignorar exige motivo`).

---

## Estrutura de arquivos

```
src/features/landing/content.ts (+ content.test.ts)      NOVO: textos das seções 1–9 (copy), trustItems
src/features/landing/release.ts                          NOVO: DATA_RIGHTS_RELEASED (o dono liga)
src/features/landing/landing-page.tsx (+ test)           NOVO: página (servidor), seções, cabeçalho, rodapé
src/features/landing/hero-preview.tsx                    NOVO: desenho do Seu mês (decorativo, só HTML/CSS)
src/features/landing/seo.ts (+ seo.test.ts)              NOVO: título, descrição, robots, sitemap
src/app/page.tsx (+ page.test.ts)                        MOD: landing estática (era redirect para /entrar)
src/app/robots.ts, src/app/sitemap.ts                    NOVO
src/app/opengraph-image.png, opengraph-image.alt.txt (+ opengraph-image.test.ts)   NOVO (gerado por npm run icons)
src/app/layout.tsx                                       MOD: metadataBase, título/descrição de seo.ts
src/lib/env.ts (+ env.test.ts)                           MOD: siteUrl sem barra no fim
src/features/auth/routes.ts (+ routes.test.ts)           MOD: '/' só para quem não entrou; robots e sitemap públicos
src/proxy.test.ts                                        MOD: robots, sitemap e imagem de compartilhamento
scripts/gerar-icones.mjs                                 MOD: imagem de compartilhamento 1200×630
src/ui/skip-link.tsx (+ test)                            NOVO: "Pular para o conteúdo"
src/ui/columns.tsx (+ test)                              NOVO: Columns, MainColumn, AsideColumn, WIDE
src/app/globals.css (+ src/app/globals.test.ts)          MOD: anel de foco
src/features/shell/main-frame.tsx (+ test)               MOD: alvo do pular (id="conteudo")
src/features/shell/offline-banner.tsx (+ test)           MOD: área segura
src/app/(app)/layout.tsx (+ layout.test.tsx)             MOD: SkipLink
src/app/(auth)/layout.tsx (+ layout.test.tsx)            MOD: logo leva à landing
src/app/(app)/inicio/page.tsx, src/features/seu-mes/{hero,categories-card,featured-goal,planned-card}.tsx,
src/features/familia/family-month.tsx (+ src/features/seu-mes/grid-breakpoint.test.ts)   MOD: md → lg
src/app/(app)/relatorios/page.tsx (+ page.test.tsx)      MOD
src/app/(app)/planejamento/page.tsx (+ page.test.tsx)    MOD
src/app/(app)/contas/page.tsx (+ page.test.tsx)          MOD
src/app/(app)/extrato/page.tsx (+ page.test.tsx)         MOD
src/app/(app)/metas/page.tsx, src/features/metas/metas-list.tsx (+ test)   MOD
src/app/(app)/metas/[id]/page.tsx (+ page.test.tsx)      MOD
src/features/familia/familia-page.tsx (+ test)           MOD
src/app/(app)/configuracoes/page.tsx (+ test)            MOD
src/features/pwa/install-card.tsx (+ test), src/app/(app)/configuracoes/instalar/page.tsx   MOD
src/features/cartoes/cards-list.tsx (+ test), src/app/(app)/cartoes/page.tsx               MOD
src/features/familia/view-model.ts, member-actions.tsx, invite-screen.tsx (+ tests)        MOD: acessibilidade do Plano 7
docs/copy/documento-base.md                              NOVO: cópia local da copy (revisão e data no topo)
scripts/conferir-textos.mjs                              NOVO: npm run textos
scripts/conferir-textos/{normalizar,extrair,fontes}.mjs (+ core.test.mjs)   NOVO
scripts/conferir-textos/ignorar.json                     NOVO: textos técnicos, cada um com motivo
vitest.config.ts                                         MOD: inclui scripts/**/*.test.mjs
package.json, package-lock.json                          MOD: @axe-core/playwright (dev), script "textos"
tests/e2e/apoio.ts                                       NOVO: usuários, sementes, entrar, rolagem horizontal, axe
tests/e2e/acessibilidade.spec.ts                         NOVO
tests/e2e/plano10.spec.ts                                NOVO
README.md, docs/progresso.md, docs/decisoes-para-revisao.md   MOD
```

Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. As Tasks 5–9 só dependem da Task 2; a Task 10 não depende de nenhuma e pode rodar em paralelo; a Task 11 depende de todas as anteriores.

---

### Task 1: Landing — textos das seções 1–9 e a regra da seção Confiança

**Files:**
- Create: `src/features/landing/content.ts`, `src/features/landing/release.ts`
- Test: `src/features/landing/content.test.ts`

**Interfaces:**
- Produces (`content.ts`):
  - `type LeadText = { lead: string; text: string }` (`lead` é o trecho em negrito da copy; `text` pode ser `''`).
  - `type TrustId = 'banco' | 'gratuita' | 'dados' | 'conselhos'`; `type TrustItem = LeadText & { id: TrustId }`.
  - `const SIGNUP_HREF = '/criar-cadastro'`, `const SIGNIN_HREF = '/entrar'`, `const HOW_IT_WORKS_ID = 'como-funciona'`.
  - `const LANDING` (objeto abaixo, `as const`).
  - `trustItems(gate: { legalReady: boolean; dataReleased: boolean }): TrustItem[]` — os quatro itens na ordem da copy, sem `'dados'` a menos que `legalReady && dataReleased`.
  - `allLandingTexts(): string[]` — todos os textos de `LANDING` (inclusive os quatro itens de confiança), achatados.
- Produces (`release.ts`): `export const DATA_RIGHTS_RELEASED: boolean = false`.

- [ ] **Step 1: Escrever o teste que falha**

`src/features/landing/content.test.ts`:

```ts
import { expect, test } from 'vitest'
import { allLandingTexts, HOW_IT_WORKS_ID, LANDING, SIGNUP_HREF, trustItems } from './content'
import { DATA_RIGHTS_RELEASED } from './release'

const full = (i: { lead: string; text: string }) => `${i.lead} ${i.text}`.trim()

test('hero da copy, com a microcopy adaptada à terminologia ("cadastro"/"conta")', () => {
  expect(LANDING.hero.title).toBe('Seu dinheiro, finalmente à vista.')
  expect(LANDING.hero.subtitle).toBe('Anote seus gastos em segundos e veja, de um jeito simples, para onde seu dinheiro está indo. Sem planilha, sem conta difícil, sem julgamento.')
  expect(LANDING.hero.cta).toBe('Começar a ver meu mês')
  expect(LANDING.hero.secondaryCta).toBe('Ver como funciona')
  expect(LANDING.hero.micro).toBe('Gratuito. Sem cartão. Sem acesso ao seu banco.')
})

test('o CTA principal é o mesmo nas seções 1, 4 e 9; destinos fixos', () => {
  expect(LANDING.solution.cta).toBe(LANDING.hero.cta)
  expect(LANDING.final.cta).toBe(LANDING.hero.cta)
  expect(SIGNUP_HREF).toBe('/criar-cadastro')
  expect(HOW_IT_WORKS_ID).toBe('como-funciona')
})

test('títulos das seções 2 a 9 na ordem da copy', () => {
  expect([
    LANDING.problem.title, LANDING.turn.title, LANDING.solution.title, LANDING.features.title,
    LANDING.benefits.title, LANDING.experience.title, LANDING.trust.title, LANDING.final.title,
  ]).toEqual([
    'Você sabe quanto ganha. O difícil é saber para onde vai.',
    'O problema nunca foi você.',
    'A Íris reúne seu dinheiro em uma visão só.',
    'Tudo o que você precisa para entender seu dinheiro. Nada além disso.',
    'O que muda quando você consegue ver.',
    'Feita para você não desistir.',
    'Clareza também sobre como a Íris funciona.',
    'Seu próximo mês pode ser o primeiro que você realmente entende.',
  ])
})

test('quantidades da copy: 5 situações, 8 funções, 4 + 4 benefícios, 5 itens da experiência, 4 de confiança', () => {
  expect(LANDING.problem.items).toHaveLength(5)
  expect(LANDING.features.items).toHaveLength(8)
  expect(LANDING.benefits.functional).toHaveLength(4)
  expect(LANDING.benefits.emotional).toHaveLength(4)
  expect(LANDING.experience.items).toHaveLength(5)
  expect(trustItems({ legalReady: true, dataReleased: true })).toHaveLength(4)
})

test('frases inteiras como na copy (negrito + resto)', () => {
  expect(full(LANDING.problem.items[0])).toBe('Um café aqui, um delivery ali. Nenhum gasto parece grande, até todos aparecerem juntos na fatura.')
  expect(full(LANDING.features.items[7])).toBe('Encontre qualquer gasto em segundos. Tudo em ordem, fácil de buscar e de corrigir.')
  expect(full(LANDING.benefits.functional[0])).toBe('Você sabe quanto pode gastar — antes de gastar, e não depois.')
  expect(full(LANDING.benefits.emotional[3])).toBe('Alívio. Simples assim.')
  expect(full(LANDING.experience.items[3])).toBe('Nada de configurações longas. Você cria seu cadastro e já pode anotar o primeiro gasto.')
  expect(LANDING.final.micro).toBe('Gratuito. Leva menos de um minuto para começar.')
})

test('terminologia e distribuição: nunca "conta bancária", "sua conta", "baixe", "download" ou loja', () => {
  for (const t of allLandingTexts()) {
    expect(t, t).not.toMatch(/conta bancária|sua conta\b|criar uma conta|baixe|download|app store|play store|google play/i)
    expect(t, t).not.toMatch(/!/)
  }
})

test('Confiança: "Seus dados são seus." só com os textos jurídicos prontos e a liberação do dono', () => {
  const ids = (legalReady: boolean, dataReleased: boolean) => trustItems({ legalReady, dataReleased }).map((i) => i.id)
  expect(ids(false, false)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(true, false)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(false, true)).toEqual(['banco', 'gratuita', 'conselhos'])
  expect(ids(true, true)).toEqual(['banco', 'gratuita', 'dados', 'conselhos'])
  const dados = trustItems({ legalReady: true, dataReleased: true })[2]
  expect(full(dados)).toBe('Seus dados são seus. Você pode baixar o que registrou ou excluir seu cadastro quando quiser.')
  expect(full(trustItems({ legalReady: false, dataReleased: false })[0])).toBe('Você decide o que registrar. A Íris não se conecta ao seu banco nem pede senha do banco.')
})

test('a liberação do item de dados começa desligada', () => {
  expect(DATA_RIGHTS_RELEASED).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/landing/content.test.ts`
Expected: FAIL — `Cannot find module './content'`.

- [ ] **Step 3: Implementar**

`src/features/landing/release.ts`:

```ts
// Só o dono do projeto liga, depois dos itens 16 a 18 da lista de lançamento do README
// (Termos e Política revisados, decisão sobre RNF-07, primeira execução do banco).
// Com `false`, a seção Confiança não cita exportação nem exclusão (RF-57).
export const DATA_RIGHTS_RELEASED: boolean = false
```

`src/features/landing/content.ts` — os textos são exatamente estes (copy, "6. Copy da landing page", revisão 11; três adaptações marcadas, decisão 159; a frase nova do item `dados`, decisão 160). `allLandingTexts` achata todos os campos de texto; `trustItems` filtra `dados`:

```ts
export type LeadText = { lead: string; text: string }
export type TrustId = 'banco' | 'gratuita' | 'dados' | 'conselhos'
export type TrustItem = LeadText & { id: TrustId }

export const SIGNUP_HREF = '/criar-cadastro'
export const SIGNIN_HREF = '/entrar'
export const HOW_IT_WORKS_ID = 'como-funciona'

const CTA = 'Começar a ver meu mês'

const TRUST: TrustItem[] = [
  // Adaptado: a copy diz "à sua conta bancária" (terminologia §1.1, decisão 159).
  { id: 'banco', lead: 'Você decide o que registrar.', text: 'A Íris não se conecta ao seu banco nem pede senha do banco.' },
  { id: 'gratuita', lead: 'Gratuita, sem letras miúdas.', text: 'Você não precisa cadastrar cartão para usar.' },
  // Texto novo no lugar de "Você pode exportar ou excluir tudo quando quiser." (RN-24; decisão 160).
  { id: 'dados', lead: 'Seus dados são seus.', text: 'Você pode baixar o que registrou ou excluir seu cadastro quando quiser.' },
  { id: 'conselhos', lead: 'Sem conselhos de investimento, sem promessas milagrosas.', text: 'A Íris mostra o que está acontecendo. As decisões continuam sendo suas.' },
]

export const LANDING = {
  hero: {
    title: 'Seu dinheiro, finalmente à vista.',
    subtitle: 'Anote seus gastos em segundos e veja, de um jeito simples, para onde seu dinheiro está indo. Sem planilha, sem conta difícil, sem julgamento.',
    cta: CTA,
    secondaryCta: 'Ver como funciona',
    // Adaptado: a copy diz "Sem acesso à sua conta bancária." (decisão 159).
    micro: 'Gratuito. Sem cartão. Sem acesso ao seu banco.',
  },
  problem: {
    title: 'Você sabe quanto ganha. O difícil é saber para onde vai.',
    items: [
      { lead: 'Um café aqui, um delivery ali.', text: 'Nenhum gasto parece grande, até todos aparecerem juntos na fatura.' },
      { lead: '"Será que ainda posso gastar?"', text: 'Você abre o app do banco, olha o saldo e continua sem a resposta.' },
      { lead: 'A conta que venceu ontem.', text: 'Não por descuido, mas porque ela estava escondida no meio de tudo.' },
      { lead: 'Pix, cartão, dinheiro, boleto.', text: 'Cada gasto em um lugar diferente, e nenhum lugar mostrando o todo.' },
      { lead: 'Dia 30 chega.', text: 'O dinheiro acabou, e você não consegue explicar exatamente como.' },
    ],
    closing: 'Se alguma dessas situações parece familiar, você não está sozinho — e não está fazendo nada de errado.',
  },
  turn: {
    title: 'O problema nunca foi você.',
    text: 'A maioria das pessoas não perde o controle do dinheiro por ganhar pouco ou gastar demais. Perde porque nunca consegue ver tudo em um lugar só. Gasto espalhado vira gasto invisível. E ninguém consegue cuidar do que não consegue enxergar.',
    highlight: 'Antes de controlar, você precisa ver.',
  },
  solution: {
    title: 'A Íris reúne seu dinheiro em uma visão só.',
    text: 'Você anota o que entrou e o que saiu. A Íris organiza, soma e mostra — o que foi para cada lugar, quanto ainda está disponível e como o mês está andando. Sem fórmulas, sem colunas, sem precisar entender de finanças. É o seu mês, finalmente legível.',
    cta: CTA,
  },
  features: {
    title: 'Tudo o que você precisa para entender seu dinheiro. Nada além disso.',
    items: [
      { lead: 'Anote em segundos.', text: 'Valor, categoria e pronto. Mais rápido que abrir uma planilha.' },
      { lead: 'Veja seu mês de relance.', text: 'Quanto entrou, quanto saiu e quanto sobrou, logo na primeira tela.' },
      { lead: 'Descubra para onde seu dinheiro vai.', text: 'Mercado, transporte, lazer: cada gasto no seu lugar, sem você precisar fazer contas.' },
      { lead: 'Saiba quanto ainda pode gastar.', text: 'Defina um valor para cada área e acompanhe quanto ainda está disponível, sem susto.' },
      { lead: 'Veja sua meta chegando mais perto.', text: 'Guarde para o que importa e acompanhe quanto falta, passo a passo.' },
      { lead: 'Entenda seus meses, não só este.', text: 'Compare períodos e perceba o que mudou, sem precisar interpretar gráficos complicados.' },
      { lead: 'Não deixe uma conta passar.', text: 'A Íris te avisa antes do vencimento — e lembra você de anotar, se quiser.' },
      { lead: 'Encontre qualquer gasto em segundos.', text: 'Tudo em ordem, fácil de buscar e de corrigir.' },
    ],
  },
  benefits: {
    title: 'O que muda quando você consegue ver.',
    functional: [
      { lead: 'Você sabe quanto pode gastar', text: '— antes de gastar, e não depois.' },
      { lead: 'Suas contas deixam de te pegar de surpresa.', text: '' },
      { lead: 'Você entende seus hábitos', text: 'sem precisar se analisar.' },
      { lead: 'Suas metas saem da cabeça', text: 'e ganham um número e um caminho.' },
    ],
    emotional: [
      { lead: 'Menos ansiedade ao abrir o app do banco.', text: '' },
      { lead: 'Mais segurança para dizer sim', text: '— e para dizer não.' },
      { lead: 'A sensação de estar por dentro da própria vida.', text: '' },
      { lead: 'Alívio.', text: 'Simples assim.' },
    ],
  },
  experience: {
    title: 'Feita para você não desistir.',
    text: 'Planilhas e apps complicados costumam ser abandonados pelo mesmo motivo: dão trabalho demais. A Íris foi pensada para caber na sua rotina.',
    items: [
      { lead: 'Um registro leva segundos.', text: 'Valor, categoria, pronto.' },
      { lead: 'Você começa com pouco.', text: 'Não precisa organizar a vida inteira no primeiro dia.' },
      { lead: 'Esqueceu de anotar por uns dias?', text: 'Tudo bem. É só continuar de onde parou.' },
      // Adaptado: a copy diz "Você cria sua conta…" (decisão 159).
      { lead: 'Nada de configurações longas.', text: 'Você cria seu cadastro e já pode anotar o primeiro gasto.' },
      { lead: 'A Íris faz as contas.', text: 'Você só precisa olhar.' },
    ],
    highlight: 'Organizar não precisa ser mais um compromisso.',
  },
  trust: { title: 'Clareza também sobre como a Íris funciona.' },
  final: {
    title: 'Seu próximo mês pode ser o primeiro que você realmente entende.',
    text: 'Comece com um gasto. Em poucos dias, você já vai enxergar o seu mês com outros olhos.',
    cta: CTA,
    micro: 'Gratuito. Leva menos de um minuto para começar.',
  },
} as const

export function trustItems(gate: { legalReady: boolean; dataReleased: boolean }): TrustItem[] { /* filtra 'dados' */ }
export function allLandingTexts(): string[] { /* achata LANDING + TRUST */ }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/landing/content.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/content.ts src/features/landing/release.ts src/features/landing/content.test.ts
git commit -m "feat(landing): textos das seções 1–9 da copy e a regra da seção Confiança" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Casca — pular para o conteúdo, anel de foco, área segura e colunas do desktop

**Files:**
- Create: `src/ui/skip-link.tsx` (+ `skip-link.test.tsx`), `src/ui/columns.tsx` (+ `columns.test.tsx`), `src/app/globals.test.ts`, `src/app/(app)/layout.test.tsx`
- Modify: `src/app/globals.css`, `src/features/shell/main-frame.tsx` (+ test), `src/features/shell/offline-banner.tsx` (+ test), `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces (`skip-link.tsx`): `SkipLink(): JSX.Element` — `<a href="#conteudo">Pular para o conteúdo</a>`; `const CONTENT_ID = 'conteudo'`.
- Produces (`columns.tsx`):
  - `Columns({ children }: { children: ReactNode })` — `div[data-columns]`, `flex flex-col gap-4` no celular; `lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-4`.
  - `MainColumn({ children })` — `div[data-column="main"]`, `flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1 lg:row-span-2`.
  - `AsideColumn({ children, row = 1 }: { children: ReactNode; row?: 1 | 2 })` — `div[data-column="aside"][data-row]`, `flex min-w-0 flex-col gap-4 lg:col-start-2` + `lg:row-start-1` ou `lg:row-start-2`.
  - `const WIDE = 'lg:max-w-[1180px]'` (acrescentado ao `main` das telas largas).
  - Regra (comentário no arquivo): os filhos de `Columns` ficam **na ordem do celular**; `AsideColumn row={1}` pode vir antes de `MainColumn` no DOM (resumo no topo do celular), `row={2}` vem depois.

- [ ] **Step 1: Escrever os testes que falham**

`src/ui/skip-link.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CONTENT_ID, SkipLink } from './skip-link'

afterEach(() => cleanup())

test('"Pular para o conteúdo": escondido até receber foco, alvo de 44 px, leva ao conteúdo', () => {
  render(<SkipLink />)
  const link = screen.getByRole('link', { name: 'Pular para o conteúdo', exact: true })
  expect(link.getAttribute('href')).toBe(`#${CONTENT_ID}`)
  expect(CONTENT_ID).toBe('conteudo')
  expect(link.className).toContain('sr-only')
  expect(link.className).toContain('focus:not-sr-only')
  expect(link.className).toContain('min-h-11')
})
```

`src/ui/columns.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AsideColumn, Columns, MainColumn, WIDE } from './columns'

afterEach(() => cleanup())

test('uma coluna no celular; duas a partir de 1024 px, sem reordenar o DOM', () => {
  const { container } = render(
    <Columns>
      <AsideColumn><p>resumo</p></AsideColumn>
      <MainColumn><p>lista</p></MainColumn>
      <AsideColumn row={2}><p>ajuda</p></AsideColumn>
    </Columns>,
  )
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect(root.className).toMatch(/^flex flex-col gap-4 /)
  expect(root.className).toContain('lg:grid')
  expect(root.className).toContain('lg:grid-cols-[minmax(0,1fr)_340px]')
  expect(root.className).not.toMatch(/(^|\s)md:/)
  const cols = [...root.children].map((c) => [c.getAttribute('data-column'), c.textContent])
  expect(cols).toEqual([['aside', 'resumo'], ['main', 'lista'], ['aside', 'ajuda']])
  const [aside1, main, aside2] = [...root.children] as HTMLElement[]
  expect(main.className).toContain('lg:col-start-1')
  expect(main.className).toContain('lg:row-span-2')
  expect(aside1.className).toContain('lg:col-start-2')
  expect(aside1.className).toContain('lg:row-start-1')
  expect(aside2.className).toContain('lg:row-start-2')
  for (const el of [root, main, aside1, aside2]) expect(el.className).not.toMatch(/(^|\s)(lg:)?(order-|flex-row-reverse|flex-col-reverse)/)
  expect(WIDE).toBe('lg:max-w-[1180px]')
})
```

`src/app/globals.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('anel de foco com contraste (≥ 3:1): contorno de 2 px na cor brand-text, afastado 2 px', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const rule = css.match(/:focus-visible\s*\{([^}]*)\}/)?.[1] ?? ''
  expect(rule).toContain('outline: 2px solid var(--color-brand-text)')
  expect(rule).toContain('outline-offset: 2px')
})
```

Em `src/features/shell/main-frame.test.tsx`, acrescentar:

```tsx
test('é o alvo do "Pular para o conteúdo" e recebe o foco', () => {
  const { container } = render(<MainFrame><p>conteúdo</p></MainFrame>)
  const frame = container.firstChild as HTMLElement
  expect(frame.id).toBe('conteudo')
  expect(frame.getAttribute('tabindex')).toBe('-1')
})
```

Em `src/features/shell/offline-banner.test.tsx`, acrescentar (no padrão do arquivo, com `navigator.onLine` falso):

```tsx
test('respeita a área segura do topo (iPhone)', () => {
  // (simular offline como os testes vizinhos)
  render(<OfflineBanner />)
  expect(screen.getByRole('status').className).toContain('pt-[max(0.5rem,env(safe-area-inset-top))]')
})
```

`src/app/(app)/layout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), usePathname: () => '/inicio' }))
vi.mock('@/lib/supabase/server', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/features/perfil/queries', () => ({ getOnboardedAt: async () => ({ display_name: 'Ana', onboarded_at: '2026-01-01' }) }))
vi.mock('@/features/onboarding/gate', () => ({ needsOnboarding: () => false }))
vi.mock('@/features/shell/sidebar', () => ({ Sidebar: () => <aside><a href="/inicio">Seu mês</a></aside> }))
vi.mock('@/features/shell/bottom-nav', () => ({ BottomNav: () => null }))
vi.mock('@/features/shell/toast', () => ({ Toast: () => null }))
vi.mock('@/features/notificacoes/push-sync', () => ({ PushSync: () => null }))

const { default: AppLayout } = await import('./layout')
afterEach(() => cleanup())

test('pular para o conteúdo vem antes do menu e aponta para o conteúdo da tela', async () => {
  const { container } = render(await AppLayout({ children: <main><h1>Seu mês</h1></main> }))
  const first = container.querySelector('a') as HTMLAnchorElement
  expect(first.textContent).toBe('Pular para o conteúdo')
  expect(container.querySelector('#conteudo')?.textContent).toContain('Seu mês')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/skip-link.test.tsx src/ui/columns.test.tsx src/app/globals.test.ts src/features/shell src/app/\(app\)/layout.test.tsx`
Expected: FAIL — módulos novos ausentes; `id`, área segura e contorno ainda não existem.

- [ ] **Step 3: Implementar**

- `src/ui/skip-link.tsx`: classes `sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] flex min-h-11 items-center rounded-panel bg-card px-4 font-semibold text-brand-text shadow-sheet`.
- `src/ui/columns.tsx`: como em Interfaces (componentes de servidor, sem `'use client'`).
- `src/app/globals.css`: a regra `:focus-visible` passa a `outline: 2px solid var(--color-brand-text); outline-offset: 2px;` (sai o `box-shadow` verde claro, que ficava abaixo de 3:1 no branco; decisão 165).
- `MainFrame`: `id={CONTENT_ID}` e `tabIndex={-1}` no `div` (mais `outline-none` para o próprio contêiner não ganhar contorno ao receber o foco programático).
- `OfflineBanner`: `py-2` → `pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]` (pendência do Plano 8).
- `(app)/layout.tsx`: `<SkipLink />` como primeiro filho do `div` raiz, antes de `<Sidebar>`.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2, e depois `npm test`.
Expected: PASS; nenhum teste existente quebra.

- [ ] **Step 5: Commit**

```bash
git add src/ui/skip-link.tsx src/ui/skip-link.test.tsx src/ui/columns.tsx src/ui/columns.test.tsx src/app/globals.css src/app/globals.test.ts src/features/shell/main-frame.tsx src/features/shell/main-frame.test.tsx src/features/shell/offline-banner.tsx src/features/shell/offline-banner.test.tsx "src/app/(app)/layout.tsx" "src/app/(app)/layout.test.tsx"
git commit -m "feat(a11y): pular para o conteúdo, anel de foco com contraste, área segura e colunas do desktop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Landing — a página pública

**Files:**
- Create: `src/features/landing/landing-page.tsx` (+ `landing-page.test.tsx`), `src/features/landing/hero-preview.tsx`, `src/app/page.test.ts`, `src/app/(auth)/layout.test.tsx`
- Modify: `src/app/page.tsx`, `src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `LANDING`, `trustItems`, `SIGNUP_HREF`, `SIGNIN_HREF`, `HOW_IT_WORKS_ID`, `TrustItem` (Task 1); `DATA_RIGHTS_RELEASED` (Task 1); `SkipLink`, `CONTENT_ID` (Task 2); `Logo` (`src/ui/logo.tsx`); `Button` (`src/ui/button.tsx`, com `href`); `Money` (`src/ui/money.tsx`); `CONTROLLER`, `isLegalReady` (`src/features/legal/controller.ts`).
- Produces: `LandingPage({ trust }: { trust: TrustItem[] }): JSX.Element` (servidor); `HeroPreview(): JSX.Element` (servidor, `aria-hidden="true"`, `data-landing-preview`). `src/app/page.tsx` exporta `dynamic = 'force-static'`, `metadata` e o componente padrão.

- [ ] **Step 1: Escrever os testes que falham**

`src/features/landing/landing-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { LANDING, trustItems } from './content'
import { LandingPage } from './landing-page'

afterEach(() => cleanup())
const show = (released = false) => render(<LandingPage trust={trustItems({ legalReady: released, dataReleased: released })} />)

test('um h1 (o título da copy) e um h2 por seção, na ordem da copy', () => {
  show()
  expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([LANDING.hero.title])
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    LANDING.problem.title, LANDING.turn.title, LANDING.solution.title, LANDING.features.title,
    LANDING.benefits.title, LANDING.experience.title, LANDING.trust.title, LANDING.final.title,
  ])
})

test('marcos: cabeçalho, conteúdo (alvo do pular) e rodapé; o pular é o primeiro link', () => {
  const { container } = show()
  expect(screen.getByRole('banner')).toBeTruthy()
  expect(screen.getByRole('main').id).toBe('conteudo')
  expect(screen.getByRole('contentinfo')).toBeTruthy()
  expect(container.querySelector('a')?.textContent).toBe('Pular para o conteúdo')
  for (const title of [LANDING.problem.title, LANDING.trust.title]) expect(screen.getByRole('region', { name: title })).toBeTruthy()
})

test('três CTAs "Começar a ver meu mês" levam ao cadastro; "Ver como funciona" leva à seção 4; "Entrar" no topo', () => {
  show()
  const ctas = screen.getAllByRole('link', { name: 'Começar a ver meu mês', exact: true })
  expect(ctas).toHaveLength(3)
  for (const c of ctas) expect(c.getAttribute('href')).toBe('/criar-cadastro')
  expect(screen.getByRole('link', { name: 'Ver como funciona', exact: true }).getAttribute('href')).toBe('#como-funciona')
  expect(document.getElementById('como-funciona')).toBe(screen.getByRole('region', { name: LANDING.solution.title }))
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Entrar', exact: true }).getAttribute('href')).toBe('/entrar')
})

test('rodapé: Termos de uso e Política de privacidade', () => {
  show()
  const legal = screen.getByRole('navigation', { name: 'Textos legais' })
  expect(within(legal).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Termos de uso', '/termos'],
    ['Política de privacidade', '/privacidade'],
  ])
})

test('Confiança: sem "Seus dados são seus." enquanto não liberado; com a liberação, aparece', () => {
  show(false)
  expect(screen.queryByText('Seus dados são seus.')).toBeNull()
  cleanup()
  show(true)
  expect(screen.getByText('Seus dados são seus.')).toBeTruthy()
})

test('o desenho do Seu mês é decorativo; a página não fala em baixar o app', () => {
  const { container } = show()
  expect(container.querySelector('[data-landing-preview]')?.getAttribute('aria-hidden')).toBe('true')
  expect(document.body.textContent ?? '').not.toMatch(/baixe|download|app store|google play/i)
})
```

`src/app/page.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import * as page from './page'

test('a landing é estática e tem canônico e Open Graph', () => {
  expect(page.dynamic).toBe('force-static')
  expect(page.metadata.alternates?.canonical).toBe('/')
  expect(page.metadata.openGraph).toMatchObject({ type: 'website', locale: 'pt_BR', siteName: 'Íris', url: '/' })
})

test('nenhum arquivo da landing lê sessão, cookies ou roda no navegador', () => {
  const dir = 'src/features/landing'
  const files = [join('src/app', 'page.tsx'), ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.')).map((f) => join(dir, f))]
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/['"]use client['"]/)
    expect(src, f).not.toMatch(/@\/lib\/supabase|next\/headers|cookies\(/)
  }
})
```

`src/app/(auth)/layout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AuthLayout from './layout'

afterEach(() => cleanup())

test('o logo das telas de acesso volta para a landing', () => {
  render(<AuthLayout><h1>Entrar</h1></AuthLayout>)
  expect(screen.getByRole('link', { name: 'Íris, página inicial', exact: true }).getAttribute('href')).toBe('/')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/landing src/app/page.test.ts "src/app/(auth)/layout.test.tsx"`
Expected: FAIL — `landing-page` ausente; `page.dynamic` indefinido; o logo do acesso não é link.

- [ ] **Step 3: Implementar a landing**

`LandingPage` (servidor, só tokens da Etapa 5, sem imagem):
- `<SkipLink />`; `<header>`: `<Logo />` (não é link: já é a página inicial) e o link "Entrar" (`SIGNIN_HREF`, variante `ghost`, `min-h-11`). Sem `nav` no cabeçalho (um link só).
- `<main id={CONTENT_ID} tabIndex={-1}>` com uma `<section aria-labelledby>` por seção; o `h2` de cada seção carrega o `id` usado no `aria-labelledby`; a seção 4 tem `id={HOW_IT_WORKS_ID}`.
  1. **Hero:** `h1`, subtítulo, `Button` primário "Começar a ver meu mês" → `SIGNUP_HREF`, `Button` secundário "Ver como funciona" → `#${HOW_IT_WORKS_ID}`, microcopy em `text-muted`. A partir de `lg`: duas colunas (texto à esquerda, `HeroPreview` à direita); no celular o desenho vem depois dos botões. O `h1` fica sem `section` própria (é o título da página) — o hero é um `div` dentro do `main`.
  2. **Problema:** `ul` com os cinco itens (`<strong>` no `lead` + texto), `md:grid-cols-2`; fechamento em parágrafo.
  3. **Virada:** texto e a frase de destaque em `<p>` grande (`text-[22px] font-semibold text-brand-ink`), sem aspas novas.
  4. **Solução:** texto e o CTA principal.
  5. **Funcionalidades:** `ul` em grade (1 coluna; `md:grid-cols-2`; `lg:grid-cols-4`), cada item num cartão com `h3` = `lead` e `p` = `text`. Os nomes internos da tabela da copy ("Registro rápido", "Painel do mês"…) **não** aparecem (decisão 158).
  6. **Benefícios:** duas listas lado a lado a partir de `md` (funcionais, emocionais), sem os rótulos "Funcionais"/"Emocionais" da copy (decisão 158).
  7. **Experiência:** texto, `ul` dos cinco itens e a frase de destaque.
  8. **Confiança:** `ul` com `trust` (a prop; `md:grid-cols-2`).
  9. **CTA final:** painel `bg-brand-wash border-brand-wash-border rounded-hero`, título, texto, CTA principal, microcopy.
- `<footer>`: `<nav aria-label="Textos legais">` com "Termos de uso" (`/termos`) e "Política de privacidade" (`/privacidade`), `min-h-11` (mesmo padrão de `src/app/(legal)/layout.tsx`).
- Largura: `mx-auto w-full max-w-[1180px] px-4 md:px-9`; ritmo vertical `gap-16 md:gap-24`; texto de corpo 16–17 px; títulos `text-[28px] md:text-[34px]` (h2) e `text-[34px] md:text-[48px] lg:text-[56px]` (h1), `tracking-tight text-ink`.

`HeroPreview` (decisão 162): cartão desenhado só com HTML/CSS e `Money` (nenhum número escrito como texto), com os rótulos já aprovados e os números do protótipo `Desktop.dc.html`: "Seu mês até agora", "Disponível" `<Money cents={124000} />`, "Entrou" 500000, "Saiu" 346000, "Guardado este mês" 30000 e "Seu maior gasto foi com **Mercado**: <Money cents={89000} />." A raiz tem `aria-hidden="true"` e `data-landing-preview`.

`src/app/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { trustItems } from '@/features/landing/content'
import { LandingPage } from '@/features/landing/landing-page'
import { DATA_RIGHTS_RELEASED } from '@/features/landing/release'
import { SEO_DESCRIPTION, SEO_TITLE } from '@/features/landing/seo'
import { CONTROLLER, isLegalReady } from '@/features/legal/controller'

// Estática: nenhuma leitura de sessão. Quem já entrou nunca chega aqui (o proxy leva para /inicio).
export const dynamic = 'force-static'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'pt_BR', siteName: 'Íris', url: '/', title: SEO_TITLE, description: SEO_DESCRIPTION },
}

export default function Home() {
  return <LandingPage trust={trustItems({ legalReady: isLegalReady(CONTROLLER), dataReleased: DATA_RIGHTS_RELEASED })} />
}
```

(`SEO_TITLE`/`SEO_DESCRIPTION` são criados na Task 4; nesta tarefa, crie já `src/features/landing/seo.ts` só com as duas constantes da copy, "Meta (SEO)": `'Íris — Veja para onde seu dinheiro vai'` e `'App gratuito de finanças pessoais. Anote seus gastos em segundos e entenda seu mês de um jeito simples, visual e sem planilha.'`.)

`src/app/(auth)/layout.tsx`: o `<Logo />` vira `<Link href="/" aria-label="Íris, página inicial" className="flex min-h-11 w-fit items-center"><Logo /></Link>` (o mesmo rótulo aprovado das páginas legais; decisão 161).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/landing src/app/page.test.ts "src/app/(auth)"`
Expected: PASS.

Run: `npm run build`
Expected: build sem erros; na tabela de rotas, `○ /` (estática).

- [ ] **Step 5: Commit**

```bash
git add src/features/landing src/app/page.tsx src/app/page.test.ts "src/app/(auth)/layout.tsx" "src/app/(auth)/layout.test.tsx"
git commit -m "feat(landing): página pública estática com as seções 1–9 da copy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `/` para quem entrou, SEO, robots, sitemap e imagem de compartilhamento

**Files:**
- Create: `src/app/robots.ts`, `src/app/sitemap.ts`, `src/features/landing/seo.test.ts`, `src/lib/env.test.ts`, `src/app/opengraph-image.alt.txt`, `src/app/opengraph-image.png` (gerado), `src/app/opengraph-image.test.ts`
- Modify: `src/features/landing/seo.ts`, `src/features/auth/routes.ts` (+ `routes.test.ts`), `src/proxy.test.ts`, `src/lib/env.ts`, `src/app/layout.tsx`, `scripts/gerar-icones.mjs`

**Interfaces:**
- Produces (`seo.ts`):
  - `SEO_TITLE`, `SEO_DESCRIPTION` (Task 3).
  - `PRIVATE_PREFIXES: readonly string[]` — `'/inicio', '/extrato', '/anotar', '/contas', '/cartoes', '/metas', '/planejamento', '/relatorios', '/familia', '/categorias', '/configuracoes', '/mais', '/boas-vindas', '/convite/', '/nova-senha', '/recuperar-senha', '/confirmar-email', '/cadastro-excluido', '/auth/', '/api/'`.
  - `robotsFor(siteUrl: string): MetadataRoute.Robots` — `{ rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }, sitemap: \`${siteUrl}/sitemap.xml\` }`.
  - `sitemapFor(siteUrl: string, legalReady: boolean): MetadataRoute.Sitemap` — `/` sempre (`changeFrequency: 'monthly'`, `priority: 1`); `/termos` e `/privacidade` só com `legalReady`.
- Produces (`routes.ts`): `'/'` em `ANON_ONLY`; `'/robots.txt'` e `'/sitemap.xml'` em `PUBLIC`.
- Produces (`env.ts`): `env.siteUrl` sem barra no fim.

- [ ] **Step 1: Escrever os testes que falham**

`src/features/landing/seo.test.ts`:

```ts
import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { PRIVATE_PREFIXES, robotsFor, sitemapFor } from './seo'

const SITE = 'https://iris.exemplo'
const blocked = (path: string) => PRIVATE_PREFIXES.some((p) => path.startsWith(p))
const dirs = (group: string) => readdirSync(`src/app/${group}`, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/${d.name}`)

test('robots: toda área do app e do onboarding fica fora; as páginas públicas, dentro', () => {
  for (const path of [...dirs('(app)'), ...dirs('(onboarding)'), '/convite/abc', '/nova-senha', '/api/jobs/notificacoes', '/auth/callback']) {
    expect(blocked(path), path).toBe(true)
  }
  for (const path of ['/', '/entrar', '/criar-cadastro', '/termos', '/privacidade']) expect(blocked(path), path).toBe(false)
  expect(robotsFor(SITE)).toEqual({ rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }, sitemap: `${SITE}/sitemap.xml` })
})

test('sitemap: só a landing enquanto os textos jurídicos são rascunho; Termos e Privacidade só quando prontos', () => {
  expect(sitemapFor(SITE, false).map((e) => e.url)).toEqual([`${SITE}/`])
  expect(sitemapFor(SITE, true).map((e) => e.url)).toEqual([`${SITE}/`, `${SITE}/termos`, `${SITE}/privacidade`])
})
```

Em `src/features/auth/routes.test.ts`, acrescentar:

```ts
test('/ é só para quem não entrou; robots e sitemap são públicos, por caminho exato', () => {
  expect(isPublicPath('/')).toBe(true)
  expect(isAnonOnlyPath('/')).toBe(true)
  expect(isPublicPath('/robots.txt')).toBe(true)
  expect(isPublicPath('/sitemap.xml')).toBe(true)
  expect(isPublicPath('/robots.txt/x')).toBe(false)
  expect(isPublicPath('/sitemap.xml.bak')).toBe(false)
  expect(isAnonOnlyPath('/termos')).toBe(false)
})
```

Em `src/proxy.test.ts`, acrescentar:

```ts
test('robots e sitemap passam pelo proxy (públicos pela lista); a imagem de compartilhamento não passa', () => {
  expect(matcher.test('/robots.txt')).toBe(true)
  expect(matcher.test('/sitemap.xml')).toBe(true)
  expect(matcher.test('/opengraph-image.png')).toBe(false)
})
```

`src/lib/env.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

test('o endereço do site perde a barra do fim (evita "//convite" e "//sitemap.xml")', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'x'.repeat(30))
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://iris.exemplo//')
  const { env } = await import('./env')
  expect(env.siteUrl).toBe('https://iris.exemplo')
})
```

`src/app/opengraph-image.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { SEO_TITLE } from '@/features/landing/seo'

test('imagem de compartilhamento: 1200×630, com o título da copy como texto alternativo', async () => {
  const meta = await sharp(readFileSync('src/app/opengraph-image.png')).metadata()
  expect([meta.width, meta.height]).toEqual([1200, 630])
  expect(readFileSync('src/app/opengraph-image.alt.txt', 'utf8').trim()).toBe(SEO_TITLE)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/landing/seo.test.ts src/features/auth/routes.test.ts src/proxy.test.ts src/lib/env.test.ts src/app/opengraph-image.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `routes.ts`: `PUBLIC` ganha `'/robots.txt'` e `'/sitemap.xml'`; `ANON_ONLY` ganha `'/'`. O proxy (`src/lib/supabase/proxy.ts`) não muda: `data.user && isAnonOnlyPath(path)` já redireciona para `/inicio`.
- `seo.ts`: como em Interfaces.
- `src/app/robots.ts`: `export default function robots(): MetadataRoute.Robots { return robotsFor(env.siteUrl) }`.
- `src/app/sitemap.ts`: `export default function sitemap(): MetadataRoute.Sitemap { return sitemapFor(env.siteUrl, isLegalReady(CONTROLLER)) }`.
- `env.ts`: `siteUrl: parsed.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')` (pendência do Plano 7). Conferir que `src/features/notificacoes/deliver.ts` continua aparando por conta própria (sem efeito novo).
- `src/app/layout.tsx`: `metadata` passa a `{ metadataBase: new URL(env.siteUrl), title: SEO_TITLE, description: SEO_DESCRIPTION, appleWebApp: … }` (mesmos textos de hoje, agora de `seo.ts`).
- `scripts/gerar-icones.mjs`: nova saída `src/app/opengraph-image.png`, 1200×630: fundo `#EEF4E9` (brand-wash) de ponta a ponta e o logo provisório (círculo `#A0E870` com o olho) centralizado, com 360 px de diâmetro; **sem texto na imagem** (fonte do sistema varia de máquina para máquina). O formato das saídas passa a aceitar largura e altura (`[caminho, svg, largura, altura]`). Rodar `npm run icons` e commitar o PNG gerado.
- `src/app/opengraph-image.alt.txt`: `Íris — Veja para onde seu dinheiro vai` (o título da copy).

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2, depois `npm test && npx tsc --noEmit && npm run build`.
Expected: PASS; na tabela de rotas do build, `○ /robots.txt`, `○ /sitemap.xml` e `○ /`.

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/seo.ts src/features/landing/seo.test.ts src/app/robots.ts src/app/sitemap.ts src/features/auth/routes.ts src/features/auth/routes.test.ts src/proxy.test.ts src/lib/env.ts src/lib/env.test.ts src/app/layout.tsx scripts/gerar-icones.mjs src/app/opengraph-image.png src/app/opengraph-image.alt.txt src/app/opengraph-image.test.ts
git commit -m "feat(landing): / leva quem entrou ao Seu mês; SEO, robots, sitemap e imagem de compartilhamento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Seu mês e mês da família — três colunas só a partir de 1024 px

**Files:**
- Modify: `src/app/(app)/inicio/page.tsx`, `src/features/seu-mes/hero.tsx`, `src/features/seu-mes/categories-card.tsx`, `src/features/seu-mes/featured-goal.tsx`, `src/features/seu-mes/planned-card.tsx`, `src/features/familia/family-month.tsx`
- Test: `src/features/seu-mes/grid-breakpoint.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: grades `grid gap-3 md:gap-4 lg:grid-cols-3 lg:grid-flow-dense`; blocos largos com `lg:col-span-2` (era `md:`).

- [ ] **Step 1: Escrever o teste que falha**

`src/features/seu-mes/grid-breakpoint.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// De 768 a 1023 px o menu lateral já ocupa 248 px: três colunas ali ficariam com ~140 px.
const GRIDS = ['src/app/(app)/inicio/page.tsx', 'src/features/familia/family-month.tsx']
const SPANS = ['src/features/seu-mes/hero.tsx', 'src/features/seu-mes/categories-card.tsx', 'src/features/seu-mes/featured-goal.tsx', 'src/features/seu-mes/planned-card.tsx', 'src/features/familia/family-month.tsx']

test('as grades do mês só abrem em três colunas a partir de 1024 px, sem buracos', () => {
  for (const f of GRIDS) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/md:grid-cols-3/)
    expect(src, f).toContain('lg:grid-cols-3 lg:grid-flow-dense')
  }
  for (const f of SPANS) {
    const src = readFileSync(f, 'utf8')
    expect(src, f).not.toMatch(/md:col-span-2/)
    expect(src, f).toContain('lg:col-span-2')
  }
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/seu-mes/grid-breakpoint.test.ts`
Expected: FAIL — `md:grid-cols-3` encontrado.

- [ ] **Step 3: Implementar**

Nos dois arquivos de grade: `grid gap-3 md:grid-cols-3 md:gap-4` → `grid gap-3 md:gap-4 lg:grid-cols-3 lg:grid-flow-dense`. Nos cinco componentes: `md:col-span-2` → `lg:col-span-2`. Os cabeçalhos (`md:flex-row`) ficam como estão (cabem em 520 px). Nada muda abaixo de 768 px.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/seu-mes src/features/familia && npx tsc --noEmit`
Expected: PASS; os testes existentes de Seu mês e família continuam passando.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/inicio/page.tsx" src/features/seu-mes src/features/familia/family-month.tsx
git commit -m "fix(desktop): Seu mês e mês da família em três colunas só a partir de 1024 px" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Relatórios e Planejamento no desktop

**Files:**
- Modify: `src/app/(app)/relatorios/page.tsx`, `src/app/(app)/planejamento/page.tsx`
- Test: `src/app/(app)/relatorios/page.test.tsx`, `src/app/(app)/planejamento/page.test.tsx`

**Interfaces:**
- Consumes: `Columns`, `MainColumn`, `AsideColumn`, `WIDE` (Task 2).
- Produces: nada para outras tarefas.

Arranjo (decisão 167; a ordem do DOM é a do celular):

| Tela | Fora das colunas (largura toda) | `AsideColumn row={1}` (antes no DOM) | `MainColumn` | `AsideColumn row={2}` (depois no DOM) |
|---|---|---|---|---|
| Relatórios | título, período | — | "O que mudou", "Entrou e saiu", "Mês a mês" | "Para onde seu dinheiro vai" (como `row={1}`, mas **depois** da principal no DOM) |
| Planejamento | título, texto de apoio, mês, aviso de erro | resumo "Planejado para {mês}" | linhas + "Planejar outra categoria" | "O que é "Planejado"?" |

Estados vazios continuam sem colunas, em uma coluna. As duas telas ganham `WIDE` no `main`.

- [ ] **Step 1: Escrever os testes que falham**

`src/app/(app)/relatorios/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ empty: false }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ usePathname: () => '/relatorios', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/registro/queries', () => ({ loadLedger: async () => ({ profile: {}, categories: [], transactions: [], goalMovements: [] }) }))
vi.mock('@/features/relatorios/view-model', () => ({
  buildRelatorios: () => ({ empty: h.empty, summary: {}, changes: [], chart: [{}], months: [], categories: [{ name: 'Mercado', cents: 100, share: 1 }] }),
}))
vi.mock('@/features/relatorios/period-filter', () => ({ PeriodFilter: () => <nav aria-label="Período" /> }))
vi.mock('@/features/relatorios/report-sections', () => ({
  WhatChanged: () => <h2>O que mudou</h2>,
  MonthByMonth: () => <h2>Mês a mês</h2>,
}))
vi.mock('@/features/relatorios/in-out-chart', () => ({ InOutChart: () => <h2>Entrou e saiu</h2> }))
vi.mock('@/features/seu-mes/categories-card', () => ({ CategoriesCard: () => <h2>Para onde seu dinheiro vai</h2> }))

const { default: RelatoriosPage } = await import('./page')
const show = async () => render(await RelatoriosPage({ searchParams: Promise.resolve({}) }))
const column = (name: string) => screen.getByRole('heading', { name, exact: true }).closest('[data-column]')?.getAttribute('data-column')

afterEach(() => { cleanup(); h.empty = false })

test('desktop: relatórios à esquerda, categorias à direita; a ordem do DOM continua a do celular', async () => {
  const { container } = await show()
  expect(['O que mudou', 'Entrou e saiu', 'Mês a mês'].map(column)).toEqual(['main', 'main', 'main'])
  expect(column('Para onde seu dinheiro vai')).toBe('aside')
  const order = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
  expect(order).toEqual(['O que mudou', 'Entrou e saiu', 'Mês a mês', 'Para onde seu dinheiro vai'])
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})

test('sem registros: uma coluna só', async () => {
  h.empty = true
  const { container } = await show()
  expect(container.querySelector('[data-columns]')).toBeNull()
})
```

`src/app/(app)/planejamento/page.test.tsx` — mesmo padrão (mocks de `loadLedger`, `loadBudgets` em `@/features/planejamento/queries`, `repeatPreviousBudgets` em `@/features/planejamento/actions`, `buildPlanejamento` devolvendo `{ empty, heroLabel: 'Planejado para outubro', totalCents: 100000, withinText: 'Você está dentro do planejado em 1 de 1 categorias.', lines: [], editHref: '/planejamento/editar', repeatFrom: null }`, `BudgetLines` como `<ul aria-label="Linhas" />` e `MonthNav` como `<nav aria-label="Mês" />`), com os testes:

```tsx
test('desktop: resumo à direita em cima, linhas à esquerda, ajuda à direita embaixo; DOM na ordem do celular', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  const parts = [...root.children].map((c) => [c.getAttribute('data-column'), c.getAttribute('data-row')])
  expect(parts).toEqual([['aside', '1'], ['main', null], ['aside', '2']])
  expect(within(root.children[0] as HTMLElement).getByText('Planejado para outubro')).toBeTruthy()
  expect(within(root.children[1] as HTMLElement).getByRole('link', { name: 'Planejar outra categoria', exact: true })).toBeTruthy()
  expect((root.children[2] as HTMLElement).textContent).toContain('O que é "Planejado"?')
})

test('sem planejado: uma coluna só, com "Planejar meu mês"', async () => {
  h.empty = true
  const { container } = await show()
  expect(container.querySelector('[data-columns]')).toBeNull()
  expect(screen.getByRole('link', { name: 'Planejar meu mês', exact: true })).toBeTruthy()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(app)/relatorios" "src/app/(app)/planejamento"`
Expected: FAIL — `data-column` ausente.

- [ ] **Step 3: Implementar** conforme a tabela; no Planejamento, o parágrafo de ajuda vai para `AsideColumn row={2}` quando há planejado e continua no fim (fora das colunas) no estado vazio.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2 e `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/relatorios" "src/app/(app)/planejamento/page.tsx" "src/app/(app)/planejamento/page.test.tsx"
git commit -m "feat(desktop): Relatórios e Planejamento em duas colunas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Contas, Extrato, Metas e a meta no desktop

**Files:**
- Modify: `src/app/(app)/contas/page.tsx`, `src/app/(app)/extrato/page.tsx`, `src/app/(app)/metas/page.tsx`, `src/features/metas/metas-list.tsx`, `src/app/(app)/metas/[id]/page.tsx`
- Test: `src/app/(app)/contas/page.test.tsx`, `src/app/(app)/extrato/page.test.tsx`, `src/features/metas/metas-list.test.tsx` (acrescentar), `src/app/(app)/metas/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `Columns`, `MainColumn`, `AsideColumn`, `WIDE` (Task 2).

Arranjo (decisões 167 e 169):

| Tela | Fora das colunas | `AsideColumn row={1}` | `MainColumn` | `AsideColumn row={2}` |
|---|---|---|---|---|
| Contas | aviso de pagar (notificação), título + "Nova conta", mês, erro, abas | "Resumo do mês" e o cartão "Quer um lembrete…" | lista da aba, "Entradas a receber" | "Contas que se repetem", "Entradas que se repetem" |
| Extrato | título + mês | barra de busca e filtros | lista | — |
| Meta (pessoal) | cabeçalho, erro | — | resumo da meta e ações | "Histórico" (depois da principal no DOM, `row={1}`) |
| Meta da família | cabeçalho, erro, detalhe | sem colunas; `main` continua `max-w-[560px]` | | |

Metas: cada lista ("Só suas", "Da família") vira `grid gap-2 lg:grid-cols-2` (cartões lado a lado); `main` com `WIDE`. Contas, Extrato e a meta pessoal com `WIDE`.

- [ ] **Step 1: Escrever os testes que falham**

`src/app/(app)/contas/page.test.tsx` (padrão de `configuracoes/page.test.tsx`; mocks de `loadLedger`, `loadRecurrences`, `buildContas` devolvendo `{ label: 'outubro', counts: { 'a-pagar': 1, pagas: 0, vencidas: 0 }, aPagarLabel: 'A pagar em outubro', aPagarCents: 100, disponivelDepoisCents: 50, bills: [{}], incomes: [{}], recurringBills: [], recurringIncomes: [{}], payable: [] }` — ajustar os campos aos tipos reais de `src/features/contas/view-model.ts` —, `payTarget` → `null`, `@/lib/env` com `vapidPublicKey: 'k'`, `BillsReminderCard` → `<p>lembrete</p>`, e `contas-sections` com `ContasTabs` → `<nav aria-label="Situação das contas" />`, `BillsList` → `<h2>Contas da aba</h2>`, `IncomeList` → `<h2>Entradas a receber</h2>`, `RecurringList` → `({ title }) => <h2>{title}</h2>`, `contasHref` → `() => '/contas'`):

```tsx
test('desktop: resumo e lembrete à direita em cima, lista à esquerda, recorrências à direita embaixo; DOM do celular', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect([...root.children].map((c) => [c.getAttribute('data-column'), c.getAttribute('data-row')])).toEqual([['aside', '1'], ['main', null], ['aside', '2']])
  expect(within(root.children[0] as HTMLElement).getByRole('region', { name: 'Resumo do mês' })).toBeTruthy()
  expect((root.children[0] as HTMLElement).textContent).toContain('lembrete')
  expect(within(root.children[1] as HTMLElement).getAllByRole('heading').map((x) => x.textContent)).toEqual(['Contas da aba', 'Entradas a receber'])
  expect(within(root.children[2] as HTMLElement).getAllByRole('heading').map((x) => x.textContent)).toEqual(['Contas que se repetem', 'Entradas que se repetem'])
  expect(screen.getByRole('navigation', { name: 'Situação das contas' }).closest('[data-columns]')).toBeNull()
})
```

`src/app/(app)/extrato/page.test.tsx` (mocks de `loadLedger`, `loadCards`, `loadGoals`, `loadFamilyGoalLabels`, `loadFamilySummary` → `null`, `buildExtrato` → `{ filters: { month: '2026-10' }, monthLabel: 'outubro', categoryName: null, cardName: null }`, `extratoParams` → `{}`, `FiltersBar` → `<nav aria-label="Filtros" />`, `ExtratoList` → `<h2>Lista</h2>`, `MonthNav` → `<nav aria-label="Mês" />`):

```tsx
test('desktop: filtros à direita, lista à esquerda; filtros antes da lista no DOM (como no celular)', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect([...root.children].map((c) => c.getAttribute('data-column'))).toEqual(['aside', 'main'])
  expect(within(root.children[0] as HTMLElement).getByRole('navigation', { name: 'Filtros' })).toBeTruthy()
  expect(within(root.children[1] as HTMLElement).getByRole('heading', { name: 'Lista' })).toBeTruthy()
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})
```

Em `src/features/metas/metas-list.test.tsx`, acrescentar:

```tsx
test('desktop: os cartões de cada lista ficam em duas colunas a partir de 1024 px', () => {
  // renderizar com uma meta pessoal e uma da família, como nos testes vizinhos
  for (const name of ['Só suas', 'Da família']) {
    const list = screen.getByRole('heading', { name, exact: true }).nextElementSibling as HTMLElement
    expect(list.className).toContain('grid')
    expect(list.className).toContain('lg:grid-cols-2')
  }
})
```

`src/app/(app)/metas/[id]/page.test.tsx` (mocks de `resolveGoal` → `h.data`, `buildGoalDetail`/`buildFamilyGoalDetail` → `{ history: [] }`, `goal-detail` com `GoalHero` → `<h2>Resumo</h2>`, `GoalActions` → `<h2>Ações</h2>`, `GoalHistory` → `<h2>Histórico</h2>`, `FamilyGoalDetail` → `<h2>Detalhe da família</h2>`):

```tsx
const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
test('meta pessoal: resumo e ações à esquerda, histórico à direita, nessa ordem no DOM', async () => {
  h.data = { kind: 'personal', goal: { id: UUID, name: 'Viagem' }, movements: [] }
  await show(UUID)
  expect(['Resumo', 'Ações', 'Histórico'].map(column)).toEqual(['main', 'main', 'aside'])
})
test('meta da família: uma coluna, largura de leitura', async () => {
  h.data = { kind: 'family', goal: { id: UUID, name: 'Casa' }, movements: [], uses: [], isAdmin: false, canEdit: false }
  const { container } = await show(UUID)
  expect(container.querySelector('[data-columns]')).toBeNull()
  expect(container.querySelector('main')?.className).not.toContain('lg:max-w-[1180px]')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(app)/contas/page.test.tsx" "src/app/(app)/extrato/page.test.tsx" src/features/metas/metas-list.test.tsx "src/app/(app)/metas/[id]/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implementar** conforme a tabela. Nas Contas, `PayFromNotification` continua o primeiro filho do `main`; `BillsReminderCard` só aparece nas mesmas condições de hoje.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2, depois `npm test` (inclui `src/app/(app)/pay-pages.test.tsx`, que percorre a árvore da página Contas: precisa continuar passando sem alteração).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/contas" "src/app/(app)/extrato/page.tsx" "src/app/(app)/extrato/page.test.tsx" "src/app/(app)/metas" src/features/metas/metas-list.tsx src/features/metas/metas-list.test.tsx
git commit -m "feat(desktop): Contas, Extrato, Metas e a meta em duas colunas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Família, Configurações, Instalar e Cartões no desktop

**Files:**
- Modify: `src/features/familia/familia-page.tsx`, `src/app/(app)/configuracoes/page.tsx`, `src/features/pwa/install-card.tsx`, `src/app/(app)/configuracoes/instalar/page.tsx`, `src/features/cartoes/cards-list.tsx`, `src/app/(app)/cartoes/page.tsx`
- Test: `src/features/familia/familia-page.test.tsx`, `src/app/(app)/configuracoes/page.test.tsx`, `src/features/pwa/install-card.test.tsx`, `src/app/(app)/configuracoes/instalar/page.test.tsx` (novo), `src/features/cartoes/cards-list.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `Columns`, `MainColumn`, `AsideColumn`, `WIDE` (Task 2).
- Produces: `InstallCard({ nextHref, skipWhenInstalled?, wide? }: { …; wide?: boolean })` — `wide` só na tela de Configurações.

Arranjo (decisões 167, 168, 170):
- **Família (com família):** `MainColumn` = "Ver o mês da família", "Contas da família", "Quem participa", "Convidar pessoa"; `AsideColumn` (depois no DOM) = "Avisos da família", "O que a família vê", sair da família. Sem família ("Criar família"): uma coluna. `WIDE` no `main` com família.
- **Configurações:** as seções num contêiner `data-settings-columns` com `flex flex-col gap-[18px] lg:block lg:columns-2 lg:gap-x-6` e, em cada seção, `break-inside-avoid lg:mb-[18px]` (duas colunas de jornal: lê-se de cima para baixo na primeira coluna e depois na segunda, a mesma ordem do DOM e do celular). `WIDE` no `main`.
- **Instalar (Configurações → App):** `wide` → a partir de `lg`, o quadro do logo à esquerda (260 × 260) e título, texto e botões à direita; o espaço vazio do topo (`h-11`) e o espaçador `flex-1` somem em `lg`. `main` com `max-w-[480px] lg:max-w-[880px]`. No onboarding (`wide` ausente) nada muda.
- **Cartões:** a lista de cartões ilustrativos vira `grid gap-3 lg:grid-cols-2` (marcada com `data-cards-grid`); `main` com `lg:max-w-[1180px]`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/features/familia/familia-page.test.tsx`, acrescentar (com a view de quem administra e tem avisos, como nos testes vizinhos):

```tsx
test('desktop: participantes e convite à esquerda; avisos, "O que a família vê" e sair à direita, depois no DOM', () => {
  render(<FamiliaPage view={adminViewWithEvents} />)
  const col = (name: string) => screen.getByRole('heading', { name, exact: true }).closest('[data-column]')?.getAttribute('data-column')
  expect(['Quem participa', 'Convidar pessoa'].map(col)).toEqual(['main', 'main'])
  expect(['Avisos da família', 'O que a família vê'].map(col)).toEqual(['aside', 'aside'])
})
test('sem família: uma coluna', () => {
  const { container } = render(<FamiliaPage view={noFamilyView} />)
  expect(container.querySelector('[data-columns]')).toBeNull()
})
```

Em `src/app/(app)/configuracoes/page.test.tsx`, acrescentar:

```tsx
test('desktop: seções em duas colunas de jornal, sem quebrar uma seção ao meio, na ordem do celular', async () => {
  const { container } = await show()
  const wrap = container.querySelector('[data-settings-columns]') as HTMLElement
  expect(wrap.className).toContain('lg:columns-2')
  for (const region of within(wrap).getAllByRole('region')) expect((region.closest('[data-settings-columns] > *') as HTMLElement).className).toContain('break-inside-avoid')
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})
```

Em `src/features/pwa/install-card.test.tsx`, acrescentar:

```tsx
test('largo (Configurações): duas colunas a partir de 1024 px; no onboarding, nenhuma classe de desktop', () => {
  const { container, unmount } = render(<InstallCard nextHref="/configuracoes" wide />)
  expect((container.firstChild as HTMLElement).className).toContain('lg:grid')
  unmount()
  const { container: c2 } = render(<InstallCard nextHref="/boas-vindas/primeiro-gasto" skipWhenInstalled />)
  expect(c2.innerHTML).not.toMatch(/\blg:/)
})
```

`src/app/(app)/configuracoes/instalar/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/features/pwa/install-card', () => ({ InstallCard: (p: Record<string, unknown>) => { seen.props = p; return null } }))
const { default: InstalarPage } = await import('./page')
afterEach(() => cleanup())

test('Configurações → Instalar usa o cartão largo e volta para Configurações', () => {
  const { container } = render(<InstalarPage />)
  expect(seen.props).toEqual({ nextHref: '/configuracoes', wide: true })
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[880px]')
})
```

Em `src/features/cartoes/cards-list.test.tsx`, acrescentar:

```tsx
test('desktop: cartões em duas colunas a partir de 1024 px', () => {
  // renderizar com dois cartões, como no teste vizinho
  const grid = container.querySelector('[data-cards-grid]') as HTMLElement
  expect(grid.className).toContain('lg:grid-cols-2')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia/familia-page.test.tsx "src/app/(app)/configuracoes" src/features/pwa/install-card.test.tsx src/features/cartoes/cards-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** conforme o arranjo.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2 e `npm test`.
Expected: PASS; o teste "Seus dados é a última seção" continua passando (a ordem não mudou).

- [ ] **Step 5: Commit**

```bash
git add src/features/familia/familia-page.tsx src/features/familia/familia-page.test.tsx "src/app/(app)/configuracoes" src/features/pwa/install-card.tsx src/features/pwa/install-card.test.tsx src/features/cartoes/cards-list.tsx src/features/cartoes/cards-list.test.tsx "src/app/(app)/cartoes/page.tsx"
git commit -m "feat(desktop): Família, Configurações, Instalar e Cartões com layout próprio" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Acessibilidade adiada do Plano 7

**Files:**
- Modify: `src/features/familia/view-model.ts` (+ `view-model.test.ts`), `src/features/familia/familia-page.tsx`, `src/features/familia/invite-screen.tsx` (+ `invite-screen.test.tsx`), `src/features/metas/metas-list.tsx` (+ `metas-list.test.tsx`)

**Interfaces:**
- Produces: o item de `FamiliaPageView.members` ganha `actionName: string` — igual a `label`, ou `\`${label} (${n})\`` quando dois ou mais participantes **ativos** têm o mesmo `label` (`n` = posição, a partir de 1, entre os que têm aquele nome, na ordem da lista). `MemberActions` recebe `name={m.actionName}`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/features/familia/view-model.test.ts`, acrescentar (montando a família no padrão dos testes vizinhos):

```ts
test('nomes repetidos ganham a posição nos botões de remover e de tornar administrador; nomes únicos, não', () => {
  const view = buildFamiliaPage({ family: familyWith(['Camila', 'Ana', 'Ana', 'Bruno']), today: '2026-10-03' })
  const others = view.kind === 'family' ? view.members.filter((m) => !m.isMe) : []
  expect(others.map((m) => m.actionName)).toEqual(['Ana (1)', 'Ana (2)', 'Bruno'])
  expect(others.map((m) => m.label)).toEqual(['Ana', 'Ana', 'Bruno'])
})
```

Em `src/features/familia/invite-screen.test.tsx`, acrescentar:

```tsx
test('convite que não vale mais e quem já tem família: a frase é o título da página', () => {
  render(<InviteScreen view={{ kind: 'invalid' }} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Este convite não vale mais. Peça um novo link a quem convidou você.' })).toBeTruthy()
  cleanup()
  render(<InviteScreen view={{ kind: 'has-family' }} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Você já participa de uma família. Para entrar em outra, saia da atual primeiro.' })).toBeTruthy()
})
```

Em `src/features/metas/metas-list.test.tsx`, acrescentar:

```tsx
test('"Da família" é uma região com nome, como "Só suas"', () => {
  // renderizar com uma meta da família
  expect(screen.getByRole('region', { name: 'Da família' })).toBeTruthy()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/familia src/features/metas/metas-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** — `actionName` no view-model (sem mudar `label`, que é o nome visível na lista); `familia-page.tsx` passa `m.actionName` a `MemberActions`; em `invite-screen.tsx` os dois `<p>` viram `<h1 className="text-[22px] font-semibold leading-snug tracking-tight text-ink">` com o mesmo texto; em `metas-list.tsx`, a seção "Da família" ganha `aria-labelledby` para o seu `h2` (com `id`), como "Só suas".

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2 e `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/familia src/features/metas/metas-list.tsx src/features/metas/metas-list.test.tsx
git commit -m "fix(a11y): nomes repetidos na família, título das telas de convite e região Da família" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conferência de textos (`npm run textos`)

**Files:**
- Create: `docs/copy/documento-base.md`, `scripts/conferir-textos.mjs`, `scripts/conferir-textos/normalizar.mjs`, `scripts/conferir-textos/extrair.mjs`, `scripts/conferir-textos/fontes.mjs`, `scripts/conferir-textos/ignorar.json`, `scripts/conferir-textos/core.test.mjs`
- Modify: `vitest.config.ts` (`include` ganha `'scripts/**/*.test.mjs'`), `package.json` (`"textos": "node scripts/conferir-textos.mjs"`)

**Interfaces:**
- Produces (`normalizar.mjs`): `normalize(s: string): string` — NFC; entidades `&quot; &apos; &amp; &nbsp; &#39;` decodificadas; aspas “ ” « » → `"`, ‘ ’ → `'`; remove `**`, `*`, `_` de ênfase e crases; qualquer `{…}` → `{}`; espaços (inclusive U+00A0 e U+202F) colapsados; `trim`.
- Produces (`extrair.mjs`): `extractStrings(code: string, fileName: string): { text: string; line: number }[]` (usa `typescript.createSourceFile`, `ScriptKind.TSX` para `.tsx`, `JS` para `.js`); `extractHtml(html: string): { text: string; line: number }[]` (texto entre tags e os atributos `alt`, `title`, `aria-label`, ignorando `<style>`/`<script>` e `{{ … }}` do Supabase, que vira `{}`).
- Produces (`fontes.mjs`): `sectionText(md: string, heading: RegExp): string` (do título que casa até o próximo título de mesmo nível ou maior); `loadCorpus(root: string): { copy: string; listed: string }` — `copy` = `docs/copy/documento-base.md`; `listed` = `docs/etapa-2-requisitos.md` inteiro + `docs/etapa-5-ui.md` ("Textos novos aprovados") + `docs/decisoes-para-revisao.md` inteiro + a seção "## Textos novos" de cada `docs/superpowers/plans/*.md`; ambos normalizados. Sem `docs/copy/documento-base.md`, lança `Error('Falta docs/copy/documento-base.md: exporte o documento de copy (README, "Conferência de textos").')`.
- Produces (`conferir-textos.mjs`): `classify(text: string, corpus: { copy: string; listed: string }): 'copy' | 'listed' | 'unlisted'` (normaliza o texto; `copy` se for trecho de `corpus.copy`, senão `listed` se for trecho de `corpus.listed`, senão `unlisted`; um texto que, normalizado, termina em `.` também casa sem o ponto final); `run(root: string): { unlisted: Finding[]; counts: Record<'copy'|'listed'|'unlisted'|'ignored', number> }` com `Finding = { file: string; line: number; text: string }`; quando chamado pela linha de comando, imprime os achados `arquivo:linha  "texto"` agrupados e sai com código 1 se houver algum `unlisted`, 2 se faltar a cópia da copy, 0 se tudo estiver na copy ou nas listas.

Regras de extração (`extractStrings`), na ordem:
1. Texto JSX (`JsxText`) não vazio com letra → sempre candidato.
2. Atributo JSX `aria-label`, `title`, `placeholder`, `alt`, `label`, `caption`, `description`, `trigger`, `triggerAriaLabel`, `confirmLabel`, `empty` com texto (literal ou modelo) → candidato.
3. Demais literais e modelos (`${…}` vira `{}`), **exceto**: especificador de `import`/`export`; diretivas (`'use client'`, `'use server'`); nome de propriedade; argumento de `new Error(…)`, `console.*(…)`, `throw`; `className`/`class`; e textos técnicos — sem letra; sem espaço **e** sem maiúscula/acento (ex.: `'installed'`); só com marcas de Tailwind (todo pedaço casa `/^(?:[a-z0-9]+:)*!?-?[a-z][\w\-\[\]\/\.\(\)%#:,]*$/` e contém `-` ou `:`, ou é uma das palavras `flex grid block hidden inline truncate relative absolute fixed sticky underline`); com `_`, `*`, `(`, `)`, `=`, `/` ou `;` e sem maiúscula (listas de `select`, tipos MIME, caminhos); começando com `/`, `#`, `http`, `mailto:`.
4. Arquivos: `src/**/*.{ts,tsx}` exceto `*.test.*` e pastas `__scratch__`; `public/sw.js`; `public/sem-conexao.html`; `supabase/templates/*.html`.

`ignorar.json`: lista de `{ "texto": string, "motivo": string }`. Entrada sem `motivo` (ou com motivo vazio) faz o comando falhar com código 1 e a mensagem `ignorar.json: "{texto}" sem motivo`.

- [ ] **Step 1: Cópia local da copy**

Exportar o documento oficial pelo conector de documentos (`export`, formato `markdown`, do Claude Doc `GjLmkNKXindMZcm1z49gLq`, aba "Íris — Documento-base de comunicação"), decodificar o conteúdo e gravá-lo **sem nenhuma alteração** em `docs/copy/documento-base.md`, com uma primeira linha `<!-- Cópia do Claude Doc "Íris — Documento-base de comunicação", revisão {rev}, exportada em {AAAA-MM-DD}. A fonte é o documento; esta cópia só serve à conferência de textos. -->`. Conferir: o arquivo contém "Seção 1 — Hero" e "Seu próximo mês pode ser o primeiro que você realmente entende.".

- [ ] **Step 2: Escrever os testes que falham**

`scripts/conferir-textos/core.test.mjs`:

```js
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { normalize } from './normalizar.mjs'
import { extractHtml, extractStrings } from './extrair.mjs'
import { loadCorpus, sectionText } from './fontes.mjs'
import { classify, run } from '../conferir-textos.mjs'

const texts = (code, file = 'a.tsx') => extractStrings(code, file).map((s) => s.text)

test('normalize: aspas, entidades, ênfase, variáveis e espaços', () => {
  expect(normalize('“Camila”  convidou&nbsp;você')).toBe('"Camila" convidou você')
  expect(normalize('**Passou {valor} do planejado.**')).toBe('Passou {} do planejado.')
  expect(normalize('O que é &quot;Planejado&quot;?')).toBe('O que é "Planejado"?')
})

test('extrai texto de tela e deixa de fora o que é técnico', () => {
  const code = `
    import x from '@/features/a'
    'use client'
    const cls = 'flex px-4 md:pt-7 text-ink'
    const q = supabase.from('profiles').select('id, display_name')
    const t = \`Faltam \${v} para \${meta}.\`
    const prazo = 'vence hoje'
    const modo = mode === 'installed'
    if (!ok) throw new Error('Sessão necessária.')
    console.error('Falha ao enviar')
    const headers = { 'Content-Type': 'text/csv; charset=utf-8' }
    export const P = () => <p className="text-sm" aria-label="Voltar">Olá, Ana.</p>
  `
  expect(texts(code)).toEqual(['Faltam {} para {}.', 'vence hoje', 'Voltar', 'Olá, Ana.'])
})

test('extrai texto de HTML (página "Sem conexão", modelos de e-mail)', () => {
  const html = '<html><style>p{color:red}</style><h1>Sem conexão</h1><p>Olá {{ .SiteURL }}</p><img alt="Íris"></html>'
  expect(extractHtml(html).map((s) => s.text)).toEqual(['Sem conexão', 'Olá {}', 'Íris'])
})

test('sectionText: só a seção pedida', () => {
  const md = '# P\n## Decisões\nx "Fora"\n## Textos novos\n1. "Dentro"\n### Sub\n"Também"\n## Outra\n"Não"'
  expect(sectionText(md, /^## Textos novos/m)).toContain('"Dentro"')
  expect(sectionText(md, /^## Textos novos/m)).toContain('"Também"')
  expect(sectionText(md, /^## Textos novos/m)).not.toContain('"Não"')
  expect(sectionText(md, /^## Textos novos/m)).not.toContain('"Fora"')
})

test('classify: da copy, das listas ou fora delas', () => {
  const corpus = { copy: normalize('**Passou do planejado:** Passou {valor} do planejado. Quer ajustar o valor deste mês?'), listed: normalize('- "Pular para o conteúdo"') }
  expect(classify('Passou {} do planejado.', corpus)).toBe('copy')
  expect(classify('Pular para o conteúdo', corpus)).toBe('listed')
  expect(classify('Baixe o app agora', corpus)).toBe('unlisted')
})

function fixture({ ignore = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'textos-'))
  for (const d of ['docs/copy', 'docs/superpowers/plans', 'src/app', 'scripts/conferir-textos', 'public', 'supabase/templates']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, 'docs/copy/documento-base.md'), '<!-- cópia -->\nSeu dinheiro, finalmente à vista.')
  writeFileSync(join(root, 'docs/etapa-2-requisitos.md'), '')
  writeFileSync(join(root, 'docs/etapa-5-ui.md'), '## Textos novos aprovados\n- "Voltar"')
  writeFileSync(join(root, 'docs/decisoes-para-revisao.md'), '')
  writeFileSync(join(root, 'docs/superpowers/plans/p.md'), '## Textos novos\n1. "Pular para o conteúdo"\n## Outra')
  writeFileSync(join(root, 'scripts/conferir-textos/ignorar.json'), JSON.stringify(ignore))
  return root
}

test('texto fora das listas faz o comando falhar, com arquivo e linha', () => {
  const root = fixture()
  writeFileSync(join(root, 'src/app/page.tsx'), 'export default () => (\n  <main><h1>Seu dinheiro, finalmente à vista.</h1>\n<p>Baixe o app agora</p><a>Voltar</a></main>)')
  const r = run(root)
  expect(r.unlisted).toEqual([{ file: 'src/app/page.tsx', line: 3, text: 'Baixe o app agora' }])
  expect(r.counts).toMatchObject({ copy: 1, listed: 1, unlisted: 1 })
})

test('ignorar exige motivo', () => {
  const ok = fixture({ ignore: [{ texto: 'Íris DEV', motivo: 'nome do ambiente local, nunca aparece em produção' }] })
  writeFileSync(join(ok, 'src/app/page.tsx'), 'export default () => <p>Íris DEV</p>')
  expect(run(ok).unlisted).toEqual([])
  expect(run(ok).counts.ignored).toBe(1)
  const bad = fixture({ ignore: [{ texto: 'Íris DEV', motivo: '' }] })
  writeFileSync(join(bad, 'src/app/page.tsx'), 'export default () => <p>Íris DEV</p>')
  expect(() => run(bad)).toThrow('ignorar.json: "Íris DEV" sem motivo')
})

test('sem a cópia da copy: erro claro', () => {
  const root = mkdtempSync(join(tmpdir(), 'textos-'))
  expect(() => loadCorpus(root)).toThrow('Falta docs/copy/documento-base.md')
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run scripts/conferir-textos/core.test.mjs`
Expected: FAIL — módulos ausentes (depois de acrescentar `'scripts/**/*.test.mjs'` ao `include` do `vitest.config.ts`).

- [ ] **Step 4: Implementar** conforme as Interfaces. `conferir-textos.mjs` exporta `classify` e `run` e só executa a linha de comando quando é o módulo principal (`import.meta.url === pathToFileURL(process.argv[1]).href`). Saída da linha de comando (para o desenvolvedor, não é texto do app):

```
Conferência de textos — copy: {n} · listas: {n} · ignorados: {n} · fora das listas: {n}
Fora das listas (aprovar e listar em "Textos novos", ou corrigir):
  src/caminho/arquivo.tsx:12  "texto"
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run scripts/conferir-textos/core.test.mjs`
Expected: PASS (8 testes).

- [ ] **Step 6: Rodar no projeto e tratar cada achado**

Run: `npm run textos`
Para cada texto "fora das listas": (a) se **não** aparece para ninguém (técnico, mensagem interna), acrescentar a `ignorar.json` com o motivo; (b) se aparece para a pessoa e veio de um plano anterior sem estar listado, **não mudar o texto do app**: acrescentá-lo, exatamente como está no código, à seção "Textos novos" deste plano, no bloco "Encontrados pela conferência (de planos anteriores)", com o arquivo. Rodar de novo até sair com código 0. Nunca apagar nem reescrever texto do app para o comando passar.
Expected: `fora das listas: 0`, código de saída 0.

- [ ] **Step 7: Commit**

```bash
git add docs/copy/documento-base.md scripts/conferir-textos.mjs scripts/conferir-textos vitest.config.ts package.json docs/superpowers/plans/2026-10-03-iris-plano-10-landing-desktop.md
git commit -m "feat(copy): conferência de textos contra a copy e as listas de textos novos (npm run textos)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Acessibilidade com axe e ponta a ponta da landing e do desktop

**Files:**
- Create: `tests/e2e/apoio.ts`, `tests/e2e/acessibilidade.spec.ts`, `tests/e2e/plano10.spec.ts`
- Modify: `package.json`, `package-lock.json` (`@axe-core/playwright` em `devDependencies`)

**Interfaces:**
- Produces (`tests/e2e/apoio.ts`):
  - `admin` (cliente com `SUPABASE_SECRET_KEY`, só testes), `PASSWORD`, `today`.
  - `users(tag: string): { makeUser(name: string): Promise<{ id: string; email: string }>; cleanup(): Promise<void> }` — prefixo `e2e-{tag}-w{worker}-{execução}-`; `cleanup` apaga só os do prefixo (mesma lógica de `plano9.spec.ts`).
  - `category(userId, key)`, `seedExpense(userId, key, cents, note)`, `seedBudget(userId, key, cents, month /* AAAA-MM */)`, `seedGoal(userId, name, targetCents)`, `seedBill(userId, name, cents, dueDay)` (conta mensal em `recurrences`, categoria `casa`, `starts_on: today`).
  - `entrar(page, email)`; `expectNoHorizontalScroll(page, label)`; `expectNoA11yViolations(page, label)` — `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()`, e `expect(violations, resumo).toEqual([])`, em que o resumo lista `id`, `impact`, `help` e os seletores de cada violação.

- [ ] **Step 1: Instalar o axe**

Run: `npm install --save-dev @axe-core/playwright@^4`
Expected: `package.json` com `"@axe-core/playwright"` em `devDependencies`; nenhuma dependência de produção nova.

- [ ] **Step 2: Escrever os testes**

`tests/e2e/acessibilidade.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar, expectNoA11yViolations, expectNoHorizontalScroll, seedBill, seedBudget, seedExpense, seedGoal, today, users } from './apoio'

const { makeUser, cleanup } = users('a11y')
test.afterAll(cleanup)

// Não precisam de banco: rodam também sem Docker.
const PUBLIC = ['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/termos', '/privacidade', '/cadastro-excluido']

test('@publico páginas públicas: sem violações WCAG A/AA e sem rolagem horizontal', async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path)
    await expectNoA11yViolations(page, path)
    await expectNoHorizontalScroll(page, path)
  }
})

test('@publico 375 px: a landing e o acesso não rolam na horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/', '/entrar', '/criar-cadastro']) {
    await page.goto(path)
    await expectNoHorizontalScroll(page, `375 ${path}`)
  }
})

const APP = ['/inicio', '/extrato', '/anotar', '/contas', '/metas', '/planejamento', '/relatorios', '/familia', '/categorias', '/cartoes', '/configuracoes', '/configuracoes/instalar', '/configuracoes/dados']

test('telas do app com dados: sem violações WCAG A/AA e sem rolagem horizontal', async ({ page }, info) => {
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await seedBudget(u.id, 'mercado', 100000, today.slice(0, 7))
  await seedGoal(u.id, 'Viagem', 400000)
  await seedBill(u.id, 'Internet', 12000, 28)
  await entrar(page, u.email)
  const paths = info.project.name === 'celular' ? [...APP, '/mais'] : APP
  for (const path of paths) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectNoA11yViolations(page, path)
    await expectNoHorizontalScroll(page, path)
  }
})
```

`tests/e2e/plano10.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar, expectNoHorizontalScroll, seedBill, seedBudget, seedExpense, today, users } from './apoio'

const { makeUser, cleanup } = users('p10')
test.afterAll(cleanup)
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

test('@publico visitante: landing com as seções da copy, CTAs para o cadastro e nada de "baixe o app"', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Seu dinheiro, finalmente à vista.', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(8)
  await expect(page.getByRole('link', { name: 'Começar a ver meu mês', exact: true })).toHaveCount(3)
  await expect(page.getByText('Seus dados são seus.')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toMatch(/baixe|download|app store|google play/i)
  await page.getByRole('link', { name: 'Ver como funciona', exact: true }).click()
  await expect(page).toHaveURL(/#como-funciona$/)
  await page.getByRole('link', { name: 'Começar a ver meu mês', exact: true }).first().click()
  await expect(page).toHaveURL(/\/criar-cadastro$/)
})

test('@publico primeiro Tab: "Pular para o conteúdo", e Enter leva o foco ao conteúdo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo', exact: true })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#conteudo')).toBeFocused()
})

test('@publico SEO: robots, sitemap, canônico e Open Graph, sem script de terceiros', async ({ page, request }) => {
  const robots = await request.get('/robots.txt', { maxRedirects: 0 })
  expect(robots.status()).toBe(200)
  const txt = await robots.text()
  expect(txt).toContain('Disallow: /inicio')
  expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`)
  const sitemap = await request.get('/sitemap.xml', { maxRedirects: 0 })
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain(`<loc>${SITE}/</loc>`)
  expect(await sitemap.text()).not.toContain('/termos') // textos jurídicos em rascunho
  const og = await request.get('/opengraph-image.png', { maxRedirects: 0 })
  expect(og.status()).toBe(200)
  await page.goto('/')
  await expect(page).toHaveTitle('Íris — Veja para onde seu dinheiro vai')
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/`)
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(new RegExp(`^${SITE}/opengraph-image\\.png`))
  const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))
  for (const src of scripts) expect(new URL(src).origin, src).toBe(new URL(page.url()).origin)
})

test('quem entrou e abre / vai para o Seu mês', async ({ page }) => {
  const u = await makeUser('Davi')
  await entrar(page, u.email)
  await page.goto('/')
  await expect(page).toHaveURL(/\/inicio$/)
})

test('desktop: duas colunas a 1440 px, uma coluna a 800 px, sem rolagem horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Elisa')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await seedBudget(u.id, 'mercado', 100000, today.slice(0, 7))
  await seedBill(u.id, 'Internet', 12000, 28)
  await entrar(page, u.email)
  // Família fica de fora: sem família a tela é de uma coluna (conferido em jsdom, Task 8).
  for (const path of ['/relatorios', '/planejamento', '/contas', '/extrato']) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(path)
    const main = page.locator('[data-column="main"]').first()
    const aside = page.locator('[data-column="aside"]').first()
    await expect(aside, path).toBeVisible()
    const [m, a] = [await main.boundingBox(), await aside.boundingBox()]
    expect(a!.x, `${path}: lateral à direita`).toBeGreaterThan(m!.x + m!.width - 1)
    await page.setViewportSize({ width: 800, height: 1000 })
    const [m2, a2] = [await main.boundingBox(), await aside.boundingBox()]
    expect(Math.abs(a2!.x - m2!.x), `${path}: uma coluna a 800 px`).toBeLessThan(2)
    await expectNoHorizontalScroll(page, `800 ${path}`)
  }
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/inicio')
  await expectNoHorizontalScroll(page, '1024 /inicio')
  await page.goto('/configuracoes')
  expect(await page.locator('[data-settings-columns]').evaluate((el) => getComputedStyle(el).columnCount)).toBe('2')
})

test('celular: 375 px sem rolagem horizontal nas telas que mudaram', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Fábio')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await entrar(page, u.email)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/inicio', '/relatorios', '/planejamento', '/contas', '/extrato', '/metas', '/familia', '/configuracoes', '/configuracoes/instalar', '/cartoes']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectNoHorizontalScroll(page, `375 ${path}`)
  }
})
```

- [ ] **Step 3: Conferir sem Docker e rodar o que roda**

Run: `npx playwright test --list tests/e2e/acessibilidade.spec.ts tests/e2e/plano10.spec.ts`
Expected: **18 entradas** (9 testes × 2 navegadores; os `test.skip` por navegador se resolvem na execução).

Run: `npx playwright test --grep @publico`
Expected: as páginas públicas não precisam do banco — os testes `@publico` passam mesmo sem Docker (com `.env.local` preenchido). Se uma violação do axe aparecer, **corrigir a tela** (contraste, nome, marco), nunca desligar a regra; registrar a correção em `docs/progresso.md`.

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run textos`
Expected: tudo verde; `no-service-key.test.ts` sem alteração e passando; `○ /` estática.

Com Docker: `npx supabase db reset && npm run test:db && npm run test:e2e`. Sem Docker: os testes com cadastro ficam **pendentes** (Task 12).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/apoio.ts tests/e2e/acessibilidade.spec.ts tests/e2e/plano10.spec.ts package.json package-lock.json
git commit -m "test(e2e): axe (WCAG A/AA) no celular e no desktop; landing, SEO e colunas do desktop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Registro — progresso, decisões e README

**Files:**
- Modify: `README.md`, `docs/progresso.md`, `docs/decisoes-para-revisao.md`

- [ ] **Step 1: `README.md`**

1. Em "Testes", acrescentar:
   - `npm test` — no Plano 10 também os textos da landing, a regra da seção Confiança, robots e sitemap, colunas do desktop, o pular para o conteúdo e a conferência de textos (`scripts/conferir-textos/core.test.mjs`).
   - `npm run test:e2e` — o Plano 10 acrescenta `plano10.spec.ts` (landing, SEO, `/` para quem entrou, colunas a 1440 e 800 px, 375 px) e `acessibilidade.spec.ts`.
2. Nova seção **"Acessibilidade (axe)"**: `npx playwright test tests/e2e/acessibilidade.spec.ts` roda o axe (WCAG 2.0, 2.1 e 2.2, níveis A e AA) nas páginas públicas e nas principais telas do app, no celular e no desktop, e confere que nada rola na horizontal. `npx playwright test --grep @publico` roda só as páginas públicas, sem precisar do banco. Uma violação aparece com a regra, o impacto e o elemento; a correção é sempre na tela, nunca desligando a regra.
3. Nova seção **"Conferência de textos"**: `npm run textos` compara todo texto visível do app (`src/`, `public/sw.js`, `public/sem-conexao.html`, `supabase/templates/`) com a cópia da copy em `docs/copy/documento-base.md` e com as listas de textos (`docs/etapa-2-requisitos.md`, `docs/etapa-5-ui.md`, `docs/decisoes-para-revisao.md` e a seção "Textos novos" de cada plano). Termina com erro e lista `arquivo:linha "texto"` quando um texto não está em nenhuma delas. Textos que nunca aparecem para ninguém ficam em `scripts/conferir-textos/ignorar.json`, sempre com o motivo. **Quando a copy mudar**, exporte de novo o documento (conector de documentos → exportar em Markdown) para `docs/copy/documento-base.md`, mantendo a primeira linha com a revisão e a data.
4. Na "Lista de lançamento", trocar o item 20 por:

```markdown
20. **Landing — item "Seus dados são seus." da seção Confiança (RF-57).** Fica escondido até você ligar `DATA_RIGHTS_RELEASED` em `src/features/landing/release.ts`, depois dos itens 16, 17 e 18 (e com os campos de `src/features/legal/controller.ts` preenchidos — sem eles o item não aparece, mesmo ligado). Antes de ligar, aprove a frase nova "Você pode baixar o que registrou ou excluir seu cadastro quando quiser." (decisão 160).
21. **Landing no ar:** com o domínio (item 13), `NEXT_PUBLIC_SITE_URL` define o endereço canônico, o `sitemap.xml` e a imagem de compartilhamento. Termos e Privacidade só entram no `sitemap.xml` quando deixam de ser rascunho (item 16). O logo definitivo (item 10) também troca a imagem de compartilhamento (`npm run icons`).
22. **Sua aprovação do Plano 10:** os textos novos e adaptados e as decisões 157 a 176 (`docs/decisoes-para-revisao.md`, seção "Plano 10"), e a landing vista por você no celular e no computador (ela não tinha protótipo).
```

- [ ] **Step 2: `docs/progresso.md`**

Acrescentar (trocando `{data}` e os números reais):

````markdown
## Plano 10 — Landing e desktop completo · concluído em {data}

**Entregue**
- Landing em `/` com as seções 1–9 da copy, estática, sem rastreador nem script de terceiros; três "Começar a ver meu mês" para o cadastro, "Ver como funciona", "Entrar" e o rodapé com Termos e Privacidade. Quem já entrou e abre `/` vai direto para o Seu mês.
- SEO: título e descrição da copy, endereço canônico, Open Graph com a imagem do logo provisório, `robots.txt` (só as páginas públicas) e `sitemap.xml` (Termos e Privacidade só quando deixarem de ser rascunho).
- Seção Confiança com três itens; "Seus dados são seus." espera a liberação (README, item 20).
- Desktop a partir de 1024 px: Seu mês e mês da família em três colunas; Relatórios, Planejamento, Contas, Extrato, a meta e Família em duas colunas; Metas e Cartões em grade; Configurações em duas colunas de jornal; Instalar sem o quadro alto. Entre 768 e 1023 px, uma coluna ao lado do menu.
- Acessibilidade: "Pular para o conteúdo", anel de foco com contraste, área segura no aviso "Sem conexão", nomes repetidos na família, título das telas de convite, região "Da família"; testes axe nas páginas públicas e nas principais telas, no celular e no desktop.
- Conferência de textos: `npm run textos`.

**Testes**
- Unitários e de componentes: {n} passando ({m} arquivos). Tipos, lint, build e `npm run textos` sem erros.
- Ponta a ponta: `plano10.spec.ts` e `acessibilidade.spec.ts` (9 testes; 18 entradas em `--list`). Os marcados `@publico` {rodaram sem Docker: resultado}; os que criam cadastro: **pendentes**, dependem do Docker (mesma pendência dos Planos 1 a 9).

**Pendências que continuam**
- Custo da segunda chamada ao banco (contas da família) em toda leitura do mês de quem não tem família: medir com o banco rodando (Plano 7).
- A barra âmbar do planejado continua abaixo de 3:1 contra o trilho; o estado sempre aparece em texto (decisão 176).
````

- [ ] **Step 3: `docs/decisoes-para-revisao.md`**

Acrescentar `## Plano 10` com a tabela "Decisões tomadas neste plano" (157–176), os blocos "Conflitos encontrados na especificação" e "Para você confirmar" deste plano, e, em "Textos novos usados", a lista "Textos novos" deste plano, exatamente como estiver no código (inclusive o bloco "Encontrados pela conferência", se a Task 10 acrescentar algo).

- [ ] **Step 4: Conferir e commitar**

Run: `npm run textos && npm test`
Expected: código 0 e PASS.

```bash
git add README.md docs/progresso.md docs/decisoes-para-revisao.md
git commit -m "docs: progresso, decisões e README do Plano 10 (axe, conferência de textos, lista de lançamento)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## O que depende de você

Nada disto é feito pelo plano.

| # | O quê | Observação |
|---|---|---|
| 1 | **Aprovar os textos** | 3 textos novos e 3 frases da copy adaptadas à terminologia (abaixo). |
| 2 | **Liberar "Seus dados são seus." na landing** | Depois dos itens 16, 17 e 18 da lista de lançamento: preencher `src/features/legal/controller.ts` e ligar `DATA_RIGHTS_RELEASED` em `src/features/landing/release.ts`. Até lá, a seção Confiança mostra três itens. |
| 3 | **Ver a landing** no celular e no computador | Ela não tinha protótipo: segue o manual visual e o protótipo do app (decisões 158, 161, 162). |
| 4 | **Docker** | Rodar `npx supabase db reset && npm run test:db && npm run test:e2e` (inclui `plano10.spec.ts` e `acessibilidade.spec.ts` com cadastro). |
| 5 | **Domínio e logo definitivo** | O domínio define o canônico, o sitemap e a imagem de compartilhamento (`NEXT_PUBLIC_SITE_URL`); o logo definitivo troca a imagem com `npm run icons`. |
| 6 | **Interpretações** | Decisões 157, 159, 160, 166, 167, 168 e 172. |

---

## Autorrevisão do plano

**1. Cobertura do escopo**

| Requisito | Onde |
|---|---|
| RF-55 landing no mesmo domínio, seções 1–9, SEO definido | Tasks 1, 3, 4; e2e Task 11 |
| RF-56 CTAs para o cadastro; nunca "baixe o app" nem selos | Tasks 1, 3 (testes de destino e de texto); e2e |
| RF-57 Confiança só com o que existe | Task 1 (`trustItems`), Task 3, Task 12 (README, item 20) |
| RNF-02 desktop com layout próprio | Tasks 2, 5–8; e2e (1440, 1024, 800 px) |
| RNF-01 / RNF-05 celular e WCAG 2.2 AA | Tasks 2, 9, 11 (axe, 375 px, primeiro Tab) |
| RNF-04 desempenho da landing | Task 3 (`force-static`, sem cliente, sem imagem), Task 4 (`○` no build) |
| RNF-08 copy | Task 10 (`npm run textos`) e "Textos novos" |
| Pendências "Plano 10" do progresso | Planejado/Relatórios (Task 6), Família e mês da família (Tasks 5, 8), Lembretes/Instalar (Task 8), telas novas do Plano 9 (decisão 171), acessibilidade do Plano 7 (Task 9), área segura (Task 2), `md:col-span-2` (Task 5), barra âmbar (decisão 176), `NEXT_PUBLIC_SITE_URL` com barra (Task 4) |
| Verificação final do mandato (axe, conferência de textos) | Tasks 10, 11; README (Task 12) |

Lacunas conhecidas: a medição da segunda chamada ao banco (Plano 7) depende do banco rodando; nada com cadastro rodou sem Docker; a aparência da landing não tem protótipo para comparar.

**2. Passos:** cada passo de teste traz o código; os de implementação trazem assinatura, arquivo, classes e textos exatos. Completos só os textos da landing (a copy fixa a forma) e as regras do extrator de textos.

**3. Nomes e tipos conferidos entre tarefas:** `LANDING`, `trustItems`, `TrustItem`, `SIGNUP_HREF`, `SIGNIN_HREF`, `HOW_IT_WORKS_ID`, `DATA_RIGHTS_RELEASED` (Task 1) = Task 3; `SkipLink`, `CONTENT_ID`, `Columns`, `MainColumn`, `AsideColumn`, `WIDE` (Task 2) = Tasks 3, 6, 7, 8; `SEO_TITLE`, `SEO_DESCRIPTION` (criados na Task 3, ampliados na Task 4) = `layout.tsx`, `page.tsx`, `opengraph-image.test.ts`; `robotsFor`, `sitemapFor`, `PRIVATE_PREFIXES` (Task 4); `data-column`/`data-row`/`data-columns`/`data-settings-columns`/`data-cards-grid` (Tasks 2, 6–8) = e2e; `actionName` (Task 9); `normalize`, `extractStrings`, `extractHtml`, `sectionText`, `loadCorpus`, `classify`, `run` (Task 10); `users`, `entrar`, `seed*`, `expectNoHorizontalScroll`, `expectNoA11yViolations` (Task 11).

**4. Review Focus:** os cinco itens têm teste na tarefa dona (lista no topo).

**5. Proporção:** o plano carrega por extenso só a copy da landing e os testes; o resto está como assinatura, classes e regras.

## Conflitos encontrados na especificação

1. **Copy "Sem acesso à sua conta bancária." (hero) e "A Íris não se conecta à sua conta bancária…" (Confiança) × terminologia fixa (etapa-2 §1.1: "conta" nunca para conta bancária).** Vale a terminologia, como no conflito 1 do Plano 9 e no texto jurídico aprovado ("Não se conecta ao seu banco"): "Sem acesso ao seu banco." e "A Íris não se conecta ao seu banco nem pede senha do banco." **Confirme.**
2. **Copy "Você cria sua conta e já pode anotar o primeiro gasto." × terminologia ("cadastro").** "Você cria seu cadastro e já pode anotar o primeiro gasto." **Confirme.**
3. **Copy "Você pode exportar ou excluir tudo quando quiser." × RN-24 (conflito 9 do Plano 9).** "Excluir tudo" não é verdade para quem tem gastos numa família que continua. Frase nova para aprovação: "Você pode baixar o que registrou ou excluir seu cadastro quando quiser." — e o item inteiro só aparece depois da liberação (decisão 160). **Confirme.**
4. **Copy, Seção 8, nota de validação × estado do lançamento.** Exportação e exclusão existem, mas a política é rascunho e o banco nunca rodou (README, itens 16–18). O item "Seus dados são seus." fica escondido até o dono liberar.
5. **Copy "na fatura" (Seção 2) × RN-30 ("Nunca 'Fatura'").** A RN-30 vale para o rótulo do total do cartão no app; na landing a palavra descreve a fatura do banco, na fala da pessoa. Mantido como na copy. **Confirme.**
6. **Copy "sem conta difícil", "sem você precisar fazer contas", "A Íris faz as contas" × terminologia.** "Conta" no sentido de cálculo, que a regra não proíbe (ela fala de acesso e de conta bancária). Mantido como na copy.
7. **Roteiro (etapa 7) "telas não desenhadas serão desenhadas no início do plano e aprovadas antes do código" × execução autônoma (sem aprovação de tela).** A landing e os layouts de desktop seguem o manual e o protótipo do app e ficam registrados como decisões (158, 161, 162, 167–171); a aprovação visual vem depois ("O que depende de você", item 3).
8. **Copy da Seção 5 (tabela "Função / Copy pelo benefício") e da Seção 6 ("Funcionais"/"Emocionais") × o que aparece na tela.** Os nomes internos ("Registro rápido", "Planejamento (orçamento)"…) e os rótulos de grupo são organização do documento, não texto de tela; só o texto pelo benefício aparece (decisão 158). "Orçamento" também está em "Evitar" no vocabulário da copy.
9. **RNF-07 "dados no Brasil" × hospedagem (conflito 3 do Plano 9, ainda aberto).** A landing não faz nenhuma afirmação sobre onde ficam os dados.

## Decisões tomadas neste plano

| # | Decisão | Motivo |
|---|---|---|
| 157 | `/` é a landing para quem não entrou; quem tem sessão é levado pelo proxy para `/inicio` antes de qualquer renderização (`/` entra na lista "só para quem não entrou"). A página não lê sessão. O logo das páginas legais e do acesso leva a `/`. (interpretação — confirme) | Etapa 3 §6; RF-55; a landing fica estática e sem dado pessoal. |
| 158 | Seções 1–9 na ordem da copy. Não aparecem: as alternativas de headline, os nomes internos da tabela de funcionalidades, os rótulos "Funcionais"/"Emocionais", "Frase de destaque", "Fechamento" e a nota de validação. A seção 4 é o destino de "Ver como funciona". | Copy (organização do documento × texto de tela); conflito 8. |
| 159 | Três frases adaptadas à terminologia: "Sem acesso ao seu banco.", "A Íris não se conecta ao seu banco nem pede senha do banco.", "Você cria seu cadastro e já pode anotar o primeiro gasto.". "Fatura" e "fazer contas" ficam como na copy. (interpretação — confirme) | Etapa-2 §1.1; conflitos 1, 2, 5, 6. |
| 160 | Confiança: "Seus dados são seus." só com `isLegalReady(CONTROLLER)` e `DATA_RIGHTS_RELEASED`; a frase passa a "Você pode baixar o que registrou ou excluir seu cadastro quando quiser." (texto novo). Os outros três itens aparecem já (existem de fato). (interpretação — confirme) | RF-57; RN-24; nota da Seção 8; README item 20; conflitos 3 e 4. |
| 161 | CTAs: "Começar a ver meu mês" (seções 1, 4 e 9) → `/criar-cadastro`; "Ver como funciona" → seção 4; "Entrar" no cabeçalho; Termos e Privacidade no rodapé. Sem bloco de instalação na landing (a instalação continua no onboarding e em Configurações, decisão 115). | RF-56; Etapa 3 §6; um CTA principal repetido (copy §6). |
| 162 | O hero mostra um desenho do Seu mês feito com HTML e CSS (sem imagem, sem JavaScript), com os rótulos aprovados e os números do protótipo `Desktop.dc.html`; é decorativo (escondido do leitor de tela). | Mostrar o produto sem prometer números; RNF-04. |
| 163 | SEO: título e descrição da copy ("Meta (SEO)"); canônico `/`; Open Graph (site "Íris", `pt_BR`, imagem 1200×630 com o logo provisório sobre o verde claro, sem texto, texto alternativo = o título da copy); `robots.txt` libera as páginas públicas e fecha todas as áreas do app; `sitemap.xml` com `/` e, quando deixarem de ser rascunho, Termos e Privacidade; `metadataBase` de `NEXT_PUBLIC_SITE_URL`, agora sem barra no fim. Sem Twitter, analytics ou verificação de buscadores. | RF-55; decisão 154; pendência do Plano 7. |
| 164 | A landing é estática (`force-static`), só componentes de servidor, sem imagem além da de compartilhamento e sem fonte nova; o único JavaScript na página é o do próprio Next e o aviso "Sem conexão" e o registro do service worker, que já existiam em todas as páginas. | RNF-04; nada de terceiros. |
| 165 | "Pular para o conteúdo" (texto novo) na landing e no app; anel de foco: contorno de 2 px na cor `brand-text`, afastado 2 px (o anterior, verde claro, ficava abaixo de 3:1 no branco). | RNF-05 (WCAG 2.4.1 e 2.4.7). |
| 166 | Duas (ou três) colunas só a partir de 1024 px; de 768 a 1023 px, uma coluna ao lado do menu lateral. As grades do Seu mês e do mês da família passam de `md` para `lg`, com preenchimento denso (sem buracos). (interpretação — confirme) | RNF-02; pendência do Plano 6 (`md:col-span-2`); Review Focus 2. |
| 167 | Padrão das duas colunas: a ordem do DOM é a do celular e o desktop só posiciona (principal à esquerda, lateral de 340 px à direita). Relatórios: categorias na lateral. Planejamento: resumo e ajuda na lateral. Contas: resumo, lembrete e recorrências na lateral. Extrato: busca e filtros na lateral. Meta pessoal: histórico na lateral. Família: avisos, "O que a família vê" e sair na lateral. (interpretação — confirme) | RNF-02; WCAG 1.3.2 e 2.4.3; protótipo Desktop (Seu mês em colunas). |
| 168 | Configurações em duas colunas de jornal (lê-se a primeira de cima a baixo e depois a segunda, na ordem do celular), sem quebrar uma seção ao meio. (interpretação — confirme) | A ordem das seções não cabe no padrão principal/lateral sem reordenar. |
| 169 | Metas: os cartões de cada lista em duas colunas. A meta da família continua em uma coluna de leitura. | Muitas metas cabem lado a lado; o detalhe da família é uma leitura. |
| 170 | Instalar (Configurações → App) no desktop: quadro do logo à esquerda e texto e botões à direita, sem o quadro alto; no onboarding nada muda. | Pendência do Plano 8; protótipo `Instalar` é de celular. |
| 171 | Formulários e telas curtas (Anotar e os painéis, Nova conta, Novo cartão, Categorias, Nome, Saldo inicial, E-mail, Baixar meus dados, Excluir meu cadastro, acesso, onboarding, Termos e Privacidade) mantêm a coluna estreita centralizada no desktop: é o layout deles (formulário estreito lê melhor); os painéis já abrem ao lado. | RNF-02 sem esticar formulário; pendência "telas novas" do Plano 9. |
| 172 | Acessibilidade do Plano 7: quando dois participantes têm o mesmo nome, os botões de remover e de tornar administrador ganham a posição ("Ana (1)", "Ana (2)"; texto novo); nas telas "Este convite não vale mais…" e "Você já participa de uma família…", a própria frase vira o título; "Da família" em Metas vira região com nome. (interpretação — confirme) | Pendências do Plano 7; WCAG 2.4.6 e 1.3.1. |
| 173 | O aviso "Sem conexão" respeita a área segura do topo. | Pendência do Plano 8. |
| 174 | axe com as etiquetas WCAG 2.0, 2.1 e 2.2, A e AA, sem desligar regra; páginas públicas (também sem banco) e as principais telas com dados, no celular e no desktop; mais 375 px e 800/1024/1440 px sem rolagem horizontal. | RNF-05; verificação final do mandato. |
| 175 | Conferência de textos: `npm run textos` compara o texto visível com uma cópia local da copy (`docs/copy/documento-base.md`) e com as listas de textos; texto fora delas faz o comando falhar; ignorar só com motivo. A cópia da copy é atualizada à mão quando o documento mudar. | RNF-08; verificação final do mandato. |
| 176 | A barra âmbar do planejado continua `#F2B54A` (abaixo de 3:1 contra o trilho): o estado "passou do planejado" sempre aparece em texto, e a WCAG 1.4.11 não exige contraste de um gráfico que repete o texto. | Pendência do Plano 6; V5. |

## Textos novos

Fora da copy oficial, para aprovação. Todos em tom calmo, sem exclamação e sem urgência.

1. "Pular para o conteúdo" (link de acessibilidade, na landing e no app; aparece só com o teclado)
2. "Você pode baixar o que registrou ou excluir seu cadastro quando quiser." (seção Confiança, depois de "Seus dados são seus."; só aparece depois da liberação)
3. "{nome} ({n})" — nome com a posição, só quando dois participantes da família têm o mesmo nome, nos rótulos de leitor de tela e no título da confirmação: "Remover {nome} ({n}) da família", "Tornar {nome} ({n}) administrador", "Remover {nome} ({n}) da família?"

**Encontrados pela conferência (de planos anteriores):** (preenchido na Task 10, Step 6, exatamente como está no código, com o arquivo)

**Adaptados da copy por causa da terminologia fixa (conflitos 1 e 2; não contam como novos, mas peço a confirmação):** "Gratuito. Sem cartão. Sem acesso ao seu banco.", "A Íris não se conecta ao seu banco nem pede senha do banco.", "Você cria seu cadastro e já pode anotar o primeiro gasto."

**Reaproveitados (já aprovados; não contam como novos):** as seções 1–9 da copy (exceto as três frases adaptadas), "Íris — Veja para onde seu dinheiro vai" e a descrição de "Meta (SEO)" (também texto alternativo da imagem de compartilhamento), "Entrar", "Termos de uso", "Política de privacidade", "Textos legais" e "Íris, página inicial" (Plano 9), e, no desenho do hero, "Seu mês até agora", "Disponível", "Entrou", "Saiu", "Guardado este mês" (RN-01) e "Seu maior gasto foi com {categoria}: {valor}.".
