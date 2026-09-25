-- Plano 2: categorias próprias (RN-27, RF-20) e onboarding (RF-05, RF-06).
-- A migração 20260922000001_nucleo.sql não é editada; tudo muda aqui.

-- 1. Nomes de categoria guardados sempre limpos e únicos por pessoa sem
--    diferenciar maiúsculas: "Pet", "PET" e " pet " são a mesma categoria.
--    O app limpa o nome antes de gravar; a restrição é a rede de segurança.
update public.categories
  set name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  where name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

alter table public.categories drop constraint categories_user_id_name_key;

alter table public.categories
  add constraint categories_name_normalized check (name = regexp_replace(btrim(name), '\s+', ' ', 'g'));

create unique index categories_user_name_ci_uidx on public.categories (user_id, lower(name));

-- 2. "Outros" recebe os gastos de categorias excluídas; o texto da confirmação
--    diz 'vão para "Outros"', então ela também não pode ser renomeada.
--    (create or replace mantém dono e permissões da função.)
create or replace function public.protect_default_categories() returns trigger
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
  if old.default_key = 'outros' and new.name is distinct from old.name then
    raise exception 'A categoria Outros não pode ser renomeada.';
  end if;
  return new;
end;
$$;

-- 3. Excluir categoria (RN-27): os gastos vão para "Outros" e a categoria é
--    apagada, tudo de uma vez (ou nada). Roda com o papel de quem chama
--    (security invoker), então a RLS continua valendo: só enxerga e altera o
--    que é da própria pessoa. O "for update" trava a categoria até o fim: um
--    gasto novo nela, gravado ao mesmo tempo, espera ou falha — nunca fica órfão.
create function public.delete_category(p_category_id uuid) returns void
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
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;
  if v_key = 'outros' then
    raise exception 'A categoria Outros não pode ser excluída.';
  end if;

  select c.id into v_outros
    from public.categories c
    where c.user_id = v_uid and c.default_key = 'outros';
  if v_outros is null then
    raise exception 'Categoria Outros não encontrada.' using errcode = 'P0002';
  end if;

  update public.transactions t
    set category_id = v_outros
    where t.category_id = p_category_id and t.user_id = v_uid;

  delete from public.categories c
    where c.id = p_category_id and c.user_id = v_uid;
end;
$$;

revoke execute on function public.delete_category(uuid) from public, anon;
grant execute on function public.delete_category(uuid) to authenticated;

-- 4. Onboarding: cadastros criados antes do Plano 2 já usam o app e não
--    precisam passar pelas telas de boas-vindas.
update public.profiles set onboarded_at = created_at where onboarded_at is null;
