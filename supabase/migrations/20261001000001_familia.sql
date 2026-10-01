-- Plano 7: família (RF-41–45, RN-17–26, RN-31, A3 A, A4 B, A6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regra de ouro: a família só enxerga o que é "da família". As tabelas
-- pessoais (transactions, categories, cards, goal_movements, budgets,
-- recurrences, installment_plans e as metas individuais) continuam com RLS
-- "só o dono": nenhuma política delas é afrouxada. O que é da família chega
-- aos outros membros por funções SECURITY DEFINER de escopo mínimo, que
-- descobrem a família só por auth.uid() (my_family_id), conferem o papel e
-- devolvem colunas escolhidas uma a uma (nunca cartão, forma de pagamento,
-- parcela, entrada ou saldo). Dentro delas a RLS não vale: cada leitura e
-- gravação filtra a família explicitamente.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- Seção 1 — família, participantes, convites e administração
-- ============================================================================

-- 1. Família. Nunca é apagada: sem ninguém, fica encerrada (o histórico de
--    Ex-membro fica nela, RN-24).
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(regexp_replace(name, '\s+', ' ', 'g'))),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 2. Participações. Ativa = left_at vazio. A linha fica depois da saída para
--    a família continuar vendo o nome no histórico (RN-23); na exclusão do
--    cadastro perde a pessoa e o nome (RN-24).
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('admin', 'member')),
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint family_members_active_has_user check (left_at is not null or user_id is not null)
);

-- RN-26: no máximo uma família ativa por pessoa.
create unique index family_members_one_family_uidx on public.family_members (user_id) where left_at is null;
-- No máximo um administrador ativo por família (o "exatamente um" é conferido
-- no fim da transação pelo gatilho family_one_admin, abaixo).
create unique index family_members_one_admin_uidx on public.family_members (family_id) where role = 'admin' and left_at is null;
create index family_members_family_idx on public.family_members (family_id);

-- Enquanto a família tem alguém, tem exatamente um administrador ativo
-- (Review Focus 5). Adiado para o fim da transação: passar a administração
-- rebaixa antes de promover, e a exclusão do cadastro promove depois de
-- marcar a saída. Família sem ninguém (encerrada) não tem administrador.
-- SECURITY DEFINER: conta participações da família inteira, e quem dispara
-- pode ser o serviço de autenticação (cascata de auth.users).
create function public.family_one_admin_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_families uuid[];
  v_family uuid;
begin
  -- A família da linha antes e depois (uma troca de família confere as duas).
  if tg_op = 'INSERT' then
    v_families := array[new.family_id];
  elsif tg_op = 'DELETE' then
    v_families := array[old.family_id];
  else
    v_families := array[old.family_id, new.family_id];
  end if;
  foreach v_family in array v_families loop
    if exists (select 1 from public.family_members fm where fm.family_id = v_family and fm.left_at is null)
       and (select count(*) from public.family_members fm
            where fm.family_id = v_family and fm.left_at is null and fm.role = 'admin') <> 1 then
      raise exception 'Família sem administrador.';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger family_one_admin after insert or update or delete on public.family_members
  deferrable initially deferred
  for each row execute function public.family_one_admin_check();

-- 3. Convites por link (RF-42). O código nunca é guardado: só o resumo
--    SHA-256. 7 dias, uma pessoa. E-mail do convidado: Plano 8.
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint family_invites_expiry check (expires_at > created_at and expires_at <= created_at + interval '7 days'),
  constraint family_invites_one_outcome check (accepted_at is null or revoked_at is null)
);

create index family_invites_family_idx on public.family_invites (family_id);

-- 4. Avisos para a família (RN-22d, RN-22e). Push e e-mail: Plano 8.
create table public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete no action,
  kind text not null check (kind in ('member_left', 'member_deleted')),
  member_name text check (member_name is null or char_length(member_name) between 1 and 60),
  goal_name text check (goal_name is null or char_length(goal_name) between 1 and 40),
  amount_cents bigint check (amount_cents is null or (amount_cents > 0 and amount_cents <= 9999999999)),
  created_at timestamptz not null default now()
);

create index family_events_family_idx on public.family_events (family_id, created_at desc);

-- 5. Quem sou eu na família. SECURITY DEFINER de propósito e com escopo
--    mínimo: uma política de family_members que consultasse family_members
--    entraria em recursão infinita. Sem parâmetro; só devolvem fatos sobre
--    quem chama (auth.uid()), nunca linhas de outra pessoa.
create function public.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select fm.family_id from public.family_members fm
  where fm.user_id = (select auth.uid()) and fm.left_at is null
$$;

create function public.my_family_role() returns text
language sql stable security definer set search_path = '' as $$
  select fm.role from public.family_members fm
  where fm.user_id = (select auth.uid()) and fm.left_at is null
$$;

-- 6. Só leitura pela API. Toda gravação passa pelas funções abaixo.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.family_events enable row level security;

-- revoke all (inclui MAINTAIN do Postgres 17) e devolve só a leitura.
revoke all on public.families, public.family_members, public.family_invites, public.family_events from anon, authenticated;
grant select on public.families, public.family_members, public.family_events to authenticated;
-- O resumo do código nunca sai do banco.
grant select (id, family_id, created_at, expires_at, accepted_at, revoked_at) on public.family_invites to authenticated;

-- Ex-membro perde tudo na hora: my_family_id() só vê participação ativa.
create policy families_select on public.families
  for select to authenticated using (id = (select public.my_family_id()));
create policy family_members_select on public.family_members
  for select to authenticated using (family_id = (select public.my_family_id()));
create policy family_invites_select on public.family_invites
  for select to authenticated
  using (family_id = (select public.my_family_id()) and (select public.my_family_role()) = 'admin');
create policy family_events_select on public.family_events
  for select to authenticated using (family_id = (select public.my_family_id()));

-- 7. O nome que a família vê acompanha o perfil enquanto a pessoa participa.
--    SECURITY DEFINER: family_members não tem política de gravação.
create function public.sync_family_display_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.family_members fm set display_name = new.display_name
      where fm.user_id = new.id and fm.left_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_family_name after update of display_name on public.profiles
  for each row execute function public.sync_family_display_name();

-- 8. Criar a família (RF-41): quem cria vira administrador.
--    SECURITY DEFINER: grava em families e family_members, que não aceitam
--    gravação direta (senão qualquer um se colocaria como administrador de
--    qualquer família).
create function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_display text;
  v_family uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if public.my_family_id() is not null then
    raise exception 'Você já participa de uma família.';
  end if;
  select p.display_name into v_display from public.profiles p where p.id = v_uid;
  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family;
  -- Duas chamadas ao mesmo tempo: o índice único de uma família por pessoa
  -- barra a segunda, com a mesma mensagem calma (a família criada é desfeita).
  begin
    insert into public.family_members (family_id, user_id, role, display_name)
      values (v_family, v_uid, 'admin', v_display);
  exception when unique_violation then
    raise exception 'Você já participa de uma família.';
  end;
  return v_family;
end;
$$;

