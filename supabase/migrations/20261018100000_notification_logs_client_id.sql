-- 2026-10-18 : colonne client_id attendue par send-followup-emails
begin;

alter table public.notification_logs
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists notification_logs_lookup_idx
  on public.notification_logs (user_id, client_id, notification_type, notification_date);

commit;