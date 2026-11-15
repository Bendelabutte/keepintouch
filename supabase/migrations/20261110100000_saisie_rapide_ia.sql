-- 2026-11-10 : v4 lot C — saisie rapide d'une fiche par l'IA (fonction parse-client-description).
--   Journal des appels pour la limite de 30 appels par heure et par utilisateur.
--   Ne stocke NI le texte envoyé NI la réponse : seulement l'utilisateur, la date et les tokens.
--   Lu et écrit uniquement par la fonction serveur (service_role) : RLS activée, aucune règle
--   pour les rôles authenticated / anon.
-- Rejouable : create table if not exists, create index if not exists, revoke.
begin;

create table if not exists public.ai_parse_logs (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0
);

create index if not exists ai_parse_logs_user_created_idx
  on public.ai_parse_logs (user_id, created_at desc);

alter table public.ai_parse_logs enable row level security;

revoke all on table public.ai_parse_logs from anon, authenticated;

comment on table public.ai_parse_logs is
  'Saisie rapide IA : un enregistrement par appel (utilisateur, date, tokens). Aucun contenu client.';

commit;