-- 9. Convidar (RF-42): só o administrador. 24 bytes aleatórios em base64url
--    (32 caracteres, 192 bits): impossível de adivinhar. O banco guarda só o
--    SHA-256. Um link por vez: o anterior ainda não usado é cancelado.
--    SECURITY DEFINER: family_invites não aceita gravação direta.
create function public.create_family_invite()
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  -- Mesma ordem de travas do aceitar (família, depois convite): sem impasse.
  perform 1 from public.families f where f.id = v_family for update;
  -- O papel é conferido de novo depois da trava: uma transferência ao mesmo
  -- tempo pode ter acabado de tirar a administração de quem chama.
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if (select count(*) from public.family_members fm where fm.family_id = v_family and fm.left_at is null) >= 10 then
    raise exception 'A família já está completa.';
  end if;
  update public.family_invites i set revoked_at = now()
    where i.family_id = v_family and i.accepted_at is null and i.revoked_at is null;
  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.family_invites (family_id, token_hash, created_by, expires_at)
    values (v_family, extensions.digest(v_code, 'sha256'), v_uid, v_expires);
  return query select v_code, v_expires;
end;
$$;

-- 10. Cancelar um convite pendente: só o administrador da própria família.
create function public.revoke_family_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for update;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  update public.family_invites i set revoked_at = now()
    where i.id = p_id and i.family_id = v_family and i.accepted_at is null and i.revoked_at is null;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;
end;
$$;

-- 11. Prévia do convite: só o nome da família e de quem convidou, só para
--     quem entrou, só com convite válido. Convite que não vale: nada.
create function public.invite_preview(p_code text)
returns table (family_name text, invited_by text)
language sql stable security definer set search_path = '' as $$
  select f.name, fm.display_name
  from public.family_invites i
  join public.families f on f.id = i.family_id and f.ended_at is null
  left join public.family_members fm
    on fm.family_id = i.family_id and fm.user_id = i.created_by and fm.left_at is null
  where (select auth.uid()) is not null
    and p_code ~ '^[A-Za-z0-9_-]{32}$'
    and i.token_hash = extensions.digest(p_code, 'sha256')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- 12. Aceitar (RF-42): sempre como membro (não há parâmetro de papel). Uma
--     mensagem só para todo convite que não vale (não revela se existiu).
--     Quem já participa de uma família não entra, e o convite não se gasta.
create function public.accept_family_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_invite uuid;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{32}$' then
    raise exception 'Convite inválido.';
  end if;
  select i.family_id into v_family from public.family_invites i
    where i.token_hash = extensions.digest(p_code, 'sha256');
  if v_family is null then
    raise exception 'Convite inválido.';
  end if;
  perform 1 from public.families f where f.id = v_family and f.ended_at is null for update;
  if not found then
    raise exception 'Convite inválido.';
  end if;
  select i.id into v_invite from public.family_invites i
    where i.token_hash = extensions.digest(p_code, 'sha256')
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    for update;
  if v_invite is null then
    raise exception 'Convite inválido.';
  end if;
  if public.my_family_id() is not null then
    raise exception 'Você já participa de uma família.';
  end if;
  if (select count(*) from public.family_members fm where fm.family_id = v_family and fm.left_at is null) >= 10 then
    raise exception 'A família já está completa.';
  end if;
  select p.display_name into v_display from public.profiles p where p.id = v_uid;
  -- Aceitar convites de duas famílias ao mesmo tempo: o índice único barra o
  -- segundo, com a mesma mensagem calma (e esse convite não se gasta).
  begin
    insert into public.family_members (family_id, user_id, role, display_name)
      values (v_family, v_uid, 'member', v_display);
  exception when unique_violation then
    raise exception 'Você já participa de uma família.';
  end;
  update public.family_invites i set accepted_by = v_uid, accepted_at = now() where i.id = v_invite;
  return v_family;
end;
$$;

-- 13. Passar a administração (RN-25): quem administra vira membro, a outra
--     pessoa vira administradora. Rebaixa antes de promover (índice único;
--     o "exatamente um" é conferido no fim, pelo gatilho family_one_admin).
--     O papel é conferido de novo depois da trava da família: duas
--     transferências (ou transferir e remover) ao mesmo tempo nunca deixam a
--     família sem administrador. O convite pendente do administrador anterior
--     é cancelado: quem administra agora decide quem entra.
create function public.transfer_family_admin(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for update;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_uid or not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family and fm.user_id = p_user and fm.left_at is null
  ) then
    raise exception 'Pessoa não encontrada.';
  end if;
  update public.family_members fm set role = 'member'
    where fm.family_id = v_family and fm.user_id = v_uid and fm.left_at is null;
  update public.family_members fm set role = 'admin'
    where fm.family_id = v_family and fm.user_id = p_user and fm.left_at is null;
  update public.family_invites i set revoked_at = now()
    where i.family_id = v_family and i.accepted_at is null and i.revoked_at is null;
end;
$$;

revoke execute on function public.sync_family_display_name(), public.family_one_admin_check()
from public, anon, authenticated;

revoke execute on function
  public.my_family_id(),
  public.my_family_role(),
  public.create_family(text),
  public.create_family_invite(),
  public.revoke_family_invite(uuid),
  public.invite_preview(text),
  public.accept_family_invite(text),
  public.transfer_family_admin(uuid)
from public, anon;

grant execute on function
  public.my_family_id(),
  public.my_family_role(),
  public.create_family(text),
  public.create_family_invite(),
  public.revoke_family_invite(uuid),
  public.invite_preview(text),
  public.accept_family_invite(text),
  public.transfer_family_admin(uuid)
to authenticated;

-- ============================================================================
-- Seção 2 — gastos da família e contas da família
-- ============================================================================

-- 14. Gasto da família (RN-18, RN-19): continua de quem registrou (sai do
--     Disponível dele) e ganha a família. Sem dono, só o histórico de quem
--     excluiu o cadastro (RN-24): sempre confirmado e da família, com a
--     categoria guardada em ex_category_* (a dele é apagada junto).
alter table public.transactions
  alter column user_id drop not null,
  add column family_id uuid references public.families (id) on delete no action,
  add column ex_category_key text check (ex_category_key is null or char_length(ex_category_key) <= 40),
  add column ex_category_name text check (ex_category_name is null or char_length(ex_category_name) between 1 and 40),
  add constraint family_only_expense check (family_id is null or kind = 'expense'),
  add constraint ownerless_only_family_history check (user_id is not null or (family_id is not null and status = 'confirmed'));

create index transactions_family_idx on public.transactions (family_id, occurred_on) where family_id is not null;

-- 15. Conta da família (RN-20): o molde é de quem criou.
alter table public.recurrences
  add column family_id uuid references public.families (id) on delete no action,
  add constraint recurrence_family_only_expense check (family_id is null or kind = 'expense');

create index recurrences_family_idx on public.recurrences (family_id) where family_id is not null;

