-- 2026-11-08 : v4 — la VALIDATION par l'admin verrouille une transaction, plus l'acte signé.
--   Remplace la règle de la section F de 20261104 (vente actée réservée à l'admin) :
--   - non validée : le créateur et les participants la modifient (montants, prix, honoraires,
--     déductions, répartition), qu'elle soit sous promesse, actée ou louée ;
--   - validée : seul l'admin la modifie, l'annule ou la supprime ; l'admin peut tout, à tout moment.
--   Appliqué aux règles RLS, aux triggers et aux fonctions qui écrivent sur ces tables.
--   + seule une transaction actée ou louée (cashed / signed) peut être validée, jamais une promesse ;
--   + « Acte signé » : prix et honoraires TTC confirmés ou corrigés dans le même appel.
-- CA, commissions et soldes ne dépendent pas de la validation (inchangé) : la validation ne change
-- aucun montant, elle verrouille seulement.
-- Rejouable : create or replace, drop ... if exists.
begin;

-- =====================================================================
-- 1. Fonctions de verrouillage
-- =====================================================================

-- Le statut (promesse, actée, louée) ne verrouille plus rien. Conservée pour compatibilité.
create or replace function public.transaction_status_locked(p_status text, p_tx uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select false
$$;

-- Verrouillée = validée par l'admin
create or replace function public.transaction_locked(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.transactions t where t.id = p_tx and t.validated_at is not null)
$$;

revoke all on function public.transaction_locked(uuid) from public, anon;
grant execute on function public.transaction_locked(uuid) to authenticated;

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

-- =====================================================================
-- 2. RLS transactions (participants et déductions passent par can_edit_transaction)
-- =====================================================================

drop policy if exists "transactions update" on public.transactions;
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

drop policy if exists "transactions delete" on public.transactions;
create policy "transactions delete" on public.transactions
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and validated_at is null)
  );

-- =====================================================================
-- 3. Triggers : aucune écriture non-admin sur une transaction validée, même par une fonction
--    SECURITY DEFINER (auth.uid() renseigné). Seule exception : la mise à null de
--    seller_client_id / buyer_client_id par la suppression d'une fiche client.
--    (La validation elle-même est réservée à l'admin par protect_transaction_fields.)
-- =====================================================================

create or replace function public.protect_acted_transaction()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_skip text[] := array['updated_at', 'fees_ht', 'seller_client_id', 'buyer_client_id'];
begin
  if tg_op <> 'DELETE' and new.validated_at is not null
     and (tg_op = 'INSERT' or old.validated_at is null)
     and new.status not in ('cashed', 'signed') then
    raise exception 'Une promesse ne peut pas être validée : la validation se fait après l''acte signé (ou la signature du bail)';
  end if;

  if tg_op = 'INSERT' or auth.uid() is null or public.is_admin(auth.uid()) or old.validated_at is null then
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

  raise exception 'Transaction validée par l''administrateur : modification réservée à l''administrateur';
end;
$$;

drop trigger if exists protect_acted_transaction on public.transactions;
create trigger protect_acted_transaction
  before insert or update or delete on public.transactions
  for each row execute function public.protect_acted_transaction();

create or replace function public.protect_acted_transaction_children()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid())
     and ((tg_op <> 'INSERT' and public.transaction_locked(old.transaction_id))
          or (tg_op <> 'DELETE' and public.transaction_locked(new.transaction_id))) then
    raise exception 'Transaction validée par l''administrateur : modification réservée à l''administrateur';
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

-- =====================================================================
-- 4. save_transaction (et donc save_transaction_with_buyer) et cancel_transaction :
--    identiques au 04/11, message de verrouillage par validation
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
    raise exception 'Transaction validée par l''administrateur : modification réservée à l''administrateur';
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
    raise exception 'Transaction validée par l''administrateur : modification réservée à l''administrateur';
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

-- =====================================================================
-- 5. sign_promise_sale : identique au 03/11, plus prix et honoraires TTC confirmés à l'acte
--    (tout ou rien). L'ancienne signature à 3 paramètres est remplacée.
-- =====================================================================

drop function if exists public.sign_promise_sale(uuid, date, date);

create or replace function public.sign_promise_sale(
  p_id uuid,
  p_deed_date date,
  p_next_due_date date default null,
  p_price numeric default null,
  p_fees_ttc numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx     public.transactions;
  v_seller public.clients;
  v_after  uuid;
begin
  if p_deed_date is null then
    raise exception 'La date de vente est obligatoire';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'Le prix de vente ne peut pas être négatif';
  end if;
  if p_fees_ttc is not null and p_fees_ttc <= 0 then
    raise exception 'Les honoraires TTC doivent être supérieurs à 0';
  end if;

  select * into v_tx from public.transactions where id = p_id;
  if not found then
    raise exception 'Transaction introuvable';
  end if;
  if v_tx.kind <> 'sale' or v_tx.status <> 'in_progress' then
    raise exception 'Seule une vente sous promesse peut être marquée comme vendue';
  end if;

  -- Montants confirmés (ou corrigés) à l'acte, dans le même appel ; vides = montants de la promesse
  update public.transactions
     set deed_date        = p_deed_date,
         fees_received_at = p_deed_date,
         status           = 'cashed',
         price            = coalesce(p_price, price),
         fees_ttc         = coalesce(p_fees_ttc, fees_ttc)
   where id = p_id;
  if not found then
    raise exception 'Transaction non modifiable (validée ou droits insuffisants)';
  end if;

  if v_tx.seller_client_id is not null then
    select * into v_seller from public.clients where id = v_tx.seller_client_id;
    if found and v_seller.category = 'seller' and v_seller.status <> 'closed' then
      perform public.close_seller_as_sold(v_seller.id, p_deed_date);
    end if;
  end if;

  if v_tx.buyer_client_id is not null then
    perform public.buyer_fiche_transition(p_id, 'deed', p_deed_date, p_next_due_date);
    v_after := v_tx.buyer_client_id;
  elsif v_tx.buyer_draft is not null then
    v_after := public.create_after_sale_client(
      v_tx.buyer_draft || jsonb_build_object('next_due_date', p_next_due_date),
      coalesce(v_seller.owner_id, auth.uid()),
      p_deed_date,
      coalesce(public.property_label(v_tx.property_id), v_seller.property_address),
      v_tx.seller_client_id
    );
    update public.transactions set buyer_client_id = v_after, buyer_draft = null where id = p_id;
  end if;

  return jsonb_build_object('transaction_id', p_id, 'after_client_id', v_after);
end;
$$;

revoke all on function public.sign_promise_sale(uuid, date, date, numeric, numeric) from public, anon;
grant execute on function public.sign_promise_sale(uuid, date, date, numeric, numeric) to authenticated;

-- =====================================================================
-- 6. validate_transaction : identique au 29/10, refuse une promesse (in_progress)
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

  if v_tx.status not in ('cashed', 'signed') then
    raise exception 'Une promesse ne peut pas être validée : la validation se fait après l''acte signé (ou la signature du bail)';
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

commit;
