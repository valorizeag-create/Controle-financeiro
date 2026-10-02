-- Plano 9: seus dados (RF-51 a RF-54, RNF-07; RN-22e, RN-24, RN-25).
-- As migrações anteriores não são editadas; tudo muda aqui.
--
-- Regras de ouro:
-- 1. O app não usa a chave de serviço. Excluir o cadastro é uma função do
--    banco, sem parâmetro, que só enxerga quem chama (auth.uid()) e apaga a
--    linha de auth.users. A cascata e handle_user_deleted (Plano 7) fazem o
--    resto, como na exclusão administrativa.
-- 2. Excluir exige entrada recente: a sessão de quem chama existe e foi
--    criada há no máximo 15 minutos. Um token de sessão encerrada não serve,
--    e renovar o token não renova a entrada (a sessão é a mesma).
-- 3. Nada pessoal fica. O que resta numa família que continua é o histórico
--    sem nome (RN-24). account_leftovers confere, tabela por tabela.

-- 0. Conferência ao aplicar. As funções abaixo pertencem a quem aplica esta
--    migração e leem e apagam em auth. Sem esses privilégios a exclusão
--    falharia só na hora em que alguém a pedisse: melhor parar aqui.
--    Além dos privilégios, confere que a segurança por linha das tabelas de
--    auth não vale para este papel: se valesse, as leituras e o delete não
--    dariam erro, só não encontrariam linha nenhuma — e a função responderia
--    "já excluído" sem ter excluído nada.
do $$
declare
  v_table text;
begin
  if not has_schema_privilege(current_user, 'auth', 'USAGE')
     or not has_table_privilege(current_user, 'auth.users', 'SELECT')
     or not has_table_privilege(current_user, 'auth.users', 'DELETE')
     or not has_table_privilege(current_user, 'auth.sessions', 'SELECT') then
    raise exception 'Plano 9: o papel % precisa de SELECT e DELETE em auth.users e SELECT em auth.sessions.', current_user;
  end if;
  if not has_function_privilege(current_user, 'auth.uid()', 'EXECUTE')
     or not has_function_privilege(current_user, 'auth.jwt()', 'EXECUTE') then
    raise exception 'Plano 9: o papel % precisa de EXECUTE em auth.uid() e auth.jwt().', current_user;
  end if;
  -- Rastros sem cascata (item 5e). As tabelas existem em todo Supabase atual;
  -- se uma versão futura não tiver alguma, não há o que apagar nela.
  foreach v_table in array array['auth.audit_log_entries', 'auth.flow_state'] loop
    if to_regclass(v_table) is not null
       and (not has_table_privilege(current_user, v_table, 'SELECT')
            or not has_table_privilege(current_user, v_table, 'DELETE')) then
      raise exception 'Plano 9: o papel % precisa de SELECT e DELETE em %.', current_user, v_table;
    end if;
  end loop;
  foreach v_table in array array['auth.users', 'auth.sessions', 'auth.audit_log_entries', 'auth.flow_state'] loop
    if to_regclass(v_table) is not null and row_security_active(v_table::regclass) then
      raise exception 'Plano 9: a segurança por linha de % vale para o papel %; ele não enxergaria as linhas.', v_table, current_user;
    end if;
  end loop;
end;
$$;

-- 1. Entrada recente, com o relógio por parâmetro (para os testes). Só o
--    papel de serviço chama; as funções abaixo a usam como donas.
--    O que conta é a hora em que a sessão nasceu (auth.sessions.created_at):
--    cada entrada (senha, Google, link do e-mail) cria uma sessão nova;
--    renovar o token mantém a mesma sessão e não mexe nessa hora.
--    SECURITY DEFINER: auth.sessions não é lida pela API.
create function public.session_recent_at(p_user uuid, p_session uuid, p_now timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_user
      and s.created_at > p_now - interval '15 minutes'
      and s.created_at <= p_now + interval '1 minute'
  )
$$;