-- 16. Guarda da família nos registros (vale também para gravação direta).
--     SECURITY DEFINER: consulta a participação e os moldes sem depender da
--     RLS de quem grava. Não devolve nada; só recusa. Registro sem família:
--     nada muda (o comportamento pessoal dos planos anteriores fica igual).
--     a) Entrar na família, ou trocar de dono dentro dela: o dono precisa
--        participar dela agora. Tirar da família ou ficar sem dono (RN-24):
--        livre. Ex-membro continua editando os próprios gastos antigos
--        (decisão 97), mas uma conta a pagar da família só existe e só muda
--        enquanto o dono participa: quem saiu não transforma um gasto antigo
--        em conta para a família pagar.
--     b) Conta a pagar da família só como ocorrência de um molde da mesma
--        família: ninguém cria, por gravação direta, uma conta com valor
--        qualquer para outro membro pagar. A FK composta (recurrence_id,
--        user_id) do Plano 3 continua valendo: uma ocorrência só nasce de um
--        molde da própria pessoa (quem paga a conta de outro membro ganha um
--        registro novo, sem molde — item 21).
create function public.transactions_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is null then
    return new;
  end if;
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.family_id is distinct from old.family_id
          or new.user_id is distinct from old.user_id or new.status = 'pending')
     and not exists (
       select 1 from public.family_members fm
       where fm.family_id = new.family_id and fm.user_id = new.user_id and fm.left_at is null
     ) then
    raise exception 'Família não encontrada.';
  end if;
  if new.status = 'pending'
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.family_id is distinct from old.family_id or new.recurrence_id is distinct from old.recurrence_id)
     and not exists (
       select 1 from public.recurrences rc
       where rc.id = new.recurrence_id and rc.family_id = new.family_id
     ) then
    raise exception 'Família não encontrada.';
  end if;
  return new;
end;
$$;

create trigger transactions_family_guard before insert or update on public.transactions
  for each row execute function public.transactions_family_guard();

-- Molde da família: só de quem participa dela. Um molde ativo (ended_on
-- vazio) da família exige participação a cada gravação: quem saiu não
-- reabre uma conta encerrada na saída.
create function public.recurrences_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is not null
     and (tg_op = 'INSERT' or new.family_id is distinct from old.family_id or new.ended_on is null)
     and not exists (
       select 1 from public.family_members fm
       where fm.family_id = new.family_id and fm.user_id = new.user_id and fm.left_at is null
     ) then
    raise exception 'Família não encontrada.';
  end if;
  return new;
end;
$$;

create trigger recurrences_family_guard before insert or update on public.recurrences
  for each row execute function public.recurrences_family_guard();

-- 17. As contas pessoais continuam sendo geradas por quem as criou; as da
--     família passam para generate_family_occurrences (item 18). Corpo igual
--     ao da migração 20260928000001, mais "rc.family_id is null".
create or replace function public.generate_occurrences() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.user_id = v_uid
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
          v_uid, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method, r.card_id,
          v_due, 'pending', v_due, r.id, v_period
        )
        on conflict (recurrence_id, recurrence_period) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_period := (v_period + interval '1 month')::date;
    end loop;
    update public.recurrences set generated_through = v_current where id = r.id and user_id = v_uid;
  end loop;

  return v_count;
end;
$$;

-- 18. Contas da família aparecem quando qualquer membro abre o app (não só
--     quem criou). SECURITY DEFINER: grava ocorrências em nome de quem criou o
--     molde (a conta é dele até alguém pagar). Só moldes da família de quem
--     chama e só de quem ainda participa dela (um molde que sobrou de quem
--     saiu é pulado e nunca derruba a geração dos outros); mesma regra de
--     datas de generate_occurrences.
create function public.generate_family_occurrences() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_oldest date := (v_current - interval '2 months')::date;
  r record;
  v_period date;
  v_due date;
  v_rows integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    return 0;
  end if;

  for r in
    select rc.* from public.recurrences rc
    where rc.family_id = v_family
      and rc.ended_on is null
      and (rc.generated_through is null or rc.generated_through < v_current)
      and rc.starts_on < (v_current + interval '1 month')::date
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = rc.user_id and fm.left_at is null
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
    update public.recurrences rc set generated_through = v_current where rc.id = r.id and rc.family_id = v_family;
  end loop;

  return v_count;
end;
$$;

