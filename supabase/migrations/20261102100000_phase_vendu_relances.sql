-- 2026-11-02 : Phase vendeur « vendu », relances remises à zéro à chaque changement de phase
-- (un seul commentaire par action), vente sans promesse depuis la page Transactions (fiche vendeur
-- liée clôturée), réparation des fiches déjà vendues restées en « sous_promesse ».
-- Rejouable : create or replace, drop ... if exists, contrainte recréée seulement si nécessaire.
begin;

-- =====================================================================
-- 1. deal_stage : ajoute 'vendu'
-- =====================================================================

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
    if c.def not ilike '%''vendu''%' then
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
      check (deal_stage is null or deal_stage in ('pre_mandat', 'mandat', 'sous_promesse', 'vendu'));
  end if;
end;
$$;

-- =====================================================================
-- 2. Règle unique « changement de phase = relance » (même règle que relance.js : phaseChangeFollowUp)
--    → Pré-mandat / Sous mandat : aujourd'hui + relance par défaut vendeur (seller_repeat_days, 21 j)
--    → Sous promesse : date de promesse + relance sous promesse (seller_promise_days, 30 j)
--    → Vendu (ou fiche clôturée) : plus de relance
--    Une date de relance fournie dans le même UPDATE (saisie utilisateur ou RPC) l'emporte.
-- =====================================================================

create or replace function public.seller_phase_label(p_stage text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case coalesce(p_stage, 'pre_mandat')
    when 'mandat' then 'Sous mandat'
    when 'sous_promesse' then 'Sous promesse'
    when 'vendu' then 'Vendu'
    else 'Pré-mandat'
  end
$$;

create or replace function public.seller_phase_next_due(p_stage text, p_promise_date date)
returns date
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case coalesce(p_stage, 'pre_mandat')
    when 'vendu' then null::date
    when 'sous_promesse' then
      coalesce(p_promise_date, (now() at time zone 'Europe/Paris')::date)
        + coalesce((select s.seller_promise_days from public.app_settings s order by s.id limit 1), 30)
    else
      (now() at time zone 'Europe/Paris')::date
        + coalesce((select s.seller_repeat_days from public.app_settings s order by s.id limit 1), 21)
  end
$$;

revoke all on function public.seller_phase_next_due(text, date) from public, anon;
grant execute on function public.seller_phase_next_due(text, date) to authenticated;

-- BEFORE UPDATE : recalcul de la prochaine relance (tous les chemins : boutons, « Modifier », RPC)
create or replace function public.on_seller_phase_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_promise date;
begin
  if new.category is distinct from 'seller'
     or coalesce(new.deal_stage, 'pre_mandat') = coalesce(old.deal_stage, 'pre_mandat') then
    return new;
  end if;

  if new.status = 'closed' or new.deal_stage = 'vendu' then
    new.next_due_date := null;
    new.next_due_source := null;
    new.next_followup_at := null;
    return new;
  end if;

  if new.next_due_date is not distinct from old.next_due_date then
    if new.deal_stage = 'sous_promesse' then
      select max(t.preliminary_date) into v_promise
      from public.transactions t
      where t.seller_client_id = new.id and t.kind = 'sale' and t.status = 'in_progress';
    end if;
    new.next_due_date := public.seller_phase_next_due(new.deal_stage, v_promise);
    new.next_due_source := 'auto';
  end if;
  new.next_followup_at := null;
  return new;
end;
$$;

drop trigger if exists on_seller_phase_change on public.clients;
create trigger on_seller_phase_change
  before update of deal_stage on public.clients
  for each row execute function public.on_seller_phase_change();

-- AFTER UPDATE : commentaire daté « Phase : … » (il compte comme dernière relance), seulement pour un
-- changement de phase sans commentaire d'action (bouton « Passer sous mandat », formulaire « Modifier »).
-- Un seul commentaire par action : une RPC qui écrit son propre commentaire (promesse avec acquéreur,
-- promesse annulée avec motif, acte signé) pose kit.phase_action_comment = on juste avant son UPDATE,
-- et ce trigger s'abstient. set_config(..., true) est appelé directement dans la RPC : une fonction
-- déclarée avec « set search_path » annule à sa sortie les réglages locaux faits en elle, ce qui borne
-- aussi le drapeau à la RPC qui le pose.
-- Pas de commentaire pour une clôture pour un autre motif, ni pour les opérations serveur (auth.uid() nul).
create or replace function public.on_seller_phase_comment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.category = 'seller'
     and coalesce(new.deal_stage, 'pre_mandat') <> coalesce(old.deal_stage, 'pre_mandat')
     and (new.status <> 'closed' or new.deal_stage = 'vendu')
     and auth.uid() is not null
     and coalesce(current_setting('kit.phase_action_comment', true), '') <> 'on' then
    insert into public.client_comments (client_id, body, author_id)
    values (new.id, 'Phase : ' || public.seller_phase_label(new.deal_stage), auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists on_seller_phase_comment on public.clients;
create trigger on_seller_phase_comment
  after update of deal_stage on public.clients
  for each row execute function public.on_seller_phase_comment();

-- =====================================================================
-- 3. Clôture « vendu avec nous » : deal_stage = vendu, plus de relance
-- =====================================================================

create or replace function public.close_seller_as_sold(p_seller_id uuid, p_sale_date date)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform set_config('kit.phase_action_comment', 'on', true);

  update public.clients set
    status            = 'closed',
    deal_stage        = 'vendu',
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
    'Acte signé le ' || to_char(p_sale_date, 'DD/MM/YYYY') || '. Fiche clôturée (vendu avec nous).',
    auth.uid()
  );
end;
$$;

-- =====================================================================
-- 4. cancel_transaction : le retour « Sous mandat » (et sa relance) est géré par le trigger
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
end;
$$;

-- =====================================================================
-- 4 bis. record_promise : identique au 01/11 ; son commentaire (date + acquéreur) est le seul ajouté.
--        La relance est fixée par p_next_due_date, sinon par le trigger (promesse + délai).
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
      || btrim(concat_ws(' ', p_buyer->>'first_name', p_buyer->>'last_name')) || ').',
    auth.uid()
  );

  return v_tx;
