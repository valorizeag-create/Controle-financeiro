# Íris

Aplicativo de finanças pessoais e familiares, pensado primeiro para o celular. A Íris mostra para onde o dinheiro vai: você anota entradas e gastos em segundos e enxerga o mês inteiro, sem planilhas, sem jargão e sem julgamento.

## Stack

- [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Postgres + Auth), rodando localmente via Docker durante o desenvolvimento
- [Zod](https://zod.dev/) para validação
- [Vitest](https://vitest.dev/) (regras de negócio, componentes, banco) e [Playwright](https://playwright.dev/) (ponta a ponta)

## Rodar localmente

O ambiente local usa uma instância do Supabase rodando em Docker — nenhum dado de desenvolvimento fica em um projeto na nuvem.

1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) e deixe-o em execução.
2. `npm install`
3. `npx supabase start` — sobe Postgres, Auth e demais serviços localmente.
4. `npx supabase status -o env` mostra as credenciais locais. Copie para `.env.local` (baseado em `.env.example`) mapeando:
   - `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `PUBLISHABLE_KEY` (ou `ANON_KEY`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SECRET_KEY` (ou `SERVICE_ROLE_KEY`) → `SUPABASE_SECRET_KEY`
   - Defina também `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
5. `npx supabase db reset` — aplica as migrações e a seed no banco local.
6. `npm run dev` → http://localhost:3000

`SUPABASE_SECRET_KEY` só é usada pelos testes de banco e end-to-end (para criar/apagar usuários de teste) e nunca deve ser usada no código do app nem exposta ao navegador.

O login por e-mail funciona sem nenhuma configuração extra. Já "Continuar com Google" só funciona depois de configurar `[auth.external.google]` em `supabase/config.toml` com as credenciais OAuth do Google (`client_id` e `secret`) via variáveis de ambiente — nunca comitadas.

## Testes

- `npm test` — regras de dinheiro, datas, formulários e componentes (Vitest)
- `npm run test:db` — privacidade e regras no banco local (usa `SUPABASE_SECRET_KEY`; requer `npx supabase start`)
- `npm run test:e2e` — fluxo completo no navegador, celular e desktop (Playwright; requer `npx supabase start` e `.env.local` preenchidos, e sobe o `npm run dev` automaticamente)
- `npm run typecheck` — checagem de tipos (TypeScript)
- `npm run lint` — checagem de estilo e boas práticas (ESLint)

## Publicar (Netlify)

A publicação só acontece quando a pessoa responsável pelo projeto decidir — não faz parte do fluxo automático de desenvolvimento.

1. Crie um projeto Supabase na nuvem, na região **São Paulo**.
2. `npx supabase link` para associar o repositório a esse projeto.
3. `npx supabase db push` para aplicar as migrações no banco de produção.
4. Configure o site na [Netlify](https://www.netlify.com/) apontando para este repositório (usa `netlify.toml` para build e publicação).
5. Nas variáveis de ambiente da Netlify, defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SITE_URL` (com a URL pública do site). `SUPABASE_SECRET_KEY` **não** é necessária em produção — ela só é usada pelos testes locais de banco e end-to-end.
6. No provedor de login Google (OAuth), atualize a URL de redirecionamento para corresponder ao `NEXT_PUBLIC_SITE_URL` de produção.

## Documentação do produto

| Documento | Conteúdo |
|---|---|
| [`docs/etapa-2-requisitos.md`](docs/etapa-2-requisitos.md) | Regras de negócio e requisitos (aprovados) |
| [`docs/etapa-3-arquitetura.md`](docs/etapa-3-arquitetura.md) | Modelo de dados, privacidade, páginas e fluxos (aprovada) |
| [`docs/etapa-5-ui.md`](docs/etapa-5-ui.md) | Identidade visual e tokens (aprovada) |
| [`docs/etapa-7-roteiro.md`](docs/etapa-7-roteiro.md) | Roteiro de desenvolvimento em 10 planos |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Planos de implementação detalhados |