-- 19. Gastos da família para a família (RF-43). SECURITY DEFINER: lê
--     registros de outros membros, que a RLS de transactions não mostra (e
--     não deve mostrar: lá estão cartão, forma de pagamento e parcela).
--     Devolve só estas colunas, só da família de quem chama, só gastos
--     confirmados; categoria pela chave padrão ou pelo nome (A3); o nome de
--     quem registrou vem da participação (guardado ao sair, RN-23; nulo depois
--     da exclusão do cadastro, RN-24). No máximo 367 dias por chamada.
create function public.family_expenses(p_from date, p_to date)
returns table (id uuid, effective_on date, amount_cents bigint, category_key text, category_name text,
               note text, author_id uuid, author_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_family uuid := public.my_family_id();
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366
     or p_from < date '2000-01-01' or p_to > date '2099-12-31' then
    raise exception 'Período inválido.';
  end if;
  if v_family is null then
    return;
  end if;
  return query
    select t.id, coalesce(t.paid_on, t.occurred_on), t.amount_cents,
           coalesce(c.default_key, t.ex_category_key), coalesce(c.name, t.ex_category_name, 'Outros'),
           t.note, t.user_id,
           (select fm.display_name from public.family_members fm
              where fm.family_id = t.family_id and fm.user_id = t.user_id
              order by fm.joined_at desc limit 1),
           t.created_at
    from public.transactions t
    left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
    where t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and coalesce(t.paid_on, t.occurred_on) between p_from and p_to
    order by coalesce(t.paid_on, t.occurred_on) desc, t.created_at desc, t.id;
end;
$$;

-- Um gasto da família (tela de edição do administrador). Mesmas colunas.
create function public.family_expense(p_id uuid)
returns table (id uuid, effective_on date, amount_cents bigint, category_key text, category_name text,
               note text, author_id uuid, author_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, coalesce(t.paid_on, t.occurred_on), t.amount_cents,
         coalesce(c.default_key, t.ex_category_key), coalesce(c.name, t.ex_category_name, 'Outros'),
         t.note, t.user_id,
         (select fm.display_name from public.family_members fm
            where fm.family_id = t.family_id and fm.user_id = t.user_id
            order by fm.joined_at desc limit 1),
         t.created_at
  from public.transactions t
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.id = p_id and t.family_id = public.my_family_id()
    and t.kind = 'expense' and t.status = 'confirmed'
$$;

-- 20. Contas da família a pagar (RN-20) e os moldes ativos. Mesmo motivo do
--     item 19; nada de cartão nem forma de pagamento. Só ocorrências de
--     moldes da família, de quem ainda participa dela.
create function public.family_bills()
returns table (id uuid, name text, amount_cents bigint, due_on date, author_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, r.name, t.amount_cents, t.due_on, t.user_id
  from public.transactions t
  join public.recurrences r on r.id = t.recurrence_id and r.family_id = t.family_id
  join public.family_members fm on fm.family_id = t.family_id and fm.user_id = t.user_id and fm.left_at is null
  where t.family_id = public.my_family_id() and t.kind = 'expense' and t.status = 'pending'
  order by t.due_on, t.created_at, t.id
$$;

create function public.family_recurrences()
returns table (id uuid, name text, amount_cents bigint, frequency text, due_day smallint, due_month smallint, author_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, r.amount_cents, r.frequency, r.due_day, r.due_month, r.user_id
  from public.recurrences r
  join public.family_members fm on fm.family_id = r.family_id and fm.user_id = r.user_id and fm.left_at is null
  where r.family_id = public.my_family_id() and r.ended_on is null
  order by r.due_day, r.name, r.id
$$;

-- 21. Marcar a conta da família como paga (RN-20): qualquer membro. O valor
--     sai do Disponível de quem pagou (A1: no dia de hoje).
--     - Quem criou a conta paga: o registro dele vira pago, como em Contas.
--     - Outro membro paga: a ocorrência de quem criou sai e nasce um registro
--       de quem pagou, confirmado, na categoria dele de mesma chave padrão (ou
--       de mesmo nome; senão Outros), sem cartão e sem forma de pagamento (quem
--       paga não disse como), com o nome da conta na nota, sem molde. A conta
--       não volta a ser gerada (decisão 30: a geração só olha meses depois de
--       generated_through).
--     Só ocorrência de molde da família, de quem ainda participa dela.
--     SECURITY DEFINER: a ocorrência é de outra pessoa. A trava compartilhada
--     da família espera uma saída ou remoção em andamento, e a participação de
--     quem paga é conferida de novo depois dela. Dois pagamentos ao mesmo
--     tempo: o segundo espera a trava da conta e não a encontra mais.
create function public.pay_family_bill(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tx record;
  v_key text;
  v_name text;
  v_mine uuid;
  v_new uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Conta não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    raise exception 'Conta não encontrada.';
  end if;
  select t.user_id, t.category_id, t.amount_cents, t.due_on, t.note, r.name as bill_name into v_tx
    from public.transactions t
    join public.recurrences r on r.id = t.recurrence_id and r.family_id = t.family_id
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'pending'
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = t.user_id and fm.left_at is null)
    for update of t;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if v_tx.user_id = v_uid then
    update public.transactions t set status = 'confirmed', paid_on = v_today where t.id = p_id;
    return p_id;
  end if;

  select c.default_key, c.name into v_key, v_name
    from public.categories c where c.id = v_tx.category_id and c.user_id = v_tx.user_id;
  select c.id into v_mine from public.categories c
    where c.user_id = v_uid
      and ((v_key is not null and c.default_key = v_key) or (v_key is null and lower(c.name) = lower(v_name)));
  if v_mine is null then
    select c.id into v_mine from public.categories c where c.user_id = v_uid and c.default_key = 'outros';
  end if;

  delete from public.transactions t where t.id = p_id;
  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, occurred_on, status, due_on, paid_on, family_id
  ) values (
    v_uid, 'expense', v_tx.amount_cents, v_mine, coalesce(v_tx.note, v_tx.bill_name), v_tx.due_on,
    'confirmed', v_tx.due_on, v_today, v_family
  ) returning id into v_new;
  return v_new;
end;
$$;

-- 22. Administrador edita valor, data e nota de um gasto da família (RN-21,
--     RF-44); a categoria continua a de quem registrou. Parcelas e gastos
--     pagos com meta ficam de fora. Data como no Extrato (decisão 4): até 1 ano
--     à frente; conta paga: o dia do pagamento, até hoje.
--     Só gasto de quem ainda participa da família ou histórico sem dono
--     (RN-24): o registro de quem saiu é só dele (decisão 97), e a família não
--     mexe mais no Disponível dessa pessoa.
--     SECURITY DEFINER: o registro pode ser de outra pessoa (ou de Ex-membro
--     sem cadastro). O papel é conferido de novo depois da trava da família
--     (uma transferência ao mesmo tempo pode ter acabado de tirá-lo).
create function public.admin_update_family_expense(p_id uuid, p_amount_cents bigint, p_on date, p_note text)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_paid date;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if v_note is not null and char_length(v_note) > 140 then
    raise exception 'Nota inválida.';
  end if;
  select t.paid_on into v_paid from public.transactions t
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and t.installment_plan_id is null and t.goal_id is null
      and (t.user_id is null or exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = t.user_id and fm.left_at is null))
    for update of t;
  if not found then
    raise exception 'Gasto não encontrado.';
  end if;
  if p_on is null or p_on < date '2000-01-01' or p_on > v_today + 365 or (v_paid is not null and p_on > v_today) then
    raise exception 'Data inválida.';
  end if;
  update public.transactions t set
    amount_cents = p_amount_cents,
    note = v_note,
    occurred_on = case when v_paid is null then p_on else t.occurred_on end,
    paid_on = case when v_paid is null then null else p_on end
  where t.id = p_id;
  return p_on;
end;
$$;

create function public.admin_delete_family_expense(p_id uuid) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_on date;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  delete from public.transactions t
    where t.id = p_id and t.family_id = v_family and t.kind = 'expense' and t.status = 'confirmed'
      and t.installment_plan_id is null and t.goal_id is null
      and (t.user_id is null or exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = t.user_id and fm.left_at is null))
    returning coalesce(t.paid_on, t.occurred_on) into v_on;
  if v_on is null then
    raise exception 'Gasto não encontrado.';
  end if;
  return v_on;
end;
$$;

-- 23. Alterar e encerrar a conta da família: quem criou e o administrador
--     (etapa-3 §4). Mesmas regras de update_recurrence/end_recurrence
--     (decisões 36 e 37), sem trocar a categoria (é de quem criou). Só moldes
--     de quem ainda participa da família. Trava compartilhada da família e
--     participação conferida de novo depois dela, como no item 22.
create function public.update_family_recurrence(p_id uuid, p_name text, p_amount_cents bigint, p_due_day integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Conta não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    raise exception 'Conta não encontrada.';
  end if;
  select r.user_id into v_owner from public.recurrences r
    where r.id = p_id and r.family_id = v_family and r.ended_on is null
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = r.user_id and fm.left_at is null)
    for update of r;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_owner <> v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_due_day is null or p_due_day not between 1 and 31 then
    raise exception 'Dia inválido.';
  end if;
  update public.recurrences r set name = v_name, amount_cents = p_amount_cents, due_day = p_due_day
    where r.id = p_id;
  update public.transactions t set
    amount_cents = p_amount_cents,
    due_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.due_on end,
    occurred_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.occurred_on end
  where t.recurrence_id = p_id and t.family_id = v_family and t.status = 'pending' and t.due_on >= v_today;
end;
$$;

create function public.end_family_recurrence(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Conta não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    raise exception 'Conta não encontrada.';
  end if;
  select r.user_id into v_owner from public.recurrences r
    where r.id = p_id and r.family_id = v_family and r.ended_on is null
      and exists (
        select 1 from public.family_members fm
        where fm.family_id = v_family and fm.user_id = r.user_id and fm.left_at is null)
    for update of r;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_owner <> v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  update public.recurrences r set ended_on = v_today where r.id = p_id;
  delete from public.transactions t
    where t.recurrence_id = p_id and t.family_id = v_family and t.status = 'pending' and t.due_on > v_today;
end;
$$;

-- 24. Anotar com "Gasto da família": conta que se repete e parcelado ganham
--     p_family (decisão 50 deixou o parcelado da família para este plano).
--     Corpos iguais aos da migração 20260928000001, mais a família. Entrada
--     nunca é da família (RN-19).
drop function public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid);

create function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text, p_card_id uuid default null,
  p_family boolean default false
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
  v_payment text := case when p_card_id is null then p_payment_method end;
  v_family uuid := case when coalesce(p_family, false) then public.my_family_id() end;
  v_name text;
  v_rec uuid;
  v_tx uuid;
  v_done boolean := p_occurred_on <= v_today;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if coalesce(p_family, false) and (v_family is null or p_kind is distinct from 'expense') then
    raise exception 'Família não encontrada.';
  end if;

  if p_kind = 'expense' then
    select c.name into v_name from public.categories c where c.id = p_category_id and c.user_id = v_uid;
    if v_name is null then
      raise exception 'Categoria não encontrada.';
    end if;
    v_name := coalesce(v_note, v_name);
  else
    if p_card_id is not null then
      raise exception 'Cartão não encontrado.';
    end if;
    v_name := coalesce(nullif(btrim(p_source), ''), 'Entrada');
  end if;

  insert into public.recurrences (
    user_id, kind, name, amount_cents, category_id, source, payment_method, card_id,
    frequency, due_day, due_month, starts_on, generated_through, note, family_id
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, v_payment, p_card_id,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period, nullif(left(v_note, 140), ''), v_family
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period, family_id
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, v_payment, p_card_id,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period, v_family
  ) returning id into v_tx;

  return v_tx;
end;
$$;

drop function public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date);

