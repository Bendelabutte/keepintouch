-- 2026-10-31 : Phase vendeur « Sous promesse », vente signée en un clic, visibilité des parts par rôle,
-- mémorisation des nouveautés vues. Rejouable : add column if not exists, create or replace, drop ... if exists.
begin;

-- =====================================================================
-- 1. Schéma
-- =====================================================================

-- Acquéreur saisi à la promesse, conservé jusqu'à la vente (création de la fiche après-vente)
alter table public.transactions add column if not exists buyer_draft jsonb;

-- Dernière version des nouveautés vue par l'utilisateur
alter table public.profiles add column if not exists release_notes_seen text;

-- deal_stage : ajoute 'sous_promesse'. Une éventuelle contrainte CHECK portant sur deal_stage
-- (créée hors migrations) est remplacée ; si des valeurs inattendues existent, la migration échoue
-- sans rien modifier.
do $$
declare
  c record;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    where con.conrelid = 'public.clients'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%deal_stage%'
  loop
    if c.def not ilike '%sous_promesse%' then
      execute format('alter table public.clients drop constraint %I', c.conname);
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.clients'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%deal_stage%'
  ) then
    alter table public.clients add constraint clients_deal_stage_check
      check (deal_stage is null or deal_stage in ('pre_mandat', 'mandat', 'sous_promesse'));
  end if;
end;
$$;

-- =====================================================================
-- 2. Visibilité des parts : un commercial ne voit que SA ligne de participation.
--    Admin : tout ; manager : les lignes de son équipe. Les montants des autres commerciaux
--    ne sont donc jamais transmis au navigateur d'un commercial.
-- =====================================================================

drop policy if exists "participants read" on public.transaction_participants;
create policy "participants read" on public.transaction_participants
  for select to authenticated
  using (
    public.can_read_transaction(transaction_id)
    and (
      public.is_admin(auth.uid())
      or user_id = auth.uid()
      or public.is_manager_of(auth.uid(), user_id)
    )
  );

