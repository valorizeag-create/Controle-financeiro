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

`SUPABASE_SECRET_KEY` só é usada pelos testes de banco e end-to-end (para criar/apagar usuários de teste) e pelo script local `scripts/configurar-tarefa.mjs`. Ela **nunca** é usada no código do app, nunca vai para a Netlify e nunca recebe o prefixo `NEXT_PUBLIC_`. As variáveis do Plano 8 (push, e-mail, tarefa) são opcionais: sem elas, a parte correspondente fica desligada e o app funciona igual (veja "PWA e notificações (local)").

O login por e-mail funciona sem nenhuma configuração extra. Já "Continuar com Google" só funciona depois de configurar `[auth.external.google]` em `supabase/config.toml` com as credenciais OAuth do Google (`client_id` e `secret`) via variáveis de ambiente — nunca comitadas.

## PWA e notificações (local)

Tudo funciona sem conta em nenhum serviço. Cada parte liga com variáveis em `.env.local` (lista comentada em `.env.example`); sem elas, a parte fica desligada.

- **Instalar e "Sem conexão":** em produção o service worker sempre registra. Em `npm run dev` ele só registra com `NEXT_PUBLIC_REGISTER_SW=1` (o Playwright já liga sozinho). Ele não guarda nenhuma tela, dado ou arquivo do app: só a página "Sem conexão" e um ícone. Para ver o aviso à mão: `npm run build && npm start` e desligue a rede no navegador.
- **Push (lembretes):** gere um par de chaves só para a sua máquina com `npx web-push generate-vapid-keys`. Copie a chave **pública** para `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (a única com esse prefixo, porque vai para o navegador), a **privada** para `VAPID_PRIVATE_KEY` e defina `VAPID_SUBJECT=mailto:seu-email`. Em Configurações → Lembretes, "Ativar lembretes". O endereço de push de cada aparelho é dado pessoal: nada o lê pela API, e o app só envia para serviços de push conhecidos (Google, Mozilla, Apple e Microsoft).
- **E-mail (convite da família, resumo do mês):** `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, `MAIL_FROM=Íris <oi@iris.local>`, sem usuário e senha. Os e-mails aparecem na caixa local, em http://127.0.0.1:54324, e não saem do computador. A recuperação de senha também passa por essa caixa (o modelo está em `supabase/templates/recovery.html`; é o Supabase que envia).
- **Tarefas agendadas:** o banco local agenda sozinho, com pg_cron: 00h05 (Brasília) cria as contas do mês, 00h15 limpa registros antigos, 9h e 21h enfileiram os lembretes, e a cada 10 minutos a fila é entregue. A entrega passa por uma rota do app (`/api/jobs/notificacoes`) que o banco chama; ela só abre com um código de disparo.
  1. Gere o segredo da tarefa (**gere, nunca escolha**): `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Coloque o valor em `JOB_SECRET` no `.env.local`.
  2. `npm run job:configurar` registra no banco local só o resumo (SHA-256) do segredo e mostra dois comandos do Vault (endereço da rota e código de disparo). Cole-os no SQL Editor, em http://127.0.0.1:54323. O script nunca mostra nem grava o segredo.
  3. Repita o passo 2 depois de cada `npx supabase db reset` (o Vault e os resumos são esvaziados).
  4. Sem esperar o relógio, com o app rodando: `npm run job:notificacoes -- manha` (enfileira os lembretes da manhã e entrega), `-- noite`, `-- ocorrencias` (gera as contas do dia) ou sem argumento (só entrega o que está na fila). Esse atalho usa a chave publicável e o segredo; é só para a máquina local.
- **Ícones:** `npm run icons` gera os PNG a partir do logo provisório.

Segurança da tarefa, em poucas palavras: o banco guarda só o SHA-256 do segredo; quem chama a rota (pg_net) leva um código derivado do segredo, do qual não se volta ao segredo e que só pede à rota para entregar um lote; a rota usa a chave publicável e o segredo do próprio ambiente, nunca a chave de serviço. O código de disparo continua valendo até o segredo ser trocado. Não ligue `log_statement = 'all'` nem pgaudit para os papéis da API (os parâmetros das chamadas iriam para o registro).

## Testes

- `npm test` — regras de dinheiro, datas, formulários e componentes (Vitest); no Plano 8 também tipos de aviso, textos e destinos, envio de push e de e-mail (simulados), rota da tarefa, service worker, manifest e página "Sem conexão"; no Plano 9 também as células do CSV, os textos jurídicos, as ações de excluir o cadastro e trocar o e-mail e a rota de download
- `npm run test:db` — privacidade e regras no banco local (usa `SUPABASE_SECRET_KEY`; requer `npx supabase start`); o Plano 8 acrescenta preferências, inscrições e fila de avisos, tarefa diária das contas, convite por e-mail e o segredo da tarefa; o Plano 9 acrescenta `plano9` (entrada recente, exclusão completa tabela por tabela, isolamento, família e limites de convite que sobrevivem à exclusão). Durante a execução o agendador local (pg_cron) fica pausado; se uma execução for interrompida antes do fim, rode `select public.job_set_paused(false);` no SQL Editor
- `npm run test:e2e` — fluxo completo no navegador, celular e desktop (Playwright; requer `npx supabase start` e `.env.local` preenchidos, e sobe o `npm run dev` automaticamente, já com `NEXT_PUBLIC_REGISTER_SW=1`; se um `npm run dev` já estiver rodando, reinicie-o). Os testes de push, da tarefa e do convite por e-mail do Plano 8 rodam quando `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `JOB_SECRET` e `SMTP_HOST` estão em `.env.local`; sem eles ficam marcados como pulados. Os testes da tarefa e do convite por e-mail só rodam contra o Supabase local e a caixa de e-mail local (`NEXT_PUBLIC_SUPABASE_URL` e `SMTP_HOST` em `localhost` ou `127.0.0.1`): com um banco hospedado ou um servidor de e-mail de verdade em `.env.local` eles ficam pulados, para nenhum aviso ou e-mail de teste chegar a pessoas de verdade. A caixa de e-mail é lida em `http://127.0.0.1:54324` (mude com `E2E_MAILBOX_URL`). O Plano 9 acrescenta `plano9.spec.ts`: páginas públicas de Termos e Privacidade, download dos dados, exclusão do cadastro, sessão antiga e troca de e-mail; a troca de e-mail só roda com o banco local (`NEXT_PUBLIC_SUPABASE_URL` em `localhost` ou `127.0.0.1`) e o teste da sessão antiga também precisa do `docker exec` no contêiner do banco local
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

