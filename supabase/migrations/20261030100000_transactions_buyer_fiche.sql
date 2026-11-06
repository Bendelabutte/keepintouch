-- 2026-10-30 : Transactions — fiche après-vente de l'acquéreur créée dans le même enregistrement
-- Aucune modification de table : fonctions uniquement (create or replace), rejouable.
begin;

-- Libellé « numéro rue, code postal ville » du bien (champ texte unique des fiches clients)
create or replace function public.property_address_label(p_property jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(concat_ws(', ',
    nullif(btrim(p_property->>'address'), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(p_property->>'postal_code'), ''), nullif(btrim(p_property->>'city'), ''))), '')
  ), '')
$$;

revoke all on function public.property_address_label(jsonb) from public, anon;
grant execute on function public.property_address_label(jsonb) to authenticated;

-- =====================================================================
-- save_transaction_with_buyer (SECURITY INVOKER : RLS appliquées, tout ou rien)
-- Enregistre la transaction (save_transaction) puis, si p_buyer est fourni (vente uniquement),
-- crée la fiche après-vente de l'acquéreur (owner = commercial connecté) et la relie via buyer_client_id.
-- p_buyer = { first_name, last_name, email, phone, next_due_date }
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
  v_sale_date date;
begin
  if p_buyer is not null then
    if (p->>'kind') is distinct from 'sale' then
      raise exception 'La fiche après-vente ne peut être créée que pour une vente';
    end if;
    if nullif(btrim(p_buyer->>'last_name'), '') is null then
      raise exception 'Le nom de l''acquéreur est obligatoire pour créer sa fiche après-vente';
    end if;
  end if;

  v_tx := public.save_transaction(p);

  if p_buyer is not null then
    v_sale_date := coalesce(
      nullif(p->>'deed_date', '')::date,
      nullif(p->>'preliminary_date', '')::date,
      current_date
    );

    insert into public.clients (
      owner_id, category, status, first_name, last_name, email, phone,
      created_at, after_address, next_due_date, next_due_source, also_owner, source_client_id
    ) values (
      auth.uid(), 'after', 'active',
      nullif(btrim(p_buyer->>'first_name'), ''), btrim(p_buyer->>'last_name'),
      nullif(btrim(p_buyer->>'email'), ''), nullif(btrim(p_buyer->>'phone'), ''),
      v_sale_date, public.property_address_label(p->'property'),
      nullif(p_buyer->>'next_due_date', '')::date, 'auto', false,
      nullif(p->>'seller_client_id', '')::uuid
    )
    returning id into v_after;

    update public.transactions
       set buyer_client_id = v_after, buyer_label = null
     where id = v_tx;

    insert into public.client_comments (client_id, body, author_id) values (
      v_after,
      'Fiche après-vente créée depuis la transaction du ' || to_char(v_sale_date, 'DD/MM/YYYY') || '.',
      auth.uid()
    );
  end if;

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', v_after);
end;
$$;

revoke all on function public.save_transaction_with_buyer(jsonb, jsonb) from public, anon;
grant execute on function public.save_transaction_with_buyer(jsonb, jsonb) to authenticated;

-- =====================================================================
-- record_own_sale : identique à la version du 29/10, sauf after_address qui reprend désormais
-- le libellé complet du bien (adresse, code postal, ville) au lieu du seul « numéro + rue ».
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
    public.property_address_label(p_transaction->'property'),
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

commit;
