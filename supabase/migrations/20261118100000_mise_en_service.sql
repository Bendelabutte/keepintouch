-- 2026-11-18 : Interrupteurs de mise en service (Keepintouch 4.0).
--   A. app_settings.modules_transactions_visible (défaut false) : module Transactions visible par les
--      commerciaux. Seul un admin peut le modifier (trigger). La règle elle-même est appliquée par
--      l'interface : les fiches vendeur (« Sous promesse », « Acte signé ») écrivent et relisent des
--      transactions ; les fermer en base (RLS) bloquerait le suivi des fiches.
--   B. profiles.compensation_visible (défaut false), par commercial : appliqué EN BASE.
--      can_read_compensation() exige désormais que la rémunération du commercial soit ouverte
--      (l'admin lit toujours tout). Cette fonction porte déjà toutes les lectures : commission_entries,
--      payments, invoices, compensation_settings(), compensation_balances, fichiers de factures.
--      L'ouverture exige type, taux entrée et sortie et date d'ouverture (contrainte + fonction).
-- Aucune donnée existante n'est modifiée : deux colonnes ajoutées avec leur valeur par défaut (false).
-- Rejouable : add column if not exists, create or replace, drop ... if exists puis recréation.
begin;

-- =====================================================================
-- A. Module Transactions
-- =====================================================================

alter table public.app_settings
  add column if not exists modules_transactions_visible boolean not null default false;

comment on column public.app_settings.modules_transactions_visible is
  'Mise en service : false = onglet, pages et chiffres issus des transactions réservés à l''admin.';

-- Seul un admin ouvre ou ferme le module, quelles que soient les règles RLS de app_settings
-- (opérations serveur et éditeur SQL non concernés).
create or replace function public.protect_app_settings_modules()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.modules_transactions_visible := false;
  elsif new.modules_transactions_visible is distinct from old.modules_transactions_visible then
    raise exception 'Seul un administrateur peut ouvrir ou fermer un module';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_app_settings_modules on public.app_settings;
create trigger protect_app_settings_modules
  before insert or update on public.app_settings
  for each row execute function public.protect_app_settings_modules();

-- =====================================================================
-- B. Rémunération : visible par le commercial
-- =====================================================================

alter table public.profiles
  add column if not exists compensation_visible boolean not null default false;

comment on column public.profiles.compensation_visible is
  'Mise en service : true = le commercial (et son manager) voit sa page Rémunération. Admin uniquement.';

-- La colonne n'est pas ajoutée au droit SELECT des rôles clients (droits par colonne posés le 04/11) :
-- elle se lit par public.compensation_settings().

-- Ouverture impossible tant que les réglages sont incomplets
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_compensation_visible_check'
                 and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_compensation_visible_check check (
      not compensation_visible
      or (compensation_type is not null and rate_entree is not null and rate_sortie is not null
          and opening_balance_date is not null)
    );
  end if;
end;
$$;

-- Réglages redevenus incomplets (type, taux ou date effacés) : la page se referme d'elle-même
create or replace function public.close_incomplete_compensation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.compensation_visible
     and (new.compensation_type is null or new.rate_entree is null or new.rate_sortie is null
          or new.opening_balance_date is null) then
    new.compensation_visible := false;
  end if;
  return new;
end;
$$;

drop trigger if exists close_incomplete_compensation on public.profiles;
create trigger close_incomplete_compensation
  before insert or update on public.profiles
  for each row execute function public.close_incomplete_compensation();

-- protect_profile_fields : identique au 04/11, plus compensation_visible réservé à l'admin
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
      new.compensation_type := null;
      new.rate_entree := null;
      new.rate_sortie := null;
      new.agent_vat_rate := 20;
      new.opening_balance := 0;
      new.opening_balance_date := null;
      new.compensation_visible := false;
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

  if (new.compensation_type is distinct from old.compensation_type
      or new.rate_entree is distinct from old.rate_entree
      or new.rate_sortie is distinct from old.rate_sortie
      or new.agent_vat_rate is distinct from old.agent_vat_rate
      or new.opening_balance is distinct from old.opening_balance
      or new.opening_balance_date is distinct from old.opening_balance_date
      or new.compensation_visible is distinct from old.compensation_visible)
     and not public.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut modifier les réglages de rémunération';
  end if;

  return new;
end;
$$;

-- Rémunération d'un utilisateur lisible : tout pour l'admin ; soi-même ou son équipe (manager)
-- seulement si la rémunération de ce commercial est ouverte.
create or replace function public.can_read_compensation(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user is not null and auth.uid() is not null and (
    public.is_admin(auth.uid())
    or (
      (p_user = auth.uid() or public.is_manager_of(auth.uid(), p_user))
      and exists (select 1 from public.profiles p where p.id = p_user and p.compensation_visible)
    )
  )
$$;

revoke all on function public.can_read_compensation(uuid) from public, anon;
grant execute on function public.can_read_compensation(uuid) to authenticated;

-- compensation_settings() renvoie aussi compensation_visible. Type de retour élargi : suppression
-- préalable (la vue compensation_balances en dépend), puis recréation à l'identique du 04/11.
drop view if exists public.compensation_balances;
drop function if exists public.compensation_settings();

create function public.compensation_settings()
returns table (
  user_id uuid, compensation_type text, rate_entree numeric, rate_sortie numeric,
  agent_vat_rate numeric, opening_balance numeric, opening_balance_date date,
  email text, first_name text, last_name text, is_active boolean, compensation_visible boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.compensation_type, p.rate_entree, p.rate_sortie,
         p.agent_vat_rate, p.opening_balance, p.opening_balance_date,
         p.email::text, p.first_name::text, p.last_name::text, coalesce(p.is_active, true),
         p.compensation_visible
  from public.profiles p
  where public.can_read_compensation(p.id)
$$;

revoke all on function public.compensation_settings() from public, anon;
grant execute on function public.compensation_settings() to authenticated;

create view public.compensation_balances
with (security_invoker = true) as
select
  s.user_id,
  s.compensation_type,
  s.opening_balance,
  s.opening_balance_date,
  coalesce(c.total, 0) as commissions_due,
  coalesce(p.total, 0) as imputed_paid,
  round(coalesce(s.opening_balance, 0) + coalesce(c.total, 0) - coalesce(p.total, 0), 2) as balance
from public.compensation_settings() s
left join lateral (
  select sum(e.amount_due) as total from public.commission_entries e where e.user_id = s.user_id
) c on true
left join lateral (
  select sum(pm.imputed_amount) as total from public.payments pm
  where pm.user_id = s.user_id
    and (s.opening_balance_date is null or pm.paid_at >= s.opening_balance_date)
) p on true;

grant select on public.compensation_balances to authenticated;

-- Admin : ouvrir ou fermer la page Rémunération d'un commercial
create or replace function public.set_compensation_visible(p_user_id uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Réservé aux administrateurs';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable';
  end if;

  if coalesce(p_visible, false)
     and (v_profile.compensation_type is null or v_profile.rate_entree is null
          or v_profile.rate_sortie is null or v_profile.opening_balance_date is null) then
    raise exception 'Renseignez d''abord le type, les taux entrée et sortie et la date d''ouverture';
  end if;

  update public.profiles set compensation_visible = coalesce(p_visible, false) where id = p_user_id;
end;
$$;

revoke all on function public.set_compensation_visible(uuid, boolean) from public, anon;
grant execute on function public.set_compensation_visible(uuid, boolean) to authenticated;

-- Factures : un agent ne dépose une facture que si sa rémunération est ouverte
drop policy if exists "invoices insert" on public.invoices;
create policy "invoices insert" on public.invoices
  for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or (user_id = auth.uid()
        and public.can_read_compensation(auth.uid())
        and public.compensation_type_of(auth.uid()) in ('agent_micro', 'agent_tva'))
  );

-- Fichiers de factures : dossier {user_id} lisible selon la même règle que la rémunération
create or replace function public.can_read_invoice_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and (
    public.is_admin(auth.uid())
    or (
      p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_read_compensation(p_folder::uuid)
    )
  )
$$;

revoke all on function public.can_read_invoice_folder(text) from public, anon;
grant execute on function public.can_read_invoice_folder(text) to authenticated;

drop policy if exists "invoices files insert" on storage.objects;
create policy "invoices files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and (
      public.is_admin(auth.uid())
      or ((storage.foldername(name))[1] = auth.uid()::text and public.can_read_compensation(auth.uid()))
    )
  );

commit;
