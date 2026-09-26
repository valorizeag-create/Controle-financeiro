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

## Plano 2 — Extrato, onboarding e ajustes básicos · concluído em 2026-09-26

**Entregue**
- Onboarding pulável: 3 telas, "Quanto você tem hoje?" (saldo inicial), convite para o primeiro gasto. Quem não concluiu volta a ele ao abrir o app.
- Extrato: tudo o que entrou e saiu, por dia, com busca (nome, nota, origem, forma de pagamento e valor, sem acento) e filtros Entradas, Gastos, Categoria e mês.
- Editar e excluir registros (com confirmação); fechar o Anotar com algo digitado pergunta antes de descartar.
- Categorias: criar, renomear, excluir levando os gastos para "Outros"; nome sem repetição (maiúsculas e espaços não contam).
- Mais e Configurações: nome, e-mail, mudar senha, saldo inicial, categorias, sair com confirmação.
- Pendências do Plano 1 resolvidas: aviso some em 4 s mesmo trocando de página; teste do setFlash; sem faixa vazia sob o Anotar; campo de data da entrada limitado a hoje.

**Testes**
- Unitários e de componentes: 222 passando (39 arquivos). Tipos, lint e build sem erros.
- Banco (privacidade, categorias e onboarding) e ponta a ponta (`nucleo.spec.ts`: 3 testes — 2 no celular, 1 no desktop; `plano2.spec.ts`: 9 execuções — celular: 6, desktop: 3) escritos e conferidos com `npx playwright test --list` (18 entradas listadas, correspondendo aos 2 navegadores × os testes acima, com os `test.skip` de projeto resolvidos em tempo de execução): **pendentes**, dependem do Docker para o Supabase local (mesma pendência do Plano 1, ainda não resolvida no ambiente de desenvolvimento).
