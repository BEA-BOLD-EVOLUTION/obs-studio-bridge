alter table public.obs_devices
  add column if not exists production_role text,
  add column if not exists is_default boolean not null default false;

alter table public.obs_devices
  drop constraint if exists obs_devices_production_role_check;
alter table public.obs_devices
  add constraint obs_devices_production_role_check
  check (production_role is null or production_role in ('background', 'camera_compositor'));

create unique index if not exists obs_devices_owner_id_key
  on public.obs_devices(owner_user_id, id);
create unique index if not exists obs_devices_one_active_role_per_owner
  on public.obs_devices(owner_user_id, production_role)
  where owner_user_id is not null and production_role is not null and revoked_at is null;
create unique index if not exists obs_devices_one_default_per_owner
  on public.obs_devices(owner_user_id)
  where owner_user_id is not null and is_default and revoked_at is null;

create table if not exists public.obs_dual_pc_presets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  background_device_id uuid not null,
  background_scene_name text not null check (char_length(background_scene_name) between 1 and 120),
  compositor_device_id uuid not null,
  compositor_scene_name text not null check (char_length(compositor_scene_name) between 1 and 120),
  receiving_source_name text not null check (char_length(receiving_source_name) between 1 and 120),
  camera_source_name text check (camera_source_name is null or char_length(camera_source_name) between 1 and 120),
  overlay_source_names jsonb not null default '[]'::jsonb check (jsonb_typeof(overlay_source_names) = 'array'),
  output_type text not null default 'tiktok_live_studio_virtual_camera'
    check (output_type = 'tiktok_live_studio_virtual_camera'),
  expected_width integer not null check (expected_width between 320 and 7680),
  expected_height integer not null check (expected_height between 240 and 7680),
  expected_fps numeric(7,3) not null check (expected_fps between 1 and 120),
  tiktok_audio_configured_separately boolean not null check (tiktok_audio_configured_separately),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obs_dual_pc_presets_distinct_devices check (background_device_id <> compositor_device_id),
  constraint obs_dual_pc_presets_background_owned_fkey
    foreign key (owner_user_id, background_device_id)
    references public.obs_devices(owner_user_id, id) on delete cascade,
  constraint obs_dual_pc_presets_compositor_owned_fkey
    foreign key (owner_user_id, compositor_device_id)
    references public.obs_devices(owner_user_id, id) on delete cascade,
  constraint obs_dual_pc_presets_owner_name_key unique (owner_user_id, name)
);

alter table public.obs_dual_pc_presets enable row level security;

create policy "users_can_read_own_dual_pc_presets"
  on public.obs_dual_pc_presets for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy "users_can_insert_own_dual_pc_presets"
  on public.obs_dual_pc_presets for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy "users_can_update_own_dual_pc_presets"
  on public.obs_dual_pc_presets for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy "users_can_delete_own_dual_pc_presets"
  on public.obs_dual_pc_presets for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all on table public.obs_dual_pc_presets from anon, authenticated;
grant select, insert, update, delete on table public.obs_dual_pc_presets to authenticated;
grant all on table public.obs_dual_pc_presets to service_role;

revoke all on table public.obs_devices from anon;
revoke truncate, references, trigger on table public.obs_devices from authenticated;
grant select, insert, update, delete on table public.obs_devices to authenticated;

notify pgrst, 'reload schema';
