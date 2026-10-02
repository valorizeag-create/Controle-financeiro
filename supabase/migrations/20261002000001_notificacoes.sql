-- Plano 8: PWA e notificações (RF-16, RF-42 por e-mail, RF-46–50; A8).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regras de ouro:
-- 1. A fila (notification_log) guarda só o tipo e uma referência (id, mês ou
--    dia). O texto do aviso é montado na hora do envio, e o banco confere de
--    novo, nessa hora, se quem recebe ainda pode ver aquilo.
-- 2. Endereço de push é dado pessoal: ninguém lê pela API, nem a própria
--    pessoa. Só funções.
-- 3. As funções job_* são do agendador (pg_cron roda dentro do banco, como
--    dono, e não usa chave nenhuma). A rota da tarefa NÃO usa a chave de
--    serviço: as funções que ela chama (seção 4) exigem o segredo da tarefa
--    por parâmetro e devolvem só o que a entrega precisa. Nenhuma delas é
--    chamada com a sessão de uma pessoa.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- O Vault (endereço da rota da tarefa e o código de disparo, seção 4) já vem
-- ligado no Supabase. Aqui só se garante que existe, sem depender do padrão
-- da imagem; se não puder ser criado, o disparo fica desligado e o resto
-- funciona (job_dispatch só devolve falso).
do $$
begin
  create extension if not exists supabase_vault with schema vault;
exception when others then
  raise notice 'supabase_vault: %', sqlstate;
end;
$$;

-- ============================================================================
-- Seção 1 — preferências, inscrições de push e fila de avisos
-- ============================================================================

-- 1. Preferências (RF-50). Só o que a pessoa mudou é gravado; sem linha vale o
--    padrão: tudo ligado, menos o lembrete para anotar (RF-47).
create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bills', 'income', 'budget', 'goal', 'summary', 'daily', 'comeback', 'family')),
  enabled boolean not null,
  primary key (user_id, kind)
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;

create policy notification_prefs_own on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Inscrições de push: uma por aparelho. Só o endereço e as duas chaves que
--    o navegador entrega; nenhum nome ou modelo de aparelho. Sem acesso pela
--    API: nem leitura (as chaves não saem do banco), nem gravação direta.
--    O endereço só pode ser de um serviço de push conhecido (Chrome/Edge,
--    Firefox, Windows, Safari): a mesma lista de isAllowedPushEndpoint
--    (src/features/notificacoes/endpoint.ts). Assim ninguém guarda aqui um
--    endereço interno para o servidor chamar depois. Mudou a lista? Mude lá,
--    aqui e em save_push_subscription (item 5).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) between 20 and 2048
    and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/[^[:space:]]*$'
  ),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 3. Fila e registro dos avisos. Uma linha por pessoa, tipo e referência: o
--    mesmo aviso nunca sai duas vezes.
--    Referência: id do registro (contas e entradas), "{id}:{AAAA-MM}"
--    (planejado e meta), "AAAA-MM" (resumo), "AAAA-MM-DD" (lembrete e
--    retomada) ou id do aviso da família. Nunca texto.
--    Estado do envio (gravado só pelas funções da tarefa, seção 4):
--    - claimed_at / attempts: quando a linha foi pega para envio e quantas
--      vezes (no máximo 3);
--    - claim_id: o lote que pegou a linha por último. Quem encerra só mexe nas
--      linhas do próprio lote: um encerramento atrasado, de uma execução que
--      estourou o tempo, não marca o que outra execução ainda está entregando;
--    - push_sent_at / email_sent_at: quando cada canal saiu. Numa nova
--      tentativa, o canal que já saiu não é repetido (o e-mail do resumo não
--      chega duas vezes porque o push falhou, nem o contrário);
--    - sent_at: a linha está encerrada (tudo o que devia sair saiu, ou não
--      havia mais o que avisar). Vazio = ainda por enviar.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'bill_tomorrow', 'bill_today', 'income_today', 'budget_near', 'goal_near',
    'month_summary', 'daily_reminder', 'comeback', 'family_event'
  )),
  ref text not null check (char_length(ref) between 1 and 80),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_id uuid,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  push_sent_at timestamptz,
  email_sent_at timestamptz,
  sent_at timestamptz,
  unique (user_id, kind, ref)
);

