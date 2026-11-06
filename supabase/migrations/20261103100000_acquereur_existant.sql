-- 2026-11-03 : Acquéreur existant. Une transaction de vente peut être reliée à une fiche client déjà
-- présente (buyer_client_id) au lieu d'un acquéreur saisi en libre :
--   promesse  → la fiche acquéreur passe « Sous promesse » (relance = promesse + délai sous promesse) ;
--   acte      → LA MÊME fiche devient après-vente (historique conservé, source = fiche vendeur,
--               1re relance = acte + délai après-vente) ; aucune nouvelle fiche ;
--   annulation→ la fiche redevient acquéreur actif (deal_stage null, relance = aujourd'hui + délai acquéreur).
-- Seule une fiche de catégorie « buyer » change de phase ; une fiche vendeur ou après-vente choisie
-- comme acquéreur est simplement reliée à la transaction.
-- Acquéreur saisi en libre : comportement inchangé (buyer_draft puis fiche après-vente créée à l'acte).
-- Les RPC restent tout ou rien. Rejouable : create or replace uniquement, aucune modification de schéma
-- (la contrainte deal_stage accepte déjà 'sous_promesse' quelle que soit la catégorie).
begin;

-- =====================================================================
-- 1. Transition de la fiche acquéreur reliée à une transaction (fonction interne)
--    SECURITY DEFINER : la fiche acquéreur peut appartenir à un autre commercial que l'appelant
--    (acquéreur d'un collègue). Garde-fous : l'appelant doit pouvoir modifier la transaction, la fiche
--    doit être celle reliée à la transaction, et seuls deal_stage / catégorie / relance sont touchés.
--    Les RPC appelantes (droits de l'appelant) vérifient en plus que la fiche lui est visible.
-- =====================================================================

create or replace function public.buyer_fiche_transition(
  p_tx uuid, p_action text, p_date date default null, p_next_due date default null, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx    public.transactions;
  v_buyer public.clients;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_label text;
  v_days  integer;
begin
  if p_action not in ('promise', 'deed', 'cancel') then
    raise exception 'Action inconnue : %', p_action;
  end if;

  select * into v_tx from public.transactions where id = p_tx;
  if not found or v_tx.kind <> 'sale' or v_tx.buyer_client_id is null then
    return;
  end if;
  if not public.can_edit_transaction(p_tx) then
    raise exception 'Fiche acquéreur non modifiable (transaction validée ou droits insuffisants)';
  end if;

  select * into v_buyer from public.clients where id = v_tx.buyer_client_id for update;
  if not found or v_buyer.category <> 'buyer' then
    return;
  end if;

  v_label := public.property_label(v_tx.property_id);

  if p_action = 'promise' then
    if v_buyer.status = 'closed' or v_buyer.deal_stage = 'sous_promesse' then
      return;
    end if;
    select s.seller_promise_days into v_days from public.app_settings s order by s.id limit 1;
    update public.clients set
      deal_stage       = 'sous_promesse',
      next_due_date    = coalesce(p_next_due, coalesce(p_date, v_today) + coalesce(v_days, 30)),
      next_due_source  = 'auto',
      next_followup_at = null
    where id = v_buyer.id;
    insert into public.client_comments (client_id, body, author_id) values (
      v_buyer.id,
      'Sous promesse depuis le ' || to_char(coalesce(p_date, v_today), 'DD/MM/YYYY')
        || coalesce(' (' || v_label || ')', '') || '.',
      auth.uid()
    );

  elsif p_action = 'deed' then
    if p_date is null then
      raise exception 'La date de l''acte est obligatoire';
    end if;
    select s.after_first_days into v_days from public.app_settings s order by s.id limit 1;
    update public.clients set
      category          = 'after',
      status            = 'active',
      deal_stage        = null,
      source_client_id  = coalesce(v_tx.seller_client_id, source_client_id),
      after_address     = coalesce(v_label, after_address),
      sale_completed_at = p_date,
      next_due_date     = coalesce(p_next_due, p_date + coalesce(v_days, 45)),
      next_due_source   = 'auto',
      next_followup_at  = null
    where id = v_buyer.id;
    insert into public.client_comments (client_id, body, author_id) values (
      v_buyer.id,
      'Acte signé le ' || to_char(p_date, 'DD/MM/YYYY') || coalesce(' (' || v_label || ')', '')
        || ' : fiche passée en après-vente.',
      auth.uid()
    );

  else -- cancel
    if v_buyer.deal_stage is distinct from 'sous_promesse'
       or exists (
         select 1 from public.transactions t
         where t.buyer_client_id = v_buyer.id and t.status = 'in_progress' and t.id <> p_tx
       ) then
      return;
    end if;
    select s.buyer_repeat_days into v_days from public.app_settings s order by s.id limit 1;
    update public.clients set
      deal_stage       = null,
      next_due_date    = v_today + coalesce(v_days, 21),
      next_due_source  = 'auto',
      next_followup_at = null
    where id = v_buyer.id;
    insert into public.client_comments (client_id, body, author_id) values (
      v_buyer.id,
      'Promesse annulée' || coalesce(' : ' || nullif(btrim(p_reason), ''), '') || '.',
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.buyer_fiche_transition(uuid, text, date, date, text) from public, anon;
grant execute on function public.buyer_fiche_transition(uuid, text, date, date, text) to authenticated;

-- Fiche acquéreur choisie : doit être visible de l'appelant (RLS de l'appelant), sinon erreur.
create or replace function public.assert_client_visible(p_client_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_name text;
begin
  select btrim(concat_ws(' ', c.first_name, c.last_name)) into v_name from public.clients c where c.id = p_client_id;
  if not found then
    raise exception 'Fiche acquéreur introuvable';
  end if;
  return v_name;
end;
$$;

revoke all on function public.assert_client_visible(uuid) from public, anon;
grant execute on function public.assert_client_visible(uuid) to authenticated;

-- =====================================================================
-- 2. record_promise : acquéreur libre (inchangé) ou fiche existante (buyer_client_id)
-- =====================================================================

create or replace function public.record_promise(
  p_seller_id uuid, p_transaction jsonb, p_buyer jsonb, p_next_due_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_seller     public.clients;
  v_tx         uuid;
  v_date       date := nullif(p_transaction->>'preliminary_date', '')::date;
  v_buyer_id   uuid := nullif(p_transaction->>'buyer_client_id', '')::uuid;
  v_buyer_name text;
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

  if v_buyer_id is not null then
    if v_buyer_id = p_seller_id then
      raise exception 'L''acquéreur ne peut pas être la fiche vendeur';
    end if;
    v_buyer_name := public.assert_client_visible(v_buyer_id);
  else
    if nullif(btrim(p_buyer->>'first_name'), '') is null or nullif(btrim(p_buyer->>'last_name'), '') is null then
      raise exception 'Le prénom et le nom de l''acquéreur sont obligatoires';
    end if;
    v_buyer_name := btrim(concat_ws(' ', btrim(p_buyer->>'first_name'), btrim(p_buyer->>'last_name')));
  end if;

  v_tx := public.save_transaction(
    (p_transaction - 'id' - 'buyer_client_id' - 'buyer_label' - 'deed_date' - 'fees_received_at')
    || jsonb_build_object(
      'kind', 'sale',
      'status', 'in_progress',
      'seller_client_id', p_seller_id,
      'buyer_client_id', v_buyer_id,
      'buyer_label', case when v_buyer_id is null then v_buyer_name end
    )
  );

  if v_buyer_id is null then
    update public.transactions set buyer_draft = p_buyer - 'next_due_date' where id = v_tx;
  else
    perform public.buyer_fiche_transition(v_tx, 'promise', v_date);
  end if;

  perform set_config('kit.phase_action_comment', 'on', true);

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
      || coalesce(nullif(v_buyer_name, ''), 'fiche existante') || ').',
    auth.uid()
  );

  return v_tx;
end;
$$;

revoke all on function public.record_promise(uuid, jsonb, jsonb, date) from public, anon;
grant execute on function public.record_promise(uuid, jsonb, jsonb, date) to authenticated;

-- =====================================================================
-- 3. sign_promise_sale : fiche acquéreur reliée → après-vente ; sinon création depuis buyer_draft
-- =====================================================================

create or replace function public.sign_promise_sale(p_id uuid, p_deed_date date, p_next_due_date date default null)
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

  select * into v_tx from public.transactions where id = p_id;
  if not found then
    raise exception 'Transaction introuvable';
  end if;
  if v_tx.kind <> 'sale' or v_tx.status <> 'in_progress' then
    raise exception 'Seule une vente sous promesse peut être marquée comme vendue';
  end if;

  update public.transactions
     set deed_date = p_deed_date, fees_received_at = p_deed_date, status = 'cashed'
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

revoke all on function public.sign_promise_sale(uuid, date, date) from public, anon;
grant execute on function public.sign_promise_sale(uuid, date, date) to authenticated;

-- =====================================================================
-- 4. cancel_transaction : identique au 02/11, plus le retour de la fiche acquéreur en acquéreur actif
-- =====================================================================

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

-- =====================================================================
-- 5. close_seller_with_promise : identique au 01/11 ; les fiches acquéreur des promesses annulées
--    redeviennent acquéreurs actifs.
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
  v_tx_id     uuid;
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

  v_cancelled := 0;
  for v_tx_id in
    update public.transactions
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Fiche clôturée : ' || btrim(p_reason)
     where seller_client_id = p_client_id and kind = 'sale' and status = 'in_progress'
    returning id
  loop
    v_cancelled := v_cancelled + 1;
    perform public.buyer_fiche_transition(v_tx_id, 'cancel', null, null, 'fiche vendeur clôturée');
  end loop;

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

-- =====================================================================
-- 6. save_transaction_with_buyer : identique au 02/11, plus la fiche acquéreur existante
--    (promesse → « Sous promesse », vente → après-vente) ; les fiches acquéreur des promesses
--    remplacées par la vente redeviennent acquéreurs actifs.
-- =====================================================================

create or replace function public.save_transaction_with_buyer(p jsonb, p_buyer jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx        uuid;
  v_after     uuid;
  v_old_tx    uuid;
  v_deed      date := nullif(p->>'deed_date', '')::date;
  v_promise   date := nullif(p->>'preliminary_date', '')::date;
  v_seller_id uuid := nullif(p->>'seller_client_id', '')::uuid;
  v_buyer_id  uuid := nullif(p->>'buyer_client_id', '')::uuid;
  v_seller    public.clients;
begin
  if p_buyer is not null and (p->>'kind') is distinct from 'sale' then
    raise exception 'La fiche après-vente ne peut être créée que pour une vente';
  end if;
  if v_buyer_id is not null then
    if v_buyer_id = v_seller_id then
      raise exception 'L''acquéreur ne peut pas être la fiche vendeur';
    end if;
    perform public.assert_client_visible(v_buyer_id);
  end if;

  v_tx := public.save_transaction(p);

  if v_seller_id is not null and (p->>'kind') = 'sale' then
    select * into v_seller from public.clients where id = v_seller_id;
    if found and v_seller.category = 'seller' and v_seller.status <> 'closed' then
      if v_deed is not null then
        for v_old_tx in
          update public.transactions
             set status = 'cancelled', cancelled_at = now(),
                 cancel_reason = 'Remplacée par la vente du ' || to_char(v_deed, 'DD/MM/YYYY')
           where seller_client_id = v_seller_id and kind = 'sale' and status = 'in_progress' and id <> v_tx
          returning id
        loop
          perform public.buyer_fiche_transition(v_old_tx, 'cancel', null, null, 'vente signée avec un autre acquéreur');
        end loop;
        perform public.close_seller_as_sold(v_seller_id, v_deed);
      elsif coalesce(v_seller.deal_stage, 'pre_mandat') <> 'sous_promesse' then
        update public.clients
           set deal_stage = 'sous_promesse', mandat_at = coalesce(mandat_at, now())
         where id = v_seller_id;
      end if;
    end if;
  end if;

  if v_buyer_id is not null and (p->>'kind') = 'sale' then
    -- Fiche existante : pas de nouvelle fiche après-vente
    if v_deed is not null then
      perform public.buyer_fiche_transition(v_tx, 'deed', v_deed, nullif(p_buyer->>'next_due_date', '')::date);
    else
      perform public.buyer_fiche_transition(v_tx, 'promise', v_promise);
    end if;
  elsif p_buyer is not null then
    if v_deed is null then
      if nullif(btrim(p_buyer->>'last_name'), '') is null then
        raise exception 'Le nom de l''acquéreur est obligatoire';
      end if;
      update public.transactions set buyer_draft = p_buyer - 'next_due_date', buyer_client_id = null where id = v_tx;
    else
      v_after := public.create_after_sale_client(
        p_buyer, coalesce(v_seller.owner_id, auth.uid()), v_deed,
        coalesce(public.property_address_label(p->'property'), v_seller.property_address),
        v_seller_id
      );
      update public.transactions
         set buyer_client_id = v_after, buyer_label = null, buyer_draft = null
       where id = v_tx;
    end if;
  end if;

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', coalesce(v_after, v_buyer_id));
end;
$$;

commit;
