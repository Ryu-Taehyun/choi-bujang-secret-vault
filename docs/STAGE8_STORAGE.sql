-- Optional provisioning contract. Not executed by the coding tool.
-- Does not alter training_notes or insert any material or identity.
create table if not exists public.training_class_memberships (
  class_id text not null,
  user_id uuid not null,
  role text not null check (role in ('student', 'instructor')),
  primary key (class_id, user_id)
);
create table if not exists public.training_announcements (
  id text primary key,
  class_id text not null,
  title text not null,
  content text not null
);
alter table public.training_class_memberships enable row level security;
alter table public.training_announcements enable row level security;
revoke all on public.training_class_memberships, public.training_announcements from anon, authenticated;
grant select on public.training_class_memberships, public.training_announcements to service_role;
grant update (title, content) on public.training_announcements to service_role;

-- Only the server service role may call this function. The actor parameter
-- comes from the verified server identity, never from a client request body.
create or replace function public.update_training_announcement(
  actor uuid, resource_id text, new_title text, new_content text
) returns setof public.training_announcements
language sql security invoker set search_path = '' as $$
  update public.training_announcements a
  set title = new_title, content = new_content
  where a.id = resource_id and exists (
    select 1 from public.training_class_memberships m
    where m.user_id = actor and m.class_id = a.class_id and m.role = 'instructor'
  ) returning a.*;
$$;
revoke all on function public.update_training_announcement(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_training_announcement(uuid, text, text, text) to service_role;
