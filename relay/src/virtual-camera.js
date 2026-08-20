const actionDefinitions = {
  inspect: {
    tool: "obs_get_virtual_camera_status",
    requiresConfirmation: false
  },
  start: {
    tool: "obs_start_virtual_camera",
    requiresConfirmation: true
  },
  stop: {
    tool: "obs_stop_virtual_camera",
    requiresConfirmation: true
  }
};

export function virtualCameraCommand(action, confirmed = false) {
  const definition = actionDefinitions[action];
  if (!definition) throw new Error(`Unsupported virtual camera action '${action}'.`);
  if (definition.requiresConfirmation && confirmed !== true) {
    throw new Error(`Explicit confirmation is required to ${action} OBS Virtual Camera.`);
  }
  return { tool: definition.tool, arguments: {} };
}

export async function dispatchVirtualCameraCommand({
  dispatchCommand,
  accessToken,
  deviceId,
  action,
  confirmed = false
}) {
  return dispatchCommand(accessToken, deviceId, virtualCameraCommand(action, confirmed));
}
