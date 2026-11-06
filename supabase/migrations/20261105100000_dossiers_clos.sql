-- 2026-11-05 : Dossiers clos (v4, lot A).
--   1. Libellés des motifs de clôture (mêmes libellés que src/lib/clientStatus.js)
--   2. close_client : clôture d'une fiche en un appel, refusée si la fiche est déjà close
--   3. Trigger : un dossier clos ne peut pas être clôturé à nouveau ; seul un admin le rouvre
--   4. reopen_client (admin) : motif obligatoire, relance recalculée selon la phase
-- Rejouable : create or replace, drop ... if exists.
begin;

-- =====================================================================
-- 1. Libellés des motifs de clôture
-- =====================================================================

create or replace function public.closure_reason_label(p_reason text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_reason
    when 'vendu_avec_nous' then 'Vendu avec nous'
    when 'vendu_autre_agence' then 'Vendu par une autre agence'
    when 'vendu_seul' then 'Vendu par le vendeur en direct'
    when 'projet_abandonne' then 'Projet abandonné'
    when 'ne_souhaite_plus_vendre' then 'Ne souhaite plus vendre / louer'
    when 'achete_avec_nous' then 'A acheté avec nous'
    when 'achete_autre_agence' then 'A acheté avec une autre agence'
    when 'achete_seul' then 'A trouvé seul'
    when 'n_achete_plus' then 'N’achète plus'
    when 'ne_repond_plus' then 'Ne répond plus'
    when 'suivi_termine' then 'Suivi après-vente terminé'
    when 'ne_souhaite_plus' then 'Ne souhaite plus de suivi'
    else coalesce(nullif(btrim(p_reason), ''), 'Motif non renseigné')
  end
$$;

create or replace function public.client_already_closed_message(p_closed_at timestamptz)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select 'Dossier déjà clos'
    || coalesce(' le ' || to_char(p_closed_at at time zone 'Europe/Paris', 'DD/MM/YYYY'), '')
    || ' : il ne peut pas être clôturé à nouveau.'
$$;

grant execute on function public.closure_reason_label(text) to authenticated;
grant execute on function public.client_already_closed_message(timestamptz) to authenticated;

-- =====================================================================
-- 2. close_client (SECURITY INVOKER : RLS de l'appelant) : remplace la mise à jour directe du front.
--    Fiche vendeur sous promesse (ou promesse en cours) : close_seller_with_promise (annulation de
--    la promesse + clôture). La vente avec nous passe par « Acte signé » ou la page Transactions.
-- =====================================================================

create or replace function public.close_client(p_client_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_client public.clients;
  v_today  date := (now() at time zone 'Europe/Paris')::date;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Le motif de clôture est obligatoire';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'Fiche introuvable';
  end if;
  if v_client.status = 'closed' then
    raise exception '%', public.client_already_closed_message(v_client.closed_at);
  end if;
  if p_reason = 'vendu_avec_nous' then
    raise exception 'Une vente avec nous passe par « Acte signé » ou la page Transactions';
  end if;

  if v_client.category = 'seller'
     and (v_client.deal_stage = 'sous_promesse'
          or exists (
            select 1 from public.transactions t
            where t.seller_client_id = p_client_id and t.kind = 'sale' and t.status = 'in_progress'
          )) then
    perform public.close_seller_with_promise(p_client_id, btrim(p_reason));
    return;
  end if;

  update public.clients set
    status            = 'closed',
    closure_reason    = btrim(p_reason),
    sale_result       = case when category = 'seller' then btrim(p_reason) else sale_result end,
    sale_completed_at = case
                          when category = 'seller' and p_reason in ('vendu_autre_agence', 'vendu_seul') then v_today
                          else sale_completed_at
                        end,
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

  insert into public.client_comments (client_id, body, author_id)
  values (p_client_id, 'Dossier clos : ' || public.closure_reason_label(btrim(p_reason)) || '.', auth.uid());
end;
$$;

revoke all on function public.close_client(uuid, text) from public, anon;
grant execute on function public.close_client(uuid, text) to authenticated;

-- =====================================================================
-- 3. Trigger : dossier clos
--    - une nouvelle clôture (date ou motif de clôture modifié sur une fiche déjà close) est refusée,
--      quel que soit le chemin (mise à jour directe, RPC, fonction SECURITY DEFINER) ;
--    - la réouverture (closed → autre statut) est réservée à l'admin pour les rôles clients ; les
--      fonctions serveur et SECURITY DEFINER (reopen_client, transitions de fiche) ne sont pas concernées.
-- =====================================================================

create or replace function public.protect_closed_client()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'closed' and new.status = 'closed'
     and (new.closed_at is distinct from old.closed_at
          or new.closure_reason is distinct from old.closure_reason) then
    raise exception '%', public.client_already_closed_message(old.closed_at);
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed'
     and current_user in ('authenticated', 'anon')
     and not public.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut rouvrir un dossier clos';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_closed_client on public.clients;
create trigger protect_closed_client
  before update on public.clients
  for each row execute function public.protect_closed_client();

-- =====================================================================
-- 4. reopen_client (admin) : corrige une clôture faite par erreur.
--    Phase vendeur : conservée, sauf « Vendu » ou « Sous promesse » sans promesse en cours, qui
--    repassent « Sous mandat ». Relance : règle de changement de phase pour un vendeur
--    (seller_phase_next_due), délai par défaut de la catégorie sinon. Un seul commentaire.
-- =====================================================================

create or replace function public.reopen_client(p_client_id uuid, p_reason text)
returns date
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client  public.clients;
  v_stage   text;
  v_promise date;
  v_next    date;
  v_days    integer;
  v_today   date := (now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut rouvrir un dossier clos';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Le motif de réouverture est obligatoire';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Fiche introuvable';
  end if;
  if v_client.status is distinct from 'closed' then
    raise exception 'Ce dossier n''est pas clos';
  end if;

  if v_client.category = 'seller' then
    select max(t.preliminary_date) into v_promise
    from public.transactions t
    where t.seller_client_id = v_client.id and t.kind = 'sale' and t.status = 'in_progress';

    v_stage := coalesce(v_client.deal_stage, 'pre_mandat');
    if v_stage = 'vendu' or (v_stage = 'sous_promesse' and v_promise is null) then
      v_stage := 'mandat';
    end if;
    v_next := public.seller_phase_next_due(v_stage, v_promise);
  else
    v_stage := case when v_client.deal_stage = 'sous_promesse' then 'sous_promesse' else null end;
    select case
             when v_stage = 'sous_promesse' then s.seller_promise_days
             when v_client.category = 'buyer' then s.buyer_repeat_days
             else s.after_repeat1_days
           end
      into v_days
    from public.app_settings s order by s.id limit 1;
    v_next := v_today + coalesce(
      v_days,
      case when v_stage = 'sous_promesse' then 30 when v_client.category = 'buyer' then 21 else 90 end
    );
  end if;

  -- Commentaire unique écrit ci-dessous : pas de « Phase : … » ajouté par trigger
  perform set_config('kit.phase_action_comment', 'on', true);

  update public.clients set
    status            = 'active',
    deal_stage        = v_stage,
    closure_reason    = null,
    sale_result       = case when category = 'seller' then null else sale_result end,
    sale_completed_at = case when category = 'seller' then null else sale_completed_at end,
    sold_at           = case when category = 'seller' then null else sold_at end,
    closed_at         = null,
    closed_by         = null,
    next_due_date     = v_next,
    next_due_note     = null,
    next_due_source   = 'auto',
    next_followup_at  = null
  where id = p_client_id;

  insert into public.client_comments (client_id, body, author_id) values (
    p_client_id,
    'Dossier rouvert (clos le '
      || coalesce(to_char(v_client.closed_at at time zone 'Europe/Paris', 'DD/MM/YYYY'), 'date inconnue')
      || ', ' || public.closure_reason_label(v_client.closure_reason) || ') : ' || btrim(p_reason)
      || '. Prochaine relance le ' || to_char(v_next, 'DD/MM/YYYY') || '.',
    auth.uid()
  );

  return v_next;
end;
$$;

revoke all on function public.reopen_client(uuid, text) from public, anon;
grant execute on function public.reopen_client(uuid, text) to authenticated;

commit;
