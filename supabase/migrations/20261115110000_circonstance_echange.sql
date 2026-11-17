-- 2026-11-15 : v4 lot D (suite) — circonstance du premier échange et message vendeur « rendez-vous ».
--   clients.contact_circumstance : 'visite' | 'agence' | 'telephone' | null (non précisé).
--   client_outreach.template : ajoute 'vendeur_rdv' (confirmation du rendez-vous d'estimation).
-- Rejouable : add column if not exists, contraintes supprimées puis recréées.
begin;

alter table public.clients add column if not exists contact_circumstance text;

alter table public.clients drop constraint if exists clients_contact_circumstance_check;
alter table public.clients add constraint clients_contact_circumstance_check
  check (contact_circumstance is null or contact_circumstance in ('visite', 'agence', 'telephone'));

comment on column public.clients.contact_circumstance is
  'Circonstance du premier échange : visite d''un bien, passage à l''agence, téléphone ; null = non précisé.';

alter table public.client_outreach drop constraint if exists client_outreach_template_check;
alter table public.client_outreach add constraint client_outreach_template_check
  check (template in ('acquereur', 'vendeur_rdv', 'vendeur_estimation'));

commit;
