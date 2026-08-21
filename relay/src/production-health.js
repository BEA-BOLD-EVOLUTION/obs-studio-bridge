import { toolPayload } from "./dual-pc.js";

export async function inspectProductionHealth({
  accessToken,
  session,
  expectedFps,
  dispatchCommand
}) {
  const roles = [
    { key: "background", role: "background", deviceId: session.backgroundDeviceId },
    { key: "compositor", role: "camera_compositor", deviceId: session.compositorDeviceId }
  ];
  const results = await Promise.all(roles.map(async target => {
    const [status, performance] = await Promise.allSettled([
      dispatchCommand(accessToken, target.deviceId, { tool: "obs_inspect_status", arguments: {} }),
      dispatchCommand(accessToken, target.deviceId, { tool: "obs_get_performance_stats", arguments: {} })
    ]);
    return evaluateDeviceHealth({ ...target, expectedFps, status, performance });
  }));
  const devices = Object.fromEntries(results.map(result => [result.key, result]));
  const issues = results.flatMap(result => result.issues.map(issue => `${roleLabel(result.role)}: ${issue}`));
  return {
    sessionId: session.id,
    sessionStatus: session.status,
    healthy: results.every(result => result.healthy),
    issues,
    devices,
    checkedAt: new Date().toISOString(),
    transportSignalVerified: false,
    limitation: "This snapshot checks OBS and relay-reported state only. It cannot verify the underlying capture card, NDI, Teleport, SRT, or other inter-PC video signal."
  };
}

export function evaluateDeviceHealth({ key = role, role, deviceId, expectedFps, status, performance }) {
  const issues = [];
  const statusPayload = settledPayload(status, "OBS status", issues);
  const stats = settledPayload(performance, "performance statistics", issues);
  const metrics = stats ? performanceMetrics(stats, expectedFps, issues) : null;
  const outputs = statusPayload ? {
    streaming: Boolean(statusPayload.stream?.outputActive),
    recording: Boolean(statusPayload.recording?.outputActive),
    replayBuffer: Boolean(statusPayload.replayBuffer?.outputActive),
    virtualCamera: Boolean(statusPayload.virtualCamera?.outputActive)
  } : null;

  if (role === "camera_compositor" && outputs && !outputs.virtualCamera) {
    issues.push("OBS Virtual Camera is not active.");
  }

  return {
    key,
    role,
    deviceId,
    online: Boolean(statusPayload || stats),
    obsConnected: Boolean(statusPayload),
    healthy: issues.length === 0,
    issues,
    version: statusPayload?.version || null,
    outputs,
    metrics
  };
}

export function performanceMetrics(stats, expectedFps, issues = []) {
  const renderLagPercent = percent(stats.renderSkippedFrames, stats.renderTotalFrames);
  const encodingLagPercent = percent(stats.outputSkippedFrames, stats.outputTotalFrames);
  const cpuUsage = finiteNumber(stats.cpuUsage);
  const memoryUsageMb = finiteNumber(stats.memoryUsage);
  const activeFps = finiteNumber(stats.activeFps);

  if (cpuUsage !== null && cpuUsage >= 85) issues.push(`CPU usage is high at ${round(cpuUsage)}%.`);
  if (activeFps !== null && activeFps < Number(expectedFps) * 0.95) {
    issues.push(`Active FPS is ${round(activeFps)}; expected approximately ${round(expectedFps)}.`);
  }
  if (renderLagPercent >= 1) issues.push(`Render lag is elevated at ${renderLagPercent}%.`);
  if (encodingLagPercent >= 1) issues.push(`Encoding lag is elevated at ${encodingLagPercent}%.`);

  return { cpuUsage, memoryUsageMb, activeFps, renderLagPercent, encodingLagPercent };
}

function settledPayload(result, label, issues) {
  if (result.status === "rejected") {
    issues.push(`Unable to read ${label}: ${errorMessage(result.reason)}`);
    return null;
  }
  try {
    return toolPayload(result.value);
  } catch (error) {
    issues.push(`Unable to read ${label}: ${errorMessage(error)}`);
    return null;
  }
}

function percent(skipped, total) {
  const numerator = Number(skipped ?? 0);
  const denominator = Number(total ?? 0);
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(3)) : 0;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number(Number(value).toFixed(2));
}

function roleLabel(role) {
  return role === "camera_compositor" ? "Camera/Compositor" : "Background";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
