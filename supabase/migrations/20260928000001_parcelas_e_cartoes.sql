-- Plano 4: parcelas e cartões (RF-14, RF-58–61, RN-06–09, RN-29–32, K6 A).
-- As migrações anteriores não são editadas; tudo muda aqui.

-- 1. Cartões ilustrativos: só apelido, tipo e cor (RN-29). Nenhum número, nem parcial.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30 and nickname = btrim(nickname)),
  kind text not null check (kind in ('credit', 'debit')),
  color text not null check (color in ('green', 'purple', 'blue', 'orange', 'graphite', 'pink')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index cards_user_idx on public.cards (user_id, created_at);

create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();

alter table public.cards enable row level security;

create policy cards_own on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Compra parcelada (RN-07). As parcelas são registros confirmados em
--    transactions; categoria e nota ficam nelas (uma fonte só).
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  total_cents bigint not null check (total_cents > 0 and total_cents <= 9999999999),
  installment_count smallint not null check (installment_count between 2 and 48),
  purchased_on date not null,
  status text not null default 'active' check (status in ('active', 'settled', 'refunded')),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_total_covers_count check (total_cents >= installment_count),
  constraint installment_closed_on_when_closed check ((status = 'active') = (closed_on is null)),
  unique (id, user_id)
);

create index installment_plans_user_idx on public.installment_plans (user_id);

create trigger installment_plans_touch before update on public.installment_plans
  for each row execute function public.touch_updated_at();

alter table public.installment_plans enable row level security;

create policy installment_plans_own on public.installment_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Registros ganham cartão e parcela. Com cartão, payment_method fica vazio:
--    o tipo (crédito/débito) vem do cartão. Cartão excluído: card_id vazio e
--    card_deleted = true (RN-32), valores intactos.
alter table public.transactions
  add column card_id uuid,
  add column card_deleted boolean not null default false,
  add column installment_plan_id uuid,
  add column installment_number smallint,
  add column installment_count smallint,
  add constraint card_only_on_expense check (card_id is null or kind = 'expense'),
  add constraint card_without_payment_method check (card_id is null or payment_method is null),
  add constraint card_deleted_has_no_card check (not (card_deleted and card_id is not null)),
  add constraint installment_number_pair check ((installment_number is null) = (installment_count is null)),
  add constraint installment_number_needs_plan check (installment_number is null or installment_plan_id is not null),
  add constraint installment_number_range check (installment_number is null or installment_number between 1 and installment_count),
  add constraint installment_only_confirmed_expense check (installment_plan_id is null or (kind = 'expense' and status = 'confirmed')),
  add constraint transactions_card_fk foreign key (card_id, user_id)
    references public.cards (id, user_id) on delete no action,
  add constraint transactions_installment_fk foreign key (installment_plan_id, user_id)
    references public.installment_plans (id, user_id) on delete no action;

create unique index transactions_installment_number_uidx
  on public.transactions (installment_plan_id, installment_number) where installment_number is not null;
create index transactions_card_idx on public.transactions (card_id) where card_id is not null;
create index transactions_installment_plan_idx on public.transactions (installment_plan_id) where installment_plan_id is not null;

-- 4. Conta que se repete anotada com cartão: as próximas levam o mesmo cartão.
alter table public.recurrences
  add column card_id uuid,
  add constraint recurrence_card_only_on_expense check (card_id is null or kind = 'expense'),
  add constraint recurrence_card_without_payment_method check (card_id is null or payment_method is null),
  add constraint recurrences_card_fk foreign key (card_id, user_id)
    references public.cards (id, user_id) on delete no action;

create index recurrences_card_idx on public.recurrences (card_id) where card_id is not null;

-- 5. Calendário das parcelas. Mesma regra de splitInstallments
--    (src/domain/installments.ts): 1ª no mês da compra, mesmo dia ajustado ao
--    tamanho do mês, centavos que sobram na 1ª (etapa-3 §3.1).
create function public.installment_schedule(p_total_cents bigint, p_count integer, p_purchased_on date)
returns table (installment_no integer, cents bigint, on_date date)
language sql immutable set search_path = '' as $$
  select
    n,
    p_total_cents / p_count + case when n = 1 then p_total_cents % p_count else 0 end,
    public.occurrence_due_on(
      ((p_purchased_on - (extract(day from p_purchased_on)::int - 1)) + make_interval(months => n - 1))::date,
      extract(day from p_purchased_on)::int
    )
  from generate_series(1, p_count) as n
  where p_count between 2 and 48 and p_total_cents >= p_count
$$;