create index notification_log_pending_idx on public.notification_log (created_at) where sent_at is null;
create index notification_log_claim_idx on public.notification_log (claim_id) where claim_id is not null;

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- 4. O aviso deste tipo está ligado para esta pessoa? Interna (sem grant):
--    só as funções abaixo a chamam.
create function public.notification_enabled(p_user uuid, p_kind text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(
    (select np.enabled from public.notification_prefs np
     where np.user_id = p_user
       and np.kind = case p_kind
         when 'bill_tomorrow' then 'bills' when 'bill_today' then 'bills'
         when 'income_today' then 'income' when 'budget_near' then 'budget'
         when 'goal_near' then 'goal' when 'month_summary' then 'summary'
         when 'daily_reminder' then 'daily' when 'comeback' then 'comeback'
         when 'family_event' then 'family' end),
    p_kind <> 'daily_reminder'
  )
$$;

-- 5. Ativar os lembretes neste aparelho. SECURITY DEFINER: a tabela não
--    aceita gravação direta, e num aparelho compartilhado a inscrição que era
--    de outra pessoa precisa sair (um aparelho = uma pessoa). No máximo 10
--    aparelhos por pessoa; o mais antigo sai. Só grava para quem chama.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 2048
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/[^[:space:]]*$'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'Inscrição inválida.';
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (v_uid, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions ps
    where ps.user_id = v_uid
      and ps.id not in (
        select k.id from public.push_subscriptions k
        where k.user_id = v_uid order by k.created_at desc, k.id desc limit 10
      );
end;
$$;

-- 6. Ao abrir o app: a inscrição deste navegador é minha? Se for de outra
--    pessoa (ela saiu sem desativar, ou a sessão venceu), é apagada: quem está
--    usando o aparelho agora não recebe o lembrete de outra pessoa.
--    SECURITY DEFINER: mesmo motivo do item 5. Só responde sim ou não.
create function public.sync_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 2048 then
    return false;
  end if;
  select ps.user_id into v_owner from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  if not found then
    return false;
  end if;
  if v_owner = v_uid then
    return true;
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  return false;
end;
$$;

-- 7. Desativar neste aparelho (e ao sair da Íris): apaga só a própria.
--    SECURITY DEFINER: a tabela não aceita gravação direta.
create function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions ps where ps.endpoint = p_endpoint and ps.user_id = v_uid;
end;
$$;

-- 8. Avisos que nascem de um registro da própria pessoa (etapa-3 §5: "logo
--    após cada registro"), no máximo um por categoria ou meta por mês.
--    - budget_near: quem decide que a categoria está "perto do limite" é o
--      servidor, com a regra de src/domain/planning.ts (RNF-11). Aqui só se
--      confere que a categoria é de quem chama e tem planejado neste mês.
--    - goal_near: conferido aqui (falta até um décimo do valor e a meta não
--      está completa), porque na meta da família o aviso vai para os outros
--      membros: ninguém manda aviso à família sem ser verdade. Diz só o total
--      (A4 B). Só quem participa da família agora enfileira e recebe.
--    SECURITY DEFINER: a fila não aceita gravação direta, e a meta da família
--    avisa outras pessoas. Devolve 1 se o aviso de quem chama entrou na fila
--    agora, senão 0: nunca quantas outras pessoas da família foram avisadas
--    (isso diria quem tem aparelho ativo e a chave ligada).
create function public.queue_own_notification(p_kind text, p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_ref text;
  v_goal record;
  v_saved bigint;
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_id is null or p_kind is null or p_kind not in ('budget_near', 'goal_near') then
    raise exception 'Aviso inválido.';
  end if;
  v_ref := p_id::text || ':' || to_char(v_today, 'YYYY-MM');

  if p_kind = 'budget_near' then
    if not exists (
      select 1 from public.budgets b
      where b.user_id = v_uid and b.category_id = p_id and b.month = v_month
    ) then
      return 0;
    end if;
    insert into public.notification_log (user_id, kind, ref)
    select v_uid, 'budget_near', v_ref
    where public.notification_enabled(v_uid, 'budget_near')
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = v_uid)
    on conflict (user_id, kind, ref) do nothing;
    get diagnostics v_rows = row_count;
    return v_rows;
  end if;

  select g.id, g.family_id, g.target_cents into v_goal
    from public.goals g
    where g.id = p_id and g.deleted_on is null and g.status = 'active'
      and (g.user_id = v_uid or (g.family_id is not null and g.family_id = public.my_family_id()));
  if not found then
    return 0;
  end if;
  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint into v_saved
    from public.goal_movements m
    where m.goal_id = v_goal.id and m.user_id is not null;
  if v_saved >= v_goal.target_cents or (v_goal.target_cents - v_saved) * 10 > v_goal.target_cents then
    return 0;
  end if;
  with queued as (
    insert into public.notification_log as nl (user_id, kind, ref)
    select x.user_id, 'goal_near', v_ref
    from (
      select v_uid as user_id where v_goal.family_id is null
      union all
      select fm.user_id from public.family_members fm
      where v_goal.family_id is not null and fm.family_id = v_goal.family_id
        and fm.left_at is null and fm.user_id is not null
    ) x
    where public.notification_enabled(x.user_id, 'goal_near')
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = x.user_id)
    on conflict (user_id, kind, ref) do nothing
    returning nl.user_id
  )
  select count(*)::integer into v_rows from queued q where q.user_id = v_uid;
  return v_rows;
end;
$$;

revoke execute on function public.notification_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_enabled(uuid, text) to service_role;

revoke execute on function
  public.save_push_subscription(text, text, text),
  public.sync_push_subscription(text),
  public.delete_push_subscription(text),
  public.queue_own_notification(text, uuid)
from public, anon;

grant execute on function
  public.save_push_subscription(text, text, text),
  public.sync_push_subscription(text),
  public.delete_push_subscription(text),
  public.queue_own_notification(text, uuid)
to authenticated;

-- ============================================================================
-- Seção 2 — tarefa diária das contas (etapa-3 §5) e generated_through
-- ============================================================================

-- 9. generated_through diz até que mês as contas já foram criadas. Enquanto a
--    geração rodava só "ao abrir o app", mexer nele só atrapalhava a própria
--    pessoa. Com a tarefa diária e as contas da família, voltar esse marcador
--    faria renascer contas que outro membro já pagou. Por isso:
--    a) pela API a coluna não aceita mais UPDATE. As colunas que as telas e as
--       funções pessoais dos planos anteriores gravam continuam como estavam
--       (update_recurrence, end_recurrence, delete_category e delete_card são
--       SECURITY INVOKER e só mexem em colunas desta lista; o "for update"
--       delas pede UPDATE em pelo menos uma coluna, que continua existindo), e
--       as guardas dos Planos 3 e 7 seguem valendo. Ficam de fora, além de
--       generated_through, id, created_at e updated_at: nenhuma tela os grava
--       (updated_at é do gatilho, que não depende da permissão de quem chama);
--    b) no INSERT só vale vazio ou o dia 1 do mês em que a conta começa (é o
--       que create_recurring_transaction grava: a primeira já existe). A
--       guarda vale para qualquer gravação, inclusive a administrativa.
revoke update on public.recurrences from authenticated;
grant update (
  user_id, kind, name, amount_cents, category_id, source, payment_method, frequency,
  due_day, due_month, starts_on, ended_on, note, card_id, family_id
) on public.recurrences to authenticated;

create function public.recurrences_generated_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.generated_through is not null
     and new.generated_through <> date_trunc('month', new.starts_on)::date then
    raise exception 'Recorrência inválida.';
  end if;
  return new;
end;
$$;

create trigger recurrences_generated_guard before insert on public.recurrences
  for each row execute function public.recurrences_generated_guard();

