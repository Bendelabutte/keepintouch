-- 2026-11-01 : Finitions « Sous promesse »
-- 1. Délai de relance sous promesse paramétrable (app_settings.seller_promise_days ; vide → 30 jours côté front).
-- 2. record_promise fixe la prochaine relance (date de promesse + délai).
-- 3. close_seller_with_promise : clôture d'une fiche sous promesse pour un autre motif, tout ou rien.
-- 4. record_own_sale : une promesse en cours sur la fiche est annulée dans le même enregistrement.
-- Rejouable : add column if not exists, drop function if exists, create or replace.
begin;

alter table public.app_settings
  add column if not exists seller_promise_days integer check (seller_promise_days is null or seller_promise_days >= 0);

-- =====================================================================
-- record_promise : ajout du paramètre p_next_due_date (ancienne signature supprimée)
-- =====================================================================

drop function if exists public.record_promise(uuid, jsonb, jsonb);

create or replace function public.record_promise(
  p_seller_id uuid, p_transaction jsonb, p_buyer jsonb, p_next_due_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_seller public.clients;
  v_tx     uuid;
  v_date   date := nullif(p_transaction->>'preliminary_date', '')::date;
begin
  select * into v_seller from public.clients where id = p_seller_id;
  if not found then
    raise exception 'Fiche vendeur introuvable';
  end if;
  if v_seller.category <> 'seller' or v_seller.status = 'closed' then
    raise exception 'Seule une fiche vendeur active peut passer « Sous promesse »';
  end if;
  if v_seller.deal_stage = 'sous_promesse' then
    raise exception 'Cette fiche est déjà sous promesse';
  end if;
  if v_date is null then
    raise exception 'La date de promesse est obligatoire';
  end if;
  if nullif(btrim(p_buyer->>'first_name'), '') is null or nullif(btrim(p_buyer->>'last_name'), '') is null then
    raise exception 'Le prénom et le nom de l''acquéreur sont obligatoires';
  end if;

  v_tx := public.save_transaction(
    (p_transaction - 'id' - 'buyer_client_id' - 'deed_date' - 'fees_received_at')
    || jsonb_build_object(
      'kind', 'sale',
      'status', 'in_progress',
      'seller_client_id', p_seller_id,
      'buyer_label', btrim(concat_ws(' ', btrim(p_buyer->>'first_name'), btrim(p_buyer->>'last_name')))
    )
  );

  update public.transactions set buyer_draft = p_buyer - 'next_due_date' where id = v_tx;

  -- Phase « Sous promesse » ; prochaine relance = date de promesse + délai sous promesse
  update public.clients set
    deal_stage      = 'sous_promesse',
    mandat_at       = coalesce(mandat_at, now()),
    next_due_date   = coalesce(p_next_due_date, next_due_date),
    next_due_source = case when p_next_due_date is not null then 'auto' else next_due_source end
  where id = p_seller_id;
  if not found then
    raise exception 'Mise à jour de la fiche vendeur refusée (droits insuffisants ?)';
  end if;

  insert into public.client_comments (client_id, body, author_id) values (
    p_seller_id,
    'Sous promesse depuis le ' || to_char(v_date, 'DD/MM/YYYY') || ' (acquéreur : '
      || btrim(concat_ws(' ', p_buyer->>'first_name', p_buyer->>'last_name')) || ').',
    auth.uid()
  );

  return v_tx;
end;
$$;

revoke all on function public.record_promise(uuid, jsonb, jsonb, date) from public, anon;
grant execute on function public.record_promise(uuid, jsonb, jsonb, date) to authenticated;

-- =====================================================================
-- close_seller_with_promise : annule la (les) promesse(s) en cours avec le motif, clôture la fiche
-- et ajoute le commentaire. Tout ou rien.
-- =====================================================================

create or replace function public.close_seller_with_promise(p_client_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_client    public.clients;
  v_cancelled integer;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Le motif de clôture est obligatoire';
  end if;
  if p_reason = 'vendu_avec_nous' then
    raise exception 'Une vente avec nous passe par « Vente signée » ou « Vendu par moi »';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'Fiche introuvable';
  end if;
  if v_client.category <> 'seller' or v_client.status = 'closed' then
    raise exception 'Seule une fiche vendeur active peut être clôturée ainsi';
  end if;

  update public.transactions
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Fiche clôturée : ' || btrim(p_reason)
   where seller_client_id = p_client_id and kind = 'sale' and status = 'in_progress';
  get diagnostics v_cancelled = row_count;

  update public.clients set
    status            = 'closed',
    closure_reason    = btrim(p_reason),
    sale_result       = btrim(p_reason),
    sale_completed_at = case when p_reason in ('vendu_autre_agence', 'vendu_seul') then current_date else sale_completed_at end,
    deal_stage        = case when deal_stage = 'sous_promesse' then 'mandat' else deal_stage end,
    next_due_date     = null,
    next_due_note     = null,
    next_due_source   = null,
    next_followup_at  = null,
    closed_at         = now(),
    closed_by         = auth.uid()
  where id = p_client_id;
  if not found then
    raise exception 'Clôture refusée (droits insuffisants ?)';
  end if;

  insert into public.client_comments (client_id, body, author_id) values (
    p_client_id,
    'Client clôturé : ' || btrim(p_reason)
      || case when v_cancelled > 0 then '. Promesse en cours annulée.' else '.' end,
    auth.uid()
  );
end;
$$;

revoke all on function public.close_seller_with_promise(uuid, text) from public, anon;
grant execute on function public.close_seller_with_promise(uuid, text) to authenticated;

-- =====================================================================
-- record_own_sale : identique au 31/10, avec annulation des promesses en cours de la fiche
-- (vente directe à un autre acquéreur après une promesse non aboutie).
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
  if (p_transaction->>'kind') is distinct from 'sale' then
    raise exception '« Vendu par moi » crée une transaction de type vente';
  end if;

  update public.transactions
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = 'Remplacée par une vente directe (« Vendu par moi »)'
   where seller_client_id = p_seller_id and kind = 'sale' and status = 'in_progress';

  v_tx := public.save_transaction(
    (p_transaction - 'id' - 'buyer_client_id' - 'buyer_label')
    || jsonb_build_object('seller_client_id', p_seller_id)
  );

  v_sale_date := coalesce(
    nullif(p_transaction->>'deed_date', '')::date,
    nullif(p_transaction->>'preliminary_date', '')::date,
    current_date
  );

  v_after := public.create_after_sale_client(
    p_buyer, v_seller.owner_id, v_sale_date,
    coalesce(public.property_address_label(p_transaction->'property'), v_seller.property_address),
    p_seller_id
  );

  update public.transactions set buyer_client_id = v_after where id = v_tx;

  perform public.close_seller_as_sold(p_seller_id, v_sale_date);

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', v_after);
end;
$$;

revoke all on function public.record_own_sale(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_own_sale(uuid, jsonb, jsonb) to authenticated;

commit;
