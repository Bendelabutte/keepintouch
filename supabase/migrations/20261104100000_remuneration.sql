-- 2026-11-04 : Module Rémunération (commissions, salaires, factures des agents, soldes).
--   A. Réglages par commercial sur profiles (admin uniquement ; lisibles par l'intéressé, son manager, l'admin)
--   B. commission_entries calculées par la base dès qu'une transaction est encaissée (taux figés)
--   C. payments : salaires et paiements de factures ; seule la part imputée diminue le solde
--   D. invoices + bucket privé « invoices »
--   E. Vue compensation_balances (security_invoker)
--   F. Verrouillage des ventes actées (admin uniquement), en RLS et par triggers
-- Rejouable : add column if not exists, create table if not exists, create or replace,
-- drop ... if exists, insert ... on conflict.
begin;

-- =====================================================================
-- A. Réglages de rémunération sur profiles
-- =====================================================================

alter table public.profiles
  add column if not exists compensation_type    text,
  add column if not exists rate_entree          numeric,
  add column if not exists rate_sortie          numeric,
  add column if not exists agent_vat_rate       numeric not null default 20,
  add column if not exists opening_balance      numeric not null default 0,
  add column if not exists opening_balance_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_compensation_check'
                 and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_compensation_check check (
      (compensation_type is null or compensation_type in ('salarie', 'agent_micro', 'agent_tva'))
      and (rate_entree is null or (rate_entree >= 0 and rate_entree <= 100))
      and (rate_sortie is null or (rate_sortie >= 0 and rate_sortie <= 100))
      and agent_vat_rate >= 0 and agent_vat_rate <= 100
    );
  end if;
end;
$$;

