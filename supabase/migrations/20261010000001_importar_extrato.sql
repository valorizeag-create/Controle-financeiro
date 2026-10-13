-- Importar extrato: chave de importação nos registros, memória de categorias
-- por estabelecimento e a gravação em lote (tudo ou nada). As migrações
-- anteriores não são editadas; tudo muda aqui.

-- 1. Chave da linha importada: a mesma linha do extrato importada duas vezes
--    entra só uma vez. Só vale por pessoa e só para registros que vieram de extrato.
alter table public.transactions
  add column import_key text;

create unique index transactions_user_import_key_uidx
  on public.transactions (user_id, import_key) where import_key is not null;

-- 2. Memória de categorias: o que a pessoa escolheu para cada estabelecimento
--    (gasto: categoria; entrada: origem). Categoria excluída leva a memória junto.
create table public.import_rules (
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_key text not null check (char_length(merchant_key) between 1 and 60),
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid,
  source text check (source is null or char_length(source) <= 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant_key, kind),
  constraint import_rule_category_or_source check ((kind = 'expense') = (category_id is not null)),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

alter table public.import_rules enable row level security;

create policy import_rules_own on public.import_rules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Grava as linhas do extrato de uma vez (tudo ou nada: qualquer erro desfaz
--    o lote). Linha com conta pendente (bill_id) marca a conta como paga;
--    as demais viram registros confirmados, e a import_key repetida é ignorada.
--    Roda com os direitos de quem chama: checks, gatilhos e RLS valem como no resto.
--    Devolve quantas linhas entraram ou foram marcadas como pagas.
create function public.import_statement(p_lines jsonb, p_card_id uuid default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_line jsonb;
  v_kind text;
  v_key text;
  v_merchant text;
  v_bill uuid;
  v_cat uuid;
  v_source text;
  v_date date;
  v_rows integer;
  v_total integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessão necessária.' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Linhas inválidas.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_kind := v_line ->> 'kind';
    v_key := v_line ->> 'import_key';
    v_merchant := v_line ->> 'merchant_key';
    v_bill := (v_line ->> 'bill_id')::uuid;
    v_cat := (v_line ->> 'category_id')::uuid;
    v_source := v_line ->> 'source';
    v_date := (v_line ->> 'occurred_on')::date;

    if v_bill is not null then
      update public.transactions t
        set status = 'confirmed', paid_on = v_date, import_key = v_key
        where t.id = v_bill and t.user_id = v_uid and t.status = 'pending'
          and (v_key is null or not exists (
            select 1 from public.transactions x where x.user_id = v_uid and x.import_key = v_key
          ));
    else
      insert into public.transactions (
        user_id, kind, amount_cents, category_id, source, note, card_id,
        occurred_on, status, import_key
      ) values (
        v_uid, v_kind, (v_line ->> 'amount_cents')::bigint, v_cat, v_source,
        nullif(btrim(v_line ->> 'note'), ''), case when v_kind = 'expense' then p_card_id end,
        v_date, 'confirmed', v_key
      )
      on conflict (user_id, import_key) where import_key is not null do nothing;
    end if;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;

    if v_merchant is not null then
      insert into public.import_rules (user_id, merchant_key, kind, category_id, source)
        values (v_uid, v_merchant, v_kind, case when v_kind = 'expense' then v_cat end,
                case when v_kind = 'income' then v_source end)
      on conflict (user_id, merchant_key, kind)
        do update set category_id = excluded.category_id, source = excluded.source, updated_at = now();
    end if;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.import_statement(jsonb, uuid) from public, anon;
grant execute on function public.import_statement(jsonb, uuid) to authenticated;