create function public.create_installment_purchase(
  p_amount_cents bigint, p_count integer, p_category_id uuid, p_note text,
  p_card_id uuid, p_payment_method text, p_purchased_on date, p_family boolean default false
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_family uuid := case when coalesce(p_family, false) then public.my_family_id() end;
  v_plan uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if coalesce(p_family, false) and v_family is null then
    raise exception 'Família não encontrada.';
  end if;
  if p_count is null or p_count < 2 or p_count > 48 or p_amount_cents is null or p_amount_cents < p_count then
    raise exception 'Parcelas inválidas.';
  end if;
  if p_purchased_on is null or p_purchased_on > v_today or p_purchased_on < date '2000-01-01' then
    raise exception 'Data inválida.';
  end if;
  if not exists (select 1 from public.categories c where c.id = p_category_id and c.user_id = v_uid) then
    raise exception 'Categoria não encontrada.';
  end if;
  if p_card_id is not null and not exists (select 1 from public.cards k where k.id = p_card_id and k.user_id = v_uid) then
    raise exception 'Cartão não encontrado.';
  end if;

  insert into public.installment_plans (user_id, total_cents, installment_count, purchased_on)
    values (v_uid, p_amount_cents, p_count, p_purchased_on)
    returning id into v_plan;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, payment_method, card_id,
    occurred_on, installment_plan_id, installment_number, installment_count, family_id
  )
  select
    v_uid, 'expense', s.cents, p_category_id, nullif(btrim(p_note), ''),
    case when p_card_id is null then p_payment_method end, p_card_id,
    s.on_date, v_plan, s.installment_no, p_count, v_family
  from public.installment_schedule(p_amount_cents, p_count, p_purchased_on) s;

  return v_plan;
end;
$$;

-- Quitar leva a família da compra, se quem quita ainda participa dela
-- (ex-membro quita como gasto pessoal). Corpo igual ao da migração
-- 20260928000001, mais family_id.
create or replace function public.settle_installments(p_plan_id uuid, p_amount_cents bigint) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_first record;
  v_count integer;
  v_tx uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.installment_plans p
    where p.id = p_plan_id and p.user_id = v_uid and p.status = 'active'
    for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;

  select t.category_id, t.note, t.payment_method, t.card_id, t.card_deleted, t.family_id into v_first
    from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid and t.installment_number is not null
    order by t.installment_number
    limit 1;

  delete from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid
      and t.installment_number is not null and t.occurred_on > v_today;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma parcela futura.';
  end if;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, note, payment_method, card_id, card_deleted,
    occurred_on, installment_plan_id, family_id
  ) values (
    v_uid, 'expense', p_amount_cents, v_first.category_id, v_first.note, v_first.payment_method,
    v_first.card_id, v_first.card_deleted, v_today, p_plan_id,
    case when v_first.family_id = public.my_family_id() then v_first.family_id end
  ) returning id into v_tx;

  update public.installment_plans p set status = 'settled', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;

  return v_tx;
end;
$$;

revoke execute on function public.transactions_family_guard(), public.recurrences_family_guard()
from public, anon, authenticated;

revoke execute on function
  public.generate_family_occurrences(),
  public.family_expenses(date, date),
  public.family_expense(uuid),
  public.family_bills(),
  public.family_recurrences(),
  public.pay_family_bill(uuid),
  public.admin_update_family_expense(uuid, bigint, date, text),
  public.admin_delete_family_expense(uuid),
  public.update_family_recurrence(uuid, text, bigint, integer),
  public.end_family_recurrence(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid, boolean),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date, boolean)
from public, anon;

grant execute on function
  public.generate_family_occurrences(),
  public.family_expenses(date, date),
  public.family_expense(uuid),
  public.family_bills(),
  public.family_recurrences(),
  public.pay_family_bill(uuid),
  public.admin_update_family_expense(uuid, bigint, date, text),
  public.admin_delete_family_expense(uuid),
  public.update_family_recurrence(uuid, text, bigint, integer),
  public.end_family_recurrence(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid, boolean),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date, boolean)
to authenticated;

-- ============================================================================
-- Seção 3 — metas da família (RF-25, RN-22 a RN-22c, A4 B, A6 A)
-- ============================================================================
--
-- Regra de ouro das metas da família: só quem participa agora tem parte
-- nelas. Quem sai recebe a parte de volta na saída (seção 4), e nenhuma
-- função abaixo devolve dinheiro, grava ou apaga algo de quem já não
-- participa (C1 da revisão de segurança). Travas: sempre a família primeiro
-- (compartilhada), depois a meta; só delete_family_goal_use trava também o
-- gasto, entre a família e a meta (nenhuma outra função trava um gasto que já
-- existe e depois a meta, então não há impasse). A saída (seção 4) trava a
-- família de forma exclusiva: espera quem está no meio de uma destas funções,
-- e cada função confere de novo a família e o papel depois da trava.

-- 25. Meta da família: sem dono (user_id nulo) e com família. Cada parte é
--     dos movimentos de quem guardou (goal_movements.user_id). As políticas
--     do Plano 5 (user_id = auth.uid()) nunca alcançam meta da família, então
--     ninguém a cria, altera ou exclui direto: só pelas funções abaixo.
alter table public.goals
  alter column user_id drop not null,
  add column family_id uuid references public.families (id) on delete no action,
  add column created_by uuid references auth.users (id) on delete set null,
  add constraint goal_owner_or_family check ((user_id is null) <> (family_id is null)),
  -- "Quem criou" só existe na meta da família (a pessoal é da dona): ninguém
  -- grava o id de outra pessoa na própria meta.
  add constraint goal_created_by_only_family check (created_by is null or family_id is not null);

create index goals_family_idx on public.goals (family_id) where family_id is not null;

