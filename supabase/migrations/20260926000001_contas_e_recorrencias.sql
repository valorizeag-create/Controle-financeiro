-- Plano 3: contas e recorrências (RF-15–18, RN-10–12, A1).
-- As migrações anteriores não são editadas; tudo muda aqui.

-- 1. O molde de cada conta ou entrada que se repete.
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  category_id uuid,
  source text check (source is null or char_length(source) <= 40),
  payment_method text check (payment_method in ('pix', 'cash', 'boleto', 'debit', 'credit', 'other')),
  frequency text not null check (frequency in ('monthly', 'yearly')),
  due_day smallint not null check (due_day between 1 and 31),
  due_month smallint check (due_month between 1 and 12),
  starts_on date not null,
  ended_on date,
  -- Último mês (dia 1) já gerado. Uma ocorrência paga e excluída depois nunca volta,
  -- porque a geração só olha meses depois deste.
  generated_through date check (generated_through is null or extract(day from generated_through) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_expense_has_category check ((kind = 'expense') = (category_id is not null)),
  constraint recurrence_month_when_yearly check ((frequency = 'yearly') = (due_month is not null)),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete no action
);

create index recurrences_user_active_idx on public.recurrences (user_id) where ended_on is null;
create index recurrences_category_idx on public.recurrences (category_id);

create trigger recurrences_touch before update on public.recurrences
  for each row execute function public.touch_updated_at();

alter table public.recurrences enable row level security;

create policy recurrences_own on public.recurrences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Cada ocorrência sabe de qual recorrência e de qual mês ela é. O índice único
--    garante no banco que a mesma conta nunca aparece duas vezes no mesmo mês.
alter table public.transactions
  add column recurrence_id uuid,
  add column recurrence_period date,
  add constraint recurrence_period_pair check ((recurrence_id is null) = (recurrence_period is null)),
  add constraint recurrence_period_month_start check (recurrence_period is null or extract(day from recurrence_period) = 1),
  add constraint transactions_recurrence_fk foreign key (recurrence_id, user_id)
    references public.recurrences (id, user_id) on delete no action;

create unique index transactions_recurrence_period_uidx on public.transactions (recurrence_id, recurrence_period);
create index transactions_user_status_due_idx on public.transactions (user_id, status, due_on);

-- 3. Dia de vencimento dentro de um mês: dia maior que o mês vira o último dia
--    (31 em fevereiro → 28 ou 29). Mesma regra de dueDateIn em src/domain/recurrence.ts.
create function public.occurrence_due_on(p_period date, p_day integer) returns date
language sql immutable set search_path = '' as $$
  select make_date(
    extract(year from p_period)::int,
    extract(month from p_period)::int,
    least(p_day, extract(day from (date_trunc('month', p_period::timestamp) + interval '1 month - 1 day'))::int)
  )
$$;

-- 4. Gerar as ocorrências "a pagar"/"a receber" até o mês atual (Brasília).
--    Idempotente: o "for update" trava cada recorrência (duas telas abrindo juntas
--    esperam uma pela outra e a segunda já não encontra nada a gerar) e o índice
--    único é a rede de segurança. Quem ficou meses sem abrir recebe no máximo os
--    3 últimos meses (CATCH_UP_MONTHS em src/domain/recurrence.ts).
create function public.generate_occurrences() returns integer
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
          v_uid, r.kind, r.amount_cents, r.category_id, r.source, r.name, r.payment_method,
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

-- 5. "É uma conta que se repete" / "Isso se repete" no Anotar: o registro de hoje
--    é a primeira ocorrência e a recorrência nasce junto, tudo ou nada.
--    Data até hoje → já paga/recebida; data futura (só gasto) → a pagar.
create function public.create_recurring_transaction(
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
    frequency, due_day, due_month, starts_on, generated_through
  ) values (
    v_uid, p_kind, btrim(left(v_name, 40)), p_amount_cents, p_category_id, p_source, p_payment_method,
    p_frequency, extract(day from p_occurred_on)::int,
    case when p_frequency = 'yearly' then extract(month from p_occurred_on)::int end,
    p_occurred_on, v_period
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

-- 6. Alterar (RF-18): muda o molde e as ocorrências ainda não vencidas
--    (due_on >= hoje). Pagas e vencidas ficam como estavam. O novo dia só é
--    aplicado se não cair antes de hoje. Frequência e mês não mudam aqui.
create function public.update_recurrence(
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
    note = p_name,
    category_id = case when v_kind = 'expense' then p_category_id end,
    source = case when v_kind = 'income' then p_source end,
    due_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.due_on end,
    occurred_on = case when public.occurrence_due_on(t.recurrence_period, p_due_day) >= v_today
      then public.occurrence_due_on(t.recurrence_period, p_due_day) else t.occurred_on end
  where t.recurrence_id = p_id and t.user_id = v_uid and t.status = 'pending' and t.due_on >= v_today;
end;
$$;

-- 7. Encerrar (RF-18): as próximas deixam de ser criadas e as que venceriam
--    depois de hoje somem. O histórico (pagas) e as de hoje ou vencidas ficam.
create function public.end_recurrence(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;

  update public.recurrences rc set ended_on = v_today
    where rc.id = p_id and rc.user_id = v_uid and rc.ended_on is null;
  if not found then
    raise exception 'Recorrência não encontrada.';
  end if;

  delete from public.transactions t
    where t.recurrence_id = p_id and t.user_id = v_uid and t.status = 'pending' and t.due_on > v_today;
end;
$$;

-- 8. Excluir categoria (RN-27) agora também leva as contas que se repetem
--    para "Outros"; sem isso a chave estrangeira barraria a exclusão.
--    (create or replace mantém dono e permissões da função.)
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

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function
  public.occurrence_due_on(date, integer),
  public.generate_occurrences(),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text),
  public.update_recurrence(uuid, text, bigint, uuid, text, integer),
  public.end_recurrence(uuid)
from public, anon;

grant execute on function
  public.occurrence_due_on(date, integer),
  public.generate_occurrences(),
  public.create_recurring_transaction(text, bigint, uuid, text, text, text, date, text),
  public.update_recurrence(uuid, text, bigint, uuid, text, integer),
  public.end_recurrence(uuid)
to authenticated;