-- Lecture : les règles SELECT de profiles diffèrent selon les bases (PROD : soi-même + admin ;
-- DEV : aussi l'équipe et le manager). Quelle que soit la règle, les colonnes de rémunération sont
-- retirées du droit SELECT des rôles clients (ce droit s'applique avant les règles RLS) et exposées
-- par public.compensation_settings() (soi-même, son équipe pour un manager, tout pour l'admin).
-- Aucune règle RLS de profiles n'est créée, modifiée ou supposée par cette migration.
-- ATTENTION : une future colonne de profiles devra être ajoutée à ce GRANT (rejouer ce bloc suffit).
do $$
declare
  v_cols text;
  v_role text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('compensation_type', 'rate_entree', 'rate_sortie', 'agent_vat_rate',
                            'opening_balance', 'opening_balance_date');

  foreach v_role in array array['authenticated', 'anon'] loop
    if has_table_privilege(v_role, 'public.profiles', 'select')
       or has_any_column_privilege(v_role, 'public.profiles', 'select') then
      execute format('revoke select on public.profiles from %I', v_role);
      execute format('grant select (%s) on public.profiles to %I', v_cols, v_role);
    end if;
  end loop;
end;
$$;

-- protect_profile_fields : + réglages de rémunération réservés à l'admin
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
      or new.opening_balance_date is distinct from old.opening_balance_date)
     and not public.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut modifier les réglages de rémunération';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Rémunération d'un utilisateur visible : soi-même, son équipe (manager), tout (admin)
create or replace function public.can_read_compensation(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user is not null and auth.uid() is not null and (
    p_user = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_manager_of(auth.uid(), p_user)
  )
$$;

revoke all on function public.can_read_compensation(uuid) from public, anon;
grant execute on function public.can_read_compensation(uuid) to authenticated;

-- Renvoie aussi nom, email et statut : en PROD, un manager ne lit pas les profils de son équipe.
-- Type de retour élargi : suppression préalable (la vue compensation_balances en dépend).
drop view if exists public.compensation_balances;
drop function if exists public.compensation_settings();

create function public.compensation_settings()
returns table (
  user_id uuid, compensation_type text, rate_entree numeric, rate_sortie numeric,
  agent_vat_rate numeric, opening_balance numeric, opening_balance_date date,
  email text, first_name text, last_name text, is_active boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.compensation_type, p.rate_entree, p.rate_sortie,
         p.agent_vat_rate, p.opening_balance, p.opening_balance_date,
         p.email::text, p.first_name::text, p.last_name::text, coalesce(p.is_active, true)
  from public.profiles p
  where public.can_read_compensation(p.id)
$$;

revoke all on function public.compensation_settings() from public, anon;
grant execute on function public.compensation_settings() to authenticated;

-- Type de rémunération d'un utilisateur (politiques RLS : la colonne n'est pas lisible directement)
create or replace function public.compensation_type_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.compensation_type from public.profiles p where p.id = p_user
$$;

revoke all on function public.compensation_type_of(uuid) from public, anon;
grant execute on function public.compensation_type_of(uuid) to authenticated;

-- =====================================================================
-- B. Commissions
-- =====================================================================

alter table public.transaction_participants add column if not exists rate_override numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transaction_participants_rate_override_check'
                 and conrelid = 'public.transaction_participants'::regclass) then
    alter table public.transaction_participants add constraint transaction_participants_rate_override_check
      check (rate_override is null or (rate_override >= 0 and rate_override <= 100));
  end if;
end;
$$;

-- Taux exceptionnel : admin uniquement (opérations serveur et fonctions SECURITY DEFINER non concernées)
create or replace function public.protect_participant_rate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.rate_override := null;
  elsif new.rate_override is distinct from old.rate_override then
    raise exception 'Seul un administrateur peut fixer un taux exceptionnel';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_participant_rate on public.transaction_participants;
create trigger protect_participant_rate
  before insert or update on public.transaction_participants
  for each row execute function public.protect_participant_rate();

create table if not exists public.commission_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete restrict,
  transaction_id    uuid not null references public.transactions(id) on delete cascade,
  participant_id    uuid not null unique references public.transaction_participants(id) on delete cascade,
  side              text not null check (side in ('entree', 'sortie')),
  base_ht           numeric not null,   -- base nette HT × share_pct / 100
  rate              numeric not null check (rate >= 0 and rate <= 100),   -- figé
  amount_ht         numeric not null,
  vat_rate          numeric not null default 0,   -- 0 pour micro et salarié
  amount_due        numeric not null,   -- HT + TVA (agent_tva) ; sinon HT (salaire brut pour un salarié)
  compensation_type text not null check (compensation_type in ('salarie', 'agent_micro', 'agent_tva')),   -- figé
  earned_at         date not null,      -- date de l'acte (ou du bail)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists commission_entries_user_idx on public.commission_entries (user_id, earned_at);
create index if not exists commission_entries_tx_idx on public.commission_entries (transaction_id);

alter table public.commission_entries enable row level security;

drop policy if exists "commission entries read" on public.commission_entries;
create policy "commission entries read" on public.commission_entries
  for select to authenticated
  using (public.can_read_compensation(user_id));
-- Aucune politique d'écriture : seules les fonctions de la base écrivent dans cette table.

-- Recalcul des commissions d'une transaction (fonction interne).
--   Transaction non encaissée (promesse, annulée) → aucune ligne.
--   Encaissée → une ligne par participant, si son type et son taux sont connus et que la date de
--   l'acte n'est pas antérieure à sa date d'ouverture.
--   Taux, type et TVA sont figés à la création de la ligne ; les montants suivent les honoraires,
--   déductions et parts. p_reprice : reprendre les taux actuels (recalcul explicite par l'admin),
--   pour tous les participants ou seulement p_only_participant / p_only_user.
--   Un taux exceptionnel (rate_override) l'emporte toujours.
create or replace function public.refresh_commissions(
  p_tx uuid, p_reprice boolean default false, p_only_participant uuid default null, p_only_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx     public.transactions;
  v_net    numeric;
  v_earned date;
  r        record;
  v_old    public.commission_entries;
  v_has    boolean;
  v_rate   numeric;
  v_type   text;
  v_vat    numeric;
  v_base   numeric;
  v_ht     numeric;
begin
  select * into v_tx from public.transactions where id = p_tx;
  if not found or v_tx.status not in ('cashed', 'signed') then
    delete from public.commission_entries where transaction_id = p_tx;
    return;
  end if;

  v_earned := coalesce(v_tx.deed_date, v_tx.fees_received_at, v_tx.created_at::date);
  v_net := coalesce(v_tx.fees_ht, 0)
    - coalesce((select sum(d.amount_ht) from public.transaction_deductions d where d.transaction_id = p_tx), 0);

  for r in
    select tp.id, tp.user_id, tp.side, tp.share_pct, tp.rate_override,
           pr.compensation_type, pr.rate_entree, pr.rate_sortie, pr.agent_vat_rate, pr.opening_balance_date
    from public.transaction_participants tp
    join public.profiles pr on pr.id = tp.user_id
    where tp.transaction_id = p_tx
  loop
    if r.opening_balance_date is not null and v_earned < r.opening_balance_date then
      delete from public.commission_entries where participant_id = r.id;
      continue;
    end if;

    select * into v_old from public.commission_entries where participant_id = r.id;
    v_has := found;

    if v_has and not (
      p_reprice
      and (p_only_participant is null or p_only_participant = r.id)
      and (p_only_user is null or p_only_user = r.user_id)
    ) then
      v_type := v_old.compensation_type;
      v_rate := coalesce(r.rate_override, v_old.rate);
      v_vat  := v_old.vat_rate;
    else
      v_type := r.compensation_type;
      v_rate := coalesce(r.rate_override, case r.side when 'entree' then r.rate_entree else r.rate_sortie end);
      v_vat  := case when r.compensation_type = 'agent_tva' then coalesce(r.agent_vat_rate, 20) else 0 end;
    end if;

    if v_type is null or v_rate is null then
      delete from public.commission_entries where participant_id = r.id;
      continue;
    end if;

    v_base := round(v_net * r.share_pct / 100, 2);
    v_ht   := round(v_base * v_rate / 100, 2);

    insert into public.commission_entries (
      user_id, transaction_id, participant_id, side, base_ht, rate, amount_ht, vat_rate, amount_due,
      compensation_type, earned_at
    ) values (
      r.user_id, p_tx, r.id, r.side, v_base, v_rate, v_ht, v_vat, round(v_ht * (1 + v_vat / 100), 2),
      v_type, v_earned
    )
    on conflict (participant_id) do update set
      user_id           = excluded.user_id,
      side              = excluded.side,
      base_ht           = excluded.base_ht,
      rate              = excluded.rate,
      amount_ht         = excluded.amount_ht,
      vat_rate          = excluded.vat_rate,
      amount_due        = excluded.amount_due,
      compensation_type = excluded.compensation_type,
      earned_at         = excluded.earned_at,
      updated_at        = now();
  end loop;
end;
$$;

revoke all on function public.refresh_commissions(uuid, boolean, uuid, uuid) from public, anon, authenticated;

-- Triggers : toute écriture sur une transaction, ses participants ou ses déductions recalcule ses
-- commissions (taux figés). Chaque écriture recalcule tout : la dernière voit l'état final.
create or replace function public.on_transaction_commissions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'transactions' then
    perform public.refresh_commissions(new.id);
  else
    perform public.refresh_commissions(coalesce(new.transaction_id, old.transaction_id));
  end if;
  return null;
end;
$$;

drop trigger if exists on_transaction_commissions on public.transactions;
create trigger on_transaction_commissions
  after insert or update on public.transactions
  for each row execute function public.on_transaction_commissions();

drop trigger if exists on_participant_commissions on public.transaction_participants;
create trigger on_participant_commissions
  after insert or update or delete on public.transaction_participants
  for each row execute function public.on_transaction_commissions();

drop trigger if exists on_deduction_commissions on public.transaction_deductions;
create trigger on_deduction_commissions
  after insert or update or delete on public.transaction_deductions
  for each row execute function public.on_transaction_commissions();

-- Admin : recalcul explicite d'une transaction aux taux actuels des commerciaux
create or replace function public.recalculate_transaction_commissions(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Réservé aux administrateurs';
  end if;
  perform public.refresh_commissions(p_tx, true);
end;
$$;

revoke all on function public.recalculate_transaction_commissions(uuid) from public, anon;
grant execute on function public.recalculate_transaction_commissions(uuid) to authenticated;

-- Admin : taux exceptionnel d'un participant (null = taux du profil), appliqué immédiatement
create or replace function public.set_participant_rate(p_participant_id uuid, p_rate numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Réservé aux administrateurs';
  end if;
  update public.transaction_participants set rate_override = p_rate
   where id = p_participant_id
  returning transaction_id into v_tx;
  if v_tx is null then
    raise exception 'Participant introuvable';
  end if;
  perform public.refresh_commissions(v_tx, true, p_participant_id);
end;
$$;

revoke all on function public.set_participant_rate(uuid, numeric) from public, anon;
grant execute on function public.set_participant_rate(uuid, numeric) to authenticated;

-- Admin : réglages d'un commercial. Les commissions manquantes sont générées aux nouveaux taux,
-- celles antérieures à la date d'ouverture retirées ; les commissions existantes gardent leur taux
-- sauf si p_reprice (recalcul explicite).
create or replace function public.save_compensation_settings(
  p_user_id uuid,
  p_compensation_type text,
  p_rate_entree numeric,
  p_rate_sortie numeric,
  p_agent_vat_rate numeric,
  p_opening_balance numeric,
  p_opening_balance_date date,
  p_reprice boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Réservé aux administrateurs';
  end if;

  update public.profiles set
    compensation_type    = nullif(p_compensation_type, ''),
    rate_entree          = p_rate_entree,
    rate_sortie          = p_rate_sortie,
    agent_vat_rate       = coalesce(p_agent_vat_rate, 20),
    opening_balance      = coalesce(p_opening_balance, 0),
    opening_balance_date = p_opening_balance_date
  where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable';
  end if;

  for v_tx in
    select distinct tp.transaction_id
    from public.transaction_participants tp
    join public.transactions t on t.id = tp.transaction_id
    where tp.user_id = p_user_id and t.status in ('cashed', 'signed')
  loop
    perform public.refresh_commissions(v_tx, p_reprice, null, p_user_id);
  end loop;
end;
$$;

revoke all on function public.save_compensation_settings(uuid, text, numeric, numeric, numeric, numeric, date, boolean)
  from public, anon;
grant execute on function public.save_compensation_settings(uuid, text, numeric, numeric, numeric, numeric, date, boolean)
  to authenticated;

-- =====================================================================
-- D. Factures des agents (avant payments, qui y fait référence)
-- =====================================================================

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete restrict,
  number      text not null check (btrim(number) <> ''),
  issued_at   date not null,
  amount_ht   numeric not null check (amount_ht >= 0),
  vat_rate    numeric not null default 0 check (vat_rate >= 0 and vat_rate <= 100),
  amount_ttc  numeric generated always as (round(amount_ht * (1 + vat_rate / 100), 2)) stored,
  file_path   text,
  note        text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists invoices_user_idx on public.invoices (user_id, issued_at);

alter table public.invoices enable row level security;

drop policy if exists "invoices read" on public.invoices;
create policy "invoices read" on public.invoices
  for select to authenticated
  using (public.can_read_compensation(user_id));

-- Un agent dépose ses propres factures ; l'admin pour tout le monde
drop policy if exists "invoices insert" on public.invoices;
create policy "invoices insert" on public.invoices
  for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or (user_id = auth.uid() and public.compensation_type_of(auth.uid()) in ('agent_micro', 'agent_tva'))
  );

drop policy if exists "invoices update" on public.invoices;
create policy "invoices update" on public.invoices
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =====================================================================
-- C. Salaires et paiements
-- =====================================================================

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete restrict,
  kind           text not null check (kind in ('salary', 'invoice_payment')),
  paid_at        date not null,
  period_month   date,   -- salaire : premier jour du mois
  amount         numeric not null check (amount >= 0),   -- brut total (salaire) ou montant viré
  fixed_part     numeric not null default 0 check (fixed_part >= 0),
  bonus_part     numeric not null default 0 check (bonus_part >= 0),
  imputed_amount numeric generated always as (amount - fixed_part - bonus_part) stored,
  invoice_id     uuid references public.invoices(id) on delete restrict,
  note           text,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint payments_parts_check check (fixed_part + bonus_part <= amount),
  constraint payments_salary_check check (
    (kind = 'salary' and period_month is not null and invoice_id is null)
    or (kind = 'invoice_payment' and fixed_part = 0 and bonus_part = 0)
  )
);

create index if not exists payments_user_idx on public.payments (user_id, paid_at);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

-- Mois du salaire ramené au 1er ; facture payée = facture du même commercial
create or replace function public.check_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.period_month is not null then
    new.period_month := date_trunc('month', new.period_month)::date;
  end if;
  if new.invoice_id is not null
     and not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.user_id = new.user_id) then
    raise exception 'La facture ne correspond pas à ce commercial';
  end if;
  return new;
end;
$$;

drop trigger if exists check_payment on public.payments;
create trigger check_payment
  before insert or update on public.payments
  for each row execute function public.check_payment();

alter table public.payments enable row level security;

drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments
  for select to authenticated
  using (public.can_read_compensation(user_id));

drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write" on public.payments
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Facture supprimable par l'admin, ou par son agent tant qu'aucun paiement n'y est rattaché
drop policy if exists "invoices delete" on public.invoices;
create policy "invoices delete" on public.invoices
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (user_id = auth.uid() and not exists (select 1 from public.payments p where p.invoice_id = invoices.id))
  );

-- =====================================================================
-- D bis. Stockage des factures : bucket privé « invoices », chemin {user_id}/{fichier}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices', 'invoices', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dossier {user_id} lisible par l'intéressé, son manager et l'admin
create or replace function public.can_read_invoice_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and (
    p_folder = auth.uid()::text
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.manager_assignments ma
      where ma.manager_id = auth.uid() and ma.user_id::text = p_folder
    )
  )
$$;

revoke all on function public.can_read_invoice_folder(text) from public, anon;
grant execute on function public.can_read_invoice_folder(text) to authenticated;

drop policy if exists "invoices files read" on storage.objects;
create policy "invoices files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and public.can_read_invoice_folder((storage.foldername(name))[1]));

drop policy if exists "invoices files insert" on storage.objects;
create policy "invoices files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

-- Suppression : admin, ou l'agent dans son dossier (fichier d'un dépôt qui n'a pas abouti)
drop policy if exists "invoices files delete" on storage.objects;
create policy "invoices files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'invoices'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

-- =====================================================================
-- E. Solde par commercial : ouverture + commissions dues − parts imputées (depuis l'ouverture)
-- =====================================================================

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
grant select on public.commission_entries, public.payments, public.invoices to authenticated;
grant insert, update, delete on public.payments, public.invoices to authenticated;

-- =====================================================================
-- F. Verrouillage des ventes actées : une transaction cashed (ou « signed », reprise historique)
--    n'est modifiable que par un admin, validée ou non : transaction, participants, déductions
--    (et, par can_edit_property, son bien). Une promesse (in_progress) reste modifiable par le
--    créateur et les participants tant qu'elle n'est pas validée. « Acte signé » et
--    « Promesse annulée » restent possibles sur une promesse.
--    Deux niveaux : règles RLS (via can_edit_transaction) et triggers, qui s'appliquent aussi
--    aux fonctions SECURITY DEFINER exécutées pour un non-admin (auth.uid() renseigné).
-- =====================================================================

-- Transactions passées à l'acte pendant l'opération en cours (acte signé, saisie d'une vente déjà
-- actée) : leurs participants, déductions et fiches liées restent modifiables jusqu'à la fin de
-- cette opération. Liste locale à la transaction SQL, alimentée uniquement par le trigger
-- protect_acted_transaction (set_config n'est pas exposé par l'API).
create or replace function public.transaction_acted_now(p_tx uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_tx is not null and p_tx::text = any (
    string_to_array(coalesce(current_setting('kit.tx_acted_now', true), ''), ',')
  )
$$;

-- Statut verrouillé pour un non-admin
create or replace function public.transaction_status_locked(p_status text, p_tx uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(p_status in ('cashed', 'signed'), false) and not public.transaction_acted_now(p_tx)
$$;

create or replace function public.transaction_locked(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.transactions t
    where t.id = p_tx and public.transaction_status_locked(t.status, t.id)
  )
$$;

revoke all on function public.transaction_acted_now(uuid) from public, anon;
revoke all on function public.transaction_status_locked(text, uuid) from public, anon;
revoke all on function public.transaction_locked(uuid) from public, anon;
grant execute on function public.transaction_acted_now(uuid) to authenticated;
grant execute on function public.transaction_status_locked(text, uuid) to authenticated;
grant execute on function public.transaction_locked(uuid) to authenticated;

-- Admin toujours ; créateur ou participant tant que la transaction n'est ni validée ni actée
create or replace function public.can_edit_transaction(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_admin(auth.uid()) or exists (
    select 1 from public.transactions t
    where t.id = p_tx
      and t.validated_at is null
      and not public.transaction_status_locked(t.status, t.id)
      and (t.created_by = auth.uid() or public.transaction_has_participant(t.id, auth.uid(), false))
  )
$$;

-- RLS transactions (participants et déductions passent par can_edit_transaction)
drop policy if exists "transactions update" on public.transactions;
create policy "transactions update" on public.transactions
  for update to authenticated
  using (
    public.is_admin(auth.uid())
    or (validated_at is null
        and not public.transaction_status_locked(status, id)
        and (created_by = auth.uid() or public.transaction_has_participant(id, auth.uid(), false)))
  )
  with check (
    public.is_admin(auth.uid())
    or (validated_at is null
        and (status not in ('cashed', 'signed') or public.transaction_acted_now(id))
        and (created_by = auth.uid() or public.transaction_has_participant(id, auth.uid(), false)))
  );

drop policy if exists "transactions delete" on public.transactions;
create policy "transactions delete" on public.transactions
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and validated_at is null and status not in ('cashed', 'signed'))
  );

-- Trigger transactions : mémorise le passage à l'acte, refuse toute autre écriture non-admin sur
-- une vente actée. Seule exception : la mise à null de seller_client_id / buyer_client_id par la
-- suppression d'une fiche client (clé étrangère on delete set null).
create or replace function public.protect_acted_transaction()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_skip text[] := array['updated_at', 'fees_ht', 'seller_client_id', 'buyer_client_id'];
begin
  if tg_op <> 'DELETE' and new.status in ('cashed', 'signed')
     and (tg_op = 'INSERT' or old.status not in ('cashed', 'signed')) then
    perform set_config(
      'kit.tx_acted_now',
      concat_ws(',', nullif(current_setting('kit.tx_acted_now', true), ''), new.id::text),
      true
    );
  end if;

  if tg_op = 'INSERT' or auth.uid() is null or public.is_admin(auth.uid())
     or not public.transaction_status_locked(old.status, old.id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - v_skip) = (to_jsonb(old) - v_skip)
     and (new.seller_client_id is null or new.seller_client_id = old.seller_client_id)
     and (new.buyer_client_id is null or new.buyer_client_id = old.buyer_client_id) then
    return new;
  end if;

  raise exception 'Vente actée : modification réservée à l''administrateur';
end;
$$;

drop trigger if exists protect_acted_transaction on public.transactions;
create trigger protect_acted_transaction
  before insert or update or delete on public.transactions
  for each row execute function public.protect_acted_transaction();

-- Trigger participants et déductions : aucune écriture non-admin sur une vente actée
create or replace function public.protect_acted_transaction_children()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid())
     and ((tg_op <> 'INSERT' and public.transaction_locked(old.transaction_id))
          or (tg_op <> 'DELETE' and public.transaction_locked(new.transaction_id))) then
    raise exception 'Vente actée : modification réservée à l''administrateur';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_acted_participants on public.transaction_participants;
create trigger protect_acted_participants
  before insert or update or delete on public.transaction_participants
  for each row execute function public.protect_acted_transaction_children();

drop trigger if exists protect_acted_deductions on public.transaction_deductions;
create trigger protect_acted_deductions
  before insert or update or delete on public.transaction_deductions
  for each row execute function public.protect_acted_transaction_children();

-- save_transaction : identique au 31/10, plus le message explicite sur une vente actée
-- (save_transaction_with_buyer l'appelle avant toute autre écriture)
create or replace function public.save_transaction(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_prop    jsonb := coalesce(p->'property', '{}'::jsonb);
  v_prop_id uuid := nullif(v_prop->>'id', '')::uuid;
  v_kind    text := p->>'kind';
  v_status  text := coalesce(nullif(p->>'status', ''), 'in_progress');
  v_sync    boolean := jsonb_typeof(p->'participants') = 'array';
  v_shares  numeric;
begin
  if v_kind not in ('sale', 'rental') then
    raise exception 'Type de transaction invalide';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Utiliser l''action « Annuler » pour annuler une transaction';
  end if;

  if (v_id is null or v_sync) and (not v_sync or jsonb_array_length(p->'participants') = 0) then
    raise exception 'Au moins un participant est requis';
  end if;

  if v_id is not null and not public.is_admin(auth.uid()) and public.transaction_locked(v_id) then
    raise exception 'Vente actée : modification réservée à l''administrateur';
  end if;

  if v_id is not null and not public.can_edit_transaction(v_id) then
    raise exception 'Transaction validée ou non modifiable : modification réservée aux administrateurs';
  end if;

  -- Bien
  if v_prop_id is null then
    insert into public.properties (address, postal_code, city, property_type, surface)
    values (
      nullif(btrim(v_prop->>'address'), ''),
      nullif(btrim(v_prop->>'postal_code'), ''),
      nullif(btrim(v_prop->>'city'), ''),
      nullif(v_prop->>'property_type', ''),
      nullif(v_prop->>'surface', '')::numeric
    )
    returning id into v_prop_id;
  else
    update public.properties set
      address       = nullif(btrim(v_prop->>'address'), ''),
      postal_code   = nullif(btrim(v_prop->>'postal_code'), ''),
      city          = nullif(btrim(v_prop->>'city'), ''),
      property_type = nullif(v_prop->>'property_type', ''),
      surface       = nullif(v_prop->>'surface', '')::numeric
    where id = v_prop_id;
    if not found then
      raise exception 'Bien introuvable ou non modifiable';
    end if;
  end if;

  -- Transaction
  if v_id is null then
    insert into public.transactions (
      kind, property_id, seller_client_id, seller_label, buyer_client_id, buyer_label,
      price, fees_ttc, vat_rate, status, preliminary_date, deed_date, move_in_date,
      fees_received_at, notes
    ) values (
      v_kind, v_prop_id,
      nullif(p->>'seller_client_id', '')::uuid, nullif(btrim(p->>'seller_label'), ''),
      nullif(p->>'buyer_client_id', '')::uuid, nullif(btrim(p->>'buyer_label'), ''),
      nullif(p->>'price', '')::numeric,
      nullif(p->>'fees_ttc', '')::numeric,
      coalesce(nullif(p->>'vat_rate', '')::numeric, 20),
      v_status,
      case when v_kind = 'sale' then nullif(p->>'preliminary_date', '')::date end,
      nullif(p->>'deed_date', '')::date,
      case when v_kind = 'rental' then nullif(p->>'move_in_date', '')::date end,
      nullif(p->>'fees_received_at', '')::date,
      nullif(btrim(p->>'notes'), '')
    )
    returning id into v_id;
  else
    update public.transactions set
      kind             = v_kind,
      property_id      = v_prop_id,
      seller_client_id = nullif(p->>'seller_client_id', '')::uuid,
      seller_label     = nullif(btrim(p->>'seller_label'), ''),
      buyer_client_id  = nullif(p->>'buyer_client_id', '')::uuid,
      buyer_label      = nullif(btrim(p->>'buyer_label'), ''),
      price            = nullif(p->>'price', '')::numeric,
      fees_ttc         = nullif(p->>'fees_ttc', '')::numeric,
      vat_rate         = coalesce(nullif(p->>'vat_rate', '')::numeric, 20),
      status           = v_status,
      preliminary_date = case when v_kind = 'sale' then nullif(p->>'preliminary_date', '')::date end,
      deed_date        = nullif(p->>'deed_date', '')::date,
      move_in_date     = case when v_kind = 'rental' then nullif(p->>'move_in_date', '')::date end,
      fees_received_at = nullif(p->>'fees_received_at', '')::date,
      notes            = nullif(btrim(p->>'notes'), '')
    where id = v_id and status <> 'cancelled';
    if not found then
      raise exception 'Transaction introuvable, annulée ou non modifiable';
    end if;
  end if;

  -- Participants : ajouts et mises à jour d'abord, suppressions en dernier
  if v_sync then
    insert into public.transaction_participants (transaction_id, user_id, side, share_pct)
    select v_id, (e->>'user_id')::uuid, e->>'side', (e->>'share_pct')::numeric
    from jsonb_array_elements(p->'participants') e
    on conflict (transaction_id, user_id, side) do update set share_pct = excluded.share_pct;

    delete from public.transaction_participants tp
    where tp.transaction_id = v_id
      and not exists (
        select 1 from jsonb_array_elements(p->'participants') e
        where (e->>'user_id')::uuid = tp.user_id and e->>'side' = tp.side
      );
  end if;

  v_shares := public.transaction_shares_total(v_id);
  if v_shares <> 100 then
    raise exception 'La somme des parts des participants doit faire 100 %% (actuellement % %%)', v_shares;
  end if;

  -- Déductions (si fournies) : nouvelles lignes insérées, lignes absentes supprimées
  if jsonb_typeof(p->'deductions') = 'array' then
    insert into public.transaction_deductions (transaction_id, label, beneficiary, amount_ht, reason)
    select v_id, btrim(e->>'label'), nullif(btrim(e->>'beneficiary'), ''),
           (e->>'amount_ht')::numeric, btrim(e->>'reason')
    from jsonb_array_elements(p->'deductions') e
    where nullif(e->>'id', '') is null;

    delete from public.transaction_deductions d
    where d.transaction_id = v_id
      and d.created_at < now()
      and not exists (
        select 1 from jsonb_array_elements(p->'deductions') e
        where nullif(e->>'id', '')::uuid = d.id
      );
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_transaction(jsonb) from public, anon;
grant execute on function public.save_transaction(jsonb) to authenticated;

-- cancel_transaction : identique au 03/11, plus le message explicite. « Promesse annulée » reste
-- possible ; l'annulation d'une vente actée est réservée à l'admin.
create or replace function public.cancel_transaction(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx public.transactions;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;

  select * into v_tx from public.transactions where id = p_id;
  if not found then
    raise exception 'Transaction introuvable';
  end if;
  if p_id is not null and not public.is_admin(auth.uid()) and public.transaction_locked(p_id) then
    raise exception 'Vente actée : modification réservée à l''administrateur';
  end if;

  if v_tx.status = 'cancelled' then
    raise exception 'Transaction déjà annulée';
  end if;

  update public.transactions
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id;
  if not found then
    raise exception 'Annulation refusée (transaction validée ou droits insuffisants)';
  end if;

  if v_tx.seller_client_id is not null
     and v_tx.status = 'in_progress'
     and not exists (
       select 1 from public.transactions t
       where t.seller_client_id = v_tx.seller_client_id and t.status = 'in_progress' and t.id <> p_id
     ) then
    insert into public.client_comments (client_id, body, author_id)
    select v_tx.seller_client_id, 'Promesse annulée : ' || btrim(p_reason) || '.', auth.uid()
    from public.clients c
    where c.id = v_tx.seller_client_id and c.deal_stage = 'sous_promesse' and c.status <> 'closed';

    -- Trigger : relance = aujourd'hui + délai vendeur (le commentaire ci-dessus suffit)
    perform set_config('kit.phase_action_comment', 'on', true);
    update public.clients set deal_stage = 'mandat'
     where id = v_tx.seller_client_id and deal_stage = 'sous_promesse' and status <> 'closed';
  end if;

  if v_tx.status = 'in_progress' then
    perform public.buyer_fiche_transition(p_id, 'cancel', null, null, p_reason);
  end if;
end;
$$;

revoke all on function public.cancel_transaction(uuid, text) from public, anon;
grant execute on function public.cancel_transaction(uuid, text) to authenticated;

-- Autres fonctions SECURITY DEFINER qui écrivent sur ces tables : set_participant_rate,
-- recalculate_transaction_commissions, save_compensation_settings et validate_transaction sont
-- réservées à l'admin ; buyer_fiche_transition passe par can_edit_transaction ; refresh_commissions
-- n'écrit que commission_entries ; le trigger de phase vendeur ne touche que les promesses.
-- Les triggers ci-dessus couvrent de toute façon tout appel non-admin.

commit;
