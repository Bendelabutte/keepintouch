-- 2026-10-29 : Module Transactions (ventes et locations)
-- Biens, transactions, participants (négociateurs), déductions avant commission,
-- RLS, validation admin, RPC d'enregistrement et reprise de l'historique clients.commission_ttc.
-- Rejouable : create ... if not exists, create or replace, drop ... if exists, reprise sans doublon.
begin;

-- =====================================================================
-- 1. Tables
-- =====================================================================

create table if not exists public.properties (
  id            uuid primary key default gen_random_uuid(),
  address       text,
  postal_code   text,
  city          text,
  property_type text check (property_type in ('appartement', 'maison', 'local', 'parking', 'terrain', 'autre')),
  surface       numeric check (surface is null or surface >= 0),
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('sale', 'rental')),
  property_id      uuid not null
                   constraint transactions_property_id_fkey references public.properties(id) on delete restrict,
  -- vendeur ou bailleur / acquéreur ou locataire : fiche client, ou libellé libre si pas de fiche
  seller_client_id uuid
                   constraint transactions_seller_client_id_fkey references public.clients(id) on delete set null,
  seller_label     text,
  buyer_client_id  uuid
                   constraint transactions_buyer_client_id_fkey references public.clients(id) on delete set null,
  buyer_label      text,
  -- prix de vente, ou loyer mensuel charges comprises pour une location
  price            numeric check (price is null or price >= 0),
  -- honoraires TTC de NOTRE agence (en cas de partage inter-agences : notre part uniquement)
  fees_ttc         numeric check (fees_ttc is null or fees_ttc >= 0),
  vat_rate         numeric not null default 20 check (vat_rate >= 0 and vat_rate <= 100),
  fees_ht          numeric generated always as (round(fees_ttc / (1 + vat_rate / 100), 2)) stored,
  status           text not null default 'in_progress'
                   check (status in ('in_progress', 'signed', 'cashed', 'cancelled')),
  preliminary_date date,   -- compromis ou promesse (vente uniquement)
  deed_date        date,   -- acte authentique, ou signature du bail
  move_in_date     date,   -- entrée dans les lieux (location uniquement)
  fees_received_at date,   -- encaissement réel des honoraires
  cancelled_at     timestamptz,
  cancel_reason    text,
  notes            text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  validated_at     timestamptz,
  validated_by     uuid references public.profiles(id) on delete set null,

  constraint transactions_preliminary_sale_only check (kind = 'sale' or preliminary_date is null),
  constraint transactions_move_in_rental_only check (kind = 'rental' or move_in_date is null),
  constraint transactions_cashed_has_date check (status <> 'cashed' or fees_received_at is not null),
  constraint transactions_cancel_reason check (
    status <> 'cancelled'
    or (cancelled_at is not null and nullif(btrim(cancel_reason), '') is not null)
  )
);

create table if not exists public.transaction_participants (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete restrict,
  side           text not null check (side in ('entree', 'sortie')),
  share_pct      numeric not null check (share_pct >= 0 and share_pct <= 100),
  constraint transaction_participants_unique unique (transaction_id, user_id, side)
);

create table if not exists public.transaction_deductions (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  label          text not null check (btrim(label) <> ''),
  beneficiary    text,
  amount_ht      numeric not null check (amount_ht > 0),
  reason         text not null check (btrim(reason) <> ''),
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists transactions_property_idx on public.transactions (property_id);
create index if not exists transactions_seller_idx on public.transactions (seller_client_id);
create index if not exists transactions_buyer_idx on public.transactions (buyer_client_id);
create index if not exists transactions_created_by_idx on public.transactions (created_by);
create index if not exists transactions_fees_received_idx on public.transactions (fees_received_at);
create index if not exists transactions_deed_idx on public.transactions (deed_date);
create index if not exists transaction_participants_tx_idx on public.transaction_participants (transaction_id);
create index if not exists transaction_participants_user_idx on public.transaction_participants (user_id);
create index if not exists transaction_deductions_tx_idx on public.transaction_deductions (transaction_id);

-- 6. Lien fiche après-vente → fiche vendeur d'origine
alter table public.clients
  add column if not exists source_client_id uuid references public.clients(id) on delete set null;
create index if not exists clients_source_client_idx on public.clients (source_client_id);

-- =====================================================================
-- 5. Vue des totaux (security_invoker : les RLS de l'appelant s'appliquent)
-- =====================================================================

create or replace view public.transaction_totals
with (security_invoker = true) as
select
  t.id                                          as transaction_id,
  t.fees_ht,
  coalesce(d.total_ht, 0)                       as deductions_ht,
  coalesce(t.fees_ht, 0) - coalesce(d.total_ht, 0) as net_fees_ht
from public.transactions t
left join (
  select transaction_id, sum(amount_ht) as total_ht
  from public.transaction_deductions
  group by transaction_id
) d on d.transaction_id = t.id;

-- =====================================================================
-- 7. Fonctions d'accès (SECURITY DEFINER : évitent la récursion RLS
--    transactions ↔ transaction_participants)
-- =====================================================================

