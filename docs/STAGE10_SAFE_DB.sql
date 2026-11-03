-- Reviewed target policy, NOT a dump of the live DB and NOT executed here.
-- Apply only to a separately provisioned test DB after inspecting its policies.
-- Never drop unrelated policies, truncate data, or replace audit records.
alter table public.training_notes enable row level security;
revoke all on public.training_notes from anon;
grant select, insert, update, delete on public.training_notes to authenticated;
create policy stage10_owner_select on public.training_notes for select to authenticated
  using (auth.uid() = owner_id);
create policy stage10_owner_insert on public.training_notes for insert to authenticated
  with check (auth.uid() = owner_id);
create policy stage10_owner_update on public.training_notes for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy stage10_owner_delete on public.training_notes for delete to authenticated
  using (auth.uid() = owner_id);
-- PostgreSQL permissive policies combine with OR. Do not treat this proposal
-- as effective protection until all existing policies/grants have been reviewed.
