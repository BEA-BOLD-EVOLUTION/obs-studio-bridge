create unique index if not exists obs_dual_pc_presets_owner_id_key
  on public.obs_dual_pc_presets(owner_user_id, id);

create table if not exists public.obs_dual_pc_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  preset_id uuid not null,
  status text not null default 'preparing' check (status in (
    'preparing',
    'active',
    'stopping',
    'stopped',
    'restored_after_failure',
    'restore_failed'
  )),
  captured_state jsonb not null check (jsonb_typeof(captured_state) = 'object'),
  completed_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_steps) = 'array'),
  restoration_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(restoration_steps) = 'array'),
  readiness_snapshot jsonb check (readiness_snapshot is null or jsonb_typeof(readiness_snapshot) = 'object'),
  error_summary text,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obs_dual_pc_sessions_owned_preset_fkey
    foreign key (owner_user_id, preset_id)
    references public.obs_dual_pc_presets(owner_user_id, id) on delete restrict
);

create index if not exists obs_dual_pc_sessions_owner_created_idx
  on public.obs_dual_pc_sessions(owner_user_id, created_at desc);
create index if not exists obs_dual_pc_sessions_owned_preset_idx
  on public.obs_dual_pc_sessions(owner_user_id, preset_id);
create unique index if not exists obs_dual_pc_sessions_one_unresolved_per_preset
  on public.obs_dual_pc_sessions(owner_user_id, preset_id)
  where status in ('preparing', 'active', 'stopping', 'restore_failed');

alter table public.obs_dual_pc_sessions enable row level security;

create policy "users_can_read_own_dual_pc_sessions"
  on public.obs_dual_pc_sessions for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy "users_can_insert_own_dual_pc_sessions"
  on public.obs_dual_pc_sessions for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy "users_can_update_own_dual_pc_sessions"
  on public.obs_dual_pc_sessions for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

revoke all on table public.obs_dual_pc_sessions from anon, authenticated;
grant select, insert, update on table public.obs_dual_pc_sessions to authenticated;
grant all on table public.obs_dual_pc_sessions to service_role;

notify pgrst, 'reload schema';
