-- Núcleo individual da Íris: perfil, categorias e registros (livro-razão).
-- Números (Disponível, Saldo total) nunca são guardados: são calculados em src/domain.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  initial_balance_cents bigint not null default 0
    check (initial_balance_cents between -9999999999 and 9999999999),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  default_key text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create unique index categories_default_key_uidx on public.categories (user_id, default_key) where default_key is not null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9999999999),
  category_id uuid,
  source text check (source is null or char_length(source) <= 40),
  note text check (note is null or char_length(note) <= 140),
  payment_method text check (payment_method in ('pix', 'cash', 'boleto', 'debit', 'credit', 'other')),
  occurred_on date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  due_on date,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_has_category check ((kind = 'expense') = (category_id is not null)),
  constraint status_dates check ((status = 'pending' and due_on is not null and paid_on is null) or status = 'confirmed'),
  -- `restrict` é verificado imediatamente (não no fim da transação) e pode
  -- quebrar o cascade de exclusão de auth.users; `no action` é adiável e não
  -- interfere com esse cascade.
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete no action
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on);
create index transactions_category_idx on public.transactions (category_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Proteção das categorias padrão: default_key não muda e "Outros" não é apagável,
-- exceto quando a pessoa é removida (o cascade de auth.users precisa passar).
-- security definer: a checagem em auth.users roda com privilégio do dono da função,
-- já que o papel authenticated não tem select em auth.users.
create function public.protect_default_categories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.default_key = 'outros' and exists (select 1 from auth.users u where u.id = old.user_id) then
      raise exception 'A categoria Outros não pode ser excluída.';
    end if;
    return old;
  end if;

  if new.default_key is distinct from old.default_key then
    raise exception 'A chave da categoria padrão não pode mudar.';
  end if;
  return new;
end;
$$;

create trigger categories_protect_default before update or delete on public.categories
  for each row execute function public.protect_default_categories();

-- Cadastro novo: perfil + categorias padrão da copy oficial.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(trim(new.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
    split_part(new.email, '@', 1),
    'Você'
  );
begin
  insert into public.profiles (id, display_name) values (new.id, left(v_name, 60));
  insert into public.categories (user_id, name, default_key, sort_order)
  select new.id, c.name, c.key, c.ord
  from (values
    ('Casa', 'casa', 1), ('Mercado', 'mercado', 2), ('Transporte', 'transporte', 3),
    ('Comer fora', 'comer_fora', 4), ('Saúde', 'saude', 5), ('Lazer', 'lazer', 6),
    ('Assinaturas', 'assinaturas', 7), ('Educação', 'educacao', 8), ('Compras', 'compras', 9),
    ('Outros', 'outros', 10)
  ) as c (name, key, ord);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privacidade: cada pessoa só enxerga e altera o que é seu.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, delete on public.profiles from authenticated, anon;
revoke update on public.profiles from authenticated;
grant update (display_name, initial_balance_cents, onboarded_at) on public.profiles to authenticated;

create policy categories_own on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_select on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));

create policy transactions_delete on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())
    ))
  );

create policy transactions_update on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())
    ))
  );

revoke execute on function public.handle_new_user(), public.touch_updated_at(), public.protect_default_categories() from public, anon, authenticated;
