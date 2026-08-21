alter table public.obs_dual_pc_sessions
  add column if not exists background_device_id uuid,
  add column if not exists compositor_device_id uuid;

update public.obs_dual_pc_sessions s
set background_device_id = p.background_device_id,
    compositor_device_id = p.compositor_device_id
from public.obs_dual_pc_presets p
where p.id = s.preset_id
  and p.owner_user_id = s.owner_user_id
  and (s.background_device_id is null or s.compositor_device_id is null);

alter table public.obs_dual_pc_sessions
  alter column background_device_id set not null,
  alter column compositor_device_id set not null;

alter table public.obs_dual_pc_sessions
  add constraint obs_dual_pc_sessions_background_owned_fkey
    foreign key (owner_user_id, background_device_id)
    references public.obs_devices(owner_user_id, id) on delete restrict,
  add constraint obs_dual_pc_sessions_compositor_owned_fkey
    foreign key (owner_user_id, compositor_device_id)
    references public.obs_devices(owner_user_id, id) on delete restrict,
  add constraint obs_dual_pc_sessions_distinct_devices
    check (background_device_id <> compositor_device_id);

create unique index obs_dual_pc_sessions_background_device_lock
  on public.obs_dual_pc_sessions(owner_user_id, background_device_id)
  where status in ('preparing', 'active', 'stopping', 'restore_failed');
create unique index obs_dual_pc_sessions_compositor_device_lock
  on public.obs_dual_pc_sessions(owner_user_id, compositor_device_id)
  where status in ('preparing', 'active', 'stopping', 'restore_failed');

notify pgrst, 'reload schema';
