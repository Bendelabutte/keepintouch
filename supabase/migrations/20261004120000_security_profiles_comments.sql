-- 2026-10-04 : Sécurité des rôles, des profils et des commentaires
begin;

-- 1. is_admin : tient compte de is_active et ne dépend plus des règles RLS de profiles
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select p.role = 'admin' and p.is_active from public.profiles p where p.id = uid),
    false
  )
$$;

-- 2. Protection des champs sensibles de profiles (role, is_active, team_id, id, email)
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Opérations serveur (service_role, création de compte, postgres) : pas de restriction
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_admin(auth.uid()) then
      new.role := 'user';
      new.team_id := null;
      new.is_active := true;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'Modification de l''identifiant ou de l''email interdite';
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.team_id is distinct from old.team_id then

    if not public.is_admin(auth.uid()) then
      raise exception 'Seul un administrateur peut modifier le rôle, le statut ou l''équipe';
    end if;

    if old.id = auth.uid()
       and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
      raise exception 'Un administrateur ne peut pas modifier son propre rôle ou statut';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3. Commentaires : lecture et écriture limitées aux clients visibles par l'utilisateur
alter table public.client_comments alter column author_id set default auth.uid();

drop policy if exists "comments read" on public.client_comments;
drop policy if exists "comments write" on public.client_comments;

create policy "comments read" on public.client_comments
  for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_comments.client_id));

create policy "comments write" on public.client_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_comments.client_id)
  );

commit;