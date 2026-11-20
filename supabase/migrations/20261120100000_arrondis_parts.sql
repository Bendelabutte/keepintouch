-- 2026-11-20 : Arrondi des parts d'une transaction.
--   Avant : chaque part était arrondie séparément (round(base × part / 100, 2)). Une base de
--   12 966,67 € répartie 50/50 donnait deux parts de 6 483,34 €, soit 12 966,68 € au total.
--   Après : chaque part est arrondie au centime, puis l'écart avec le total attendu
--   (base × somme des parts / 100, donc la base elle-même à 100 %) est attribué à UNE ligne :
--   la plus grande part ; à égalité, la sortie avant l'entrée, puis le plus grand user_id.
--   Les parts (commission_entries.base_ht) totalisent ainsi toujours exactement la base.
--   La commission reste calculée sur la part ainsi répartie : round(base_ht × taux / 100, 2).
--   Même règle que le front : src/lib/transactions.js, participantAmounts.
--
--   A. refresh_commissions : seul le calcul de la part change (le reste est identique au 04/11).
--   B. Recalcul des transactions qui ont déjà des commissions (taux, type et TVA figés conservés ;
--      seuls les montants peuvent bouger, d'un centime). Aucune ligne n'est créée pour une
--      transaction qui n'en avait pas.
-- Rejouable : create or replace ; le recalcul donne le même résultat à chaque passage.
-- Doit passer après 20261118110000_securite_avant_prod.sql.
begin;

-- =====================================================================
-- A. Recalcul des commissions d'une transaction (fonction interne)
-- =====================================================================

create or replace function public.refresh_commissions(
  p_tx uuid, p_reprice boolean default false, p_only_participant uuid default null, p_only_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx     public.transactions;
  v_net    numeric;
  v_earned date;
  r        record;
  v_old    public.commission_entries;
  v_has    boolean;
  v_rate   numeric;
  v_type   text;
  v_vat    numeric;
  v_base   numeric;
  v_ht     numeric;
begin
  select * into v_tx from public.transactions where id = p_tx;
  if not found or v_tx.status not in ('cashed', 'signed') then
    delete from public.commission_entries where transaction_id = p_tx;
    return;
  end if;

  v_earned := coalesce(v_tx.deed_date, v_tx.fees_received_at, v_tx.created_at::date);
  v_net := round(
    coalesce(v_tx.fees_ht, 0)
    - coalesce((select sum(d.amount_ht) from public.transaction_deductions d where d.transaction_id = p_tx), 0),
    2
  );

  for r in
    -- Parts de TOUS les participants de la transaction (même ceux sans type ni taux), pour que
    -- l'écart de centimes soit attribué de la même façon quel que soit le participant recalculé.
    with parts as (
      select
        tp.id,
        round(v_net * tp.share_pct / 100, 2) as part,
        round(v_net * sum(tp.share_pct) over () / 100, 2)
          - sum(round(v_net * tp.share_pct / 100, 2)) over () as ecart,
        row_number() over (order by tp.share_pct desc, tp.side desc, tp.user_id desc, tp.id desc) as rang
      from public.transaction_participants tp
      where tp.transaction_id = p_tx
    )
    select tp.id, tp.user_id, tp.side, tp.share_pct, tp.rate_override,
           pr.compensation_type, pr.rate_entree, pr.rate_sortie, pr.agent_vat_rate, pr.opening_balance_date,
           pa.part + case when pa.rang = 1 then pa.ecart else 0 end as base_ht
    from public.transaction_participants tp
    join parts pa on pa.id = tp.id
    join public.profiles pr on pr.id = tp.user_id
    where tp.transaction_id = p_tx
  loop
    if r.opening_balance_date is not null and v_earned < r.opening_balance_date then
      delete from public.commission_entries where participant_id = r.id;
      continue;
    end if;

    select * into v_old from public.commission_entries where participant_id = r.id;
    v_has := found;

    if v_has and not (
      p_reprice
      and (p_only_participant is null or p_only_participant = r.id)
      and (p_only_user is null or p_only_user = r.user_id)
    ) then
      v_type := v_old.compensation_type;
      v_rate := coalesce(r.rate_override, v_old.rate);
      v_vat  := v_old.vat_rate;
    else
      v_type := r.compensation_type;
      v_rate := coalesce(r.rate_override, case r.side when 'entree' then r.rate_entree else r.rate_sortie end);
      v_vat  := case when r.compensation_type = 'agent_tva' then coalesce(r.agent_vat_rate, 20) else 0 end;
    end if;

    if v_type is null or v_rate is null then
      delete from public.commission_entries where participant_id = r.id;
      continue;
    end if;

    v_base := r.base_ht;
    v_ht   := round(v_base * v_rate / 100, 2);

    insert into public.commission_entries (
      user_id, transaction_id, participant_id, side, base_ht, rate, amount_ht, vat_rate, amount_due,
      compensation_type, earned_at
    ) values (
      r.user_id, p_tx, r.id, r.side, v_base, v_rate, v_ht, v_vat, round(v_ht * (1 + v_vat / 100), 2),
      v_type, v_earned
    )
    on conflict (participant_id) do update set
      user_id           = excluded.user_id,
      side              = excluded.side,
      base_ht           = excluded.base_ht,
      rate              = excluded.rate,
      amount_ht         = excluded.amount_ht,
      vat_rate          = excluded.vat_rate,
      amount_due        = excluded.amount_due,
      compensation_type = excluded.compensation_type,
      earned_at         = excluded.earned_at,
      updated_at        = now();
  end loop;
end;
$$;

-- Fonction interne : jamais appelable par un utilisateur (inchangé)
revoke all on function public.refresh_commissions(uuid, boolean, uuid, uuid) from public, anon, authenticated;

-- =====================================================================
-- B. Recalcul des commissions existantes avec la nouvelle répartition (taux figés conservés)
-- =====================================================================

do $$
declare
  v_tx uuid;
begin
  for v_tx in select distinct e.transaction_id from public.commission_entries e loop
    perform public.refresh_commissions(v_tx);
  end loop;
end;
$$;

commit;