-- 2. A sessão de quem chama é recente? Sem parâmetro: só responde sobre a
--    própria sessão (o session_id vem do token, conferido pela API: a
--    assinatura e a validade são da API; aqui se confere que a sessão ainda
--    existe, é da própria pessoa e nasceu há pouco). Token sem session_id
--    (chave da API, token feito fora do serviço de autenticação): falso.
--    SECURITY DEFINER: mesmo motivo do item 1.
create function public.session_is_recent() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sid text := auth.jwt() ->> 'session_id';
begin
  if v_uid is null or v_sid is null
     or v_sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.session_recent_at(v_uid, v_sid::uuid, now());
end;
$$;

-- 3. Família encerrada não guarda o nome (pode trazer sobrenome), seja qual
--    for o caminho: sair sozinho, ou excluir o cadastro. Ninguém lê uma
--    família encerrada; o nome não tem mais para quê.
create function public.families_forget_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ended_at is not null then
    new.name := 'Família encerrada';
  end if;
  return new;
end;
$$;

create trigger families_forget_name before update on public.families
  for each row execute function public.families_forget_name();

update public.families set name = 'Família encerrada' where ended_at is not null and name <> 'Família encerrada';

-- 4. Varredura de uma família encerrada (só chamada pela exclusão do
--    cadastro, item 5, que já travou a família; a trava é pedida de novo aqui
--    para a função nunca rodar sem ela). Em dois passos:
--    a) apaga o que não é de mais ninguém: convites, avisos e metas sem
--       movimento;
--    b) se alguém com cadastro ainda tem algo na família (participação,
--       registro, molde ou parte numa meta), para: a linha da família fica,
--       sem nome, e nada dessa pessoa é tocado. Se ninguém tem, o que sobrou
--       é só histórico sem dono (gasto e parte de uso de quem já excluiu o
--       cadastro), que ninguém mais lê: sai tudo, com as participações
--       anônimas e a própria família.
--    Nunca toca em registro, molde, movimento ou participação de quem ainda
--    tem cadastro.
--    SECURITY DEFINER: essas tabelas não têm gravação pela API.
create function private.sweep_ended_family(p_family uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.families f where f.id = p_family for update;
  if not exists (select 1 from public.families f where f.id = p_family and f.ended_at is not null) then
    return;
  end if;
  delete from public.family_invites i where i.family_id = p_family;
  delete from public.family_events e where e.family_id = p_family;
  delete from public.goals g
    where g.family_id = p_family
      and not exists (select 1 from public.goal_movements m where m.goal_id = g.id)
      and not exists (select 1 from public.transactions t where t.goal_id = g.id);
  if exists (select 1 from public.family_members fm where fm.family_id = p_family and fm.user_id is not null)
     or exists (select 1 from public.transactions t where t.family_id = p_family and t.user_id is not null)
     or exists (select 1 from public.recurrences rc where rc.family_id = p_family)
     or exists (select 1 from public.goal_movements m
                join public.goals g on g.id = m.goal_id
                where g.family_id = p_family and m.user_id is not null) then
    return;
  end if;
  -- Só histórico sem dono daqui em diante. A ordem segue as referências:
  -- partes de uso, depois os gastos, depois as metas.
  delete from public.goal_movements m
    using public.goals g
    where g.id = m.goal_id and g.family_id = p_family;
  delete from public.transactions t where t.family_id = p_family;
  delete from public.goals g where g.family_id = p_family;
  delete from public.family_members fm where fm.family_id = p_family;
  delete from public.families f where f.id = p_family;
end;
$$;

-- 5. Excluir o próprio cadastro (RF-53, LGPD). Sem parâmetro.
--    Em ordem:
--    a) quem chama existe? Se não, devolve falso (toque duplo, outra aba): a
--       ação encerra a sessão do mesmo jeito;
--    b) entrada recente (item 2). Se a sessão sumiu porque outra chamada
--       acabou de excluir o cadastro, é o caso (a): falso, sem erro;
--    c) trava as famílias da pessoa — a ativa e as de que já saiu —, em ordem
--       de id, ANTES da linha de auth.users: a mesma ordem de sair e remover
--       (Plano 7, seção 4). As participações são lidas de novo depois das
--       travas (a pessoa pode ter entrado em outra família enquanto esperava).
--       As famílias antigas entram porque a exclusão mexe nos gastos que a
--       pessoa deixou nelas e, se estiverem encerradas, as varre (f): sem a
--       trava, duas pessoas da mesma família encerrada excluindo o cadastro
--       ao mesmo tempo não veriam uma à outra, e a família ficaria para trás;
--    d) apaga auth.users: handle_user_deleted e as cascatas rodam aqui;
--    e) apaga os rastros da pessoa no serviço de autenticação que não têm
--       cascata (registro de acessos e pedidos de login em andamento). Um
--       problema nisso não desfaz a exclusão: fica um aviso no registro do
--       banco, e account_leftovers mostra o que sobrou;
--    f) varre as famílias encerradas em que ela participou (item 4).
--    Duas chamadas ao mesmo tempo: a segunda espera a trava e encontra zero
--    linhas para apagar; devolve falso.
--    SECURITY DEFINER: a pessoa não alcança auth pela API. O escopo é só
--    auth.uid(); nenhum id chega por parâmetro.
create function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_family uuid;
  v_families uuid[];
  v_current uuid[];
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  -- A conferência do item 0, de novo na hora: se a segurança por linha de
  -- auth passar a valer para o dono desta função, "não encontrei o cadastro"
  -- deixa de significar "já foi excluído". Melhor recusar do que dizer à
  -- pessoa que os dados foram apagados sem terem sido.
  if row_security_active('auth.users'::regclass) or row_security_active('auth.sessions'::regclass) then
    raise exception 'Exclusão indisponível.';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if not found then
    return false;
  end if;
  if not public.session_is_recent() then
    if not exists (select 1 from auth.users u where u.id = v_uid) then
      return false;
    end if;
    raise exception 'Entrada recente necessária.' using errcode = '42501';
  end if;

  loop
    select coalesce(array_agg(x.family_id order by x.family_id), '{}'::uuid[]) into v_families
      from (select distinct fm.family_id from public.family_members fm where fm.user_id = v_uid) x;
    perform 1 from public.families f where f.id = any (v_families) order by f.id for update;
    select coalesce(array_agg(x.family_id order by x.family_id), '{}'::uuid[]) into v_current
      from (select distinct fm.family_id from public.family_members fm where fm.user_id = v_uid) x;
    exit when v_current <@ v_families;
  end loop;

  delete from auth.users u where u.id = v_uid;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false;
  end if;

  begin
    delete from auth.audit_log_entries a
      where a.payload ->> 'actor_id' = v_uid::text
         or a.payload -> 'traits' ->> 'user_id' = v_uid::text
         or (v_email is not null and (
              lower(a.payload ->> 'actor_username') = lower(v_email)
              or lower(a.payload -> 'traits' ->> 'user_email') = lower(v_email)));
  exception when others then
    raise warning 'delete_my_account (registro de acessos): %', sqlstate;
  end;
  begin
    delete from auth.flow_state fs where fs.user_id = v_uid;
  exception when others then
    raise warning 'delete_my_account (login em andamento): %', sqlstate;
  end;

  foreach v_family in array v_families loop
    begin
      perform private.sweep_ended_family(v_family);
    exception when others then
      raise warning 'delete_my_account (família encerrada): %', sqlstate;
    end;
  end loop;
  return true;
