create extension if not exists pgcrypto;

create table if not exists public.obs_devices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  device_name text not null default 'My OBS Computer',
  secret_hash text not null unique,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists obs_devices_owner_user_id_idx on public.obs_devices(owner_user_id);
create index if not exists obs_devices_pairing_code_hash_idx on public.obs_devices(pairing_code_hash) where pairing_code_hash is not null;

alter table public.obs_devices enable row level security;

create policy "users_can_read_own_obs_devices"
on public.obs_devices
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "users_can_update_own_obs_devices"
on public.obs_devices
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- Device registration and command routing are performed by the relay using the service role.
-- Clients never receive service-role credentials and cannot claim another user's device directly.