create policy goals_family_select on public.goals
  for select to authenticated
  using (family_id is not null and family_id = (select public.my_family_id()));

-- A guarda só olha as colunas que ela confere: apagar quem criou (created_by,
-- na exclusão do cadastro) não pode esbarrar em "Meta excluída.".
drop trigger goals_guard on public.goals;
create trigger goals_guard
  before insert or update of user_id, family_id, name, target_cents, deadline, status, used_on, deleted_on
  on public.goals
  for each row execute function public.goals_guard();

-- 26. Movimentos: a FK composta (goal_id, user_id) do Plano 5 impediria o
--     movimento de um membro numa meta sem dono; vira FK simples, e o que ela
--     garantia (só na própria meta) passa para a política de inserção e para
--     goal_movements_guard (item 29). O uso da meta da família tem um
--     movimento por membro na mesma compra: o índice único vira
--     (transaction_id, user_id). user_id nulo só no "use" de quem excluiu o
--     cadastro (RN-22e, seção 4).
alter table public.goal_movements
  alter column user_id drop not null,
  add constraint goal_movement_ownerless_only_use check (user_id is not null or kind = 'use'),
  drop constraint goal_movements_goal_fk,
  add constraint goal_movements_goal_fk foreign key (goal_id)
    references public.goals (id) on delete no action,
  drop constraint goal_movements_transaction_fk,
  add constraint goal_movements_transaction_fk foreign key (transaction_id)
    references public.transactions (id) on delete no action;

drop index public.goal_movements_transaction_uidx;
create unique index goal_movements_transaction_user_uidx
  on public.goal_movements (transaction_id, user_id) where transaction_id is not null;

drop policy goal_movements_insert on public.goal_movements;
create policy goal_movements_insert on public.goal_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

drop policy goal_movements_delete_use on public.goal_movements;
create policy goal_movements_delete_use on public.goal_movements
  for delete to authenticated
  using (
    user_id = (select auth.uid()) and kind = 'use'
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

-- 27. O gasto do uso da meta da família é de quem usou (administrador) e a
--     meta não tem dono: a FK composta (goal_id, user_id) vira FK simples; o
--     vínculo continua conferido por transactions_goal_link_guard (item 30).
alter table public.transactions
  drop constraint transactions_goal_fk,
  add constraint transactions_goal_fk foreign key (goal_id)
    references public.goals (id) on delete no action;

-- 28. Guarda da meta (Plano 5), agora com a família: dono e família nunca
--     mudam; excluir meta da família só pelo administrador (A6 A) e só com
--     todas as partes zeradas; "usada" confere o uso de qualquer membro.
--     Meta pessoal: exatamente as regras do Plano 5.
create or replace function public.goals_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
  v_has_use boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.used_on is not null or new.deleted_on is not null then
      raise exception 'Meta inválida.';
    end if;
    return new;
  end if;

  if old.deleted_on is not null then
    raise exception 'Meta excluída.';
  end if;
  if new.user_id is distinct from old.user_id or new.family_id is distinct from old.family_id then
    raise exception 'Meta inválida.';
  end if;

  if new.deleted_on is distinct from old.deleted_on then
    if new.deleted_on <> v_today then
      raise exception 'Meta inválida.';
    end if;
    if new.family_id is not null
       and (public.my_family_id() is distinct from new.family_id or public.my_family_role() is distinct from 'admin') then
      raise exception 'Meta inválida.';
    end if;
    select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)
      into v_balance
      from public.goal_movements m
      where m.goal_id = new.id and m.user_id is not null
        and (new.family_id is not null or m.user_id = new.user_id);
    if v_balance <> 0 then
      raise exception 'Meta ainda tem dinheiro guardado.';
    end if;
  end if;

  if new.status <> old.status then
    select exists (
      select 1 from public.goal_movements m
      where m.goal_id = new.id and m.kind = 'use'
        and (new.family_id is not null or m.user_id = new.user_id)
    ) into v_has_use;
    if new.status = 'used' and not v_has_use then
      raise exception 'Meta inválida.';
    end if;
    if new.status = 'active' and v_has_use then
      raise exception 'Meta inválida.';
    end if;
  end if;

  return new;
end;
$$;

-- 29. Guarda do guardado (Plano 5), agora com a família. SECURITY DEFINER:
--     confere a participação e a compra de outra pessoa (o gasto do uso é do
--     administrador), que a RLS de quem grava não mostra. Não devolve nada.
--     Meta pessoal: só a dona. Meta da família: só quem participa agora; o
--     "use" aponta para a compra da família dessa meta (a soma das partes é
--     conferida no fim, pelo item 30).
--     Dono e participação são conferidos antes da trava (ninguém trava a meta
--     de outra pessoa por uma gravação direta, M5), e a participação de novo
--     depois dela: uma saída que terminou enquanto esperávamos a trava já
--     devolveu a parte de quem saiu, e nada mais entra em nome dessa pessoa.
--
--     Antes dela roda goal_movements_author_guard (os gatilhos BEFORE disparam
--     em ordem de nome: "author" vem antes de "guard"). Esta guarda roda antes
--     da RLS e responde conforme o saldo ("Valor maior que o guardado.",
--     "Valor inválido."); sem a outra, um membro gravaria direto um movimento
--     em nome de outro membro e, pela resposta, descobriria a parte dele
--     (A4 B). Por isso uma gravação direta pela API (papel authenticated ou
--     anon) em nome de outra pessoa é recusada antes de qualquer consulta,
--     sempre com a mesma mensagem, seja qual for o valor. SECURITY INVOKER de
--     propósito: current_user é o papel de quem grava. Dentro das funções
--     SECURITY DEFINER deste arquivo (uso, exclusão e saída, que gravam o
--     movimento de cada membro) current_user é o dono delas, e a gravação
--     passa; as funções pessoais do Plano 5 gravam sempre auth.uid().
create function public.goal_movements_author_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.user_id is distinct from auth.uid() then
    raise exception 'Meta não encontrada.';
  end if;
  return new;
end;
$$;

create trigger goal_movements_author_guard before insert on public.goal_movements
  for each row execute function public.goal_movements_author_guard();

create or replace function public.goal_movements_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_family uuid;
  v_status text;
  v_deleted date;
  v_balance bigint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.user_id is null or new.occurred_on <> v_today then
    raise exception 'Movimento inválido.';
  end if;

  select g.user_id, g.family_id into v_owner, v_family
    from public.goals g where g.id = new.goal_id;
  if not found
     or (v_family is null and v_owner is distinct from new.user_id)
     or (v_family is not null and not exists (
           select 1 from public.family_members fm
           where fm.family_id = v_family and fm.user_id = new.user_id and fm.left_at is null)) then
    raise exception 'Meta não encontrada.';
  end if;

  select g.status, g.deleted_on into v_status, v_deleted
    from public.goals g where g.id = new.goal_id
    for update;
  if v_deleted is not null then
    raise exception 'Meta não encontrada.';
  end if;
  if v_family is not null and not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family and fm.user_id = new.user_id and fm.left_at is null
  ) then
    raise exception 'Meta não encontrada.';
  end if;
  if new.kind = 'deposit' and v_status <> 'active' then
    raise exception 'Meta não encontrada.';
  end if;

  if new.kind = 'use' and not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id and t.goal_id = new.goal_id
      and (
        (v_family is null and t.user_id = new.user_id and t.goal_funded_cents = new.amount_cents)
        or (v_family is not null and t.family_id = v_family)
      )
  ) then
    raise exception 'Movimento inválido.';
  end if;

  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)
    into v_balance
    from public.goal_movements m
    where m.goal_id = new.goal_id and m.user_id = new.user_id;

  if new.kind = 'deposit' then
    if v_balance + new.amount_cents > 9999999999 then
      raise exception 'Valor inválido.';
    end if;
  elsif new.amount_cents > v_balance then
    raise exception 'Valor maior que o guardado.';
  end if;
  return new;
