-- Provision in the private Supabase SQL Editor before live device testing.
-- No existing notes, membership policies, or audit rows are modified.
create table if not exists public.training_device_requests (
  user_id uuid not null,
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.training_device_requests enable row level security;
revoke all on public.training_device_requests from public, anon, authenticated, service_role;
grant select on public.training_device_requests to service_role;
grant insert (user_id, device_hash, status) on public.training_device_requests to service_role;
-- Deliberately no server/API UPDATE grant and no browser approval RPC.
-- A trusted DB operator reviews a specific pending row in the private dashboard
-- and changes only that row's status to approved (or revoked). Never approve all.
-- There is no self-approval route. This app registry is not hardware attestation
-- or the ALEPH engine's device registry/signature contract.
