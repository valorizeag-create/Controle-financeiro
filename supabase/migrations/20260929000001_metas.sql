-- Plano 5: metas (RF-25–30, RN-13–16, A6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.

-- Metas da família (Plano 7) entram depois: goal_movements.user_id já é
-- "quem guardou" (RN-22) e o tipo return_on_exit já existe (RN-22d).

-- 1. Metas. O guardado é sempre calculado pelos movimentos (etapa-3 §2).
--    "Concluída" é calculada (guardado >= valor); "usada" fica gravada.
--    Excluir é suave (deleted_on): o histórico continua (RN-16).
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  target_cents bigint not null check (target_cents > 0 and target_cents <= 9999999999),
  deadline date check (
    deadline is null
    or (deadline = date_trunc('month', deadline)::date and deadline between date '2000-01-01' and date '2099-12-01')
  ),
  status text not null default 'active' check (status in ('active', 'used')),
  used_on date,
  deleted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_used_on_when_used check ((status = 'used') = (used_on is not null)),
  unique (id, user_id)
);

create index goals_user_idx on public.goals (user_id, created_at);

create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

alter table public.goals enable row level security;

-- Sem política de exclusão: a meta nunca é apagada de verdade.
create policy goals_select on public.goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert on public.goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Gasto pago com meta (RN-15): quanto veio da meta; o resto veio do mês (RN-15a).
alter table public.transactions
  add constraint transactions_id_user_key unique (id, user_id),
  add column goal_id uuid,
  add column goal_funded_cents bigint not null default 0,
  add constraint goal_funded_range check (goal_funded_cents >= 0 and goal_funded_cents <= amount_cents),
  add constraint goal_funded_needs_goal check ((goal_id is null) = (goal_funded_cents = 0)),
  add constraint goal_only_confirmed_expense check (goal_id is null or (kind = 'expense' and status = 'confirmed')),
  add constraint transactions_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete no action;

create index transactions_goal_idx on public.transactions (goal_id) where goal_id is not null;

-- 3. Movimentos da meta: o livro-razão do Guardado (etapa-3 §3.1).
create table public.goal_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null,
  kind text not null check (kind in ('deposit', 'withdraw', 'use', 'return_on_exit')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  occurred_on date not null,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  constraint goal_movement_use_has_transaction check ((kind = 'use') = (transaction_id is not null)),
  constraint goal_movements_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete no action,
  constraint goal_movements_transaction_fk foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete no action
);

create index goal_movements_user_date_idx on public.goal_movements (user_id, occurred_on);
create index goal_movements_goal_idx on public.goal_movements (goal_id);
create unique index goal_movements_transaction_uidx on public.goal_movements (transaction_id) where transaction_id is not null;

alter table public.goal_movements enable row level security;

-- Sem política de alteração: movimentos não mudam. Só o uso pode ser
-- apagado (junto com o gasto, por delete_goal_use).
create policy goal_movements_select on public.goal_movements
  for select to authenticated using (user_id = (select auth.uid()));
create policy goal_movements_insert on public.goal_movements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goal_movements_delete_use on public.goal_movements
  for delete to authenticated using (user_id = (select auth.uid()) and kind = 'use');

-- 4. Guarda do guardado: vale também para gravação direta na tabela.
--    Trava a meta: dois pedidos ao mesmo tempo esperam um pelo outro.
create function public.goal_movements_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
  v_deleted date;
  v_balance bigint;
begin
  select g.status, g.deleted_on into v_status, v_deleted
    from public.goals g
    where g.id = new.goal_id and g.user_id = new.user_id
    for update;
  if not found or v_deleted is not null then
    raise exception 'Meta não encontrada.';
  end if;
  if new.kind = 'deposit' and v_status <> 'active' then
    raise exception 'Meta não encontrada.';
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

create trigger goal_movements_guard before insert on public.goal_movements
  for each row execute function public.goal_movements_guard();

-- 5. Guardado de uma meta da própria pessoa (0 para meta de outra pessoa).
create function public.goal_balance(p_goal_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(case when m.kind = 'deposit' then m.amount_cents else -m.amount_cents end), 0)::bigint
  from public.goal_movements m
  where m.goal_id = p_goal_id and m.user_id = (select auth.uid())