end;
$$;

-- 30. Vínculo gasto-uso (Plano 5), agora com a família: a soma dos "use" da
--     compra é exatamente a parte paga com a meta, todos da mesma meta; na
--     meta pessoal, todos da dona; na da família, a compra é da família da
--     meta. Registro sem dono (Ex-membro, RN-24) é histórico congelado.
--     SECURITY DEFINER: soma movimentos de todos os membros.
create or replace function public.transactions_goal_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
  v_sum bigint;
  v_bad boolean;
begin
  if tg_op = 'INSERT' and new.goal_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.goal_id is null and new.goal_id is null then
    return null;
  end if;
  if new.user_id is null then
    return null;
  end if;
  if new.goal_id is not null then
    select g.family_id into v_family from public.goals g where g.id = new.goal_id;
    select coalesce(sum(m.amount_cents), 0),
           coalesce(bool_or(m.goal_id <> new.goal_id or (v_family is null and m.user_id is distinct from new.user_id)), false)
      into v_sum, v_bad
      from public.goal_movements m
      where m.transaction_id = new.id and m.kind = 'use';
    if v_sum <> new.goal_funded_cents or v_bad
       or (v_family is not null and new.family_id is distinct from v_family) then
      raise exception 'Movimento inválido.';
    end if;
  elsif exists (
    select 1 from public.goal_movements m
    where m.transaction_id = new.id and m.kind = 'use'
  ) then
    raise exception 'Movimento inválido.';
  end if;
  return null;
end;
$$;

-- 31. Apagar um "use" só vale quando a compra já não existe (apagada junto,
--     por delete_goal_use/delete_family_goal_use) ou é histórico de
--     Ex-membro. SECURITY DEFINER: a compra da família é de outra pessoa (o
--     membro não a enxerga e, sem isto, apagaria a própria parte do uso).
create or replace function public.goal_movements_use_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind <> 'use' then
    return null;
  end if;
  if exists (
    select 1 from public.transactions t
    where t.id = old.transaction_id and t.user_id is not null
  ) then
    raise exception 'Movimento inválido.';
  end if;
  return null;
end;
$$;

-- 32. Total de cada meta da família (A4 B): todos veem o total; a parte de
--     cada um continua só dele (goal_movements tem RLS "só o dono").
--     SECURITY DEFINER: soma movimentos de todos; devolve só o total, só das
--     metas da família de quem chama.
create function public.family_goal_totals()
returns table (goal_id uuid, saved_cents bigint)
language sql stable security definer set search_path = '' as $$
  select g.id,
         coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end)
                  filter (where m.user_id is not null), 0)::bigint
  from public.goals g
  left join public.goal_movements m on m.goal_id = g.id
  where g.family_id is not null and g.family_id = (select public.my_family_id())
  group by g.id
$$;

-- 33. Criar e editar a meta da família (RF-25, decisão 61). Criar: qualquer
--     membro. Editar: quem criou e o administrador. SECURITY DEFINER: a meta
--     não tem dono e as políticas de goals não a alcançam.
create function public.create_family_goal(p_name text, p_target_cents bigint, p_deadline date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null then
    raise exception 'Família não encontrada.';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family then
    raise exception 'Família não encontrada.';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_target_cents is null or p_target_cents <= 0 or p_target_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_deadline is not null and (p_deadline <> date_trunc('month', p_deadline)::date
     or p_deadline < v_month or p_deadline > date '2099-12-01') then
    raise exception 'Prazo inválido.';
  end if;
  insert into public.goals (user_id, family_id, created_by, name, target_cents, deadline)
    values (null, v_family, v_uid, v_name, p_target_cents, p_deadline)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.update_family_goal(p_id uuid, p_name text, p_target_cents bigint, p_deadline date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_name text := btrim(coalesce(p_name, ''));
  v_goal record;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is not null then
    perform 1 from public.families f where f.id = v_family for share;
  end if;
  select g.created_by, g.deadline into v_goal from public.goals g
    where g.id = p_id and v_family is not null and g.family_id = v_family and g.deleted_on is null
      and public.my_family_id() is not distinct from v_family
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if v_goal.created_by is distinct from v_uid and public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Nome inválido.';
  end if;
  if p_target_cents is null or p_target_cents <= 0 or p_target_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_deadline is not null and p_deadline is distinct from v_goal.deadline
     and (p_deadline <> date_trunc('month', p_deadline)::date or p_deadline < v_month or p_deadline > date '2099-12-01') then
    raise exception 'Prazo inválido.';
  end if;
  update public.goals g set name = v_name, target_cents = p_target_cents, deadline = p_deadline
    where g.id = p_id;
end;
$$;

-- 34. Guardar e tirar a própria parte (RN-22, RN-22a): qualquer membro, hoje.
--     Tirar vale também na meta usada (a sobra de cada um, RN-22c).
--     SECURITY DEFINER: a meta não tem dono (a política de inserção de
--     goal_movements só aceita meta pessoal). Devolvem a própria parte.
create function public.deposit_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is not null then
    perform 1 from public.families f where f.id = v_family for share;
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and v_family is not null and g.family_id = v_family
      and g.status = 'active' and g.deleted_on is null
      and public.my_family_id() is not distinct from v_family
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
    values (v_uid, p_goal_id, 'deposit', p_amount_cents, v_today);
  return public.goal_balance(p_goal_id);
end;
$$;

create function public.withdraw_family_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is not null then
    perform 1 from public.families f where f.id = v_family for share;
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and v_family is not null and g.family_id = v_family and g.deleted_on is null
      and public.my_family_id() is not distinct from v_family
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_amount_cents > public.goal_balance(p_goal_id) then
    raise exception 'Valor maior que o guardado.';
  end if;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
    values (v_uid, p_goal_id, 'withdraw', p_amount_cents, v_today);
  return public.goal_balance(p_goal_id);
end;
$$;

-- 35. Usar o dinheiro da meta da família (RN-22b, RN-22c): só o
--     administrador; gasto de hoje, na categoria dele, da família. A meta paga
--     o menor entre o gasto e o total; a diferença sai do Disponível de quem
--     usou. A parte paga é dividida na proporção do que cada um guardou —
--     exatamente splitFamilyUse (src/domain/family.ts); mantenha os dois em
--     sincronia:
--       - entram só as partes maiores que zero (zeradas ficam de fora), e o
--         total é a soma delas;
--       - cada um recebe div(pago × parte, total) (piso exato em numeric:
--         pago × parte chega a 10^20, e a divisão comum de numeric arredonda);
--       - os centavos que sobram vão, um a um, para os maiores restos
--         (empate: maior parte, depois o menor id — a ordem do uuid é a mesma
--         da comparação de texto do id em minúsculas);
--       - quem fica com zero não ganha movimento.
--     Só quem participa agora tem parte: se sobrasse parte de alguém que já
--     saiu, o uso é recusado com um erro claro (e nada é gravado pela metade).
--     SECURITY DEFINER: grava o "use" de cada membro.
create function public.use_family_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid)
returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total bigint;
  v_funded bigint;
  v_tx uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.family_id = v_family and g.status = 'active' and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 9999999999 then
    raise exception 'Valor inválido.';
  end if;
  if p_category_id is null or not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_uid
  ) then
    raise exception 'Categoria não encontrada.';
  end if;
  if exists (
    select 1 from public.goal_movements m
    where m.goal_id = p_goal_id and m.user_id is not null
      and not exists (select 1 from public.family_members fm
                      where fm.family_id = v_family and fm.user_id = m.user_id and fm.left_at is null)
    group by m.user_id
    having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) <> 0
  ) then
    raise exception 'Meta inválida.';
  end if;
  select coalesce(sum(p.part), 0)::bigint into v_total
    from (
      select sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
      from public.goal_movements m
      where m.goal_id = p_goal_id and m.user_id is not null
      group by m.user_id
    ) p
    where p.part > 0;
  if v_total <= 0 then
    raise exception 'Meta sem dinheiro guardado.';
  end if;
  v_funded := least(p_amount_cents, v_total);

  insert into public.transactions (user_id, kind, amount_cents, category_id, occurred_on, goal_id, goal_funded_cents, family_id)
    values (v_uid, 'expense', p_amount_cents, p_category_id, v_today, p_goal_id, v_funded, v_family)
    returning id into v_tx;

  for r in
    with parts as (
      select m.user_id as member, sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
      from public.goal_movements m
      where m.goal_id = p_goal_id and m.user_id is not null
      group by m.user_id
      having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) > 0
    ), shares as (
      select p.member, p.part,
             div(v_funded::numeric * p.part, v_total::numeric) as share,
             mod(v_funded::numeric * p.part, v_total::numeric) as rest
      from parts p
    ), ranked as (
      select q.member, q.share,
             row_number() over (order by q.rest desc, q.part desc, q.member) as rn,
             v_funded - sum(q.share) over () as extra
      from shares q
    )
    select k.member, (k.share + case when k.rn <= k.extra then 1 else 0 end)::bigint as amount
    from ranked k
    order by k.member
  loop
    if r.amount > 0 then
      insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on, transaction_id)
        values (r.member, p_goal_id, 'use', r.amount, v_today, v_tx);
    end if;
  end loop;

  update public.goals g set status = 'used', used_on = v_today where g.id = p_goal_id;

  return query select v_tx, v_funded, v_total - v_funded;