-- 6. "Foi parcelado" no Anotar: a compra e todas as parcelas nascem juntas.
--    Data da compra até hoje (Brasília).
create function public.create_installment_purchase(
  p_amount_cents bigint, p_count integer, p_category_id uuid, p_note text,
  p_card_id uuid, p_payment_method text, p_purchased_on date
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_plan uuid;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
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
    occurred_on, installment_plan_id, installment_number, installment_count
  )
  select
    v_uid, 'expense', s.cents, p_category_id, nullif(btrim(p_note), ''),
    case when p_card_id is null then p_payment_method end, p_card_id,
    s.on_date, v_plan, s.installment_no, p_count
  from public.installment_schedule(p_amount_cents, p_count, p_purchased_on) s;

  return v_plan;
end;
$$;

-- 7. Quitar antecipadamente (RN-08): as parcelas depois de hoje saem e o valor
--    pago entra como um gasto único hoje, com a categoria, a nota e o cartão da
--    compra. O "for update" faz um toque duplo esperar e falhar sem pagar duas vezes.
create function public.settle_installments(p_plan_id uuid, p_amount_cents bigint) returns uuid
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

  select t.category_id, t.note, t.payment_method, t.card_id, t.card_deleted into v_first
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
    occurred_on, installment_plan_id
  ) values (
    v_uid, 'expense', p_amount_cents, v_first.category_id, v_first.note, v_first.payment_method,
    v_first.card_id, v_first.card_deleted, v_today, p_plan_id
  ) returning id into v_tx;

  update public.installment_plans p set status = 'settled', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;

  return v_tx;
end;
$$;

-- 8. Devolução (RN-09): as parcelas depois de hoje saem; as que já contaram ficam.
create function public.refund_installments(p_plan_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
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

  delete from public.transactions t
    where t.installment_plan_id = p_plan_id and t.user_id = v_uid
      and t.installment_number is not null and t.occurred_on > v_today;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma parcela futura.';
  end if;

  update public.installment_plans p set status = 'refunded', closed_on = v_today
    where p.id = p_plan_id and p.user_id = v_uid;
end;
$$;

-- 9. Excluir a compra inteira (engano ao anotar): parcelas, restante quitado e a compra.
create function public.delete_installment_purchase(p_plan_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.installment_plans p where p.id = p_plan_id and p.user_id = v_uid for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  delete from public.transactions t where t.installment_plan_id = p_plan_id and t.user_id = v_uid;
  delete from public.installment_plans p where p.id = p_plan_id and p.user_id = v_uid;
end;
$$;

-- 10. Excluir cartão (RN-32): os gastos ficam como "Cartão excluído" com os
--     mesmos valores; contas que se repetem seguem sem cartão; o apelido some.
create function public.delete_card(p_card_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  perform 1 from public.cards k where k.id = p_card_id and k.user_id = v_uid for update;
  if not found then
    raise exception 'Cartão não encontrado.';
  end if;
  update public.transactions t set card_id = null, card_deleted = true
    where t.card_id = p_card_id and t.user_id = v_uid;
  update public.recurrences r set card_id = null
    where r.card_id = p_card_id and r.user_id = v_uid;
  delete from public.cards k where k.id = p_card_id and k.user_id = v_uid;
end;
$$;

-- 11. Conta que se repete pelo Anotar, agora com cartão (p_card_id opcional:
--     chamadas do Plano 3 sem ele continuam valendo). Corpo igual ao da
--     migração 20260927000001, mais card_id; com cartão, payment_method vazio.
drop function public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text);

create function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text, p_card_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
  v_payment text := case when p_card_id is null then p_payment_method end;
  v_name text;
  v_rec uuid;
  v_tx uuid;
  v_done boolean := p_occurred_on <= v_today;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
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
    frequency, due_day, due_month, starts_on, generated_through, note
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, v_payment, p_card_id,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period, nullif(left(v_note, 140), '')
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method, card_id,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, v_payment, p_card_id,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period
  ) returning id into v_tx;

  return v_tx;
end;
$$;

-- 12. Ocorrências levam o cartão da recorrência. Corpo igual ao da migração
--     20260927000001, mais card_id.
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

revoke execute on function
  public.installment_schedule(bigint, integer, date),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date),
  public.settle_installments(uuid, bigint),
  public.refund_installments(uuid),
  public.delete_installment_purchase(uuid),
  public.delete_card(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid)
from public, anon;

grant execute on function
  public.installment_schedule(bigint, integer, date),
  public.create_installment_purchase(bigint, integer, uuid, text, uuid, text, date),
  public.settle_installments(uuid, bigint),
  public.refund_installments(uuid),
  public.delete_installment_purchase(uuid),
  public.delete_card(uuid),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text, uuid)
to authenticated;
