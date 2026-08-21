export const allowedRemoteTools = new Set([
  "obs_inspect_status",
  "obs_get_performance_stats",
  "obs_list_scenes",
  "obs_inspect_production_resources",
  "obs_switch_scene",
  "obs_set_source_visibility",
  "obs_get_virtual_camera_status",
  "obs_start_virtual_camera",
  "obs_stop_virtual_camera",
  "obs_run_ai_transition",
  "obs_share_capture_source",
  "obs_run_workflow"
]);

export function isRemoteToolAllowed(tool: string): boolean {
  return allowedRemoteTools.has(tool);
}