end;
$$;

-- Desfazer o uso (decisão 66): só o administrador; a compra e os "use" de
-- todos saem juntos; cada parte volta; a meta volta a ser ativa. Só quando
-- todos os envolvidos ainda participam (C1): desfazer depois de uma saída
-- devolveria uma parte a quem já recebeu tudo na saída (a meta ficaria presa
-- para sempre) ou apagaria o gasto de quem saiu, que é só dele (decisão 97).
-- Histórico sem dono (Ex-membro que excluiu o cadastro, RN-24) não impede.
create function public.delete_family_goal_use(p_transaction_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_goal uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  select t.goal_id into v_goal from public.transactions t
    join public.goals g on g.id = t.goal_id and g.family_id = v_family
    where t.id = p_transaction_id and t.family_id = v_family
    for update of t;
  if v_goal is null
     or exists (
       select 1 from public.transactions t
       where t.id = p_transaction_id and t.user_id is not null
         and not exists (select 1 from public.family_members fm
                         where fm.family_id = v_family and fm.user_id = t.user_id and fm.left_at is null))
     or exists (
       select 1 from public.goal_movements m
       where m.transaction_id = p_transaction_id and m.kind = 'use' and m.user_id is not null
         and not exists (select 1 from public.family_members fm
                         where fm.family_id = v_family and fm.user_id = m.user_id and fm.left_at is null)) then
    raise exception 'Gasto não encontrado.';
  end if;
  perform 1 from public.goals g where g.id = v_goal and g.deleted_on is null for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  delete from public.goal_movements m where m.transaction_id = p_transaction_id and m.kind = 'use';
  delete from public.transactions t where t.id = p_transaction_id;
  update public.goals g set status = 'active', used_on = null where g.id = v_goal;
  return v_goal;
end;
$$;

-- 36. Excluir a meta da família (A6 A): só o administrador; cada parte volta
--     hoje para quem guardou (como "tirado"); os meses anteriores não mudam.
--     Só quem participa tem parte (C1): se sobrasse parte de alguém que já
--     saiu, a exclusão é recusada com um erro claro, sem nada pela metade.
create function public.delete_family_goal(p_goal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := public.my_family_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if v_family is null or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.families f where f.id = v_family for share;
  if public.my_family_id() is distinct from v_family or public.my_family_role() is distinct from 'admin' then
    raise exception 'Só quem administra a família pode fazer isso.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.family_id = v_family and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  if exists (
    select 1 from public.goal_movements m
    where m.goal_id = p_goal_id and m.user_id is not null
      and not exists (select 1 from public.family_members fm
                      where fm.family_id = v_family and fm.user_id = m.user_id and fm.left_at is null)
    group by m.user_id
    having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) <> 0
  ) then
    raise exception 'Meta inválida.';
  end if;
  for r in
    select m.user_id as member, sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) as part
    from public.goal_movements m
    where m.goal_id = p_goal_id and m.user_id is not null
    group by m.user_id
    having sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end) > 0
    order by m.user_id
  loop
    insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
      values (r.member, p_goal_id, 'withdraw', r.part, v_today);
  end loop;
  update public.goals g set deleted_on = v_today where g.id = p_goal_id;
end;
$$;

revoke execute on function
  public.goals_guard(),
  public.goal_movements_author_guard(),
  public.goal_movements_guard(),
  public.transactions_goal_link_guard(),
  public.goal_movements_use_delete_guard()
from public, anon, authenticated;

revoke execute on function
  public.family_goal_totals(),
  public.create_family_goal(text, bigint, date),
  public.update_family_goal(uuid, text, bigint, date),
  public.deposit_family_goal(uuid, bigint),
  public.withdraw_family_goal(uuid, bigint),
  public.use_family_goal(uuid, bigint, uuid),
  public.delete_family_goal_use(uuid),
  public.delete_family_goal(uuid)
from public, anon;

grant execute on function
  public.family_goal_totals(),
  public.create_family_goal(text, bigint, date),
  public.update_family_goal(uuid, text, bigint, date),
  public.deposit_family_goal(uuid, bigint),
  public.withdraw_family_goal(uuid, bigint),
  public.use_family_goal(uuid, bigint, uuid),
  public.delete_family_goal_use(uuid),
  public.delete_family_goal(uuid)
to authenticated;
