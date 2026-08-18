create extension if not exists pgcrypto;

create table if not exists public.obs_devices (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'My OBS Computer',
  secret_hash text not null unique,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists obs_devices_owner_user_id_idx on public.obs_devices(owner_user_id);

alter table public.obs_devices enable row level security;

create policy "users_can_read_own_obs_devices"
on public.obs_devices
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "users_can_pair_own_obs_devices"
on public.obs_devices
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "users_can_update_own_obs_devices"
on public.obs_devices
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "users_can_delete_own_obs_devices"
on public.obs_devices
for delete
to authenticated
using (owner_user_id = auth.uid());

-- The local companion must be able to prove possession of a device secret before
-- opening its outbound relay socket. This function reveals only a boolean and
-- bypasses RLS solely for that narrow credential check.
create or replace function public.authenticate_obs_device(
  p_device_id uuid,
  p_secret_hash text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.obs_devices d
    where d.id = p_device_id
      and d.secret_hash = p_secret_hash
      and d.revoked_at is null
  );
$$;

revoke all on function public.authenticate_obs_device(uuid, text) from public;
grant execute on function public.authenticate_obs_device(uuid, text) to anon, authenticated;

create or replace function public.touch_obs_device(
  p_device_id uuid,
  p_secret_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.obs_devices
  set last_seen_at = now()
  where id = p_device_id
    and secret_hash = p_secret_hash
    and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.touch_obs_device(uuid, text) from public;
grant execute on function public.touch_obs_device(uuid, text) to anon, authenticated;
