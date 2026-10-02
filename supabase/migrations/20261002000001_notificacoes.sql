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