-- Total des parts calculé sur toutes les lignes (y compris celles que l'appelant ne voit pas)
create or replace function public.transaction_shares_total(p_tx uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(share_pct), 0) from public.transaction_participants where transaction_id = p_tx
$$;

revoke all on function public.transaction_shares_total(uuid) from public, anon;
grant execute on function public.transaction_shares_total(uuid) to authenticated;

-- Libellé « numéro rue, code postal ville » d'un bien enregistré
create or replace function public.property_label(p_property_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.property_address_label(jsonb_build_object(
    'address', pr.address, 'postal_code', pr.postal_code, 'city', pr.city))
  from public.properties pr
  where pr.id = p_property_id
$$;

revoke all on function public.property_label(uuid) from public, anon;
grant execute on function public.property_label(uuid) to authenticated;

-- =====================================================================
-- 3. save_transaction : participants facultatifs en modification (la répartition n'est alors pas
--    touchée), contrôle des 100 % sur toutes les lignes. Le reste est identique au 29/10.
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

-- =====================================================================
-- 4. Fiche après-vente à partir du bloc acquéreur (fonction interne, droits de l'appelant)
-- p_buyer = { first_name, last_name, phone, email, client_birthday, contact_origin, context, next_due_date }
-- =====================================================================

create or replace function public.create_after_sale_client(
  p_buyer jsonb, p_owner uuid, p_sale_date date, p_address text, p_source uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if nullif(btrim(p_buyer->>'first_name'), '') is null or nullif(btrim(p_buyer->>'last_name'), '') is null then
    raise exception 'Le prénom et le nom de l''acquéreur sont obligatoires';
  end if;

  insert into public.clients (
    owner_id, category, status, first_name, last_name, email, phone,
    created_at, after_address, client_birthday, contact_origin, context,
    next_due_date, next_due_source, also_owner, source_client_id
  ) values (
    coalesce(p_owner, auth.uid()), 'after', 'active',
    btrim(p_buyer->>'first_name'), btrim(p_buyer->>'last_name'),
    nullif(btrim(p_buyer->>'email'), ''), nullif(btrim(p_buyer->>'phone'), ''),
    p_sale_date, p_address,
    nullif(p_buyer->>'client_birthday', '')::date,
    nullif(btrim(p_buyer->>'contact_origin'), ''),
    nullif(btrim(p_buyer->>'context'), ''),
    nullif(p_buyer->>'next_due_date', '')::date, 'auto', false, p_source
  )
  returning id into v_id;

  insert into public.client_comments (client_id, body, author_id) values (
    v_id,
    'Fiche après-vente créée automatiquement suite à la vente du ' || to_char(p_sale_date, 'DD/MM/YYYY') || '.',
    auth.uid()
  );

  return v_id;
end;
$$;

revoke all on function public.create_after_sale_client(jsonb, uuid, date, text, uuid) from public, anon;
grant execute on function public.create_after_sale_client(jsonb, uuid, date, text, uuid) to authenticated;

-- Clôture « vendu avec nous » d'une fiche vendeur (fonction interne, droits de l'appelant)
create or replace function public.close_seller_as_sold(p_seller_id uuid, p_sale_date date)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.clients set
    status            = 'closed',
    closure_reason    = 'vendu_avec_nous',
    sale_result       = 'vendu_avec_nous',
    sale_completed_at = p_sale_date,
    sold_at           = p_sale_date,
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

  insert into public.client_comments (client_id, body, author_id) values (
    p_seller_id,
    'Vente signée le ' || to_char(p_sale_date, 'DD/MM/YYYY') || '. Fiche clôturée (vendu avec nous).',
    auth.uid()
  );
end;
$$;

revoke all on function public.close_seller_as_sold(uuid, date) from public, anon;
grant execute on function public.close_seller_as_sold(uuid, date) to authenticated;

-- =====================================================================
-- 5. record_promise : passage d'une fiche vendeur en « Sous promesse », tout ou rien
-- Transaction in_progress reliée au vendeur, acquéreur conservé dans buyer_draft,
-- deal_stage = sous_promesse, mandat_at renseigné s'il est vide. Les relances continuent.
-- =====================================================================

create or replace function public.record_promise(p_seller_id uuid, p_transaction jsonb, p_buyer jsonb)
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

  update public.clients set
    deal_stage = 'sous_promesse',
    mandat_at  = coalesce(mandat_at, now())
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

revoke all on function public.record_promise(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_promise(uuid, jsonb, jsonb) to authenticated;

-- =====================================================================
-- 6. sign_promise_sale : « Vente signée » / « Marquer comme vendue », tout ou rien
-- Transaction → cashed (fees_received_at = deed_date) ; fiche vendeur liée clôturée ;
-- fiche après-vente créée depuis buyer_draft et reliée via buyer_client_id.
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

  if v_tx.buyer_client_id is null and v_tx.buyer_draft is not null then
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
-- 7. cancel_transaction : annulation avec motif ; une fiche vendeur « Sous promesse » sans autre
--    promesse en cours repasse « Sous mandat ».
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
    update public.clients set deal_stage = 'mandat'
     where id = v_tx.seller_client_id and deal_stage = 'sous_promesse';
    if found then
      insert into public.client_comments (client_id, body, author_id) values (
        v_tx.seller_client_id,
        'Promesse annulée : ' || btrim(p_reason) || '. Retour en phase « Sous mandat ».',
        auth.uid()
      );
    end if;
  end if;
end;
$$;

revoke all on function public.cancel_transaction(uuid, text) from public, anon;
grant execute on function public.cancel_transaction(uuid, text) to authenticated;

-- =====================================================================
-- 8. save_transaction_with_buyer : vente sous promesse → acquéreur conservé dans buyer_draft
--    (fiche créée à la vente) ; vente avec date de vente → fiche après-vente créée tout de suite.
-- =====================================================================

create or replace function public.save_transaction_with_buyer(p jsonb, p_buyer jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx    uuid;
  v_after uuid;
  v_deed  date := nullif(p->>'deed_date', '')::date;
begin
  if p_buyer is not null and (p->>'kind') is distinct from 'sale' then
    raise exception 'La fiche après-vente ne peut être créée que pour une vente';
  end if;

  v_tx := public.save_transaction(p);

  if p_buyer is not null then
    if v_deed is null then
      if nullif(btrim(p_buyer->>'last_name'), '') is null then
        raise exception 'Le nom de l''acquéreur est obligatoire';
      end if;
      update public.transactions set buyer_draft = p_buyer - 'next_due_date', buyer_client_id = null where id = v_tx;
    else
      v_after := public.create_after_sale_client(
        p_buyer, auth.uid(), v_deed, public.property_address_label(p->'property'),
        nullif(p->>'seller_client_id', '')::uuid
      );
      update public.transactions
         set buyer_client_id = v_after, buyer_label = null, buyer_draft = null
       where id = v_tx;
    end if;
  end if;

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', v_after);
end;
$$;

revoke all on function public.save_transaction_with_buyer(jsonb, jsonb) from public, anon;
grant execute on function public.save_transaction_with_buyer(jsonb, jsonb) to authenticated;

-- =====================================================================
-- 9. record_own_sale (vente directe sans promesse) : même bloc acquéreur, seuls prénom et nom
--    sont obligatoires ; s'appuie sur les fonctions communes.
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