create or replace function public.is_manager_of(p_manager uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_manager is not null and p_user is not null and exists (
    select 1 from public.manager_assignments ma
    where ma.manager_id = p_manager and ma.user_id = p_user
  )
$$;

-- p_include_managed : compte aussi les participations des commerciaux gérés par p_uid
create or replace function public.transaction_has_participant(p_tx uuid, p_uid uuid, p_include_managed boolean)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.transaction_participants tp
    where tp.transaction_id = p_tx
      and (tp.user_id = p_uid or (p_include_managed and public.is_manager_of(p_uid, tp.user_id)))
  )
$$;

create or replace function public.can_read_transaction(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.transactions t
    where t.id = p_tx
      and (
        public.is_admin(auth.uid())
        or t.created_by = auth.uid()
        or public.is_manager_of(auth.uid(), t.created_by)
        or public.transaction_has_participant(t.id, auth.uid(), true)
      )
  )
$$;

-- Admin toujours ; créateur ou participant tant que la transaction n'est pas validée
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
      and (t.created_by = auth.uid() or public.transaction_has_participant(t.id, auth.uid(), false))
  )
$$;

-- Bien modifiable : admin, lié à une transaction modifiable, ou créé par moi et pas encore lié
create or replace function public.can_edit_property(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_admin(auth.uid())
    or exists (
      select 1 from public.transactions t
      where t.property_id = p_property and public.can_edit_transaction(t.id)
    )
    or exists (
      select 1 from public.properties pr
      where pr.id = p_property
        and pr.created_by = auth.uid()
        and not exists (select 1 from public.transactions t where t.property_id = pr.id)
    )
$$;

revoke all on function public.is_manager_of(uuid, uuid) from public, anon;
revoke all on function public.transaction_has_participant(uuid, uuid, boolean) from public, anon;
revoke all on function public.can_read_transaction(uuid) from public, anon;
revoke all on function public.can_edit_transaction(uuid) from public, anon;
revoke all on function public.can_edit_property(uuid) from public, anon;
grant execute on function public.is_manager_of(uuid, uuid) to authenticated;
grant execute on function public.transaction_has_participant(uuid, uuid, boolean) to authenticated;
grant execute on function public.can_read_transaction(uuid) to authenticated;
grant execute on function public.can_edit_transaction(uuid) to authenticated;
grant execute on function public.can_edit_property(uuid) to authenticated;

-- =====================================================================
-- 7. Trigger : validated_at / validated_by réservés aux admins
--    (même modèle que protect_profile_fields : opérations serveur non concernées)
-- =====================================================================

create or replace function public.protect_transaction_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  -- Opérations serveur (service_role, postgres, fonctions SECURITY DEFINER) : pas de restriction
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.validated_at := null;
    new.validated_by := null;
    new.created_by := auth.uid();
    return new;
  end if;

  -- UPDATE
  if new.validated_at is distinct from old.validated_at
     or new.validated_by is distinct from old.validated_by then
    raise exception 'Seul un administrateur peut valider une transaction';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Le créateur d''une transaction ne peut pas être modifié';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_transaction_fields on public.transactions;
create trigger protect_transaction_fields
  before insert or update on public.transactions
  for each row execute function public.protect_transaction_fields();

-- =====================================================================
-- 7. RLS
-- =====================================================================

alter table public.properties enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_participants enable row level security;
alter table public.transaction_deductions enable row level security;

revoke all on public.properties, public.transactions,
  public.transaction_participants, public.transaction_deductions,
  public.transaction_totals from anon;
grant select, insert, update, delete on public.properties, public.transactions,
  public.transaction_participants, public.transaction_deductions to authenticated;
grant select on public.transaction_totals to authenticated;

-- transactions
-- (conditions écrites en ligne et non via can_read_transaction : la ligne qu'on vient
--  d'insérer doit être lisible par son créateur pour INSERT ... RETURNING)
drop policy if exists "transactions read" on public.transactions;
drop policy if exists "transactions insert" on public.transactions;
drop policy if exists "transactions update" on public.transactions;
drop policy if exists "transactions delete" on public.transactions;

create policy "transactions read" on public.transactions
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    or public.is_manager_of(auth.uid(), created_by)
    or public.transaction_has_participant(id, auth.uid(), true)
  );

create policy "transactions insert" on public.transactions
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "transactions update" on public.transactions
  for update to authenticated
  using (
    public.is_admin(auth.uid())
    or (validated_at is null
        and (created_by = auth.uid() or public.transaction_has_participant(id, auth.uid(), false)))
  )
  with check (
    public.is_admin(auth.uid())
    or (validated_at is null
        and (created_by = auth.uid() or public.transaction_has_participant(id, auth.uid(), false)))
  );

create policy "transactions delete" on public.transactions
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and validated_at is null)
  );

