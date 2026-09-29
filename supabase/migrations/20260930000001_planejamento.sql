-- Plano 6: planejamento individual (RF-22–24) e categoria excluída (RN-27).
-- As migrações anteriores não são editadas; tudo muda aqui.
-- Planejamento da família está fora da v1 (etapa-2 §6): sem family_id.
-- O "gasto" do planejado nunca é guardado: é calculado em src/domain.

-- 1. Planejado: um valor por pessoa, mês e categoria. Sem planejado = sem linha.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (
    month = date_trunc('month', month)::date
    and month between date '2000-01-01' and date '2099-12-01'
  ),
  category_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_category_key unique (user_id, month, category_id),
  -- no action: não quebra o cascade de exclusão do cadastro, e
  -- barra apagar direto uma categoria que ainda tem planejado.
  constraint budgets_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete no action
);

create index budgets_category_idx on public.budgets (category_id);

create trigger budgets_touch before update on public.budgets
  for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update on public.budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy budgets_delete on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

-- 2. Salvar o planejamento do mês: tudo de uma vez. Valor nulo tira a
--    categoria do planejado; categorias fora da lista não mudam.
--    As categorias ficam travadas (for share) até o fim: uma exclusão de
--    categoria ao mesmo tempo espera, e depois leva o planejado para Outros.
create function public.set_month_budgets(p_month date, p_category_ids uuid[], p_amounts bigint[])
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := coalesce(cardinality(p_category_ids), 0);
  v_found integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not between date '2000-01-01' and date '2099-12-01' then
    raise exception 'Mês inválido.';
  end if;
  if v_n = 0 or v_n > 200 or v_n <> coalesce(cardinality(p_amounts), 0) then
    raise exception 'Valor inválido.';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is not null and (a <= 0 or a > 9999999999)) then
    raise exception 'Valor inválido.';
  end if;
  if (select count(distinct c) from unnest(p_category_ids) c) <> v_n then
    raise exception 'Categoria não encontrada.';
  end if;
  select count(*) into v_found from (
    select 1 from public.categories c
      where c.user_id = v_uid and c.id = any (p_category_ids)
      for share
  ) s;
  if v_found <> v_n then
    raise exception 'Categoria não encontrada.';
  end if;

  delete from public.budgets b
    using unnest(p_category_ids, p_amounts) as x (category_id, amount_cents)
    where b.user_id = v_uid and b.month = p_month
      and b.category_id = x.category_id and x.amount_cents is null;

  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, p_month, x.category_id, x.amount_cents
      from unnest(p_category_ids, p_amounts) as x (category_id, amount_cents)
      where x.amount_cents is not null
      order by x.category_id
    on conflict (user_id, month, category_id)
      do update set amount_cents = excluded.amount_cents;

  return (select count(*)::integer from public.budgets b where b.user_id = v_uid and b.month = p_month);
end;
$$;

-- 3. Repetir o planejamento do mês anterior (RF-24): só categorias ainda sem
--    planejado no mês; nunca sobrescreve. Dois pedidos ao mesmo tempo: o
--    segundo não copia nada (on conflict do nothing).
create function public.repeat_previous_budgets(p_month date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not between date '2000-01-01' and date '2099-12-01' then
    raise exception 'Mês inválido.';
  end if;
  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, p_month, b.category_id, b.amount_cents
      from public.budgets b
      where b.user_id = v_uid and b.month = (p_month - interval '1 month')::date
    on conflict (user_id, month, category_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 4. Excluir categoria (RN-27): além dos gastos e das contas que se repetem,
--    o planejado vai para "Outros" no mesmo mês, somado (até o limite do app).
--    Mesmo corpo da migração 20260926000001, mais o passo do planejado.
--    create or replace mantém as permissões já concedidas.
create or replace function public.delete_category(p_category_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_outros uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  select c.default_key into v_key
    from public.categories c
    where c.id = p_category_id and c.user_id = v_uid
    for update;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_key = 'outros' then
    raise exception 'A categoria Outros não pode ser excluída.';
  end if;

  select c.id into v_outros
    from public.categories c
    where c.user_id = v_uid and c.default_key = 'outros';
  if v_outros is null then
    raise exception 'Categoria Outros não encontrada.';
  end if;

  update public.transactions t
    set category_id = v_outros
    where t.category_id = p_category_id and t.user_id = v_uid;

  update public.recurrences r
    set category_id = v_outros
    where r.category_id = p_category_id and r.user_id = v_uid;

  insert into public.budgets (user_id, month, category_id, amount_cents)
    select v_uid, b.month, v_outros, b.amount_cents
      from public.budgets b
      where b.category_id = p_category_id and b.user_id = v_uid
    on conflict (user_id, month, category_id)
      do update set amount_cents = least(public.budgets.amount_cents + excluded.amount_cents, 9999999999);
  delete from public.budgets b
    where b.category_id = p_category_id and b.user_id = v_uid;

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function
  public.set_month_budgets(date, uuid[], bigint[]),
  public.repeat_previous_budgets(date)
from public, anon;

grant execute on function
  public.set_month_budgets(date, uuid[], bigint[]),
  public.repeat_previous_budgets(date)
to authenticated;