$$;

-- 6. Guardar (RN-13): hoje, só em meta ativa.
create function public.deposit_to_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active' and g.deleted_on is null
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

-- 7. Tirar (RN-14): volta ao Disponível de hoje; nunca mais que o guardado.
--    Vale para meta ativa ou usada (a sobra de uma meta usada pode sair).
create function public.withdraw_from_goal(p_goal_id uuid, p_amount_cents bigint) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.deleted_on is null
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

-- 8. Usar o dinheiro da meta (RN-15, etapa-3 §8.3): gasto de hoje com a
--    categoria; a meta paga o menor entre o gasto e o guardado (mesma regra de
--    splitGoalUse, src/domain/goals.ts); a meta vira "usada". Tudo junto.
create function public.use_goal(p_goal_id uuid, p_amount_cents bigint, p_category_id uuid)
returns table (tx_id uuid, funded_cents bigint, leftover_cents bigint)
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
  v_funded bigint;
  v_tx uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active' and g.deleted_on is null
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
  v_balance := public.goal_balance(p_goal_id);
  if v_balance <= 0 then
    raise exception 'Meta sem dinheiro guardado.';
  end if;
  v_funded := least(p_amount_cents, v_balance);

  insert into public.transactions (user_id, kind, amount_cents, category_id, occurred_on, goal_id, goal_funded_cents)
    values (v_uid, 'expense', p_amount_cents, p_category_id, v_today, p_goal_id, v_funded)
    returning id into v_tx;
  insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on, transaction_id)
    values (v_uid, p_goal_id, 'use', v_funded, v_today, v_tx);
  update public.goals g set status = 'used', used_on = v_today
    where g.id = p_goal_id and g.user_id = v_uid;

  return query select v_tx, v_funded, v_balance - v_funded;
end;
$$;

-- 9. Desfazer um uso (engano): o gasto e o uso saem juntos, o dinheiro volta
--    para a meta e ela volta a ser ativa. Meta excluída: não.
create function public.delete_goal_use(p_transaction_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_goal uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  select m.goal_id into v_goal from public.goal_movements m
    where m.transaction_id = p_transaction_id and m.user_id = v_uid and m.kind = 'use';
  if v_goal is null then
    raise exception 'Gasto não encontrado.';
  end if;
  perform 1 from public.goals g
    where g.id = v_goal and g.user_id = v_uid and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  delete from public.goal_movements m
    where m.transaction_id = p_transaction_id and m.user_id = v_uid and m.kind = 'use';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Gasto não encontrado.';
  end if;
  delete from public.transactions t where t.id = p_transaction_id and t.user_id = v_uid;
  update public.goals g set status = 'active', used_on = null
    where g.id = v_goal and g.user_id = v_uid;
  return v_goal;
end;
$$;

-- 10. Excluir meta (RN-16, A6 A): o guardado volta ao Disponível de hoje
--     como "tirado"; os movimentos passados continuam contando nos meses deles.
create function public.delete_goal(p_goal_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.deleted_on is null
    for update;
  if not found then
    raise exception 'Meta não encontrada.';
  end if;
  v_balance := public.goal_balance(p_goal_id);
  if v_balance > 0 then
    insert into public.goal_movements (user_id, goal_id, kind, amount_cents, occurred_on)
      values (v_uid, p_goal_id, 'withdraw', v_balance, v_today);
  end if;
  update public.goals g set deleted_on = v_today
    where g.id = p_goal_id and g.user_id = v_uid;
end;
$$;

revoke execute on function public.goal_movements_guard() from public, anon, authenticated;

revoke execute on function
  public.goal_balance(uuid),
  public.deposit_to_goal(uuid, bigint),
  public.withdraw_from_goal(uuid, bigint),
  public.use_goal(uuid, bigint, uuid),
  public.delete_goal_use(uuid),
  public.delete_goal(uuid)
from public, anon;

grant execute on function
  public.goal_balance(uuid),
  public.deposit_to_goal(uuid, bigint),
  public.withdraw_from_goal(uuid, bigint),
  public.use_goal(uuid, bigint, uuid),
  public.delete_goal_use(uuid),
  public.delete_goal(uuid)
to authenticated;