-- transaction_participants
drop policy if exists "participants read" on public.transaction_participants;
drop policy if exists "participants insert" on public.transaction_participants;
drop policy if exists "participants update" on public.transaction_participants;
drop policy if exists "participants delete" on public.transaction_participants;

create policy "participants read" on public.transaction_participants
  for select to authenticated
  using (public.can_read_transaction(transaction_id));

create policy "participants insert" on public.transaction_participants
  for insert to authenticated
  with check (public.can_edit_transaction(transaction_id));

create policy "participants update" on public.transaction_participants
  for update to authenticated
  using (public.can_edit_transaction(transaction_id))
  with check (public.can_edit_transaction(transaction_id));

create policy "participants delete" on public.transaction_participants
  for delete to authenticated
  using (public.can_edit_transaction(transaction_id));

-- transaction_deductions
drop policy if exists "deductions read" on public.transaction_deductions;
drop policy if exists "deductions insert" on public.transaction_deductions;
drop policy if exists "deductions update" on public.transaction_deductions;
drop policy if exists "deductions delete" on public.transaction_deductions;

create policy "deductions read" on public.transaction_deductions
  for select to authenticated
  using (public.can_read_transaction(transaction_id));

create policy "deductions insert" on public.transaction_deductions
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_transaction(transaction_id));

create policy "deductions update" on public.transaction_deductions
  for update to authenticated
  using (public.can_edit_transaction(transaction_id))
  with check (public.can_edit_transaction(transaction_id));

create policy "deductions delete" on public.transaction_deductions
  for delete to authenticated
  using (public.can_edit_transaction(transaction_id));

-- properties
drop policy if exists "properties read" on public.properties;
drop policy if exists "properties insert" on public.properties;
drop policy if exists "properties update" on public.properties;
drop policy if exists "properties delete" on public.properties;

create policy "properties read" on public.properties
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    -- sous-requête soumise aux RLS de transactions : bien lié à une transaction visible
    or exists (select 1 from public.transactions t where t.property_id = properties.id)
  );

create policy "properties insert" on public.properties
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "properties update" on public.properties
  for update to authenticated
  using (public.can_edit_property(id))
  with check (public.can_edit_property(id));

create policy "properties delete" on public.properties
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (created_by = auth.uid()
        and not exists (select 1 from public.transactions t where t.property_id = properties.id))
  );

-- =====================================================================
-- 7. RPC validate_transaction (admin uniquement)
-- =====================================================================

