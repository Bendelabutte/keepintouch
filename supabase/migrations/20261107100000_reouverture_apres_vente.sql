-- 2026-11-07 : v4 lot B (correction) — réouverture d'une vente avec nous : la fiche de l'acquéreur
-- issue de la vente est traitée dans le même appel (tout ou rien) :
--   - fiche après-vente créée par la vente (create_after_sale_client) → close, motif « Vente annulée » ;
--   - fiche acquéreur existante convertie en après-vente à l'acte (buyer_fiche_transition 'deed')
--     → redevient acquéreur active, avec une relance au délai par défaut acquéreur.
-- Rejouable : create or replace.
begin;

-- Libellés des motifs : + « Vente annulée » (même liste que src/lib/clientStatus.js)
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
    when 'vente_annulee' then 'Vente annulée'
    else coalesce(nullif(btrim(p_reason), ''), 'Motif non renseigné')
  end
$$;

-- Fiche de l'acquéreur d'une vente annulée par réouverture du dossier vendeur (fonction interne,
-- appelée par reopen_client ; non exposée aux utilisateurs).
create or replace function public.undo_sale_buyer_fiche(p_buyer uuid, p_seller uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer public.clients;
  v_days  integer;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if p_buyer is null then
    return;
  end if;
  select * into v_buyer from public.clients where id = p_buyer for update;
  if not found or v_buyer.category is distinct from 'after' then
    return;
  end if;

  -- Fiche acquéreur existante convertie à l'acte (commentaire posé par buyer_fiche_transition)
  if exists (
    select 1 from public.client_comments cc
    where cc.client_id = v_buyer.id and cc.body like '%: fiche passée en après-vente.%'
  ) then
    select s.buyer_repeat_days into v_days from public.app_settings s order by s.id limit 1;
    update public.clients set
      category          = 'buyer',
      status            = 'active',
      deal_stage        = null,
      sale_completed_at = null,
      closure_reason    = null,
      closed_at         = null,
      closed_by         = null,
      next_due_date     = v_today + coalesce(v_days, 21),
      next_due_note     = null,
      next_due_source   = 'auto',
      next_followup_at  = null
    where id = v_buyer.id;
    insert into public.client_comments (client_id, body, author_id)
    values (v_buyer.id, 'Vente annulée (dossier vendeur rouvert) : fiche redevenue acquéreur active.', auth.uid());
    return;
  end if;

  -- Fiche après-vente créée par la vente : close (si elle ne l'est pas déjà)
  if v_buyer.status is distinct from 'closed' then
    update public.clients set
      status           = 'closed',
      closure_reason   = 'vente_annulee',
      closed_at        = now(),
      closed_by        = auth.uid(),
      next_due_date    = null,
      next_due_note    = null,
      next_due_source  = null,
      next_followup_at = null
    where id = v_buyer.id;
    insert into public.client_comments (client_id, body, author_id)
    values (v_buyer.id, 'Dossier clos : Vente annulée (dossier vendeur rouvert).', auth.uid());
  end if;
end;
$$;

revoke all on function public.undo_sale_buyer_fiche(uuid, uuid) from public, anon, authenticated;

-- reopen_client : identique au 06/11, plus la fiche de l'acquéreur
create or replace function public.reopen_client(p_client_id uuid, p_reason text, p_cancel_sale boolean default false)
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
  v_sales   integer := 0;
  v_tx      record;
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
    -- Ventes actées liées : annulées sur confirmation, sinon refus
    if exists (
      select 1 from public.transactions t
      where t.seller_client_id = v_client.id and t.status in ('cashed', 'signed')
    ) then
      if not coalesce(p_cancel_sale, false) then
        raise exception 'Une vente actée est liée à cette fiche : confirmez son annulation pour rouvrir le dossier';
      end if;
      for v_tx in
        update public.transactions
           set status        = 'cancelled',
               cancelled_at  = now(),
               cancel_reason = 'Dossier vendeur rouvert : ' || btrim(p_reason)
         where seller_client_id = v_client.id and status in ('cashed', 'signed')
        returning id, deed_date, fees_ttc, buyer_client_id
      loop
        v_sales := v_sales + 1;
        -- Fiche de l'acquéreur issue de cette vente : annulée avec elle
        perform public.undo_sale_buyer_fiche(v_tx.buyer_client_id, v_client.id);
      end loop;
    end if;

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
      || case when v_sales > 0 then '. Vente actée annulée, commissions supprimées, fiche de l''acquéreur mise à jour' else '' end
      || '. Prochaine relance le ' || to_char(v_next, 'DD/MM/YYYY') || '.',
    auth.uid()
  );

  return v_next;
end;
$$;

revoke all on function public.reopen_client(uuid, text, boolean) from public, anon;
grant execute on function public.reopen_client(uuid, text, boolean) to authenticated;

commit;
