-- 2026-11-06 : v4 lot B — fiche vendeur par étapes, création par type, réouverture d'une fiche vendue.
--   1. clients : valeur estimée, prix de mise en vente, honoraires prévus TTC, type de mandat (fiche
--      vendeur) et nombre de pièces (projet acquéreur). Toutes facultatives.
--   2. reopen_client : une fiche vendue avec nous liée à une transaction actée ne se rouvre qu'avec
--      p_cancel_sale = true ; la transaction est alors annulée dans le même appel (tout ou rien),
--      ce qui supprime ses commissions (trigger on_transaction_commissions).
-- Rejouable : add column if not exists, contraintes ajoutées si absentes, drop/create function.
begin;

-- =====================================================================
-- 1. Nouvelles colonnes clients
-- =====================================================================

alter table public.clients
  add column if not exists estimation_value numeric,
  add column if not exists listing_price    numeric,
  add column if not exists planned_fees_ttc numeric,
  add column if not exists mandate_type     text,
  add column if not exists rooms            integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_lot_b_check'
                 and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_lot_b_check check (
      (estimation_value is null or estimation_value >= 0)
      and (listing_price is null or listing_price >= 0)
      and (planned_fees_ttc is null or planned_fees_ttc >= 0)
      and (mandate_type is null or mandate_type in ('simple', 'exclusif'))
      and (rooms is null or (rooms >= 0 and rooms <= 50))
    );
  end if;
end;
$$;

-- =====================================================================
-- 2. reopen_client (admin) : + annulation de la vente actée liée, sur confirmation
--    Sans confirmation, refus explicite : aucune réouverture ne laisse une transaction actée
--    rattachée à une fiche vendeur qui n'est plus « Vendu ».
-- =====================================================================

drop function if exists public.reopen_client(uuid, text);

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
        returning id, deed_date, fees_ttc
      loop
        v_sales := v_sales + 1;
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
      || case when v_sales > 0 then '. Vente actée annulée, commissions supprimées' else '' end
      || '. Prochaine relance le ' || to_char(v_next, 'DD/MM/YYYY') || '.',
    auth.uid()
  );

  return v_next;
end;
$$;

revoke all on function public.reopen_client(uuid, text, boolean) from public, anon;
grant execute on function public.reopen_client(uuid, text, boolean) to authenticated;

commit;
