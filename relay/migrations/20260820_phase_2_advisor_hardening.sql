create index if not exists obs_dual_pc_presets_background_device_idx
  on public.obs_dual_pc_presets(owner_user_id, background_device_id);
create index if not exists obs_dual_pc_presets_compositor_device_idx
  on public.obs_dual_pc_presets(owner_user_id, compositor_device_id);
drop index if exists public.obs_dual_pc_presets_owner_user_id_idx;

drop policy if exists "users_can_read_own_obs_devices" on public.obs_devices;
create policy "users_can_read_own_obs_devices"
  on public.obs_devices for select to authenticated
  using ((select auth.uid()) = owner_user_id);

drop policy if exists "users_can_pair_own_obs_devices" on public.obs_devices;
create policy "users_can_pair_own_obs_devices"
  on public.obs_devices for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);

drop policy if exists "users_can_update_own_obs_devices" on public.obs_devices;
create policy "users_can_update_own_obs_devices"
  on public.obs_devices for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

drop policy if exists "users_can_delete_own_obs_devices" on public.obs_devices;
create policy "users_can_delete_own_obs_devices"
  on public.obs_devices for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

alter function public.device_owned_by_current_user(uuid) set search_path = public;

revoke execute on function public.register_obs_device(uuid, text, text, timestamptz, text) from authenticated;
revoke execute on function public.authenticate_obs_device(uuid, text) from authenticated;
revoke execute on function public.touch_obs_device(uuid, text) from authenticated;
revoke execute on function public.claim_obs_device(uuid, text) from anon;
revoke execute on function public.claim_obs_device_by_code(text) from anon;

notify pgrst, 'reload schema';
