-- 2026-11-18 : Corrections de sécurité avant la mise en production (suite de l'audit, DEPLOY.md § 1.6).
--   1. buyer_fiche_transition : la fiche acquéreur n'est modifiée que si l'appelant en a le droit
--      (propriétaire de la fiche, son manager, ou admin) et si l'action correspond à l'état réel de
--      la transaction. Sinon : refus explicite.
--   2. Vente actée (vente « cashed » ou « signed ») : annulation réservée à l'admin, qui remet la
--      fiche de l'acquéreur en état ; suppression seulement après annulation ; retour en promesse et
--      changement de type interdits. Appliqué par trigger (tous les chemins), RLS et cancel_transaction.
--   3. save_compensation_settings : type ou taux refusés sans date d'ouverture.
--   4. compensation_type_of et transaction_shares_total : contrôle de l'appelant.
--   5. Droit d'exécution retiré à public et anon sur toutes les fonctions SECURITY DEFINER de la v4.
-- Aucune donnée existante n'est modifiée. Rejouable : create or replace, drop policy if exists.
-- À appliquer après 20261118100000_mise_en_service.sql.
begin;

-- =====================================================================
-- 1. Fiche acquéreur reliée à une transaction
--    SECURITY DEFINER conservé (commentaires et relance écrits quelle que soit la RLS de clients),
--    mais la fonction n'agit plus pour le compte de quelqu'un qui n'a pas de droit sur la fiche.
-- =====================================================================

-- L'appelant peut-il modifier cette fiche ? Propriétaire, son manager, ou admin.
-- Hors session utilisateur (éditeur SQL, service_role) : oui.
create or replace function public.can_manage_client_fiche(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is null
      or public.is_admin(auth.uid())
      or (p_owner is not null and (p_owner = auth.uid() or public.is_manager_of(auth.uid(), p_owner)))
$$;

revoke all on function public.can_manage_client_fiche(uuid) from public, anon;
grant execute on function public.can_manage_client_fiche(uuid) to authenticated;

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

  -- L'action doit correspondre à l'état réel de la transaction : un appel direct ne peut pas
  -- « signer » une promesse ni annuler une fiche dont la transaction est toujours en cours.
  if (p_action = 'promise' and v_tx.status <> 'in_progress')
     or (p_action = 'deed' and v_tx.status not in ('cashed', 'signed'))
     or (p_action = 'cancel' and v_tx.status <> 'cancelled') then
    raise exception 'Action impossible : elle ne correspond pas à l''état de la transaction';
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
    if not public.can_manage_client_fiche(v_buyer.owner_id) then
      raise exception 'La fiche de cet acquéreur est suivie par un autre commercial : seul son propriétaire, son manager ou un administrateur peut la relier à une vente';
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
    if not public.can_manage_client_fiche(v_buyer.owner_id) then
      raise exception 'La fiche de cet acquéreur est suivie par un autre commercial : seul son propriétaire, son manager ou un administrateur peut enregistrer l''acte';
    end if;
    select s.after_first_days into v_days from public.app_settings s order by s.id limit 1;
    -- Fiche acquéreur close choisie comme acquéreur : rouverte en après-vente, clôture effacée
    update public.clients set
      category          = 'after',
      status            = 'active',
      deal_stage        = null,
      closure_reason    = case when status = 'closed' then null else closure_reason end,
      closed_at         = case when status = 'closed' then null else closed_at end,
      closed_by         = case when status = 'closed' then null else closed_by end,
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
    if not public.can_manage_client_fiche(v_buyer.owner_id) then
      raise exception 'La fiche de cet acquéreur est suivie par un autre commercial : seul son propriétaire, son manager ou un administrateur peut annuler cette promesse';
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

-- =====================================================================
-- 2. Vente actée : annulation réservée à l'admin, fiches remises en état, pas de commission orpheline
--    Les commissions suivent le statut : refresh_commissions les supprime dès que la transaction
--    n'est plus « cashed » / « signed », et la suppression d'une transaction les supprime en cascade.
--    Une location n'engage aucune fiche : son annulation par son créateur reste possible.
-- =====================================================================

-- Trigger transactions : identique au 08/11, plus les règles de la vente actée (tous les chemins :
-- mise à jour directe, RPC, fonctions SECURITY DEFINER exécutées pour un utilisateur connecté).
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

  -- Vente actée, pour tout utilisateur connecté (opérations serveur et éditeur SQL non concernés)
  if auth.uid() is not null and tg_op in ('UPDATE', 'DELETE')
     and old.kind = 'sale' and old.status in ('cashed', 'signed') then
    if tg_op = 'DELETE' then
      raise exception 'Vente actée : annulez-la d''abord (ou rouvrez le dossier vendeur) avant de la supprimer';
    end if;
    if new.kind is distinct from old.kind then
      raise exception 'Le type d''une vente actée ne peut pas être modifié';
    end if;
    if new.status = 'in_progress' then
      raise exception 'Une vente actée ne peut pas redevenir une promesse : demandez son annulation à l''administrateur';
    end if;
    if new.status = 'cancelled' and not public.is_admin(auth.uid()) then
      raise exception 'Vente actée : l''annulation est réservée à l''administrateur (elle remet les fiches du vendeur et de l''acquéreur en état)';
    end if;
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

-- Suppression : admin, ou créateur tant que la transaction n'est ni validée ni une vente actée
drop policy if exists "transactions delete" on public.transactions;
create policy "transactions delete" on public.transactions
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and validated_at is null
        and not (kind = 'sale' and status in ('cashed', 'signed')))
  );