-- 10. Gerar as contas e entradas pessoais de uma pessoa. Corpo igual ao de
--     generate_occurrences da migração 20261001000001 (item 17), com a pessoa
--     por parâmetro. Interna (sem grant) e SECURITY DEFINER: a tarefa diária
--     não tem sessão, e generated_through não aceita mais UPDATE de quem
--     chama. Como a RLS não vale aqui, todo comando filtra por p_user: só
--     mexe em moldes e registros dessa pessoa.
create function public.generate_occurrences_for(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.user_id = p_user
      and rc.family_id is null
      and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.id
    for update
  loop
    v_period := greatest(
      coalesce((r.generated_through + interval '1 month')::date, v_oldest),
      make_date(extract(year from r.starts_on)::int, extract(month from r.starts_on)::int, 1),
      v_oldest
    );
    while v_period <= v_current loop
      if r.frequency = 'monthly' or extract(month from v_period)::int = r.due_month then
        v_due := public.occurrence_due_on(v_period, r.due_day);
        insert into public.transactions (
          user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
          occurred_on, status, due_on, recurrence_id, recurrence_period
        ) values (
          p_user, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.user_id = p_user;
  end loop;

  return v_count;
end;
$$;

-- 11. Ao abrir o app: a mesma assinatura e as mesmas permissões de antes
--     (create or replace mantém dono e permissões). Agora SECURITY DEFINER
--     (precisa gravar generated_through), sempre só para quem chama: a pessoa
--     vem de auth.uid(), nunca de parâmetro.
create or replace function public.generate_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  return public.generate_occurrences_for(auth.uid());
end;
$$;

-- 12. Contas de uma família. Corpo igual ao de generate_family_occurrences da
--     migração 20261001000001 (item 18), com a família por parâmetro e a mesma
--     ordem de travas (a família primeiro, os moldes depois). Interna e
--     SECURITY DEFINER (como já era a função do item 18: grava ocorrências em
--     nome de quem criou o molde). Família encerrada não gera nada.
create function public.generate_family_occurrences_for(p_family uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_family is null then
    return 0;
  end if;
  perform 1 from public.families f where f.id = p_family and f.ended_at is null for share;
  if not found then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.family_id = p_family
      and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = p_family and fm.user_id = rc.user_id and fm.left_at is null
      )
    order by rc.id
    for update of rc
  loop
    v_period := greatest(
      coalesce((r.generated_through + interval '1 month')::date, v_oldest),
      make_date(extract(year from r.starts_on)::int, extract(month from r.starts_on)::int, 1),
      v_oldest
    );
    while v_period <= v_current loop
      if r.frequency = 'monthly' or extract(month from v_period)::int = r.due_month then
        v_due := public.occurrence_due_on(v_period, r.due_day);
        insert into public.transactions (
          user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
          occurred_on, status, due_on, recurrence_id, recurrence_period, family_id
        ) values (
          r.user_id, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period, r.family_id
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.family_id = p_family;
  end loop;

  return v_count;
end;
$$;

-- Ao abrir o app: mesma assinatura, mesmas permissões e mesmas conferências
-- de antes (sessão, família de quem chama, trava da família e participação
-- conferida de novo depois dela). A família vem de my_family_id(), nunca de
-- parâmetro.
create or replace function public.generate_family_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    return 0;
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    return 0;
  end if;
  return public.generate_family_occurrences_for(v_family);
end;
$$;

-- 13. A tarefa diária: todas as pessoas e famílias com algo a gerar. O erro de
--     uma não impede as outras (vai para o log do banco só o código do erro,
--     nunca dado de pessoa). Quem chama é o agendador (pg_cron, seção 4), que
--     roda dentro do banco e não usa chave. SECURITY DEFINER: chama as
--     internas dos itens 10 e 12. Não recebe parâmetro.
create function public.job_generate_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  r record;
  v_count integer := 0;
begin
  for r in
    select distinct rc.user_id from public.recurrences rc
    where rc.family_id is null and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.user_id
  loop
    begin
      v_count := v_count + public.generate_occurrences_for(r.user_id);
    exception when others then
      raise warning 'job_generate_occurrences (pessoa): %', sqlstate;
    end;
  end loop;

  for r in
    select distinct rc.family_id from public.recurrences rc
    where rc.family_id is not null and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
    order by rc.family_id
  loop
    begin
      v_count := v_count + public.generate_family_occurrences_for(r.family_id);
    exception when others then
      raise warning 'job_generate_occurrences (família): %', sqlstate;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.recurrences_generated_guard() from public, anon, authenticated;

-- service_role aqui é só para os testes de banco e os scripts locais; o app
-- não usa a chave de serviço (regra de ouro 3).
revoke execute on function
  public.generate_occurrences_for(uuid),
  public.generate_family_occurrences_for(uuid),
  public.job_generate_occurrences()
from public, anon, authenticated;

grant execute on function
  public.generate_occurrences_for(uuid),
  public.generate_family_occurrences_for(uuid),
  public.job_generate_occurrences()
to service_role;

-- ============================================================================
-- Seção 3 — convite da família por e-mail (RF-42) e limpeza diária
-- ============================================================================

-- 14. O convite por e-mail é o convite por link do Plano 7 (7 dias, uma
--     pessoa, um por vez, só o resumo do código no banco) entregue por e-mail.
--     - invited_email: o endereço de quem foi convidado é dado de terceiro.
--       Fica só enquanto o convite está pendente (para "Reenviar"), só o
--       administrador lê, e some quando o convite é aceito, cancelado ou vence.
--     - sent_by_email fica: é o que conta para os limites por período.
--     - invited_email_hash: o SHA-256 do endereço, só para o limite por
--       destinatário (item 15). Ninguém lê pela API (sem permissão na coluna),
--       fica mesmo depois de o convite ser cancelado (senão cancelar zeraria o
--       limite) e é apagado pela limpeza diária depois de 7 dias (item 16).
alter table public.family_invites
  add column invited_email text check (
    invited_email is null
    or (char_length(invited_email) between 6 and 254
        and invited_email = lower(invited_email)
        and invited_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  add column sent_by_email boolean not null default false,
  add column invited_email_hash bytea check (invited_email_hash is null or octet_length(invited_email_hash) = 32),
  add constraint family_invites_email_only_pending
    check (invited_email is null or (accepted_at is null and revoked_at is null));

create index family_invites_sent_idx on public.family_invites (created_at) where sent_by_email;
create index family_invites_email_hash_idx on public.family_invites (invited_email_hash, created_at)
  where invited_email_hash is not null;

-- A política do Plano 7 já limita a leitura ao administrador da família.
-- invited_email_hash fica de fora de propósito.
grant select (invited_email, sent_by_email) on public.family_invites to authenticated;

create function public.family_invites_clear_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.accepted_at is not null or new.revoked_at is not null then
    new.invited_email := null;
  end if;
  return new;
end;
$$;

create trigger family_invites_clear_email before update on public.family_invites
  for each row execute function public.family_invites_clear_email();

-- 15. Convidar por e-mail: só o administrador. Ninguém usa a Íris para encher
--     a caixa de entrada de outra pessoa nem para mandar texto próprio em nome
--     da Íris. Limites, todos com a mesma resposta ("Limite de convites."):
--     a) 5 por família E 5 por pessoa a cada 24 horas. O limite por pessoa usa
--        created_by, que não muda quando a pessoa encerra a família e cria
--        outra: recriar a família não zera a conta;
--     b) 3 para o mesmo endereço a cada 7 dias, somando todas as famílias
--        (pelo resumo do endereço);
--     c) 100 no total a cada 24 horas (abaixo da cota gratuita de envio, que é
--        a mesma dos e-mails de recuperação de senha). Aproximado: não há
--        trava global, de propósito.
--     Não consulta se o e-mail tem cadastro: a resposta é sempre a mesma.
--     Devolve só o código e a validade, só para quem pediu (a Server Action
--     monta o link e envia; o código não é guardado). Nenhum nome sai daqui: o
--     assunto do e-mail é fixo, definido no app, sem texto escolhido por
--     quem convida.
--     O link continua sendo um convite normal do Plano 7: vale para quem o
--     tiver (uma pessoa, 7 dias), entra sempre como membro.
--     SECURITY DEFINER: family_invites não aceita gravação direta.
create function public.create_family_email_invite(p_email text)
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash bytea;
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_email) not between 6 and 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido.';
  end if;
  v_hash := extensions.digest(v_email, 'sha256');
  -- Mesma ordem de travas de create_family_invite (família, depois convite).
  perform 1 from public.families f where f.id = v_family for update;
  if (select count(*) from public.family_invites i
      where i.sent_by_email and i.created_at > now() - interval '24 hours'
        and (i.family_id = v_family or i.created_by = v_uid)) >= 5
     or (select count(*) from public.family_invites i
         where i.invited_email_hash = v_hash and i.created_at > now() - interval '7 days') >= 3
     or (select count(*) from public.family_invites i
         where i.sent_by_email and i.created_at > now() - interval '24 hours') >= 100 then
    raise exception 'Limite de convites.';
  end if;
  -- Confere de novo o papel depois da trava, cancela o convite anterior e cria o novo.
  select c.invite_code, c.invite_expires_at into v_code, v_expires from public.create_family_invite() c;
  update public.family_invites i
    set invited_email = v_email, invited_email_hash = v_hash, sent_by_email = true
    where i.family_id = v_family and i.token_hash = extensions.digest(v_code, 'sha256');
  return query select v_code, v_expires;
end;
$$;

-- 16. Limpeza diária (agenda própria, seção 4): e-mail de convite vencido,
--     resumo de endereço com mais de 7 dias (já não conta para limite nenhum),
--     avisos antigos (a fila só precisa lembrar do que já avisou por pouco
--     tempo) e o histórico do agendador (cresce a cada execução). Um problema
--     no histórico do agendador não impede o resto.
create function public.job_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.family_invites i set invited_email = null
    where i.invited_email is not null and i.expires_at <= now();
  update public.family_invites i set invited_email_hash = null
    where i.invited_email_hash is not null and i.created_at < now() - interval '7 days';
  delete from public.notification_log nl where nl.created_at < now() - interval '90 days';
  begin
    delete from cron.job_run_details d where d.end_time < now() - interval '7 days';
  exception when others then
    raise warning 'job_cleanup (agendador): %', sqlstate;
  end;
end;
$$;

revoke execute on function public.family_invites_clear_email() from public, anon, authenticated;
revoke execute on function public.create_family_email_invite(text) from public, anon;
grant execute on function public.create_family_email_invite(text) to authenticated;
revoke execute on function public.job_cleanup() from public, anon, authenticated;
grant execute on function public.job_cleanup() to service_role;

-- ============================================================================
-- Seção 4 — segredo da tarefa, enfileirar, entregar o lote, avisos da família
--           e agenda
-- ============================================================================

-- 17. O segredo da tarefa (JOB_SECRET: 32 bytes aleatórios em base64url, 43
--     caracteres). Ele mora só no ambiente do servidor do app. O banco guarda
--     só o SHA-256 dele, num esquema que a API não expõe: o segredo em si
--     nunca fica no banco, nem no Vault, nem passa pelo pg_net.
--     A rota da tarefa usa a chave pública, sem sessão (papel anon), e manda o
--     segredo como parâmetro das funções dos itens 22, 23 e 25. Sem o segredo
--     certo elas não fazem nem devolvem nada.
--     Várias linhas com rótulo: trocar o segredo (grava o novo com outro
--     rótulo, muda o ambiente, apaga o antigo) e deixar os testes gravarem o
--     deles sem mexer no de quem desenvolve.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table private.job_secrets (
  label text primary key check (label ~ '^[a-z0-9-]{1,40}$'),
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  created_at timestamptz not null default now()
);

-- Sem política: ninguém além do dono (as funções SECURITY DEFINER abaixo).
alter table private.job_secrets enable row level security;
revoke all on private.job_secrets from public, anon, authenticated, service_role;

-- Grava ou apaga (p_hash_hex nulo) um resumo. Recebe só o resumo em
-- hexadecimal: o segredo não chega ao banco, ao log de comandos nem ao editor
-- de SQL. No máximo 5 rótulos. Só service_role (script local e testes de
-- banco); no Supabase hospedado, quem cuida do projeto roda a mesma chamada no
-- editor de SQL. SECURITY DEFINER: o esquema private não tem acesso nenhum.
create function public.job_secret_set(p_label text, p_hash_hex text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_label is null or p_label !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Segredo inválido.';
  end if;
  if p_hash_hex is null then
    delete from private.job_secrets s where s.label = p_label;
    return;
  end if;
  if p_hash_hex !~ '^[0-9a-f]{64}$'
     or (select count(*) from private.job_secrets s where s.label <> p_label) >= 4 then
    raise exception 'Segredo inválido.';
  end if;
  insert into private.job_secrets (label, secret_hash) values (p_label, decode(p_hash_hex, 'hex'))
  on conflict (label) do update set secret_hash = excluded.secret_hash, created_at = now();
end;
$$;

-- Confere o segredo sem dar pista pelo tempo de resposta: os dois lados viram
-- um resumo e depois um HMAC com uma chave sorteada nesta chamada, então a
-- comparação de bytes é feita sobre valores que quem chama não prevê.
-- bool_or compara todas as linhas (não para na primeira). O tamanho é
-- conferido depois da comparação: segredo malformado custa o mesmo que errado.
create function private.job_secret_ok(p_secret text) returns boolean
language plpgsql volatile set search_path = '' as $$
declare
  v_key bytea := extensions.gen_random_bytes(32);
  v_given bytea := extensions.hmac(extensions.digest(coalesce(p_secret, ''), 'sha256'), v_key, 'sha256');
  v_ok boolean;
begin
  select coalesce(bool_or(extensions.hmac(s.secret_hash, v_key, 'sha256') = v_given), false)
    into v_ok from private.job_secrets s;
  return v_ok and p_secret is not null and octet_length(p_secret) between 43 and 128;
end;
$$;

-- Uma falha só para tudo: segredo errado, nenhum segredo gravado, vazio,
-- tamanho errado. É o mesmo código que recebe quem chama uma função sem
-- permissão. O segredo nunca entra numa mensagem de erro.
create function private.job_require(p_secret text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  if not private.job_secret_ok(p_secret) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.job_secret_ok(text), private.job_require(text)
  from public, anon, authenticated, service_role;

-- 18. Os dados de um aviso, conferidos na hora do envio. Devolve nulo quando
--     quem recebe não pode (mais) ver aquilo: conta já paga ou que mudou de
--     dia, pessoa que saiu da família, categoria ou meta excluída, meta já
--     completa ou que deixou de estar perto, quem voltou a anotar antes do
--     aviso de retomada. Só as colunas
--     que as telas da própria pessoa (ou da família, Plano 7) já mostram:
--     nunca cartão, forma de pagamento, valor da conta, entrada de outra
--     pessoa nem a parte de outro numa meta. Entrada a receber é sempre
--     pessoal: nunca vai para a família.
--     Interna: chamada só por job_claim_notifications.
create function public.notification_params(p_user uuid, p_kind text, p_ref text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_out jsonb;
begin
  if p_user is null or p_kind is null or p_ref is null then
    return null;
  end if;

  if p_kind in ('bill_tomorrow', 'bill_today', 'income_today') then
    if p_ref !~ ('^' || v_uuid || '$') then
      return null;
    end if;
    -- O nome cabe no que o aviso aceita (60 caracteres): uma nota comprida
    -- não faz o aviso da conta deixar de sair.
    select jsonb_build_object(
             'name', left(coalesce(r.name, t.note, t.source), 60), 'id', t.id, 'due_on', t.due_on,
             'family', t.family_id is not null)
      into v_out
    from public.transactions t
    left join public.recurrences r on r.id = t.recurrence_id
    where t.id = p_ref::uuid
      and t.status = 'pending'
      and t.kind = case when p_kind = 'income_today' then 'income' else 'expense' end
      and t.due_on = case when p_kind = 'bill_tomorrow' then v_today + 1 else v_today end
      and coalesce(r.name, t.note, t.source) is not null
      and (
        (t.family_id is null and t.user_id = p_user)
        or (p_kind <> 'income_today'
            and t.family_id is not null
            and r.family_id = t.family_id
            and exists (select 1 from public.family_members fm
                        where fm.family_id = t.family_id and fm.user_id = p_user and fm.left_at is null)
            and exists (select 1 from public.family_members au
                        where au.family_id = t.family_id and au.user_id = t.user_id and au.left_at is null))
      );
    return v_out;
  end if;

  if p_kind = 'budget_near' then
    if p_ref !~ ('^' || v_uuid || ':20[0-9]{2}-(0[1-9]|1[0-2])$')
       or split_part(p_ref, ':', 2) <> to_char(v_today, 'YYYY-MM') then
      return null;
    end if;
    select jsonb_build_object('name', c.name) into v_out
    from public.categories c
    where c.id = split_part(p_ref, ':', 1)::uuid and c.user_id = p_user;
    return v_out;
  end if;

  if p_kind = 'goal_near' then
    if p_ref !~ ('^' || v_uuid || ':20[0-9]{2}-(0[1-9]|1[0-2])$') then
      return null;
    end if;
    select jsonb_build_object('name', g.name, 'id', g.id, 'remaining_cents', g.target_cents - s.saved) into v_out
    from public.goals g
    cross join lateral (
      select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint as saved
      from public.goal_movements m
      where m.goal_id = g.id and m.user_id is not null
    ) s
    where g.id = split_part(p_ref, ':', 1)::uuid
      and g.deleted_on is null and g.status = 'active'
      and g.target_cents - s.saved > 0
      -- Ainda falta até um décimo (a mesma regra de queue_own_notification):
      -- se alguém resgatou ou saiu da família nesse meio-tempo, "faltam só"
      -- deixou de ser verdade e o aviso não sai.
      and (g.target_cents - s.saved) * 10 <= g.target_cents
      and (g.user_id = p_user
           or (g.family_id is not null and exists (
                 select 1 from public.family_members fm
                 where fm.family_id = g.family_id and fm.user_id = p_user and fm.left_at is null)));
    return v_out;
  end if;

  if p_kind = 'month_summary' then
    return case when p_ref ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then jsonb_build_object('month', p_ref) end;
  end if;

  if p_kind = 'daily_reminder' then
    return case when p_ref = v_today::text then '{}'::jsonb end;
  end if;

  if p_kind = 'comeback' then
    -- A referência é o dia do último registro. Quem anotou alguma coisa
    -- depois dele já voltou: não recebe o aviso. (Datas AAAA-MM-DD comparam
    -- como texto na mesma ordem dos dias.)
    if p_ref !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
      return null;
    end if;
    return case when not exists (
      select 1 from public.transactions t
      where t.user_id = p_user and t.status = 'confirmed'
        and to_char((t.updated_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') > p_ref
    ) then '{}'::jsonb end;
  end if;

  if p_kind = 'family_event' then
    if p_ref !~ ('^' || v_uuid || '$') then
      return null;
    end if;
    select jsonb_build_object(
             'event_kind', e.kind, 'member_name', e.member_name, 'goal_name', e.goal_name, 'amount_cents', e.amount_cents)
      into v_out
    from public.family_events e
    where e.id = p_ref::uuid
      and exists (select 1 from public.family_members fm
                  where fm.family_id = e.family_id and fm.user_id = p_user and fm.left_at is null);
    return v_out;
  end if;

  return null;
end;
$$;

-- 19. Manhã (9h de Brasília, A8). p_today existe para os testes escolherem o
--     dia; a agenda chama job_enqueue_morning, que usa o dia de hoje.
--     - contas: a pagar que vencem amanhã ou hoje. Pessoal → quem criou; da
--       família → todos que participam (é o que Família → Contas mostra a
--       todos, RN-20). Vencida não gera aviso.
--     - entradas a receber de hoje (só pessoais).
--     - retomada: o último registro confirmado foi há 5 dias ou mais (até 30);
--       a referência é o dia desse registro, então o aviso sai uma vez por
--       intervalo. Só olha os registros dos últimos 30 dias: se o último é
--       mais antigo, a pessoa não entra de qualquer jeito.
--     - resumo: no dia 1, quem teve registro no mês que fechou. Não exige
--       aparelho (também vai por e-mail).
--     Só entra na fila quem tem a chave ligada (e, menos no resumo, aparelho).
--     SECURITY DEFINER: lê registros de todas as pessoas e grava na fila, que
--     não aceita gravação direta.
create function public.job_enqueue_morning_on(p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_prev date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_today is null then
    return 0;
  end if;

  insert into public.notification_log (user_id, kind, ref)
  select t.user_id, case when t.due_on = p_today then 'bill_today' else 'bill_tomorrow' end, t.id::text
  from public.transactions t
  where t.kind = 'expense' and t.status = 'pending' and t.family_id is null and t.user_id is not null
    and t.due_on in (p_today, p_today + 1)
    and public.notification_enabled(t.user_id, 'bill_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = t.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select fm.user_id, case when t.due_on = p_today then 'bill_today' else 'bill_tomorrow' end, t.id::text
  from public.transactions t
  join public.recurrences r on r.id = t.recurrence_id and r.family_id = t.family_id
  join public.family_members au on au.family_id = t.family_id and au.user_id = t.user_id and au.left_at is null
  join public.family_members fm on fm.family_id = t.family_id and fm.left_at is null and fm.user_id is not null
  where t.kind = 'expense' and t.status = 'pending' and t.family_id is not null
    and t.due_on in (p_today, p_today + 1)
    and public.notification_enabled(fm.user_id, 'bill_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = fm.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select t.user_id, 'income_today', t.id::text
  from public.transactions t
  where t.kind = 'income' and t.status = 'pending' and t.family_id is null and t.user_id is not null
    and t.due_on = p_today
    and public.notification_enabled(t.user_id, 'income_today')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = t.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.notification_log (user_id, kind, ref)
  select x.user_id, 'comeback', x.last_on::text
  from (
    select t.user_id, max((t.updated_at at time zone 'America/Sao_Paulo')::date) as last_on
    from public.transactions t
    where t.user_id is not null and t.status = 'confirmed'
      and t.updated_at >= ((p_today - 30)::timestamp at time zone 'America/Sao_Paulo')
    group by t.user_id
  ) x
  where x.last_on between p_today - 30 and p_today - 5
    and public.notification_enabled(x.user_id, 'comeback')
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = x.user_id)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  if extract(day from p_today)::int = 1 then
    v_prev := (p_today - interval '1 month')::date;
    insert into public.notification_log (user_id, kind, ref)
    select distinct t.user_id, 'month_summary', to_char(v_prev, 'YYYY-MM')
    from public.transactions t
    where t.user_id is not null and t.status = 'confirmed'
      and coalesce(t.paid_on, t.occurred_on) >= v_prev and coalesce(t.paid_on, t.occurred_on) < p_today
      and public.notification_enabled(t.user_id, 'month_summary')
    on conflict (user_id, kind, ref) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;

  return v_count;
end;
$$;

-- 20. Noite (21h de Brasília): lembrete para anotar, só para quem ligou
--     (RF-47) e ainda não anotou nada hoje. SECURITY DEFINER: mesmo motivo do
--     item 19.
create function public.job_enqueue_evening_on(p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer := 0;
begin
  if p_today is null then
    return 0;
  end if;
  insert into public.notification_log (user_id, kind, ref)
  select np.user_id, 'daily_reminder', p_today::text
  from public.notification_prefs np
  where np.kind = 'daily' and np.enabled
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = np.user_id)
    and not exists (
      select 1 from public.transactions t
      where t.user_id = np.user_id and t.status = 'confirmed'
        and (t.created_at at time zone 'America/Sao_Paulo')::date = p_today
    )
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- 21. Avisos da família (RN-22d, RN-22e; decisão 108): cada aviso gravado
--     pelo Plano 7 entra na fila de quem continua na família. Quem está saindo
--     ainda aparece como participante nesta hora, e é pulado pelo member_id;
--     quem está excluindo o cadastro perde a linha na cascata. A fila guarda
--     só o id do aviso: o que ele diz é lido de family_events na hora do envio
--     (item 18), só para quem ainda participa — as mesmas colunas que a tela
--     da família mostra.
--     Nunca recusa: um problema com o aviso não pode impedir alguém de sair
--     da família nem de excluir o cadastro.
--     SECURITY DEFINER: grava na fila de outras pessoas da família.
create function public.family_event_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.notification_log (user_id, kind, ref)
    select fm.user_id, 'family_event', new.id::text
    from public.family_members fm
    where fm.family_id = new.family_id and fm.left_at is null and fm.user_id is not null
      and (new.member_id is null or fm.id <> new.member_id)
      and public.notification_enabled(fm.user_id, 'family_event')
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = fm.user_id)
    on conflict (user_id, kind, ref) do nothing;
  exception when others then
    raise warning 'family_event_notify: %', sqlstate;
  end;
  return null;
end;
$$;

create trigger family_events_notify after insert on public.family_events
  for each row execute function public.family_event_notify();

-- 22. Pegar um lote para enviar (rota da tarefa, com o segredo). Para cada
--     linha ainda não enviada (até 3 tentativas, com 15 minutos entre elas, e
--     só as dos últimos 2 dias): confere de novo a chave e monta os dados
--     (item 18). Sem dados, ou sem canal nenhum para enviar (a pessoa
--     desativou o aparelho), a linha é encerrada sem envio.
--     Devolve só o que a entrega precisa — nunca o id da pessoa:
--     - n_claim: o lote. Quem encerra só mexe nas linhas dele (item 23);
--     - n_subscriptions: as inscrições de push de quem recebe ({ id, endpoint,
--       p256dh, auth }); vazia se o push desta linha já saiu numa tentativa
--       anterior;
--     - n_email: só no resumo do mês, o e-mail confirmado; vazio se o e-mail
--       desta linha já saiu.
--     É o único lugar de onde endereços de push e e-mails saem do banco.
--     Lote de 20 por padrão, 50 no máximo (cabe no tempo de uma chamada pela
--     API). VOLATILE: a API só aceita POST, o segredo nunca vai numa URL.
--     SECURITY DEFINER: a fila e as inscrições não têm acesso pela API; o que
--     autoriza é o segredo (por isso pode ser chamada pelo papel anon).
create function public.job_claim_notifications(p_secret text, p_limit integer)
returns table (n_claim uuid, n_id uuid, n_kind text, n_params jsonb, n_email text, n_subscriptions jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_claim uuid := gen_random_uuid();
  r record;
  v_params jsonb;
  v_email text;
  v_subs jsonb;
begin
  perform private.job_require(p_secret);
  for r in
    select nl.id, nl.user_id, nl.kind, nl.ref, nl.push_sent_at, nl.email_sent_at
    from public.notification_log nl
    where nl.sent_at is null and nl.attempts < 3
      and (nl.claimed_at is null or nl.claimed_at < now() - interval '15 minutes')
      and nl.created_at > now() - interval '2 days'
    order by nl.created_at, nl.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  loop
    v_params := null;
    v_email := null;
    v_subs := '[]'::jsonb;
    -- Uma linha com problema é encerrada; não trava a fila das outras pessoas.
    begin
      if public.notification_enabled(r.user_id, r.kind) then
        v_params := public.notification_params(r.user_id, r.kind, r.ref);
      end if;
    exception when others then
      raise warning 'job_claim_notifications: %', sqlstate;
      v_params := null;
    end;
    if v_params is not null then
      if r.push_sent_at is null then
        v_subs := coalesce((
          select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
                           order by ps.created_at, ps.id)
          from public.push_subscriptions ps where ps.user_id = r.user_id
        ), '[]'::jsonb);
      end if;
      if r.kind = 'month_summary' and r.email_sent_at is null then
        select u.email::text into v_email
          from auth.users u where u.id = r.user_id and u.email_confirmed_at is not null;
      end if;
    end if;
    if v_params is null or (v_email is null and v_subs = '[]'::jsonb) then
      update public.notification_log nl set sent_at = now() where nl.id = r.id;
      continue;
    end if;
    update public.notification_log nl
      set claimed_at = now(), claim_id = v_claim, attempts = nl.attempts + 1
      where nl.id = r.id;
    n_claim := v_claim;
    n_id := r.id;
    n_kind := r.kind;
    n_params := v_params;
    n_email := v_email;
    n_subscriptions := v_subs;
    return next;
  end loop;
end;
$$;

-- 23. Depois de enviar UMA linha (a rota chama logo depois do envio de cada
--     linha; se a execução estourar o tempo, só as linhas em andamento ficam
--     sem registro). Cada canal diz o que aconteceu:
--       'sent'   — saiu agora (fica gravado: uma nova tentativa não repete);
--       'none'   — não havia o que enviar por este canal (sem aparelho, sem
--                  e-mail, canal já enviado antes, inscrições que não valem
--                  mais, canal desligado no servidor);
--       'failed' — falhou; a linha fica aberta para a próxima tentativa.
--     A linha é encerrada quando nenhum canal falhou.
--     Só alcança a linha do lote informado (p_claim), ainda aberta e pega há
--     menos de uma hora: um encerramento atrasado, de uma execução que
--     estourou o tempo, não mexe no que outra execução está entregando.
--     p_dead: inscrições que o serviço de push disse que não valem mais. Só
--     apaga as que são da pessoa desta linha (no máximo 10: é o limite de
--     aparelhos por pessoa). Quem tem o segredo não apaga a inscrição de mais
--     ninguém.
--     Devolve verdadeiro se a linha era deste lote e foi atualizada.
--     SECURITY DEFINER: mesmo motivo do item 22.
create function public.job_finish_notification(
  p_secret text, p_claim uuid, p_id uuid, p_push text, p_email text, p_dead uuid[]
) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform private.job_require(p_secret);
  if p_claim is null or p_id is null
     or p_push is null or p_push not in ('sent', 'none', 'failed')
     or p_email is null or p_email not in ('sent', 'none', 'failed')
     or coalesce(cardinality(p_dead), 0) > 10 then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select nl.user_id into v_user
    from public.notification_log nl
    where nl.id = p_id and nl.claim_id = p_claim and nl.sent_at is null
      and nl.claimed_at > now() - interval '1 hour'
    for update;
  if not found then
    return false;
  end if;
  delete from public.push_subscriptions ps
    where ps.user_id = v_user and ps.id = any (coalesce(p_dead, '{}'::uuid[]));
  update public.notification_log nl set
    push_sent_at = case when p_push = 'sent' then coalesce(nl.push_sent_at, now()) else nl.push_sent_at end,
    email_sent_at = case when p_email = 'sent' then coalesce(nl.email_sent_at, now()) else nl.email_sent_at end,
    sent_at = case when p_push <> 'failed' and p_email <> 'failed' then now() end
  where nl.id = p_id;
  return true;
end;
$$;

-- 24. Disparo: se há algo a enviar, chama a rota da tarefa (pg_net). O Vault
--     do Supabase guarda o endereço e o CÓDIGO DE DISPARO, nunca o segredo:
--       select vault.create_secret('https://…/api/jobs/notificacoes', 'iris_job_url');
--       select vault.create_secret('<código de disparo>', 'iris_job_trigger');
--     O código de disparo é HMAC-SHA256(JOB_SECRET, 'iris-job-trigger-v1') em
--     base64url (43 caracteres), calculado fora do banco. Dele não se chega ao
--     segredo; quem o tiver só consegue pedir à rota que entregue um lote (o
--     que é idempotente), e não chama as funções dos itens 22 e 23. A rota
--     confere o código e usa o segredo do próprio ambiente.
--     O endereço só pode ser https (ou http para a máquina local): um erro de
--     digitação não manda o código em texto aberto.
--     Sem os dois, não faz nada. Nunca lança erro (o agendador não para).
--     SECURITY DEFINER: lê o Vault e a fila.
create function public.job_dispatch() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_token text;
begin
  if not exists (
    select 1 from public.notification_log nl
    where nl.sent_at is null and nl.attempts < 3
      and (nl.claimed_at is null or nl.claimed_at < now() - interval '15 minutes')
      and nl.created_at > now() - interval '2 days'
  ) then
    return false;
  end if;
  begin
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'iris_job_url';
    select ds.decrypted_secret into v_token from vault.decrypted_secrets ds where ds.name = 'iris_job_trigger';
    if v_url is null or v_token is null or char_length(v_url) > 2048
       or v_token !~ '^[A-Za-z0-9_-]{43}$' then
      return false;
    end if;
    if v_url !~ '^https://[^[:space:]]+$'
       and v_url !~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{1,5})?/[^[:space:]]*$' then
      return false;
    end if;
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('content-type', 'application/json', 'x-iris-job-trigger', v_token),
      timeout_milliseconds := 20000
    );
    return true;
  exception when others then
    raise warning 'job_dispatch: %', sqlstate;
    return false;
  end;
end;
$$;

-- 25. As tarefas que a agenda chama. SECURITY DEFINER: chamam as internas.
create function public.job_enqueue_morning() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  -- Rede de segurança: se a tarefa das 00h05 falhou, as contas de hoje nascem aqui.
  perform public.job_generate_occurrences();
  v_count := public.job_enqueue_morning_on((now() at time zone 'America/Sao_Paulo')::date);
  perform public.job_dispatch();
  return v_count;
end;
$$;

create function public.job_enqueue_evening() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  v_count := public.job_enqueue_evening_on((now() at time zone 'America/Sao_Paulo')::date);
  perform public.job_dispatch();
  return v_count;
end;
$$;

-- Para o script local (scripts/rodar-tarefa.mjs) rodar uma tarefa da agenda na
-- hora, com o segredo e a chave pública: o agendador chama as funções direto e
-- não precisa disto. Tarefa desconhecida: nada. SECURITY DEFINER: chama as
-- internas; o que autoriza é o segredo.
create function public.job_trigger(p_secret text, p_job text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.job_require(p_secret);
  return case p_job
    when 'manha' then public.job_enqueue_morning()
    when 'noite' then public.job_enqueue_evening()
    when 'ocorrencias' then public.job_generate_occurrences()
  end;
end;
$$;

-- A agenda da Íris (para conferir e para os testes). SECURITY DEFINER: o
-- esquema cron não é exposto pela API.
create function public.job_schedules() returns table (jobname text, schedule text, active boolean)
language sql stable security definer set search_path = '' as $$
  select j.jobname::text, j.schedule::text, j.active from cron.job j where j.jobname like 'iris-%' order by j.jobname
$$;

-- Pausar e retomar a agenda da Íris (só service_role). Os testes de banco
-- pausam antes de rodar e retomam no fim (tests/db/global-setup.ts): uma
-- tarefa que disparasse no meio de um teste (00h05, 9h, 21h ou a cada 10
-- minutos) geraria contas e avisos que o teste não espera. Também serve para
-- desligar os avisos numa emergência sem apagar a agenda. Devolve quantas
-- tarefas mudou. SECURITY DEFINER: mesmo motivo de job_schedules.
create function public.job_set_paused(p_paused boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count integer := 0;
begin
  if p_paused is null then
    return 0;
  end if;
  for r in select j.jobid from cron.job j where j.jobname like 'iris-%' order by j.jobid loop
    perform cron.alter_job(r.jobid, active := not p_paused);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.family_event_notify() from public, anon, authenticated;

-- Internas e da agenda: service_role aqui é só para os testes de banco e os
-- scripts locais (regra de ouro 3).
revoke execute on function
  public.job_secret_set(text, text),
  public.notification_params(uuid, text, text),
  public.job_enqueue_morning_on(date),
  public.job_enqueue_morning(),
  public.job_enqueue_evening_on(date),
  public.job_enqueue_evening(),
  public.job_dispatch(),
  public.job_schedules(),
  public.job_set_paused(boolean)
from public, anon, authenticated;

grant execute on function
  public.job_secret_set(text, text),
  public.notification_params(uuid, text, text),
  public.job_enqueue_morning_on(date),
  public.job_enqueue_morning(),
  public.job_enqueue_evening_on(date),
  public.job_enqueue_evening(),
  public.job_dispatch(),
  public.job_schedules(),
  public.job_set_paused(boolean)
to service_role;

-- As três funções com segredo. A rota usa a chave pública sem sessão: é o
-- papel anon. Uma pessoa com sessão (papel authenticated) recebe 42501 mesmo
-- com o segredo certo: a sessão de um navegador nunca roda a tarefa.
revoke execute on function
  public.job_claim_notifications(text, integer),
  public.job_finish_notification(text, uuid, uuid, text, text, uuid[]),
  public.job_trigger(text, text)
from public, anon, authenticated;

grant execute on function
  public.job_claim_notifications(text, integer),
  public.job_finish_notification(text, uuid, uuid, text, text, uuid[]),
  public.job_trigger(text, text)
to anon;

-- 26. Agenda. O pg_cron roda em UTC; Brasília = UTC−3, sem horário de verão:
--       iris-ocorrencias  00h05 de Brasília = 03h05 UTC  → '5 3 * * *'
--       iris-limpeza      00h15 de Brasília = 03h15 UTC  → '15 3 * * *'
--       iris-manha        9h de Brasília    = 12h UTC    → '0 12 * * *'
--       iris-noite        21h de Brasília   = 00h UTC (já o dia seguinte em UTC) → '0 0 * * *'
--       iris-entrega      a cada 10 minutos              → '*/10 * * * *'
--     Dentro das funções, "hoje" é sempre o dia de Brasília
--     ((now() at time zone 'America/Sao_Paulo')::date), nunca o dia em UTC.
--     A limpeza tem tarefa própria: um erro nela não desfaz a geração das
--     contas do dia. cron.schedule com nome substitui a tarefa de mesmo nome.
--     O agendador roda dentro do banco, como dono: não usa chave nem segredo.
select cron.schedule('iris-ocorrencias', '5 3 * * *', $$select public.job_generate_occurrences();$$);
select cron.schedule('iris-limpeza', '15 3 * * *', $$select public.job_cleanup();$$);
select cron.schedule('iris-manha', '0 12 * * *', $$select public.job_enqueue_morning();$$);
select cron.schedule('iris-noite', '0 0 * * *', $$select public.job_enqueue_evening();$$);
select cron.schedule('iris-entrega', '*/10 * * * *', $$select public.job_dispatch();$$);