create or replace function public.validate_transaction(p_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx     public.transactions;
  v_shares numeric;
  v_ded    numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut valider une transaction' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions where id = p_id for update;
  if not found then
    raise exception 'Transaction introuvable';
  end if;

  if v_tx.validated_at is not null then
    raise exception 'Transaction déjà validée le %', to_char(v_tx.validated_at at time zone 'Europe/Paris', 'DD/MM/YYYY');
  end if;

  if v_tx.status = 'cancelled' then
    raise exception 'Une transaction annulée ne peut pas être validée';
  end if;

  if v_tx.fees_ht is null then
    raise exception 'Les honoraires TTC ne sont pas renseignés';
  end if;

  select coalesce(sum(share_pct), 0) into v_shares
  from public.transaction_participants where transaction_id = p_id;

  if v_shares <> 100 then
    raise exception 'La somme des parts des participants vaut % %% au lieu de 100 %%', v_shares;
  end if;

  select coalesce(sum(amount_ht), 0) into v_ded
  from public.transaction_deductions where transaction_id = p_id;

  if v_ded > v_tx.fees_ht then
    raise exception 'Les déductions (% € HT) dépassent les honoraires (% € HT)', v_ded, v_tx.fees_ht;
  end if;

  update public.transactions
     set validated_at = now(), validated_by = auth.uid()
   where id = p_id
  returning * into v_tx;

  return v_tx;
end;
$$;

revoke all on function public.validate_transaction(uuid) from public, anon;
grant execute on function public.validate_transaction(uuid) to authenticated;

-- =====================================================================
-- RPC save_transaction (SECURITY INVOKER : RLS appliquées, tout ou rien)
-- Crée ou met à jour bien + transaction, synchronise participants et déductions.
-- p = { id?, kind, property: {id?, address, postal_code, city, property_type, surface},
--       seller_client_id, seller_label, buyer_client_id, buyer_label, price, fees_ttc, vat_rate,
--       status, preliminary_date, deed_date, move_in_date, fees_received_at, notes,
--       participants: [{user_id, side, share_pct}],
--       deductions?: [{id?, label, beneficiary, amount_ht, reason}] }
-- =====================================================================

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
  v_shares  numeric;
begin
  if v_kind not in ('sale', 'rental') then
    raise exception 'Type de transaction invalide';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Utiliser l''action « Annuler » pour annuler une transaction';
  end if;

  if jsonb_typeof(p->'participants') is distinct from 'array'
     or jsonb_array_length(p->'participants') = 0 then
    raise exception 'Au moins un participant est requis';
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
  -- (un participant qui modifie la transaction garde ses droits jusqu'au bout)
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

  select coalesce(sum(share_pct), 0) into v_shares
  from public.transaction_participants where transaction_id = v_id;
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
      and d.created_at < now()   -- ne pas supprimer celles insérées ci-dessus
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

-- =====================================================================
-- RPC record_own_sale (SECURITY INVOKER) : flux « Vendu par moi », tout ou rien
-- 1. transaction (vendeur = fiche d'origine) ; 2. NOUVELLE fiche après-vente pour l'acquéreur ;
-- 3. clôture de la fiche vendeur (jamais transformée) ; 4. commentaires.
-- p_buyer = { first_name, last_name, email, phone, client_birthday, contact_origin,
--             consultant_feeling, context, next_due_date }
-- =====================================================================

create or replace function public.record_own_sale(p_seller_id uuid, p_transaction jsonb, p_buyer jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_seller    public.clients;
  v_tx        uuid;
  v_after     uuid;
  v_sale_date date;
  v_address   text;
begin
  select * into v_seller from public.clients where id = p_seller_id;
  if not found then
    raise exception 'Fiche vendeur introuvable';
  end if;
  if v_seller.category <> 'seller' then
    raise exception 'Seule une fiche vendeur peut être clôturée en « Vendu par moi »';
  end if;
  if v_seller.status = 'closed' then
    raise exception 'Cette fiche vendeur est déjà clôturée';
  end if;
  if nullif(btrim(p_buyer->>'last_name'), '') is null then
    raise exception 'Le nom de l''acquéreur est obligatoire';
  end if;
  if nullif(btrim(p_buyer->>'phone'), '') is null then
    raise exception 'Le téléphone de l''acquéreur est obligatoire';
  end if;
  if (p_transaction->>'kind') is distinct from 'sale' then
    raise exception '« Vendu par moi » crée une transaction de type vente';
  end if;

  v_tx := public.save_transaction(
    (p_transaction - 'id' - 'buyer_client_id' - 'buyer_label')
    || jsonb_build_object('seller_client_id', p_seller_id)
  );

  v_sale_date := coalesce(
    nullif(p_transaction->>'deed_date', '')::date,
    nullif(p_transaction->>'preliminary_date', '')::date,
    current_date
  );
  v_address := coalesce(
    nullif(btrim(p_transaction->'property'->>'address'), ''),
    v_seller.property_address
  );

  insert into public.clients (
    owner_id, category, status, first_name, last_name, email, phone,
    created_at, after_address, client_birthday, contact_origin, consultant_feeling, context,
    next_due_date, next_due_source, also_owner, source_client_id
  ) values (
    v_seller.owner_id, 'after', 'active',
    nullif(btrim(p_buyer->>'first_name'), ''), btrim(p_buyer->>'last_name'),
    nullif(btrim(p_buyer->>'email'), ''), btrim(p_buyer->>'phone'),
    v_sale_date, v_address,
    nullif(p_buyer->>'client_birthday', '')::date,
    nullif(btrim(p_buyer->>'contact_origin'), ''),
    nullif(btrim(p_buyer->>'consultant_feeling'), ''),
    nullif(btrim(p_buyer->>'context'), ''),
    nullif(p_buyer->>'next_due_date', '')::date, 'auto', false, p_seller_id
  )
  returning id into v_after;

  update public.transactions set buyer_client_id = v_after where id = v_tx;

  -- Clôture de la fiche vendeur (M2) ; mandat_at forcé s'il était vide (M6)
  update public.clients set
    status            = 'closed',
    closure_reason    = 'vendu_avec_nous',
    sale_result       = 'vendu_avec_nous',
    sale_completed_at = v_sale_date,
    sold_at           = v_sale_date,
    mandat_at         = coalesce(mandat_at, now()),
    closed_at         = now(),
    closed_by         = auth.uid(),
    next_due_date     = null,
    next_due_note     = null,
    next_due_source   = null,
    next_followup_at  = null
  where id = p_seller_id;
  if not found then
    raise exception 'Clôture de la fiche vendeur refusée (droits insuffisants ?)';
  end if;

  insert into public.client_comments (client_id, body, author_id) values
    (p_seller_id,
     'Vendu par moi le ' || to_char(v_sale_date, 'DD/MM/YYYY')
       || '. Fiche clôturée, transaction et fiche après-vente de l''acquéreur créées.',
     auth.uid()),
    (v_after,
     'Fiche après-vente créée suite à la vente du bien de '
       || coalesce(nullif(btrim(concat_ws(' ', v_seller.first_name, v_seller.last_name)), ''), 'la fiche vendeur')
       || ' le ' || to_char(v_sale_date, 'DD/MM/YYYY') || '.',
     auth.uid());

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', v_after);
end;
$$;

revoke all on function public.record_own_sale(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_own_sale(uuid, jsonb, jsonb) to authenticated;

-- =====================================================================
-- 8. Reprise de l'historique : clients.commission_ttc → transactions
-- Rejouable : marqueur [reprise-historique client:<id>] dans notes + contrôle d'existence.
-- Exécutée en tant que postgres : RLS et trigger de validation ne s'appliquent pas.
-- =====================================================================

do $$
declare
  c          record;
  v_prop     uuid;
  v_tx       uuid;
  v_received date;
begin
  for c in
    select cl.*
    from public.clients cl
    where cl.commission_ttc is not null
      and not exists (
        select 1 from public.transactions t
        where (t.buyer_client_id = cl.id and t.kind = 'sale')
           or t.notes like '%[reprise-historique client:' || cl.id::text || ']%'
      )
  loop
    v_received := c.commission_received_at::date;

    insert into public.properties (address, created_by)
    values (
      coalesce(nullif(btrim(c.property_address), ''), nullif(btrim(c.after_address), '')),
      c.owner_id
    )
    returning id into v_prop;

    insert into public.transactions (
      kind, property_id, buyer_client_id, fees_ttc, vat_rate, status,
      deed_date, fees_received_at, notes, created_by, validated_at
    ) values (
      'sale', v_prop, c.id, c.commission_ttc, coalesce(c.commission_vat_rate, 20),
      case when v_received is not null then 'cashed' else 'signed' end,
      coalesce(c.sale_completed_at::date, v_received), v_received,
      'Reprise de l''historique (commission de la fiche client) [reprise-historique client:' || c.id::text || ']',
      c.owner_id, now()
    )
    returning id into v_tx;

    if c.owner_id is not null then
      insert into public.transaction_participants (transaction_id, user_id, side, share_pct)
      values (v_tx, c.owner_id, 'entree', 50), (v_tx, c.owner_id, 'sortie', 50);
    end if;
  end loop;
end;
$$;

commit;
