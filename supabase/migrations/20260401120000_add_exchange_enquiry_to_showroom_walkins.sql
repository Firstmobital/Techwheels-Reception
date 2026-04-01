-- Migration: add_exchange_enquiry_to_showroom_walkins.sql
-- Added: 2026-04-01
-- Purpose: Track exchange enquiry information from kiosk submissions

alter table public.showroom_walkins
add column if not exists is_exchange_enquiry boolean not null default false;

-- Create index for filtering exchange inquiries in reports
create index if not exists idx_showroom_walkins_is_exchange_enquiry
on public.showroom_walkins(is_exchange_enquiry)
where is_exchange_enquiry = true;