end;
$$;

-- 6. O que ainda existe de uma pessoa? Uma linha por lugar. Serve para os
--    testes provarem a exclusão e para conferir um pedido de exclusão no
--    banco hospedado (SQL Editor). Não altera nada.
--    Procura o id em toda coluna uuid de public, private e auth que o dono
--    desta função enxerga, mais os lugares em que o id ou o e-mail aparecem
--    como texto. Uma tabela de auth que o dono não enxerga de jeito nenhum
--    não é conferida (ela nem aparece na lista de colunas). Uma tabela que
--    aparece mas não pode ser lida de verdade (sem SELECT, ou com segurança
--    por linha valendo para o dono) sai como "(não conferido)", com n = -1:
--    nunca conta como "nada ficou".
--    SECURITY DEFINER: lê tabelas sem acesso pela API. Só o papel de serviço.
create function public.account_leftovers(p_user uuid, p_email text default null)
returns table (place text, n bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  v_n bigint;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if p_user is null then
    return;
  end if;
  for r in
    select c.table_schema::text as s, c.table_name::text as t, c.column_name::text as col
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'private', 'auth') and c.data_type = 'uuid'
    order by 1, 2, 3
  loop
    begin
      if row_security_active(format('%I.%I', r.s, r.t)::regclass) then
        v_n := -1;
      else
        execute format('select count(*) from %I.%I where %I = $1', r.s, r.t, r.col) into v_n using p_user;
      end if;
    exception when others then
      v_n := -1;
    end;
    if v_n > 0 then
      place := format('%s.%s.%s', r.s, r.t, r.col);
      n := v_n;
      return next;
    elsif v_n < 0 then
      place := format('%s.%s.%s (não conferido)', r.s, r.t, r.col);
      n := -1;
      return next;
    end if;
  end loop;

  -- O id guardado como texto.
  begin
    select count(*) into v_n from auth.refresh_tokens rt where rt.user_id::text = p_user::text;
    if v_n > 0 then place := 'auth.refresh_tokens.user_id'; n := v_n; return next; end if;
  exception when others then
    place := 'auth.refresh_tokens (não conferido)'; n := -1; return next;
  end;
  begin
    select count(*) into v_n from auth.audit_log_entries a
      where a.payload::text like '%' || p_user::text || '%'
         or (v_email is not null and position(v_email in lower(a.payload::text)) > 0);
    if v_n > 0 then place := 'auth.audit_log_entries.payload'; n := v_n; return next; end if;
  exception when others then
    place := 'auth.audit_log_entries (não conferido)'; n := -1; return next;
  end;

  if v_email is not null then
    select count(*) into v_n from auth.users u where lower(u.email) = v_email;
    if v_n > 0 then place := 'auth.users.email'; n := v_n; return next; end if;
    -- Convite que outra família mandou para este endereço: fica até vencer
    -- (o endereço) e por até 7 dias (o resumo dele, que conta para o limite de
    -- convites por destinatário); a limpeza diária apaga os dois (Plano 8).
    select count(*) into v_n from public.family_invites i where i.invited_email = v_email;
    if v_n > 0 then place := 'public.family_invites.invited_email'; n := v_n; return next; end if;
    select count(*) into v_n from public.family_invites i
      where i.invited_email_hash = extensions.digest(v_email, 'sha256');
    if v_n > 0 then place := 'public.family_invites.invited_email_hash'; n := v_n; return next; end if;
  end if;
end;
$$;

revoke execute on function
  public.session_recent_at(uuid, uuid, timestamptz),
  public.account_leftovers(uuid, text),
  public.families_forget_name()
from public, anon, authenticated;
grant execute on function
  public.session_recent_at(uuid, uuid, timestamptz),
  public.account_leftovers(uuid, text)
to service_role;

revoke execute on function private.sweep_ended_family(uuid) from public, anon, authenticated, service_role;

-- Só uma pessoa com sessão chama estas duas. O papel de serviço também fica
-- de fora: sem sessão não há "quem chama", e nenhuma chave exclui cadastro
-- por aqui.
revoke execute on function public.session_is_recent(), public.delete_my_account() from public, anon, service_role;
grant execute on function public.session_is_recent(), public.delete_my_account() to authenticated;
