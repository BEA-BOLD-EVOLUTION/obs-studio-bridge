create extension if not exists pgcrypto;

create table if not exists public.obs_devices (
  id uuid primary key,
  owner_user_id uuid references auth.users(id) on delete cascade,
  device_name text not null default 'My OBS Computer',
  secret_hash text not null unique,
  paired_at timestamptz default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  production_role text check (production_role is null or production_role in ('background', 'camera_compositor')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists obs_devices_owner_user_id_idx on public.obs_devices(owner_user_id);

alter table public.obs_devices enable row level security;

create policy "users_can_read_own_obs_devices"
on public.obs_devices
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "users_can_pair_own_obs_devices"
on public.obs_devices
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "users_can_update_own_obs_devices"
on public.obs_devices
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "users_can_delete_own_obs_devices"
on public.obs_devices
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

create or replace function public.register_obs_device(
  p_device_id uuid,
  p_secret_hash text,
  p_pairing_code_hash text,
  p_pairing_expires_at timestamptz,
  p_device_name text default 'My OBS Computer'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.obs_devices(id, owner_user_id, device_name, secret_hash, pairing_code_hash, pairing_expires_at, paired_at)
  values (p_device_id, null, coalesce(nullif(p_device_name, ''), 'My OBS Computer'), p_secret_hash, p_pairing_code_hash, p_pairing_expires_at, null)
  on conflict (id) do nothing;
  return p_device_id;
end;
$$;

create or replace function public.claim_obs_device(p_device_id uuid, p_pairing_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.obs_devices
  set owner_user_id = auth.uid(), paired_at = now(), pairing_code_hash = null, pairing_expires_at = null
  where id = p_device_id
    and owner_user_id is null
    and pairing_code_hash = p_pairing_code_hash
    and pairing_expires_at > now()
    and revoked_at is null;
  return found;
end;
$$;

create or replace function public.claim_obs_device_by_code(p_pairing_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_count integer;
begin
  if auth.uid() is null then return null; end if;
  select count(*), min(id) into v_count, v_device_id
  from public.obs_devices
  where owner_user_id is null
    and pairing_code_hash = p_pairing_code_hash
    and pairing_expires_at > now()
    and revoked_at is null;
  if v_count <> 1 then return null; end if;
  update public.obs_devices
  set owner_user_id = auth.uid(), paired_at = now(), pairing_code_hash = null, pairing_expires_at = null
  where id = v_device_id and owner_user_id is null;
  if not found then return null; end if;
  return v_device_id;
end;
$$;

create or replace function public.device_owned_by_current_user(p_device_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1 from public.obs_devices d
    where d.id = p_device_id
      and d.owner_user_id = auth.uid()
      and d.revoked_at is null
  );
$$;

revoke all on function public.register_obs_device(uuid, text, text, timestamptz, text) from public;
grant execute on function public.register_obs_device(uuid, text, text, timestamptz, text) to anon;
revoke all on function public.claim_obs_device(uuid, text) from public;
grant execute on function public.claim_obs_device(uuid, text) to authenticated;
revoke all on function public.claim_obs_device_by_code(text) from public;
grant execute on function public.claim_obs_device_by_code(text) to authenticated;

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
grant execute on function public.authenticate_obs_device(uuid, text) to anon;

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
grant execute on function public.touch_obs_device(uuid, text) to anon;

-- Apply the ordered SQL files in relay/migrations after this bootstrap schema.
-- They add account-scoped dual-PC preset storage and current advisor hardening.