end;
$$;

revoke all on function public.record_promise(uuid, jsonb, jsonb, date) from public, anon;
grant execute on function public.record_promise(uuid, jsonb, jsonb, date) to authenticated;

-- =====================================================================
-- 5. save_transaction_with_buyer : vendeur existant relié (vente sans promesse depuis la page
--    Transactions). Vente avec date → fiche vendeur clôturée en « vendu » (promesses en cours annulées) ;
--    promesse → fiche vendeur « Sous promesse ». Fiche après-vente au nom du propriétaire du vendeur.
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
  v_deed      date := nullif(p->>'deed_date', '')::date;
  v_seller_id uuid := nullif(p->>'seller_client_id', '')::uuid;
  v_seller    public.clients;
begin
  if p_buyer is not null and (p->>'kind') is distinct from 'sale' then
    raise exception 'La fiche après-vente ne peut être créée que pour une vente';
  end if;

  v_tx := public.save_transaction(p);

  if v_seller_id is not null and (p->>'kind') = 'sale' then
    select * into v_seller from public.clients where id = v_seller_id;
    if found and v_seller.category = 'seller' and v_seller.status <> 'closed' then
      if v_deed is not null then
        update public.transactions
           set status = 'cancelled', cancelled_at = now(),
               cancel_reason = 'Remplacée par la vente du ' || to_char(v_deed, 'DD/MM/YYYY')
         where seller_client_id = v_seller_id and kind = 'sale' and status = 'in_progress' and id <> v_tx;
        perform public.close_seller_as_sold(v_seller_id, v_deed);
      elsif coalesce(v_seller.deal_stage, 'pre_mandat') <> 'sous_promesse' then
        update public.clients
           set deal_stage = 'sous_promesse', mandat_at = coalesce(mandat_at, now())
         where id = v_seller_id;
      end if;
    end if;
  end if;

  if p_buyer is not null then
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

  return jsonb_build_object('transaction_id', v_tx, 'after_client_id', v_after);
end;
$$;

-- =====================================================================
-- 6. Réparation : fiches vendeur vendues avec nous restées dans une autre phase
--    (cas observé après « Vente signée » : status closed mais deal_stage sous_promesse).
--    Exécuté en tant que postgres : le trigger vide la relance, sans commentaire.
-- =====================================================================

update public.clients
   set deal_stage = 'vendu'
 where category = 'seller'
   and status = 'closed'
   and sale_result = 'vendu_avec_nous'
   and deal_stage is distinct from 'vendu';

commit;
