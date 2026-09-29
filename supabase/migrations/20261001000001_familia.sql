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
