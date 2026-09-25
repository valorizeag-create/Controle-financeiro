# Íris — Progresso do desenvolvimento

Roteiro: [etapa-7-roteiro.md](etapa-7-roteiro.md). Decisões tomadas durante o desenvolvimento, para sua revisão: [decisoes-para-revisao.md](decisoes-para-revisao.md).

## Plano 1 — Fundação e núcleo individual · concluído em 2026-09-25

**Entregue**
- Projeto Next.js 16 + React 19 + Tailwind 4, com Vitest e Playwright configurados.
- Regras de dinheiro num único módulo testado (`src/domain/`): centavos, datas no fuso de Brasília, Disponível, Entrou, Saiu, linha das metas, contas a pagar, Saldo total e gastos por categoria.
- Banco (migração versionada): perfil, categorias padrão, registros; privacidade por pessoa (RLS), categorias padrão protegidas, perfil protegido.
- Cadastro, entrar, recuperar e criar nova senha, login com Google (depende de credenciais), rotas protegidas.
- Anotar gasto e Registrar entrada, com validação no servidor e o formulário mantendo o que foi digitado.
- Seu mês: Disponível, Disponível depois das contas, Entrou, Saiu, maior gasto, "Para onde seu dinheiro vai", últimos registros, Saldo total, navegação entre meses, estados vazios.
- Casca do app: barra inferior (celular), menu lateral (desktop), aviso "Anotado.".

**Testes**
- Unitários e de componentes: 107 passando (19 arquivos). Tipos e lint sem erros. Build de produção sem erros.
- Banco (RLS, 11 testes) e ponta a ponta (Playwright, celular e desktop): escritos, **ainda não executados** — dependem do Docker para o Supabase local.

**Pendências**
- Rodar `npx supabase db reset`, `npm run test:db` e `npm run test:e2e` assim que o Docker estiver instalado.
- Levadas para o Plano 2: aviso "Anotado." pode ficar preso na tela se a pessoa navegar em menos de 4 s; teste do `setFlash` direto; faixa vazia sob o Anotar no celular; campo de data da entrada sem limite visual de hoje.
