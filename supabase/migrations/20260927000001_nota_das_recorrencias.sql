-- Plano 3, revisão final: nota das recorrências.
-- Sem uma coluna própria, as ocorrências geradas usavam recurrences.name como
-- note. Para uma conta criada pelo Anotar sem nota, name cai no nome da
-- categoria (ex.: "Mercado"), então o Extrato mostrava "Mercado · Mercado".
-- Migrações anteriores não são editadas; tudo muda aqui.

alter table public.recurrences
  add column note text null check (note is null or char_length(note) <= 140);

-- create_recurring_transaction: passa a guardar a nota do Anotar (sem
-- truncar, até 140 caracteres) em recurrences.note (null quando não há
-- nota). name continua sendo o nome de exibição (nota, ou nome da categoria/
-- fonte quando não há nota), truncado em 40 — igual à versão original.
create or replace function public.create_recurring_transaction(
  p_kind text, p_amount_cents bigint, p_category_id uuid, p_source text, p_note text,
  p_payment_method text, p_occurred_on date, p_frequency text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_period date := make_date(extract(year from p_occurred_on)::int, extract(month from p_occurred_on)::int, 1);
  v_note text := nullif(btrim(p_note), '');
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
    v_name := coalesce(nullif(btrim(p_source), ''), 'Entrada');
  end if;

  insert into public.recurrences (
    user_id, kind, name, amount_cents, category_id, source, payment_method,
    frequency, due_day, due_month, starts_on, generated_through, note
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, p_payment_method,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period, nullif(left(v_note, 140), '')
  ) returning id into v_rec;

  insert into public.transactions (
    user_id, kind, amount_cents, category_id, source, note, payment_method,
    occurred_on, status, due_on, paid_on, recurrence_id, recurrence_period
  ) values (
    v_uid, p_kind, p_amount_cents, p_category_id, p_source, v_note, p_payment_method,
    p_occurred_on, case when v_done then 'confirmed' else 'pending' end, p_occurred_on,
    case when v_done then p_occurred_on end, v_rec, v_period
  ) returning id into v_tx;

  return v_tx;
end;
$$;

-- generate_occurrences: ocorrências passam a levar r.note (pode ser null)
-- em vez de r.name.
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
          user_id, kind, amount_cents, category_id, source, note, payment_method,
          occurred_on, status, due_on, recurrence_id, recurrence_period
        ) values (
          v_uid, r.kind, r.amount_cents, r.category_id, r.source, r.note, r.payment_method,
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

-- update_recurrence: não toca mais em transactions.note — a nota do Anotar é
-- independente do nome da conta que está sendo editado aqui.
create or replace function public.update_recurrence(
  p_id uuid, p_name text, p_amount_cents bigint, p_category_id uuid, p_source text, p_due_day integer
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  select rc.kind into v_kind from public.recurrences rc
    where rc.id = p_id and rc.user_id = v_uid and rc.ended_on is null
    for update;
  if not found then
    raise exception 'Recorrência não encontrada.';
  end if;

  update public.recurrences rc set
    name = p_name,
    amount_cents = p_amount_cents,
    category_id = case when v_kind = 'expense' then p_category_id end,
    source = case when v_kind = 'income' then p_source end,
    due_day = p_due_day
  where rc.id = p_id and rc.user_id = v_uid;

  update public.transactions t set
    amount_cents = p_amount_cents,
    category_id = case when v_kind = 'expense' then p_category_id end,
    source = case when v_kind = 'income' then p_source end,
    due_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.due_on end,
    occurred_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.occurred_on end
  where t.recurrence_id = p_id and t.user_id = v_uid and t.status = 'pending' and t.due_on >= v_today;
end;
$$;

-- Limpeza: pendências geradas antes desta migração tinham note = nome da
-- categoria (duplicado) quando a conta não tinha nota no Anotar.
update public.transactions t
  set note = null
  from public.recurrences r
  join public.categories c on c.id = r.category_id
  where t.recurrence_id = r.id and t.status = 'pending' and t.note = c.name;
