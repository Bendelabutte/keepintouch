-- 2026-11-15 : v4 lot D — agences et message de remerciement après découverte.
--   agencies        : agences (nom, lien d'avis Google, adresse, téléphone), archivables.
--                     Prévue pour recevoir plus tard une colonne organization_id (multi-clients) :
--                     aucune contrainte d'unicité globale sur le nom, clé primaire uuid.
--   agency_members  : appartenance d'un utilisateur à une ou plusieurs agences.
--   client_outreach : journal des remerciements (canal, modèle, statut). Ne stocke jamais le texte.
--   Les équipes existantes (profiles.team_id, manager_assignments) ne sont pas des agences.
-- Rejouable : create table if not exists, add constraint protégé, create or replace, drop policy if exists.
begin;

-- =====================================================================
-- 1. Utilisateur actif (lecture des agences)
-- =====================================================================

create or replace function public.is_active_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select uid is not null and coalesce(
    (select p.is_active from public.profiles p where p.id = uid),
    false
  )
$$;

revoke all on function public.is_active_user(uuid) from public, anon;
grant execute on function public.is_active_user(uuid) to authenticated;

-- =====================================================================
-- 2. Agences
-- =====================================================================

create table if not exists public.agencies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  google_review_url text,
  address           text,
  phone             text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agencies_name_not_blank') then
    alter table public.agencies add constraint agencies_name_not_blank check (btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agencies_google_review_url_https') then
    alter table public.agencies add constraint agencies_google_review_url_https
      check (google_review_url is null or google_review_url ~ '^https://\S+$');
  end if;
end;
$$;

create or replace function public.touch_agency()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_agency on public.agencies;
create trigger touch_agency
  before update on public.agencies
  for each row execute function public.touch_agency();

alter table public.agencies enable row level security;

drop policy if exists "agencies read" on public.agencies;
drop policy if exists "agencies admin insert" on public.agencies;
drop policy if exists "agencies admin update" on public.agencies;
drop policy if exists "agencies admin delete" on public.agencies;

create policy "agencies read" on public.agencies
  for select to authenticated
  using (public.is_active_user(auth.uid()));

create policy "agencies admin insert" on public.agencies
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy "agencies admin update" on public.agencies
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "agencies admin delete" on public.agencies
  for delete to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.agencies from anon;
grant select, insert, update, delete on table public.agencies to authenticated;

-- =====================================================================
-- 3. Membres des agences
-- =====================================================================

create table if not exists public.agency_members (
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create index if not exists agency_members_user_idx on public.agency_members (user_id);

alter table public.agency_members enable row level security;

drop policy if exists "agency members read" on public.agency_members;
drop policy if exists "agency members admin insert" on public.agency_members;
drop policy if exists "agency members admin delete" on public.agency_members;

create policy "agency members read" on public.agency_members
  for select to authenticated
  using (public.is_active_user(auth.uid()));

create policy "agency members admin insert" on public.agency_members
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy "agency members admin delete" on public.agency_members
  for delete to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.agency_members from anon;
grant select, insert, delete on table public.agency_members to authenticated;

-- =====================================================================
-- 4. Journal des remerciements (aucun texte de message)
-- =====================================================================

create table if not exists public.client_outreach (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  agency_id  uuid references public.agencies(id) on delete set null,
  channel    text not null,
  template   text not null,
  status     text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_outreach_channel_check') then
    alter table public.client_outreach add constraint client_outreach_channel_check
      check (channel in ('whatsapp', 'sms', 'email', 'email_app'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_outreach_template_check') then
    alter table public.client_outreach add constraint client_outreach_template_check
      check (template in ('acquereur', 'vendeur_estimation'));
  end if;
  -- 'prepare' : WhatsApp, SMS, messagerie (email) ; 'envoye' / 'echec' : email envoyé par l'application
  if not exists (select 1 from pg_constraint where conname = 'client_outreach_status_check') then
    alter table public.client_outreach add constraint client_outreach_status_check
      check (
        (channel in ('whatsapp', 'sms', 'email') and status = 'prepare')
        or (channel = 'email_app' and status in ('envoye', 'echec'))
      );
  end if;
end;
$$;

create index if not exists client_outreach_client_idx on public.client_outreach (client_id, created_at desc);
create index if not exists client_outreach_user_channel_idx on public.client_outreach (user_id, channel, created_at desc);

alter table public.client_outreach enable row level security;

drop policy if exists "outreach read" on public.client_outreach;
drop policy if exists "outreach insert" on public.client_outreach;

-- Même règle que client_comments : visible si le client l'est pour l'utilisateur (RLS de clients)
create policy "outreach read" on public.client_outreach
  for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_outreach.client_id));

-- L'email envoyé par l'application (email_app) n'est journalisé que par la fonction
-- send-client-message (service_role) : un utilisateur ne peut pas déclarer un envoi.
create policy "outreach insert" on public.client_outreach
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and channel <> 'email_app'
    and public.is_active_user(auth.uid())
    and exists (select 1 from public.clients c where c.id = client_outreach.client_id)
  );

-- Pas de modification ni de suppression : aucune règle UPDATE / DELETE, droits retirés
revoke all on table public.client_outreach from anon;
revoke update, delete, truncate on table public.client_outreach from authenticated;
grant select, insert on table public.client_outreach to authenticated;

comment on table public.client_outreach is
  'Remerciements client : canal, modèle et statut seulement. Le texte du message n''est jamais stocké.';

commit;
