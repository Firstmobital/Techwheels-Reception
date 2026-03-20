alter table public.ai_leads
add column if not exists transcription_status text null default 'pending',
add column if not exists transcription_error text null,
add column if not exists transcribed_at timestamptz null,
add column if not exists ca_name_raw text null,
add column if not exists model_name_raw text null,
add column if not exists fuel_type_raw text null;

alter table public.ai_leads
drop constraint if exists ai_leads_transcription_status_check;

alter table public.ai_leads
add constraint ai_leads_transcription_status_check
check (
  transcription_status is null
  or transcription_status = any (
    array['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]
  )
);