-- Admin : fiche de l'acquéreur d'une vente actée qui vient d'être annulée (même traitement que la
-- réouverture du dossier vendeur). Les reprises d'historique sont ignorées : leur « acquéreur » est
-- la fiche d'origine de la commission, qui ne doit pas être close.
create or replace function public.undo_cancelled_sale_buyer(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx public.transactions;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Réservé aux administrateurs';
  end if;
  select * into v_tx from public.transactions where id = p_tx;
  if not found or v_tx.kind <> 'sale' or v_tx.status <> 'cancelled' or v_tx.buyer_client_id is null
     or coalesce(v_tx.notes, '') like '%[reprise-historique client:%' then
    return;
  end if;
  perform public.undo_sale_buyer_fiche(v_tx.buyer_client_id, v_tx.seller_client_id);
end;
$$;

revoke all on function public.undo_cancelled_sale_buyer(uuid) from public, anon;
grant execute on function public.undo_cancelled_sale_buyer(uuid) to authenticated;

-- cancel_transaction : identique au 08/11 pour une promesse ou une location ; vente actée :
--   non-admin → refus ;
--   admin, fiche vendeur close par cette vente → renvoi vers « Rouvrir le dossier » (reopen_client),
--     seul parcours qui rouvre le vendeur, annule la vente et traite l'acquéreur ensemble ;
--   admin, sinon → annulation et remise en état de la fiche de l'acquéreur.
create or replace function public.cancel_transaction(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx    public.transactions;
  v_acted boolean;
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

  v_acted := v_tx.kind = 'sale' and v_tx.status in ('cashed', 'signed');

  if v_acted then
    if not public.is_admin(auth.uid()) then
      raise exception 'Vente actée : l''annulation est réservée à l''administrateur (elle remet les fiches du vendeur et de l''acquéreur en état)';
    end if;
    if v_tx.seller_client_id is not null and exists (
         select 1 from public.clients c
         where c.id = v_tx.seller_client_id and c.category = 'seller' and c.status = 'closed'
           and (c.deal_stage = 'vendu' or c.sale_result = 'vendu_avec_nous')
       ) then
      raise exception 'Cette vente a clôturé la fiche du vendeur : utilisez « Rouvrir le dossier » sur la fiche vendeur, qui annule la vente et remet les fiches en état';
    end if;
  end if;

  update public.transactions
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id;
  if not found then
    raise exception 'Annulation refusée (transaction validée ou droits insuffisants)';
  end if;

  if v_acted then
    perform public.undo_cancelled_sale_buyer(p_id);
    return;
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
-- 3. Réglages de rémunération : pas de type ni de taux sans date d'ouverture
--    (sans date, toutes les ventes passées du commercial ouvriraient une commission)
-- =====================================================================

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

  if p_opening_balance_date is null
     and (nullif(p_compensation_type, '') is not null or p_rate_entree is not null or p_rate_sortie is not null) then
    raise exception 'La date d''ouverture est obligatoire dès qu''un type ou un taux est renseigné : sans elle, toutes les ventes passées du commercial ouvriraient une commission';
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
-- 4. Fonctions de lecture : contrôle de l'appelant
-- =====================================================================

-- Type de rémunération : le sien, ou celui d'un commercial dont on peut lire la rémunération
create or replace function public.compensation_type_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.compensation_type from public.profiles p
  where p.id = p_user
    and (auth.uid() is null or p_user = auth.uid() or public.can_read_compensation(p_user))
$$;

revoke all on function public.compensation_type_of(uuid) from public, anon;
grant execute on function public.compensation_type_of(uuid) to authenticated;

-- Total des parts (y compris les lignes que l'appelant ne voit pas) : transaction lisible seulement
create or replace function public.transaction_shares_total(p_tx uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(tp.share_pct), 0) from public.transaction_participants tp
  where tp.transaction_id = p_tx
    and (auth.uid() is null or public.can_read_transaction(p_tx))
$$;

revoke all on function public.transaction_shares_total(uuid) from public, anon;
grant execute on function public.transaction_shares_total(uuid) to authenticated;

-- =====================================================================
-- 5. Droit d'exécution : ni public ni anon sur les fonctions SECURITY DEFINER de la v4
--    (déjà posé par chaque migration, répété ici pour toutes ; les quatre fonctions de trigger
--    n'avaient pas de révocation). Les droits de « authenticated » ne sont pas modifiés.
-- =====================================================================

revoke all on function public.on_seller_phase_change() from public, anon;
revoke all on function public.on_seller_phase_comment() from public, anon;
revoke all on function public.on_transaction_commissions() from public, anon;
revoke all on function public.check_payment() from public, anon;

revoke all on function public.is_manager_of(uuid, uuid) from public, anon;
revoke all on function public.transaction_has_participant(uuid, uuid, boolean) from public, anon;
revoke all on function public.can_read_transaction(uuid) from public, anon;
revoke all on function public.can_edit_transaction(uuid) from public, anon;
revoke all on function public.can_edit_property(uuid) from public, anon;
revoke all on function public.transaction_locked(uuid) from public, anon;
revoke all on function public.seller_phase_next_due(text, date) from public, anon;
revoke all on function public.is_active_user(uuid) from public, anon;
revoke all on function public.validate_transaction(uuid) from public, anon;
revoke all on function public.recalculate_transaction_commissions(uuid) from public, anon;
revoke all on function public.set_participant_rate(uuid, numeric) from public, anon;
revoke all on function public.set_compensation_visible(uuid, boolean) from public, anon;
revoke all on function public.reopen_client(uuid, text, boolean) from public, anon;
revoke all on function public.can_read_compensation(uuid) from public, anon;
revoke all on function public.compensation_settings() from public, anon;
revoke all on function public.can_read_invoice_folder(text) from public, anon;
-- Fonctions internes : jamais appelables par un utilisateur
revoke all on function public.refresh_commissions(uuid, boolean, uuid, uuid) from public, anon, authenticated;
revoke all on function public.undo_sale_buyer_fiche(uuid, uuid) from public, anon, authenticated;

commit;