### Lista de lançamento: o que depende de você

Nada disto é necessário para desenvolver e testar localmente. Reúne o que ficou para você nos Planos 8 e 9: contas e chaves que só você pode criar (itens 1 a 11, todas com plano gratuito), decisões de custo e de hospedagem (12, 13, 17), configurações do Supabase hospedado (5, 8, 14, 15), a revisão jurídica (16), a primeira execução com Docker (18) e as aprovações (11 e 19). A `SUPABASE_SECRET_KEY` **não** entra nesta lista: ela não vai para a Netlify, nunca.

1. **Provedor de e-mail (SMTP)** com plano gratuito e um domínio seu verificado nele. Coloque `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` na Netlify **e** as mesmas credenciais no Supabase, em Authentication → SMTP (é o que envia a recuperação de senha). Sem isso, convite e resumo por e-mail ficam desligados (o convite por link continua) e a recuperação de senha tem limite baixo de envios.
2. **Modelo do e-mail de recuperação** no Supabase hospedado: Authentication → Email Templates → Reset Password, colar `supabase/templates/recovery.html` e o assunto "Crie uma nova senha na Íris". O arquivo do repositório só vale no ambiente local.
3. **Chaves VAPID de produção:** `npx web-push generate-vapid-keys` (outro par, diferente do local) para `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` na Netlify. Trocar as chaves depois desliga os lembretes de quem já ativou (a pessoa ativa de novo).
4. **Segredo da tarefa:** gere o `JOB_SECRET` (comando acima) e coloque na Netlify. Depois, uma vez, rode `npm run job:configurar -- producao https://SEU-DOMINIO` na sua máquina (com o mesmo `JOB_SECRET` no `.env.local`) e cole os três comandos que ele mostra no SQL Editor do Supabase hospedado. Nenhum deles contém o segredo.
5. **Extensões e versão no Supabase hospedado:** em Database → Extensions, ligar `pg_cron`, `pg_net` e o Vault antes de `npx supabase db push`. O Postgres do projeto precisa ser **17 ou mais novo** (o local usa 17). O papel `anon` tem limite curto de tempo por comando: a produção depende do pg_cron (que chama as funções direto), não do atalho `job_trigger` do script local.
6. **Na Netlify, confirmar no primeiro deploy:** o limite de tempo da função (a entrega assume cerca de 10 segundos: 6 s enviando mais 2,5 s para encerrar cada linha; se o limite for maior, aumente `BUDGET_MS` em `src/features/notificacoes/deliver.ts`) e que os trechos que rodam depois da resposta (`after()`: avisos de planejado e de meta) de fato rodam lá. Se não rodarem, é preciso entregá-los por `waitUntil`.
7. **Endereços de push reais:** a lista de serviços aceitos (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`) é rígida e, se um navegador usar outro endereço, o lembrete não é salvo. Confira com um endereço real de cada navegador (o Chrome pode usar um endereço diferente de `fcm.googleapis.com`). A lista está em `src/features/notificacoes/endpoint.ts` e, igual, na migração.
8. **Supabase → Authentication → URL Configuration:** conferir que a lista de endereços de retorno aceita a volta do Google com o parâmetro `next` mais longo (use o curinga `…/**`).
9. **Teste em aparelho de verdade:** iPhone (iOS 16.4 ou mais novo, com a Íris na tela de início: no iPhone o push só funciona no app instalado) e Android. Push só se confirma de verdade num endereço HTTPS; a instrução do iPhone e o botão de instalar do Android precisam ser vistos no aparelho.
10. **Logo definitivo:** trocar em `scripts/gerar-icones.mjs` e rodar `npm run icons`. Hoje os ícones usam o logo provisório.
11. **Sua aprovação** dos textos novos e das interpretações do Plano 8 (lista em `docs/decisoes-para-revisao.md`).
12. **Supabase Pro (cerca de US$ 25 por mês): decisão sua.** No plano gratuito o projeto é pausado depois de um tempo sem uso; com ele pausado, a Íris sai do ar e o agendador (lembretes, contas do mês) para. O plano pago também traz cópias de segurança diárias. Nada foi contratado. Se decidir ficar no gratuito no começo, saiba que é preciso reativar o projeto à mão quando ele pausar.
13. **Domínio próprio: decisão sua (é pago).** Sem domínio, o site funciona no endereço da Netlify, mas o provedor de e-mail exige um domínio verificado para enviar a qualquer pessoa (item 1). Com o domínio: apontar na Netlify, trocar `NEXT_PUBLIC_SITE_URL`, o "Site URL" e os endereços de retorno em Supabase → Authentication → URL Configuration, e o retorno do login com o Google.
14. **Supabase hospedado na região São Paulo** (RNF-07). A região é escolhida ao criar o projeto e não muda depois. O Postgres do projeto precisa ser 17 ou mais novo (item 5).
15. **Supabase → Authentication, para a troca de e-mail e a exclusão (Plano 9):**
    - Em Email: deixar ligados "Secure email change" (a troca de e-mail só vale com a confirmação nos dois endereços) e "Secure password change". Sem o segundo, qualquer sessão, por mais antiga que seja, consegue definir uma senha nova e entrar com ela, e a regra de entrada recente (15 minutos) da exclusão do cadastro perde o sentido.
    - Em URL Configuration: "Site URL" igual ao `NEXT_PUBLIC_SITE_URL` de produção. O link do e-mail de troca usa `{{ .SiteURL }}`.
    - Em Email Templates → "Change Email Address": colar `supabase/templates/email_change.html`, com o assunto "Confirme a troca de e-mail na Íris". O link precisa ser exatamente `{{ .SiteURL }}/confirmar-email?token_hash={{ .TokenHash }}`. Se decidir ligar "Confirm email" no cadastro, colar também `supabase/templates/confirmation.html` em "Confirm signup" (assunto "Confirme seu e-mail na Íris") e testar antes o caminho do convite da família (pendência em `docs/progresso.md`).
    - SMTP próprio (item 1) e, em Rate Limits, o limite de e-mails por hora acima do padrão: cada troca de e-mail envia dois e-mails (no ambiente local o limite foi subido para 20 por hora). O envio embutido do Supabase só chega à equipe do projeto e tem limite muito baixo.
16. **Termos de uso e Política de privacidade: revisão sua e, de preferência, de um advogado.** Os textos em `src/features/legal/content.ts` são um rascunho fiel ao que o app faz. Antes de lançar: (a) preencher em `src/features/legal/controller.ts` quem é o responsável (você ou a sua empresa), o e-mail de contato para assuntos de dados (que também é o contato do encarregado), o nome do provedor de e-mail e a data da revisão — enquanto um deles estiver vazio, as páginas mostram "Rascunho em revisão", marcam o que falta com "[a definir antes do lançamento]" e não são indexadas; nunca invente nomes ou números ali; (b) decidir os pontos marcados em `docs/decisoes-para-revisao.md` (Plano 9, "Para a revisão jurídica"): base legal, servidores da Netlify fora do Brasil, idade mínima, limite de responsabilidade, aviso em caso de incidente, prazos das cópias de segurança, lei aplicável e foro, gratuidade; (c) confirmar se os e-mails de confirmação e de nova senha (enviados pelo Supabase Auth) usam o mesmo provedor de e-mail do item 1 — a política diz que isso ainda está a confirmar.
17. **RNF-07 (dados no Brasil) e a Netlify: decisão sua.** O banco fica em São Paulo, mas as páginas e as ações do servidor rodam na Netlify, que pode executar o código fora do Brasil, e os dados passam por lá enquanto a pessoa usa o app. A política de privacidade diz isso com todas as letras. Se a exigência for "nada fora do Brasil", é uma decisão de hospedagem (ficar assim e documentar, ou trocar de hospedagem) que só você pode tomar antes de lançar.
18. **Primeira execução em Docker: o SQL e os testes dos Planos 8 e 9 nunca rodaram contra um banco.** Com o Docker aberto: `npx supabase db reset && npm run test:db && npm run test:e2e`. Esperado do Plano 9: banco `plano9` com 19 testes; ponta a ponta `plano9.spec.ts` com 6 testes (12 entradas em `--list`); os testes dos Planos 7 e 8 continuam passando (em especial `plano7-familia`, `plano7-saida` e `plano8-convite`, que passam pelas mudanças do Plano 9). Conferências que nenhum teste automático faz de ponta a ponta:
    - **Migração `20261003000001_seus_dados.sql`:** se parar no primeiro bloco, o papel que aplica as migrações não pode apagar em `auth.users` (ou ler `auth.sessions`, ou tem a segurança por linha ligada nas tabelas de `auth`). Nesse caso **não publique e não use a chave de serviço no app**: fale comigo. No banco hospedado, `npx supabase db push` para nesse ponto com uma mensagem clara.
    - **Sessão com mais de 15 minutos é recusada:** o teste "sessão com mais de 15 minutos" de `plano9.spec.ts` envelhece a sessão pelo `psql` do contêiner do banco local (`supabase_db_Planilha_financeira`; mude com `E2E_DB_CONTAINER`) e fica marcado como pulado se o contêiner não puder ser alcançado. Sem ele, à mão: `update auth.sessions set created_at = now() - interval '16 minutes' where user_id = 'ID';`, depois a tela Excluir meu cadastro deve pedir para sair e entrar de novo, e `delete_my_account` chamada com o token dessa pessoa deve recusar com "Entrada recente necessária." e deixar o cadastro intacto.
    - **Download autenticado:** o teste `plano9.spec.ts` baixa o arquivo com uma sessão de verdade. Confira também num deploy de prévia da Netlify, com um cadastro grande, e o que acontece se a conexão cair no meio do envio (o download deve falhar, não terminar "completo"). Confira ainda, no mesmo deploy, que os trechos `after()` rodam (item 6).
    - **Troca de e-mail:** `auth.jwt() ->> 'session_id'` vem preenchido; `verifyOtp({ type: 'email_change', token_hash })` só devolve sessão na segunda confirmação; cada endereço recebe um `{{ .TokenHash }}` diferente.
    - **Cadastro grande:** meça a exclusão de um cadastro com muitos registros (o papel `authenticated` tem limite de tempo por comando, 8 segundos no Supabase hospedado; o risco de estourar está no tamanho do registro de acessos de autenticação, `auth.audit_log_entries`, varrido sem índice; se estourar, a exclusão volta atrás inteira).
    - **Depois de publicar:** teste a exclusão com um cadastro de teste e confira no SQL Editor: `select * from public.account_leftovers('ID-DO-CADASTRO', 'e-mail')` deve voltar vazio. Compare também `select tablename from pg_tables where schemaname = 'auth'` com o que o papel consegue ler: uma tabela sem acesso não é conferida.
19. **Sua aprovação do Plano 9:** os textos novos (inclusive os dois textos jurídicos), a troca de "conta" por "cadastro" nos textos de exclusão da copy, "Todos os seus dados serão apagados…" só para quem não deixa nada para trás, e as interpretações das decisões 137, 142, 144, 146, 150, 151 e 155 (lista em `docs/decisoes-para-revisao.md`, seção "Plano 9").
20. **Landing (Plano 10):** a seção "Confiança" só pode citar exportação, exclusão e privacidade depois que os itens 16, 17 e 18 estiverem feitos (RF-57).

## Documentação do produto

| Documento | Conteúdo |
|---|---|
| [`docs/etapa-2-requisitos.md`](docs/etapa-2-requisitos.md) | Regras de negócio e requisitos (aprovados) |
| [`docs/etapa-3-arquitetura.md`](docs/etapa-3-arquitetura.md) | Modelo de dados, privacidade, páginas e fluxos (aprovada) |
| [`docs/etapa-5-ui.md`](docs/etapa-5-ui.md) | Identidade visual e tokens (aprovada) |
| [`docs/etapa-7-roteiro.md`](docs/etapa-7-roteiro.md) | Roteiro de desenvolvimento em 10 planos |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Planos de implementação detalhados |
